import type { DemoWorkspace } from './types'

const STORAGE_VERSION = 2

function dateInSaoPaulo(daysAgo: number, time = '10:00:00'): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const day = new Date(`${today}T12:00:00.000Z`)
  day.setUTCDate(day.getUTCDate() - daysAgo)
  const date = day.toISOString().slice(0, 10)
  return new Date(`${date}T${time}-03:00`).toISOString()
}

export function createInitialDemoWorkspace(): DemoWorkspace {
  const today = dateInSaoPaulo(0).slice(0, 10)
  const at = (daysAgo: number, time?: string) => dateInSaoPaulo(daysAgo, time)

  const accounts: DemoWorkspace['accounts'] = [
    { id: 'account-apex-01', name: 'APEX #01', firm: 'Apex', kind: 'evaluation', stage: 'Avaliação', startingCapital: 50_000, dailyLossLimit: 2_500, trailingDrawdownLimit: 2_250, drawdownBufferPercent: 72, lifecycle: 'active', connectionState: 'not-configured', createdAt: at(30, '09:00:00'), lastSyncedAt: null, provenance: 'demo' },
    { id: 'account-topstep-01', name: 'TOPSTEP #01', firm: 'Topstep', kind: 'combine', stage: 'Combine', startingCapital: 50_000, dailyLossLimit: 2_000, trailingDrawdownLimit: 2_000, drawdownBufferPercent: 84, lifecycle: 'active', connectionState: 'not-configured', createdAt: at(25, '09:00:00'), lastSyncedAt: null, provenance: 'demo' },
    { id: 'account-apex-02', name: 'APEX #02', firm: 'Apex', kind: 'funded', stage: 'Financiada', startingCapital: 50_000, dailyLossLimit: 2_500, trailingDrawdownLimit: 2_250, drawdownBufferPercent: 31, lifecycle: 'active', connectionState: 'not-configured', createdAt: at(22, '09:00:00'), lastSyncedAt: null, provenance: 'demo' },
    { id: 'account-takeprofit-01', name: 'TAKEPROFIT #01', firm: 'TakeProfit', kind: 'funded', stage: 'Financiada', startingCapital: 25_000, dailyLossLimit: 1_250, trailingDrawdownLimit: 1_250, drawdownBufferPercent: 46, lifecycle: 'active', connectionState: 'not-configured', createdAt: at(18, '09:00:00'), lastSyncedAt: null, provenance: 'demo' },
  ]

  const strategies: DemoWorkspace['strategies'] = [
    { id: 'strategy-hunter', name: 'Hunter', description: 'Estratégia aguardando especificação das regras.', status: 'configuration-pending', accountIds: ['account-apex-01', 'account-apex-02'], instruments: ['NQ'], sessions: [], provenance: 'demo' },
    { id: 'strategy-hsg-a', name: 'HSG A', description: 'Estratégia aguardando especificação das regras.', status: 'configuration-pending', accountIds: ['account-topstep-01'], instruments: ['MNQ'], sessions: [], provenance: 'demo' },
    { id: 'strategy-hsg-b', name: 'HSG B', description: 'Estratégia aguardando especificação das regras.', status: 'configuration-pending', accountIds: ['account-takeprofit-01'], instruments: ['MNQ'], sessions: [], provenance: 'demo' },
  ]

  const trades: DemoWorkspace['trades'] = [
    { id: 'trade-001', accountId: 'account-apex-01', strategyId: 'strategy-hunter', openedAt: at(0, '10:38:00'), closedAt: at(0, '10:42:18'), instrument: 'NQ SEP26', side: 'long', quantity: 1, entryPrice: 19_831.50, exitPrice: 19_842.25, netPnl: 428, session: 'Manhã', status: 'closed', provenance: 'demo' },
    { id: 'trade-002', accountId: 'account-topstep-01', strategyId: 'strategy-hsg-a', openedAt: at(0, '10:12:00'), closedAt: at(0, '10:16:04'), instrument: 'MNQ SEP26', side: 'short', quantity: 2, entryPrice: 19_846.00, exitPrice: 19_837.00, netPnl: 186.5, session: 'Manhã', status: 'closed', provenance: 'demo' },
    { id: 'trade-003', accountId: 'account-apex-02', strategyId: 'strategy-hunter', openedAt: at(0, '09:53:00'), closedAt: at(0, '09:58:41'), instrument: 'NQ SEP26', side: 'long', quantity: 1, entryPrice: 19_850.00, exitPrice: 19_847.70, netPnl: -92, session: 'Manhã', status: 'closed', provenance: 'demo' },
    { id: 'trade-004', accountId: 'account-takeprofit-01', strategyId: 'strategy-hsg-b', openedAt: at(0, '09:29:00'), closedAt: at(0, '09:32:12'), instrument: 'MNQ SEP26', side: 'short', quantity: 1, entryPrice: 19_835.00, exitPrice: 19_832.00, netPnl: 64, session: 'Manhã', status: 'closed', provenance: 'demo' },
    { id: 'trade-005', accountId: 'account-apex-01', strategyId: 'strategy-hunter', openedAt: at(3, '11:05:00'), closedAt: at(3, '11:18:00'), instrument: 'NQ SEP26', side: 'long', quantity: 1, entryPrice: 19_710.00, exitPrice: 19_770.30, netPnl: 2_412, session: 'Manhã', status: 'closed', provenance: 'demo' },
    { id: 'trade-006', accountId: 'account-topstep-01', strategyId: 'strategy-hsg-a', openedAt: at(5, '13:15:00'), closedAt: at(5, '13:28:00'), instrument: 'MNQ SEP26', side: 'short', quantity: 2, entryPrice: 19_625.00, exitPrice: 19_532.00, netPnl: 3_723.5, session: 'Tarde', status: 'closed', provenance: 'demo' },
    { id: 'trade-007', accountId: 'account-apex-02', strategyId: 'strategy-hunter', openedAt: at(8, '10:10:00'), closedAt: at(8, '10:27:00'), instrument: 'NQ SEP26', side: 'long', quantity: 1, entryPrice: 19_420.00, exitPrice: 19_453.80, netPnl: 1_352, session: 'Manhã', status: 'closed', provenance: 'demo' },
    { id: 'trade-008', accountId: 'account-takeprofit-01', strategyId: 'strategy-hsg-b', openedAt: at(12, '14:02:00'), closedAt: at(12, '14:15:00'), instrument: 'MNQ SEP26', side: 'short', quantity: 1, entryPrice: 19_310.00, exitPrice: 19_263.00, netPnl: 1_078, session: 'Tarde', status: 'closed', provenance: 'demo' },
  ]

  return {
    schemaVersion: STORAGE_VERSION,
    mode: 'demo',
    updatedAt: new Date().toISOString(),
    asOfDate: today,
    accounts,
    trades,
    strategies,
    payouts: [
      { id: 'payout-001', accountId: 'account-apex-01', requestedAt: at(2, '12:00:00'), splitLabel: '90 / 10', status: 'approved', amount: 2_400, provenance: 'demo' },
      { id: 'payout-002', accountId: 'account-topstep-01', requestedAt: at(3, '12:00:00'), splitLabel: '90 / 10', status: 'processing', amount: 1_860, provenance: 'demo' },
      { id: 'payout-003', accountId: 'account-takeprofit-01', requestedAt: at(6, '12:00:00'), splitLabel: '80 / 20', status: 'paid', amount: 600, provenance: 'demo' },
    ],
    operationEvents: [
      { id: 'event-001', accountId: 'account-apex-01', occurredAt: at(0, '10:42:18'), category: 'execution', status: 'success', title: 'Trade demonstrativo encerrado', detail: 'NQ SEP26 · compra · execução simulada', amount: 428, provenance: 'demo' },
      { id: 'event-002', accountId: 'account-topstep-01', occurredAt: at(0, '10:16:04'), category: 'execution', status: 'success', title: 'Trade demonstrativo encerrado', detail: 'MNQ SEP26 · venda · execução simulada', amount: 186.5, provenance: 'demo' },
      { id: 'event-003', accountId: 'account-apex-02', occurredAt: at(0, '09:58:41'), category: 'risk', status: 'attention', title: 'Buffer demonstrativo abaixo de 40%', detail: 'Regra local de exemplo; nenhuma proteção foi aplicada.', amount: -92, provenance: 'demo' },
      { id: 'event-004', accountId: 'account-takeprofit-01', occurredAt: at(0, '09:32:12'), category: 'sync', status: 'info', title: 'Evento de sincronização de exemplo', detail: 'Nenhuma conexão externa foi consultada.', amount: null, provenance: 'demo' },
    ],
    riskRules: [
      { id: 'risk-001', name: 'Alerta ao atingir 80% do limite diário', description: 'Monitora a perda diária no conjunto de dados de demonstração.', condition: 'daily-loss-percent', threshold: 80, enabled: true, scopeAccountIds: [], provenance: 'demo' },
      { id: 'risk-002', name: 'Alerta com buffer abaixo de 40%', description: 'Sinaliza contas de demonstração com buffer baixo.', condition: 'drawdown-buffer-percent', threshold: 40, enabled: true, scopeAccountIds: [], provenance: 'demo' },
    ],
    alertRules: [
      { id: 'alert-rule-001', name: 'Buffer de risco baixo', condition: 'drawdown-buffer-percent', threshold: 40, enabled: true, accountId: null, provenance: 'demo' },
      { id: 'alert-rule-002', name: 'Limite diário próximo', condition: 'daily-loss-percent', threshold: 80, enabled: true, accountId: null, provenance: 'demo' },
    ],
    alertEvents: [
      { id: 'alert-event-001', ruleId: 'alert-rule-001', accountId: 'account-apex-02', occurredAt: at(0, '09:58:41'), message: 'APEX #02 tem 31% de buffer restante (exemplo).', readAt: null, provenance: 'demo' },
    ],
    journalEntries: [
      { id: 'journal-001', tradeId: 'trade-001', plan: 'Entrada demonstrativa após rompimento.', notes: 'Anotação de exemplo; substitua pelo seu contexto.', tags: ['demo', 'manhã'], review: '', updatedAt: at(0, '10:45:00'), provenance: 'demo' },
    ],
    integrations: [
      { id: 'integration-tradovate', name: 'Tradovate', category: 'broker', connectionState: 'not-configured', requirements: ['Definir ambiente e fluxo de autenticação', 'Configurar credenciais somente no servidor'], provenance: 'demo' },
      { id: 'integration-ninjatrader', name: 'NinjaTrader', category: 'broker', connectionState: 'not-configured', requirements: ['Registrar o aplicativo e a URL de retorno OAuth com a NinjaTrader', 'Obter client_id e client_secret oficiais; guardar o segredo apenas no servidor', 'Validar primeiro no ambiente Demo e liberar apenas leitura nesta fase'], provenance: 'demo' },
      { id: 'integration-wealthcharts', name: 'WealthCharts', category: 'broker', connectionState: 'not-configured', requirements: ['Confirmar API disponível', 'Configurar credenciais somente no servidor'], provenance: 'demo' },
      { id: 'integration-apex', name: 'Apex', category: 'prop-firm', connectionState: 'not-configured', requirements: ['Confirmar acesso a dados de contas e saques'], provenance: 'demo' },
      { id: 'integration-topstep', name: 'Topstep', category: 'prop-firm', connectionState: 'not-configured', requirements: ['Confirmar acesso a dados de contas e saques'], provenance: 'demo' },
      { id: 'integration-takeprofit', name: 'TakeProfit', category: 'prop-firm', connectionState: 'not-configured', requirements: ['Confirmar acesso a dados de contas e saques'], provenance: 'demo' },
    ],
  }
}
