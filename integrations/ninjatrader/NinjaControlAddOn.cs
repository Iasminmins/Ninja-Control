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
        private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, double>> observedAccountValues = new ConcurrentDictionary<string, ConcurrentDictionary<string, double>>();
        private readonly ConcurrentDictionary<string, DateTime> lastSnapshotQueuedUtc = new ConcurrentDictionary<string, DateTime>();
        private readonly ConditionalWeakTable<Order, OrderIdentity> orderIdentities = new ConditionalWeakTable<Order, OrderIdentity>();
        private Timer flushTimer;
        private Timer heartbeatTimer;
        private NTMenuItem newMenu;
        private NTMenuItem connectorMenuItem;
        private ControlCenter controlCenter;
        private string endpoint = DefaultEndpoint;
        private string token = String.Empty;
        private string[] accountNames = new string[0];
        private string installationId = Guid.NewGuid().ToString("N");
        private int queued;
        private int lastReportedHttpStatus;
        private DateTime lastReportedHttpErrorUtc = DateTime.MinValue;

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
            var content = new StackPanel { Margin = new Thickness(20), Width = 480 };
            content.Children.Add(new TextBlock { Text = "Ninja Control · Conexão somente leitura", FontSize = 17, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 16) });
            content.Children.Add(new TextBlock { Text = "Endpoint HTTPS" }); content.Children.Add(endpointBox);
            content.Children.Add(new TextBlock { Text = "Token do workspace (protegido no Windows deste usuário)" }); content.Children.Add(tokenBox);
            content.Children.Add(new TextBlock { Text = "Contas NinjaTrader (selecione uma ou mais)" }); content.Children.Add(accountScroll);
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
                if (String.IsNullOrWhiteSpace(tokenBox.Password) || selectedNames.Length == 0)
                {
                    MessageBox.Show(dialog, "Informe o token e selecione ao menos uma conta.", "Ninja Control", MessageBoxButton.OK, MessageBoxImage.Warning); return;
                }
                endpoint = uri.ToString().TrimEnd('/');
                token = tokenBox.Password.Trim();
                accountNames = selectedNames;
                SaveSettings();
                dialog.DialogResult = true;
            };
            if (dialog.ShowDialog() == true) StartConnector();
        }
        private void StartConnector()
        {
            if (!accounts.IsEmpty) return;
            if (String.IsNullOrWhiteSpace(endpoint) || String.IsNullOrWhiteSpace(token) || accountNames == null || accountNames.Length == 0)
            {
                NinjaTrader.Code.Output.Process("Configure endpoint, token, and at least one account from New > Ninja Control.", PrintTo.OutputTab1);
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
            if (selectedAccounts.Count == 0)
            {
                NinjaTrader.Code.Output.Process("None of the selected NinjaTrader accounts is currently available. No account was attached.", PrintTo.OutputTab1);
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
            string connectedNames = String.Join(", ", selectedAccounts.Select(candidate => candidate.Name).ToArray());
            NinjaTrader.Code.Output.Process("Ninja Control read-only sync started for " + connectedNames + ".", PrintTo.OutputTab1);
            if (missingAccounts.Count > 0)
                NinjaTrader.Code.Output.Process("Selected accounts not currently available: " + String.Join(", ", missingAccounts.ToArray()) + ".", PrintTo.OutputTab1);
        }
        private void StopConnector()
        {
            if (flushTimer != null) flushTimer.Dispose();
            if (heartbeatTimer != null) heartbeatTimer.Dispose();
            flushTimer = null;
            heartbeatTimer = null;
            foreach (Account candidate in accounts.Values)
            {
                candidate.AccountItemUpdate -= OnAccountItemUpdate;
                candidate.PositionUpdate -= OnPositionUpdate;
                candidate.OrderUpdate -= OnOrderUpdate;
                candidate.ExecutionUpdate -= OnExecutionUpdate;
            }
            accounts.Clear();
            observedAccountValues.Clear();
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
                var saved = new ConnectorSettings { Endpoint = endpoint, AccountNames = accountNames, AccountName = accountNames == null || accountNames.Length == 0 ? String.Empty : accountNames[0], InstallationId = installationId, ProtectedToken = Convert.ToBase64String(ProtectForCurrentUser(Encoding.UTF8.GetBytes(token))) };
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
            public string InstallationId { get; set; }
            public string ProtectedToken { get; set; }
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
