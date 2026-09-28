// NinjaTrader 8 AddOn source. Endpoint, token, and account are configured from the Control Center menu.
// This file intentionally uses no Account.Submit/Change/Cancel/Flatten methods.
using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.CompilerServices;
using System.Collections.Generic;
using System.Globalization;
using System.Windows.Controls;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using Newtonsoft.Json;
using System.Windows;

namespace NinjaTrader.NinjaScript.AddOns
{
    public class NinjaControlAddOn : AddOnBase
    {
        private const string DefaultEndpoint = "https://ninja-control.vercel.app/api/integrations/ninjatrader-desktop/events";
        private const int QueueLimit = 1000;
        private const int MarketSymbolLimit = 100;
        private const int MarketSnapshotLimit = 2048;

        private static readonly HttpClient Client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        // Call Windows DPAPI directly because some NinjaScript installs do not
        // include the managed DPAPI assembly in their compiler references.
        [StructLayout(LayoutKind.Sequential)]
        private struct DataBlob
        {
            public int Length;
            public IntPtr Data;
        }

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CryptProtectData(ref DataBlob input, string description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, ref DataBlob output);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr LocalFree(IntPtr memory);

        private readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
        private readonly SemaphoreSlim sender = new SemaphoreSlim(1, 1);
        private readonly ConcurrentDictionary<string, Account> accounts = new ConcurrentDictionary<string, Account>();
        private readonly ConcurrentDictionary<string, MarketData> marketSubscriptions = new ConcurrentDictionary<string, MarketData>();
        private readonly ConcurrentDictionary<string, MarketQuoteState> marketQuotes = new ConcurrentDictionary<string, MarketQuoteState>();
        private readonly ConcurrentDictionary<string, MarketInstrumentChoice> marketInstruments = new ConcurrentDictionary<string, MarketInstrumentChoice>();
        private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, double>> observedAccountValues = new ConcurrentDictionary<string, ConcurrentDictionary<string, double>>();
        private readonly ConcurrentDictionary<string, DateTime> lastSnapshotQueuedUtc = new ConcurrentDictionary<string, DateTime>();
        private readonly ConditionalWeakTable<Order, OrderIdentity> orderIdentities = new ConditionalWeakTable<Order, OrderIdentity>();
        private Timer flushTimer;
        private Timer heartbeatTimer;
        private Timer marketFlushTimer;
        private NTMenuItem newMenu;
        private NTMenuItem connectorMenuItem;
        private ControlCenter controlCenter;
        private string endpoint = DefaultEndpoint;
        private string token = String.Empty;
        private string[] accountNames = new string[0];
        private string[] marketSymbols = new string[0];
        private string futureInstrument = String.Empty;
        private string marketMetadataSource = String.Empty;
        private string marketMetadataEffectiveFrom = String.Empty;
        private bool marketDataEnabled;
        private string installationId = Guid.NewGuid().ToString("N");
        private int queued;
        private int started;
        private int marketDropped;
        private readonly SemaphoreSlim marketSender = new SemaphoreSlim(1, 1);
        private int lastReportedHttpStatus;
        private DateTime lastReportedHttpErrorUtc = DateTime.MinValue;
        private DateTime lastReportedMarketErrorUtc = DateTime.MinValue;

