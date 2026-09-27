// NinjaTrader 8 AddOn source. Endpoint, token, and Sim account are configured from the Control Center menu.
// This file intentionally uses no Account.Submit/Change/Cancel/Flatten methods.
using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using System.Security.Cryptography;
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
        private readonly ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
        private readonly SemaphoreSlim sender = new SemaphoreSlim(1, 1);
        private Account account;
        private Timer flushTimer;
        private Timer heartbeatTimer;
        private NTMenuItem newMenu;
        private NTMenuItem connectorMenuItem;
        private ControlCenter controlCenter;
        private string endpoint = DefaultEndpoint;
        private string token = String.Empty;
        private string accountName = String.Empty;
        private string installationId = Guid.NewGuid().ToString("N");
        private int queued;
        private string ExternalAccountId { get { return installationId + ":" + (account == null ? accountName : account.Name); } }

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
            var accountBox = new ComboBox { MinWidth = 420, Margin = new Thickness(0, 4, 0, 12), IsEditable = false };
            lock (Account.All)
                foreach (Account candidate in Account.All.Where(IsSimulationAccount)) accountBox.Items.Add(candidate.Name);
            if (!String.IsNullOrWhiteSpace(accountName) && accountBox.Items.Contains(accountName)) accountBox.SelectedItem = accountName;
            else if (accountBox.Items.Count > 0) accountBox.SelectedIndex = 0;

            var saveButton = new Button { Content = "Salvar e iniciar sincronização somente leitura", Padding = new Thickness(12, 8, 12, 8), HorizontalAlignment = HorizontalAlignment.Left, IsDefault = true };
            var content = new StackPanel { Margin = new Thickness(20), Width = 480 };
            content.Children.Add(new TextBlock { Text = "Ninja Control · Conexão somente leitura", FontSize = 17, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 16) });
            content.Children.Add(new TextBlock { Text = "Endpoint HTTPS" }); content.Children.Add(endpointBox);
            content.Children.Add(new TextBlock { Text = "Token do workspace (protegido no Windows deste usuário)" }); content.Children.Add(tokenBox);
            content.Children.Add(new TextBlock { Text = "Conta Sim/demo" }); content.Children.Add(accountBox);
            content.Children.Add(new TextBlock { Text = "Use Criar token na página Integrações do Ninja Control. Contas reais não aparecem nesta lista.", TextWrapping = TextWrapping.Wrap, Opacity = 0.72, Margin = new Thickness(0, 0, 0, 14) });
            content.Children.Add(saveButton);
            var dialog = new Window { Title = "Configurar Ninja Control", Content = content, SizeToContent = SizeToContent.WidthAndHeight, WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = controlCenter, ResizeMode = ResizeMode.NoResize };
            saveButton.Click += (s, args) =>
            {
                Uri uri;
                if (!Uri.TryCreate(endpointBox.Text.Trim(), UriKind.Absolute, out uri) || uri.Scheme != Uri.UriSchemeHttps)
                {
                    MessageBox.Show(dialog, "Informe um endpoint HTTPS válido.", "Ninja Control", MessageBoxButton.OK, MessageBoxImage.Warning); return;
                }
                if (String.IsNullOrWhiteSpace(tokenBox.Password) || accountBox.SelectedItem == null)
                {
                    MessageBox.Show(dialog, "Informe o token e selecione uma conta Sim/demo.", "Ninja Control", MessageBoxButton.OK, MessageBoxImage.Warning); return;
                }
                endpoint = uri.ToString().TrimEnd('/');
                token = tokenBox.Password.Trim();
                accountName = accountBox.SelectedItem.ToString();
                SaveSettings();
                dialog.DialogResult = true;
            };
            if (dialog.ShowDialog() == true) StartConnector();
        }
        private void StartConnector()
        {
            if (account != null) return;
            if (String.IsNullOrWhiteSpace(endpoint) || String.IsNullOrWhiteSpace(token) || String.IsNullOrWhiteSpace(accountName))
            {
                NinjaTrader.Code.Output.Process("Configure endpoint, token, and Sim account from New > Ninja Control.", PrintTo.OutputTab1);
                return;
            }
            lock (Account.All)
                account = Account.All.FirstOrDefault(a => a.Name == accountName && IsSimulationAccount(a));
            if (account == null)
            {
                NinjaTrader.Code.Output.Process("Configured account was not found as a Sim account. No account was attached.", PrintTo.OutputTab1);
                return;
            }
            account.AccountItemUpdate += OnAccountItemUpdate;
            account.PositionUpdate += OnPositionUpdate;
            account.OrderUpdate += OnOrderUpdate;
            account.ExecutionUpdate += OnExecutionUpdate;
            Enqueue(new { type = "account_discovered", accountId = ExternalAccountId, accountName = account.Name });
            SendSnapshot();
            lock (account.Positions)
                foreach (Position position in account.Positions) EnqueuePosition(position);
            flushTimer = new Timer(_ => FlushQueue(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2));
            heartbeatTimer = new Timer(_ => Enqueue(new { type = "account_discovered", accountId = ExternalAccountId, accountName = account.Name }), null, TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(2));
            NinjaTrader.Code.Output.Process("Ninja Control read-only sync started for " + account.Name + ".", PrintTo.OutputTab1);
        }
        private void StopConnector()
        {
            if (account != null)
            {
                account.AccountItemUpdate -= OnAccountItemUpdate;
                account.PositionUpdate -= OnPositionUpdate;
                account.OrderUpdate -= OnOrderUpdate;
                account.ExecutionUpdate -= OnExecutionUpdate;
                account = null;
            }
            if (flushTimer != null) flushTimer.Dispose();
            if (heartbeatTimer != null) heartbeatTimer.Dispose();
            flushTimer = null;
            heartbeatTimer = null;
        }

        private static bool IsSimulationAccount(Account candidate)
        {
            return candidate != null && candidate.Connection != null &&
                (candidate.Name.StartsWith("Sim", StringComparison.OrdinalIgnoreCase) || candidate.Connection.Options.Name.IndexOf("Sim", StringComparison.OrdinalIgnoreCase) >= 0);
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
                accountName = saved.AccountName ?? String.Empty;
                installationId = String.IsNullOrWhiteSpace(saved.InstallationId) ? Guid.NewGuid().ToString("N") : saved.InstallationId;
                if (!String.IsNullOrWhiteSpace(saved.ProtectedToken))
                    token = Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(saved.ProtectedToken), null, DataProtectionScope.CurrentUser));
            }
            catch { token = String.Empty; }
        }

        private void SaveSettings()
        {
            try
            {
                string folder = Path.GetDirectoryName(SettingsPath);
                Directory.CreateDirectory(folder);
                var saved = new ConnectorSettings { Endpoint = endpoint, AccountName = accountName, InstallationId = installationId, ProtectedToken = Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser)) };
                File.WriteAllText(SettingsPath, JsonConvert.SerializeObject(saved, Formatting.Indented));
            }
            catch (Exception ex) { NinjaTrader.Code.Output.Process("Could not save encrypted connector settings: " + ex.Message, PrintTo.OutputTab1); }
        }

        private class ConnectorSettings
        {
            public string Endpoint { get; set; }
            public string AccountName { get; set; }
            public string InstallationId { get; set; }
            public string ProtectedToken { get; set; }
        }

        private void OnAccountItemUpdate(object sender, AccountItemEventArgs e) { SendSnapshot(); }
        private void OnPositionUpdate(object sender, PositionEventArgs e) { if (e.Position != null) EnqueuePosition(e.Position); }
        private void OnOrderUpdate(object sender, OrderEventArgs e)
        {
            Order order = e.Order;
            if (order == null) return;
            Enqueue(new { type = "order", accountId = ExternalAccountId, orderId = order.OrderId ?? order.Name, instrument = order.Instrument.FullName, side = order.OrderAction == OrderAction.Buy || order.OrderAction == OrderAction.BuyToCover ? "buy" : "sell", quantity = Math.Max(1, order.Quantity), status = MapOrderStatus(order.OrderState) });
        }
        private void OnExecutionUpdate(object sender, ExecutionEventArgs e)
        {
            Execution execution = e.Execution;
            if (execution == null) return;
            OrderAction action = execution.Order == null ? OrderAction.Buy : execution.Order.OrderAction;
            Enqueue(new { type = "execution", executionId = execution.ExecutionId, accountId = ExternalAccountId, instrument = execution.Instrument.FullName, side = action == OrderAction.Buy || action == OrderAction.BuyToCover ? "buy" : "sell", quantity = execution.Quantity, price = execution.Price });
        }

        private void SendSnapshot()
        {
            if (account == null) return;
            double cash = account.Get(AccountItem.CashValue, Currency.UsDollar);
            double unrealized = account.Get(AccountItem.UnrealizedProfitLoss, Currency.UsDollar);
            Enqueue(new { type = "account_snapshot", accountId = ExternalAccountId, balanceCents = ToCents(cash), equityCents = ToCents(cash + unrealized) });
        }
        private void EnqueuePosition(Position position)
        {
            int quantity = position.MarketPosition == MarketPosition.Long ? position.Quantity : position.MarketPosition == MarketPosition.Short ? -position.Quantity : 0;
            Enqueue(new { type = "position_snapshot", accountId = ExternalAccountId, instrument = position.Instrument.FullName, quantity, averagePrice = position.AveragePrice, unrealizedPnlCents = ToCents(position.GetUnrealizedProfitLoss(PerformanceUnit.Currency)) });
        }
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
                            if (!response.IsSuccessStatusCode) return;
                        }
                    }
                    string sentPayload;
                    if (queue.TryDequeue(out sentPayload)) Interlocked.Decrement(ref queued);
                }
                catch { /* Keep the head item and retry on the next timer tick. */ }
            }
            finally { sender.Release(); }
        }
        private static int ToCents(double value) { return (int)Math.Max(int.MinValue, Math.Min(int.MaxValue, Math.Round(value * 100))); }
        private static string MapOrderStatus(OrderState state)
        {
            switch (state)
            {
                case OrderState.Accepted: case OrderState.Working: return "accepted";
                case OrderState.PartFilled: return "partially_filled";
                case OrderState.Filled: return "filled";
                case OrderState.Cancelled: return "cancelled";
                case OrderState.Rejected: return "rejected";
                default: return "pending";
            }
        }
    }
}
