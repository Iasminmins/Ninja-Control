import type {
  AccountFilters,
  DemoAccount,
  DemoTrade,
  DemoWorkspace,
  PerformanceSummary,
  TradeFilters,
} from './types'

export function selectTrades(workspace: DemoWorkspace, filters: TradeFilters = {}): DemoTrade[] {
  return workspace.trades
    .filter((trade) => !filters.accountId || trade.accountId === filters.accountId)
    .filter((trade) => !filters.strategyId || trade.strategyId === filters.strategyId)
    .filter((trade) => !filters.instrument || trade.instrument === filters.instrument)
    .filter((trade) => !filters.from || trade.closedAt >= filters.from)
    .filter((trade) => !filters.to || trade.closedAt <= filters.to)
    .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
}

export function selectAccounts(workspace: DemoWorkspace, filters: AccountFilters = {}): DemoAccount[] {
  const query = filters.search?.trim().toLocaleLowerCase('pt-BR')
  return workspace.accounts
    .filter((account) => filters.lifecycle === 'all' || !filters.lifecycle || account.lifecycle === filters.lifecycle)
    .filter((account) => !filters.firm || filters.firm === 'all' || account.firm === filters.firm)
    .filter((account) => !query || `${account.name} ${account.firm} ${account.stage}`.toLocaleLowerCase('pt-BR').includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function accountNetPnl(workspace: DemoWorkspace, accountId: string, from?: string, to?: string): number {
  return selectTrades(workspace, { accountId, from, to }).reduce((sum, trade) => sum + trade.netPnl, 0)
}

export function accountBalance(workspace: DemoWorkspace, account: DemoAccount): number {
  return account.startingCapital + accountNetPnl(workspace, account.id)
}

export function calculatePerformance(trades: DemoTrade[]): PerformanceSummary {
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0)
  const winners = trades.filter((trade) => trade.netPnl > 0)
  const losers = trades.filter((trade) => trade.netPnl < 0)
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0)
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0))
  let running = 0
  let peak = 0
  let maxDrawdown = 0
  for (const trade of [...trades].sort((a, b) => a.closedAt.localeCompare(b.closedAt))) {
    running += trade.netPnl
    peak = Math.max(peak, running)
    maxDrawdown = Math.max(maxDrawdown, peak - running)
  }
  return {
    tradeCount: trades.length,
    netPnl,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: trades.length ? winners.length / trades.length : null,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? null : 0,
    averageTrade: trades.length ? netPnl / trades.length : null,
    maxDrawdown: trades.length ? maxDrawdown : null,
  }
}

export function dateRangeForPeriod(period: '7D' | '30D' | '90D' | 'YTD', asOfDate: string): { from: string; to: string } {
  const end = new Date(`${asOfDate}T23:59:59.999-03:00`)
  const start = new Date(`${asOfDate}T00:00:00.000-03:00`)
  if (period === 'YTD') start.setUTCMonth(0, 1)
  else start.setUTCDate(start.getUTCDate() - (period === '7D' ? 6 : period === '30D' ? 29 : 89))
  return { from: start.toISOString(), to: end.toISOString() }
}

export function groupDailyPnl(trades: DemoTrade[]): Array<{ date: string; label: string; pnl: number }> {
  const grouped = new Map<string, number>()
  for (const trade of trades) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(trade.closedAt))
    grouped.set(date, (grouped.get(date) ?? 0) + trade.netPnl)
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => ({ date, label: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00-03:00`)), pnl }))
}

export function strategyNetPnl(workspace: DemoWorkspace, strategyId: string, from?: string, to?: string): number {
  return selectTrades(workspace, { strategyId, from, to }).reduce((sum, trade) => sum + trade.netPnl, 0)
}

export function accountDailyLossUsePercent(workspace: DemoWorkspace, account: DemoAccount): number {
  const pnl = accountNetPnl(workspace, account.id, `${workspace.asOfDate}T00:00:00-03:00`, `${workspace.asOfDate}T23:59:59.999-03:00`)
  return Math.min(100, Math.max(0, (-pnl / account.dailyLossLimit) * 100))
}