        private string ExternalAccountId(Account candidate)
        {
            return installationId + ":" + candidate.Name;
        }

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "Ninja Control Read-only Connector";
            }
            else if (State == State.Terminated)
            {
                StopConnector();
            }
        }

        protected override void OnWindowCreated(Window window)
        {
            ControlCenter center = window as ControlCenter;
            if (center == null || connectorMenuItem != null) return;
            controlCenter = center;
            newMenu = center.FindFirst("ControlCenterMenuItemNew") as NTMenuItem;
            if (newMenu == null) return;
            connectorMenuItem = new NTMenuItem { Header = "Ninja Control · Iniciar sincronização somente leitura", Style = Application.Current.TryFindResource("MainMenuItem") as Style };
            connectorMenuItem.Click += OnConnectorMenuClick;
            newMenu.Items.Add(connectorMenuItem);
        }

        protected override void OnWindowDestroyed(Window window)
        {
            if (!(window is ControlCenter) || connectorMenuItem == null) return;
            connectorMenuItem.Click -= OnConnectorMenuClick;
            if (newMenu != null && newMenu.Items.Contains(connectorMenuItem)) newMenu.Items.Remove(connectorMenuItem);
            connectorMenuItem = null;
            newMenu = null;
            StopConnector();
        }

        private void OnConnectorMenuClick(object sender, RoutedEventArgs e)
        {
            LoadSettings();
            var endpointBox = new TextBox { Text = endpoint, MinWidth = 420, Margin = new Thickness(0, 4, 0, 12) };
            var tokenBox = new PasswordBox { Password = token, MinWidth = 420, Margin = new Thickness(0, 4, 0, 12) };
            var accountList = new StackPanel();
            var accountScroll = new ScrollViewer { Content = accountList, Height = 104, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 4, 0, 12) };
            var availableAccounts = new System.Collections.Generic.List<AccountChoice>();
            lock (Account.All)
                foreach (Account candidate in Account.All.Where(IsSupportedAccount)) availableAccounts.Add(new AccountChoice { Name = candidate.Name, DisplayName = candidate.Name + " · " + GetAccountModeLabel(candidate) });
            string[] savedNames = accountNames ?? new string[0];
            bool hasSavedSelection = availableAccounts.Any(choice => savedNames.Contains(choice.Name, StringComparer.OrdinalIgnoreCase));
            foreach (AccountChoice choice in availableAccounts)
            {
                accountList.Children.Add(new CheckBox
                {
                    Content = choice.DisplayName,
                    Tag = choice,
                    IsChecked = hasSavedSelection ? savedNames.Contains(choice.Name, StringComparer.OrdinalIgnoreCase) : accountList.Children.Count == 0,
                    Margin = new Thickness(2, 3, 2, 3)
                });
            }

            var saveButton = new Button { Content = "Salvar e iniciar sincronização somente leitura", Padding = new Thickness(12, 8, 12, 8), HorizontalAlignment = HorizontalAlignment.Left, IsDefault = true };
            var marketEnabledBox = new CheckBox { Content = "Ativar mapa de contexto (cotações Level I)", IsChecked = marketDataEnabled, Margin = new Thickness(2, 4, 2, 8) };
            var marketSymbolsBox = new TextBox { Text = String.Join(",", marketSymbols ?? new string[0]), MinWidth = 420, Height = 66, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 4, 0, 10) };
            var futureInstrumentBox = new TextBox { Text = futureInstrument ?? String.Empty, MinWidth = 420, Margin = new Thickness(0, 4, 0, 12) };
            var marketMetadataSourceBox = new TextBox { Text = marketMetadataSource ?? String.Empty, MinWidth = 420, Margin = new Thickness(0, 4, 0, 8) };
            var marketMetadataDateBox = new TextBox { Text = marketMetadataEffectiveFrom ?? String.Empty, MinWidth = 420, Margin = new Thickness(0, 4, 0, 12) };
            var content = new StackPanel { Margin = new Thickness(20), Width = 500 };
            content.Children.Add(new TextBlock { Text = "Ninja Control · Conexão somente leitura", FontSize = 17, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 16) });
            content.Children.Add(new TextBlock { Text = "Endpoint HTTPS" }); content.Children.Add(endpointBox);
            content.Children.Add(new TextBlock { Text = "Token do workspace (protegido no Windows deste usuário)" }); content.Children.Add(tokenBox);
            content.Children.Add(new TextBlock { Text = "Contas NinjaTrader (selecione uma ou mais)" }); content.Children.Add(accountScroll);
            content.Children.Add(marketEnabledBox);
            content.Children.Add(new TextBlock { Text = "Ações para o mapa: SYMBOL ou SYMBOL|SETOR|PESO%, separados por vírgula (até 100)" }); content.Children.Add(marketSymbolsBox);
            content.Children.Add(new TextBlock { Text = "Contrato NQ ou MNQ exato, incluindo vencimento (ex.: NQ 12-26)" }); content.Children.Add(futureInstrumentBox);
            content.Children.Add(new TextBlock { Text = "Fonte dos setores/pesos (opcional; informe apenas uma referência autorizada)" }); content.Children.Add(marketMetadataSourceBox);
            content.Children.Add(new TextBlock { Text = "Data de vigência dos pesos (AAAA-MM-DD; opcional)" }); content.Children.Add(marketMetadataDateBox);
            content.Children.Add(new TextBlock { Text = "Os símbolos e o contrato dependem da licença e da conexão de dados. Configure somente instrumentos autorizados. Cotações são enviadas a cada 5 s em fila separada das execuções.", TextWrapping = TextWrapping.Wrap, Opacity = 0.82, Margin = new Thickness(0, 0, 0, 14) });
            content.Children.Add(new TextBlock { Text = "Contas LIVE usam dinheiro real. A sincronização é somente leitura e não envia nem altera ordens.", TextWrapping = TextWrapping.Wrap, Opacity = 0.82, Margin = new Thickness(0, 0, 0, 14) });
            content.Children.Add(saveButton);
            var dialog = new Window { Title = "Configurar Ninja Control", Content = content, SizeToContent = SizeToContent.WidthAndHeight, WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = controlCenter, ResizeMode = ResizeMode.NoResize };
            saveButton.Click += (s, args) =>
            {
                Uri uri;
                if (!Uri.TryCreate(endpointBox.Text.Trim(), UriKind.Absolute, out uri) || uri.Scheme != Uri.UriSchemeHttps)
                {
                    MessageBox.Show(dialog, "Informe um endpoint HTTPS válido.", "Ninja Control", MessageBoxButton.OK, MessageBoxImage.Warning); return;
                }
                string[] selectedNames = accountList.Children.OfType<CheckBox>()
                    .Where(checkBox => checkBox.IsChecked == true)
                    .Select(checkBox => ((AccountChoice)checkBox.Tag).Name)
                    .ToArray();
                string[] selectedMarketSymbols = marketSymbolsBox.Text.Split(new[] { ',', ';', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries).Select(value => value.Trim()).Where(value => value.Length <= 180 && value.Split('|')[0].Trim().Length <= 120).Distinct(StringComparer.OrdinalIgnoreCase).Take(MarketSymbolLimit).ToArray();
                bool enableMarket = marketEnabledBox.IsChecked == true;
                string selectedFuture = futureInstrumentBox.Text.Trim();
                if (String.IsNullOrWhiteSpace(tokenBox.Password) || (enableMarket && (selectedMarketSymbols.Length == 0 || String.IsNullOrWhiteSpace(selectedFuture))) || (selectedNames.Length == 0 && !enableMarket))
                {
                    MessageBox.Show(dialog, "Informe o token e configure ao menos uma conta ou uma lista de mercado com o contrato NQ/MNQ exato.", "Ninja Control", MessageBoxButton.OK, MessageBoxImage.Warning); return;
                }
                bool includesReferenceMetadata = selectedMarketSymbols.Any(value => { string[] parts = value.Split('|'); return (parts.Length > 1 && !String.IsNullOrWhiteSpace(parts[1])) || (parts.Length > 2 && !String.IsNullOrWhiteSpace(parts[2])); });
                DateTime referenceDate;
                if (enableMarket && includesReferenceMetadata && (String.IsNullOrWhiteSpace(marketMetadataSourceBox.Text) || marketMetadataSourceBox.Text.Trim().Length > 120 || !DateTime.TryParseExact(marketMetadataDateBox.Text.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out referenceDate)))
                {
                    MessageBox.Show(dialog, "Para enviar setor ou peso, informe a fonte autorizada e a data de vigência no formato AAAA-MM-DD.", "Ninja Control", MessageBoxButton.OK, MessageBoxImage.Warning); return;
                }
                endpoint = uri.ToString().TrimEnd('/');
                token = tokenBox.Password.Trim();
                accountNames = selectedNames;
                marketDataEnabled = enableMarket;
                marketSymbols = selectedMarketSymbols;
                futureInstrument = selectedFuture;
                marketMetadataSource = marketMetadataSourceBox.Text.Trim();
                marketMetadataEffectiveFrom = marketMetadataDateBox.Text.Trim();
                SaveSettings();
                dialog.DialogResult = true;
            };
            if (dialog.ShowDialog() == true) StartConnector();
        }
        private void StartConnector()
        {
            if (Interlocked.CompareExchange(ref started, 1, 0) != 0) return;
            if (String.IsNullOrWhiteSpace(endpoint) || String.IsNullOrWhiteSpace(token) || (!marketDataEnabled && (accountNames == null || accountNames.Length == 0)))
            {
                NinjaTrader.Code.Output.Process("Configure endpoint, token, and at least one account from New > Ninja Control.", PrintTo.OutputTab1);
                Interlocked.Exchange(ref started, 0);
                return;
            }

            var selectedAccounts = new System.Collections.Generic.List<Account>();
            var missingAccounts = new System.Collections.Generic.List<string>();
            lock (Account.All)
            {
                foreach (string selectedName in accountNames)
                {
                    Account candidate = Account.All.FirstOrDefault(a => a.Name == selectedName && IsSupportedAccount(a));
                    if (candidate == null) missingAccounts.Add(selectedName);
                    else selectedAccounts.Add(candidate);
                }
            }
            if (selectedAccounts.Count == 0 && (!marketDataEnabled || marketSymbols == null || marketSymbols.Length == 0 || String.IsNullOrWhiteSpace(futureInstrument)))
            {
                NinjaTrader.Code.Output.Process("None of the selected NinjaTrader accounts is currently available. No account was attached.", PrintTo.OutputTab1);
                Interlocked.Exchange(ref started, 0);
                return;
            }

            foreach (Account candidate in selectedAccounts)
            {
                accounts[candidate.Name] = candidate;
                string syncId = Guid.NewGuid().ToString("N");
                candidate.AccountItemUpdate += OnAccountItemUpdate;
                candidate.PositionUpdate += OnPositionUpdate;
                candidate.OrderUpdate += OnOrderUpdate;
                candidate.ExecutionUpdate += OnExecutionUpdate;
                Enqueue(new { type = "account_discovered", accountId = ExternalAccountId(candidate), accountName = candidate.Name, accountMode = GetAccountMode(candidate) });
                Enqueue(new { type = "sync_start", accountId = ExternalAccountId(candidate), syncId });
                SendSnapshot(candidate, syncId, true);
                int positionCount = 0;
                lock (candidate.Positions)
                    foreach (Position position in candidate.Positions)
                        if (position.MarketPosition != MarketPosition.Flat && position.Quantity > 0) { EnqueuePosition(candidate, position, syncId); positionCount++; }
                int orderCount = 0;
                lock (candidate.Orders)
                    foreach (Order order in candidate.Orders)
                        if (order != null && !IsTerminalOrder(order.OrderState)) { EnqueueOrder(candidate, order, syncId); orderCount++; }
                int executionCount = 0;
                lock (candidate.Executions)
                    foreach (Execution execution in candidate.Executions)
                        if (execution != null) { EnqueueExecution(candidate, execution); executionCount++; }
                Enqueue(new { type = "sync_complete", accountId = ExternalAccountId(candidate), syncId, positionCount, orderCount, executionCount });
            }
            flushTimer = new Timer(_ => FlushQueue(), null, TimeSpan.FromMilliseconds(500), TimeSpan.FromMilliseconds(500));
            heartbeatTimer = new Timer(_ =>
            {
                foreach (Account candidate in accounts.Values)
                {
                    Enqueue(new { type = "account_discovered", accountId = ExternalAccountId(candidate), accountName = candidate.Name, accountMode = GetAccountMode(candidate) });
                    SendSnapshot(candidate, null, true);
                }
            }, null, TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(2));
            if (marketDataEnabled) StartMarketFeed();
            string connectedNames = String.Join(", ", selectedAccounts.Select(candidate => candidate.Name).ToArray());
            NinjaTrader.Code.Output.Process("Ninja Control read-only sync started for " + connectedNames + ".", PrintTo.OutputTab1);
            if (missingAccounts.Count > 0)
                NinjaTrader.Code.Output.Process("Selected accounts not currently available: " + String.Join(", ", missingAccounts.ToArray()) + ".", PrintTo.OutputTab1);
        }
        private void StopConnector()
        {
            if (Interlocked.Exchange(ref started, 0) == 0 && accounts.IsEmpty && marketSubscriptions.IsEmpty) return;
            if (flushTimer != null) flushTimer.Dispose();
            if (heartbeatTimer != null) heartbeatTimer.Dispose();
            if (marketFlushTimer != null) marketFlushTimer.Dispose();
            flushTimer = null;
            heartbeatTimer = null;
            marketFlushTimer = null;
            foreach (Account candidate in accounts.Values)
            {
                candidate.AccountItemUpdate -= OnAccountItemUpdate;
                candidate.PositionUpdate -= OnPositionUpdate;
                candidate.OrderUpdate -= OnOrderUpdate;
                candidate.ExecutionUpdate -= OnExecutionUpdate;
            }
            accounts.Clear();
            observedAccountValues.Clear();
            foreach (var subscription in marketSubscriptions.ToArray())
            {
                try { subscription.Value.Update -= OnMarketData; } catch { }
            }
            marketSubscriptions.Clear();
            marketQuotes.Clear();
            marketInstruments.Clear();
        }

        private void StartMarketFeed()
        {
            var choices = new System.Collections.Generic.List<MarketInstrumentChoice>();
            foreach (string symbol in (marketSymbols ?? new string[0]).Take(MarketSymbolLimit))
            {
                string[] parts = symbol.Split('|');
                string instrumentKey = parts[0].Trim();
                if (String.IsNullOrWhiteSpace(instrumentKey)) continue;
                double weight = 0;
                DateTime effective = DateTime.MinValue;
                bool hasWeight = parts.Length > 2 && Double.TryParse(parts[2].Trim().Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out weight) && weight > 0 && weight <= 100;
                bool hasDate = DateTime.TryParseExact(marketMetadataEffectiveFrom, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out effective);
                choices.Add(new MarketInstrumentChoice { InstrumentKey = instrumentKey, Symbol = instrumentKey.Split(' ')[0].ToUpperInvariant(), Kind = "equity", Sector = parts.Length > 1 && !String.IsNullOrWhiteSpace(parts[1]) ? parts[1].Trim() : null, MarketCapWeight = hasWeight ? (double?)weight : null, MetadataSource = String.IsNullOrWhiteSpace(marketMetadataSource) ? null : marketMetadataSource, EffectiveFrom = hasDate ? effective.ToString("o") : null });
            }
            if (!String.IsNullOrWhiteSpace(futureInstrument))
                choices.Add(new MarketInstrumentChoice { InstrumentKey = futureInstrument.Trim(), Symbol = futureInstrument.Trim().Split(' ')[0].ToUpperInvariant(), Kind = "future" });

            foreach (MarketInstrumentChoice choice in choices.GroupBy(item => item.InstrumentKey, StringComparer.OrdinalIgnoreCase).Select(group => group.First()))
            {
                marketInstruments[choice.InstrumentKey] = choice;
                try
                {
                    Instrument instrument = Instrument.GetInstrument(choice.InstrumentKey);
                    if (instrument == null)
                    {
                        NinjaTrader.Code.Output.Process("Ninja Control market symbol not found: " + choice.InstrumentKey, PrintTo.OutputTab1);
                        continue;
                    }
                    var marketData = new MarketData(instrument);
                    marketSubscriptions[choice.InstrumentKey] = marketData;
                    marketData.Update += OnMarketData;
                }
                catch (Exception ex)
                {
                    NinjaTrader.Code.Output.Process("Ninja Control could not subscribe to " + choice.InstrumentKey + ": " + ex.Message, PrintTo.OutputTab1);
                }
            }
            marketFlushTimer = new Timer(_ => FlushMarketBatch(), null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
            NinjaTrader.Code.Output.Process("Ninja Control Level I watchlist started: " + marketSubscriptions.Count + "/" + choices.Count + " subscriptions. Provider coverage can be partial.", PrintTo.OutputTab1);
        }

        private void OnMarketData(object sender, MarketDataEventArgs e)
        {
            if (e == null || e.Instrument == null) return;
            MarketInstrumentChoice choice;
            string providerKey = e.Instrument.FullName;
            if (!marketInstruments.TryGetValue(providerKey, out choice))
                choice = marketInstruments.Values.FirstOrDefault(item => String.Equals(item.InstrumentKey, providerKey, StringComparison.OrdinalIgnoreCase));
            if (choice == null) return;
            string key = choice.InstrumentKey;
            MarketQuoteState quote = marketQuotes.GetOrAdd(key, _ => new MarketQuoteState { InstrumentKey = key, Symbol = choice.Symbol, Kind = choice.Kind, ContractExpiry = choice.Kind == "future" ? ContractExpiry(key) : null });
            lock (quote)
            {
                bool changed = false;
                if (e.MarketDataType == MarketDataType.Last && e.Price > 0)
                {
                    quote.Last = e.Price;
                    quote.EventAt = e.Time.ToUniversalTime();
                    changed = true;
                }
                else if (e.MarketDataType == MarketDataType.LastClose && e.Price > 0) { quote.PriorClose = e.Price; changed = true; }
                else if (e.MarketDataType == MarketDataType.Bid && e.Price > 0) { quote.Bid = e.Price; changed = true; }
                else if (e.MarketDataType == MarketDataType.Ask && e.Price > 0) { quote.Ask = e.Price; changed = true; }
                else if (e.MarketDataType == MarketDataType.DailyVolume && e.Volume >= 0) { quote.SessionVolume = e.Volume; changed = true; }
                if (changed) quote.Sequence++;
            }
            if (marketQuotes.Count > MarketSnapshotLimit) Interlocked.Increment(ref marketDropped);
        }

        private static string ContractExpiry(string instrumentKey)
        {
            string[] parts = (instrumentKey ?? String.Empty).Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            return parts.Length > 1 ? String.Join(" ", parts.Skip(1).ToArray()) : instrumentKey;
        }

        private async void FlushMarketBatch()
        {
            if (marketInstruments.IsEmpty || !await marketSender.WaitAsync(0)) return;
            try
            {
                string marketEndpoint = endpoint.EndsWith("/events", StringComparison.OrdinalIgnoreCase) ? endpoint.Substring(0, endpoint.Length - "/events".Length) + "/market-data" : endpoint.TrimEnd('/') + "/market-data";
                var instruments = marketInstruments.Values.OrderBy(item => item.InstrumentKey).Select(item => new { instrumentKey = item.InstrumentKey, symbol = item.Symbol, kind = item.Kind, sector = item.Sector, marketCapWeight = item.MarketCapWeight, metadataSource = item.MetadataSource, effectiveFrom = item.EffectiveFrom }).ToArray();
                var quotes = marketQuotes.Values.Where(item => item.Last > 0 && item.EventAt != DateTime.MinValue).OrderBy(item => item.InstrumentKey).Select(item =>
                {
                    lock (item) return new { instrumentKey = item.InstrumentKey, eventAt = item.EventAt.ToString("o"), last = item.Last, priorClose = item.PriorClose > 0 ? (double?)item.PriorClose : null, bid = item.Bid > 0 ? (double?)item.Bid : null, ask = item.Ask > 0 ? (double?)item.Ask : null, sessionVolume = item.SessionVolume >= 0 ? (double?)item.SessionVolume : null, contractExpiry = item.ContractExpiry, sequence = (long?)item.Sequence };
                }).Take(MarketSnapshotLimit).ToArray();
                var payload = new { sourceId = installationId, sentAt = DateTime.UtcNow.ToString("o"), instruments, quotes };
                using (var request = new HttpRequestMessage(HttpMethod.Post, marketEndpoint))
                {
                    request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                    request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
                    using (HttpResponseMessage response = await Client.SendAsync(request))
                    {
                        if (!response.IsSuccessStatusCode)
                        {
                            DateTime now = DateTime.UtcNow;
                            if (now - lastReportedMarketErrorUtc >= TimeSpan.FromMinutes(1))
                            {
                                lastReportedMarketErrorUtc = now;
                                NinjaTrader.Code.Output.Process("Ninja Control market data not accepted (HTTP " + (int)response.StatusCode + "). Check data entitlement, symbols, token, and deployment.", PrintTo.OutputTab1);
                            }
                            return;
                        }
                    }
                }
                int dropped = Interlocked.Exchange(ref marketDropped, 0);
                if (dropped > 0) NinjaTrader.Code.Output.Process("Ninja Control coalesced or skipped " + dropped + " excess market updates; latest quote snapshots remain prioritized.", PrintTo.OutputTab1);
            }
            catch
            {
                DateTime now = DateTime.UtcNow;
                if (now - lastReportedMarketErrorUtc >= TimeSpan.FromMinutes(1))
                {
                    lastReportedMarketErrorUtc = now;
                    NinjaTrader.Code.Output.Process("Ninja Control could not reach the market-data endpoint. The latest quote state will be retried.", PrintTo.OutputTab1);
                }
            }
            finally { marketSender.Release(); }
        }

        private static bool IsSupportedAccount(Account candidate)
        {
            return candidate != null && candidate.Connection != null && candidate.Connection.Options != null;
        }

        private static string GetAccountMode(Account candidate)
        {
            return candidate != null && candidate.Connection != null && candidate.Connection.Options != null && candidate.Connection.Options.Mode == Mode.Live ? "live" : "simulation";
        }

        private static string GetAccountModeLabel(Account candidate)
        {
            return GetAccountMode(candidate) == "live" ? "LIVE · CONTA REAL" : "SIM · DEMONSTRAÇÃO";
        }

        private sealed class AccountChoice
        {
            public string Name { get; set; }
            public string DisplayName { get; set; }
        }

        private static string SettingsPath
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "NinjaTrader 8", "NinjaControl", "settings.json"); }
        }

        private void LoadSettings()
        {
            try
            {
                if (!File.Exists(SettingsPath)) return;
                var saved = JsonConvert.DeserializeObject<ConnectorSettings>(File.ReadAllText(SettingsPath));
                if (saved == null) return;
                endpoint = String.IsNullOrWhiteSpace(saved.Endpoint) ? DefaultEndpoint : saved.Endpoint;
                if (saved.AccountNames != null && saved.AccountNames.Length > 0)
                    accountNames = saved.AccountNames.Where(name => !String.IsNullOrWhiteSpace(name)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
                else if (!String.IsNullOrWhiteSpace(saved.AccountName))
                    accountNames = new[] { saved.AccountName };
                installationId = String.IsNullOrWhiteSpace(saved.InstallationId) ? Guid.NewGuid().ToString("N") : saved.InstallationId;
                marketDataEnabled = saved.MarketDataEnabled;
                marketSymbols = (saved.MarketSymbols ?? new string[0]).Where(name => !String.IsNullOrWhiteSpace(name)).Distinct(StringComparer.OrdinalIgnoreCase).Take(MarketSymbolLimit).ToArray();
                futureInstrument = saved.FutureInstrument ?? String.Empty;
                marketMetadataSource = saved.MarketMetadataSource ?? String.Empty;
                marketMetadataEffectiveFrom = saved.MarketMetadataEffectiveFrom ?? String.Empty;
                if (!String.IsNullOrWhiteSpace(saved.ProtectedToken))
                    token = Encoding.UTF8.GetString(UnprotectForCurrentUser(Convert.FromBase64String(saved.ProtectedToken)));
            }
            catch { token = String.Empty; }
        }

        private void SaveSettings()
        {
            try
            {
                string folder = Path.GetDirectoryName(SettingsPath);
                Directory.CreateDirectory(folder);
                var saved = new ConnectorSettings { Endpoint = endpoint, AccountNames = accountNames, AccountName = accountNames == null || accountNames.Length == 0 ? String.Empty : accountNames[0], MarketDataEnabled = marketDataEnabled, MarketSymbols = marketSymbols, FutureInstrument = futureInstrument, MarketMetadataSource = marketMetadataSource, MarketMetadataEffectiveFrom = marketMetadataEffectiveFrom, InstallationId = installationId, ProtectedToken = Convert.ToBase64String(ProtectForCurrentUser(Encoding.UTF8.GetBytes(token))) };
                File.WriteAllText(SettingsPath, JsonConvert.SerializeObject(saved, Formatting.Indented));
            }
            catch (Exception ex) { NinjaTrader.Code.Output.Process("Could not save encrypted connector settings: " + ex.Message, PrintTo.OutputTab1); }
        }

        private static byte[] ProtectForCurrentUser(byte[] value)
        {
            return TransformWithDpapi(value, true);
        }

        private static byte[] UnprotectForCurrentUser(byte[] value)
        {
            return TransformWithDpapi(value, false);
        }

        private static byte[] TransformWithDpapi(byte[] value, bool protect)
        {
            DataBlob input = new DataBlob { Length = value.Length, Data = Marshal.AllocHGlobal(value.Length) };
            DataBlob output = new DataBlob { Length = 0, Data = IntPtr.Zero };
            try
            {
                Marshal.Copy(value, 0, input.Data, value.Length);
                bool succeeded = protect
                    ? CryptProtectData(ref input, "Ninja Control connector token", IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, ref output)
                    : CryptUnprotectData(ref input, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, ref output);
                if (!succeeded)
                    throw new InvalidOperationException("Windows DPAPI failed (error " + Marshal.GetLastWin32Error() + ").");

                byte[] result = new byte[output.Length];
                Marshal.Copy(output.Data, result, 0, output.Length);
                return result;
            }
            finally
            {
                if (input.Data != IntPtr.Zero) Marshal.FreeHGlobal(input.Data);
                if (output.Data != IntPtr.Zero) LocalFree(output.Data);
            }
        }

        private class ConnectorSettings
        {
            public string Endpoint { get; set; }
            public string[] AccountNames { get; set; }
            public string AccountName { get; set; }
            public bool MarketDataEnabled { get; set; }
            public string[] MarketSymbols { get; set; }
            public string FutureInstrument { get; set; }
            public string MarketMetadataSource { get; set; }
            public string MarketMetadataEffectiveFrom { get; set; }
            public string InstallationId { get; set; }
            public string ProtectedToken { get; set; }
        }

        private sealed class MarketInstrumentChoice
        {
            public string InstrumentKey { get; set; }
            public string Symbol { get; set; }
            public string Kind { get; set; }
            public string Sector { get; set; }
            public double? MarketCapWeight { get; set; }
            public string MetadataSource { get; set; }
            public string EffectiveFrom { get; set; }
        }

        private sealed class MarketQuoteState
        {
            public string InstrumentKey { get; set; }
            public string Symbol { get; set; }
            public string Kind { get; set; }
            public string ContractExpiry { get; set; }
            public double Last { get; set; }
            public double PriorClose { get; set; }
            public double Bid { get; set; }
            public double Ask { get; set; }
            public long SessionVolume { get; set; } = -1;
            public long Sequence { get; set; }
            public DateTime EventAt { get; set; }
        }

        private void OnAccountItemUpdate(object sender, AccountItemEventArgs e)
        {
            Account candidate = sender as Account;
            if (candidate != null && e != null)
            {
                ConcurrentDictionary<string, double> values = observedAccountValues.GetOrAdd(ExternalAccountId(candidate), _ => new ConcurrentDictionary<string, double>());
                values[e.AccountItem.ToString()] = e.Value;
            }
            SendSnapshot(candidate);
        }
        private void OnPositionUpdate(object sender, PositionEventArgs e)
        {
            Account candidate = sender as Account;
            if (candidate != null && e.Position != null) EnqueuePosition(candidate, e.Position, null);
        }
        private void OnOrderUpdate(object sender, OrderEventArgs e)
        {
            Account candidate = sender as Account;
            Order order = e.Order;
            if (candidate == null || order == null) return;
            EnqueueOrder(candidate, order, null);
        }
        private void OnExecutionUpdate(object sender, ExecutionEventArgs e)
        {
            Account candidate = sender as Account;
            Execution execution = e.Execution;
            if (candidate == null || execution == null) return;
            bool present;
            lock (candidate.Executions) present = candidate.Executions.Any(item => item != null && item.ExecutionId == execution.ExecutionId);
            if (present) EnqueueExecution(candidate, execution);
            else Enqueue(new { type = "execution_removed", executionId = execution.ExecutionId, accountId = ExternalAccountId(candidate) });
        }

        private void SendSnapshot(Account candidate, string syncId = null, bool force = false)
        {
            if (candidate == null) return;
            string accountKey = ExternalAccountId(candidate);
            DateTime now = DateTime.UtcNow;
            if (!force)
            {
                DateTime lastQueued;
                if (lastSnapshotQueuedUtc.TryGetValue(accountKey, out lastQueued) && now - lastQueued < TimeSpan.FromSeconds(5)) return;
                lastSnapshotQueuedUtc[accountKey] = now;
            }
            ConcurrentDictionary<string, double> observed = observedAccountValues.GetOrAdd(ExternalAccountId(candidate), _ => new ConcurrentDictionary<string, double>());
            double cash;
            if (!observed.TryGetValue(AccountItem.CashValue.ToString(), out cash)) cash = candidate.Get(AccountItem.CashValue, candidate.Denomination);
            double unrealized;
            if (!observed.TryGetValue(AccountItem.UnrealizedProfitLoss.ToString(), out unrealized)) unrealized = candidate.Get(AccountItem.UnrealizedProfitLoss, candidate.Denomination);
            var providerValues = new Dictionary<string, object>();
            AccountItem[] items = new[] { AccountItem.BuyingPower, AccountItem.CashValue, AccountItem.Commission, AccountItem.ExcessIntradayMargin, AccountItem.ExcessInitialMargin, AccountItem.ExcessMaintenanceMargin, AccountItem.ExcessPositionMargin, AccountItem.Fee, AccountItem.GrossRealizedProfitLoss, AccountItem.InitialMargin, AccountItem.IntradayMargin, AccountItem.LongOptionValue, AccountItem.LookAheadMaintenanceMargin, AccountItem.LongStockValue, AccountItem.MaintenanceMargin, AccountItem.NetLiquidation, AccountItem.PositionMargin, AccountItem.RealizedProfitLoss, AccountItem.ShortOptionValue, AccountItem.ShortStockValue, AccountItem.SodCashValue, AccountItem.SodLiquidatingValue, AccountItem.UnrealizedProfitLoss, AccountItem.TotalCashBalance };
            foreach (AccountItem item in items)
            {
                double value;
                bool wasObserved = observed.TryGetValue(item.ToString(), out value);
                try { if (!wasObserved) value = candidate.Get(item, candidate.Denomination); }
                catch { continue; }
                if (Double.IsNaN(value) || Double.IsInfinity(value)) continue;
                providerValues[item.ToString()] = new { valueCents = ToCents(value), observed = wasObserved };
            }
            double netLiquidation;
            bool hasObservedNetLiquidation = observed.TryGetValue(AccountItem.NetLiquidation.ToString(), out netLiquidation);
            int equityCents = ToCents(hasObservedNetLiquidation ? netLiquidation : cash + unrealized);
            Enqueue(new { type = "account_snapshot", accountId = ExternalAccountId(candidate), balanceCents = ToCents(cash), equityCents, equityMethod = hasObservedNetLiquidation ? "net_liquidation_reported" : "cash_plus_unrealized_calculated", currency = CurrencyCode(candidate.Denomination.ToString()), providerValues, syncId });
        }
        private void EnqueuePosition(Account candidate, Position position, string syncId)
        {
            int quantity = position.MarketPosition == MarketPosition.Long ? position.Quantity : position.MarketPosition == MarketPosition.Short ? -position.Quantity : 0;
            Enqueue(new { type = "position_snapshot", accountId = ExternalAccountId(candidate), instrument = position.Instrument.FullName, quantity, averagePrice = position.AveragePrice, unrealizedPnlCents = ToCents(position.GetUnrealizedProfitLoss(PerformanceUnit.Currency)), syncId });
        }
        private void EnqueueOrder(Account candidate, Order order, string syncId)
        {
            bool active = !IsTerminalOrder(order.OrderState);
            Enqueue(new { type = "order", accountId = ExternalAccountId(candidate), orderId = orderIdentities.GetValue(order, _ => new OrderIdentity()).Id, providerOrderId = order.OrderId, instrument = order.Instrument.FullName, side = order.OrderAction == OrderAction.Buy || order.OrderAction == OrderAction.BuyToCover ? "buy" : "sell", quantity = Math.Max(1, order.Quantity), filledQuantity = Math.Max(0, order.Filled), averageFillPrice = order.AverageFillPrice, status = MapOrderStatus(order.OrderState), providerStatus = order.OrderState.ToString(), orderType = order.OrderType.ToString(), limitPrice = order.LimitPrice > 0 ? (double?)order.LimitPrice : null, stopPrice = order.StopPrice > 0 ? (double?)order.StopPrice : null, timeInForce = order.TimeInForce.ToString(), ocoId = order.Oco, isActive = active, syncId });
        }
        private void EnqueueExecution(Account candidate, Execution execution)
        {
            OrderAction? action = execution.Order == null ? (OrderAction?)null : execution.Order.OrderAction;
            string side = !action.HasValue ? null : action.Value == OrderAction.Buy || action.Value == OrderAction.BuyToCover ? "buy" : "sell";
            double? pointValue = null;
            string currency = null;
            try
            {
                if (execution.Instrument != null && execution.Instrument.MasterInstrument != null)
                {
                    pointValue = execution.Instrument.MasterInstrument.PointValue;
                    currency = CurrencyCode(execution.Instrument.MasterInstrument.Currency.ToString());
                }
            }
            catch { }
            int? commissionCents = null;
            try { commissionCents = ToCents(execution.Commission); } catch { }
            Enqueue(new { type = "execution", executionId = execution.ExecutionId, orderId = execution.Order == null ? null : execution.Order.OrderId, accountId = ExternalAccountId(candidate), instrument = execution.Instrument.FullName, side, quantity = execution.Quantity, price = execution.Price, pointValue, commissionCents, commissionCurrency = CurrencyCode(candidate.Denomination.ToString()), currency, executedAt = execution.Time.ToUniversalTime().ToString("o") });
        }
        private sealed class OrderIdentity { public string Id { get; private set; } = Guid.NewGuid().ToString("N"); }
        private static string CurrencyCode(string value)
        {
            switch (value)
            {
                case "UsDollar": return "USD";
                case "Euro": return "EUR";
                case "Pound": case "BritishPound": return "GBP";
                case "Yen": case "JapaneseYen": return "JPY";
                case "AustralianDollar": return "AUD";
                case "CanadianDollar": return "CAD";
                case "SwissFranc": return "CHF";
                case "NewZealandDollar": return "NZD";
                case "HongKongDollar": return "HKD";
                case "SingaporeDollar": return "SGD";
                case "BrazilianReal": return "BRL";
                case "ChineseYuan": return "CNY";
                case "DanishKrone": return "DKK";
                case "IndianRupee": return "INR";
                case "MexicanPeso": return "MXN";
                case "NorwegianKrone": return "NOK";
                case "PolishZloty": return "PLN";
                case "RussianRuble": return "RUB";
                case "SwedishKrona": return "SEK";
                case "SouthAfricanRand": return "ZAR";
                case "TurkishLira": return "TRY";
                default: return value != null && value.Length == 3 ? value.ToUpperInvariant() : null;
            }
        }
        private static bool IsTerminalOrder(OrderState state) { return state == OrderState.Filled || state == OrderState.Cancelled || state == OrderState.Rejected; }
        private void Enqueue(object data)
        {
            if (Interlocked.Increment(ref queued) > QueueLimit) { Interlocked.Decrement(ref queued); return; }
            var envelope = new { eventId = Guid.NewGuid().ToString("N"), occurredAt = DateTime.UtcNow.ToString("o"), data };
            var fields = JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JObject>(JsonConvert.SerializeObject(envelope));
            var body = (Newtonsoft.Json.Linq.JObject)fields["data"];
            foreach (var property in body.Properties()) fields[property.Name] = property.Value;
            fields.Remove("data");
            queue.Enqueue(fields.ToString(Formatting.None));
        }
        private async void FlushQueue()
        {
            if (!await sender.WaitAsync(0)) return;
            try
            {
                string payload;
                if (!queue.TryPeek(out payload)) return;
                try
                {
                    using (var request = new HttpRequestMessage(HttpMethod.Post, endpoint))
                    {
                        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
                        using (HttpResponseMessage response = await Client.SendAsync(request))
                        {
                            if (!response.IsSuccessStatusCode)
                            {
                                string responseText = await response.Content.ReadAsStringAsync();
                                string code = "";
                                try { code = (string)Newtonsoft.Json.Linq.JObject.Parse(responseText)["code"] ?? ""; } catch { }
                                int status = (int)response.StatusCode;
                                DateTime now = DateTime.UtcNow;
                                if (status != lastReportedHttpStatus || now - lastReportedHttpErrorUtc >= TimeSpan.FromMinutes(1))
                                {
                                    lastReportedHttpStatus = status;
                                    lastReportedHttpErrorUtc = now;
                                    NinjaTrader.Code.Output.Process("Ninja Control event not accepted (HTTP " + status + (String.IsNullOrWhiteSpace(code) ? "" : ", " + code) + "). Check token, account link, and server response.", PrintTo.OutputTab1);
                                }
                                // Rotate rejected events so a pending link or malformed event for one
                                // account cannot block other accounts in the shared queue.
                                if (status >= 400 && status < 500)
                                {
                                    string rejectedPayload;
                                    if (queue.TryDequeue(out rejectedPayload)) queue.Enqueue(rejectedPayload);
                                }
                                return;
                            }
                        }
                    }
                    string sentPayload;
                    if (queue.TryDequeue(out sentPayload)) Interlocked.Decrement(ref queued);
                }
                catch
                {
                    DateTime now = DateTime.UtcNow;
                    if (now - lastReportedHttpErrorUtc >= TimeSpan.FromMinutes(1))
                    {
                        lastReportedHttpErrorUtc = now;
                        NinjaTrader.Code.Output.Process("Ninja Control could not reach the event endpoint. The queued event will be retried.", PrintTo.OutputTab1);
                    }
                }
            }
            finally { sender.Release(); }
        }
        private static int ToCents(double value) { return (int)Math.Max(int.MinValue, Math.Min(int.MaxValue, Math.Round(value * 100))); }
        private static string MapOrderStatus(OrderState state)
        {
            switch (state)
            {
                case OrderState.Accepted: case OrderState.Working: case OrderState.Submitted: case OrderState.TriggerPending: case OrderState.ChangePending: case OrderState.ChangeSubmitted: case OrderState.CancelPending: case OrderState.CancelSubmitted: return "accepted";
                case OrderState.PartFilled: return "partially_filled";
                case OrderState.Filled: return "filled";
                case OrderState.Cancelled: return "cancelled";
                case OrderState.Rejected: return "rejected";
                default: return "pending";
            }
        }
    }
}
