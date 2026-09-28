import { Activity, CircleDollarSign, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { EmptyState, MetricTile, Panel, SectionHeading } from '@/components/workspace/primitives'
import type { AnalyticsSnapshot } from '@/lib/analytics/server'
import { formatCurrency, formatDate } from '@/lib/format'
import { NinjaTraderGrossCharts } from './ninjatrader-gross-charts'

const selectClass = 'h-10 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
const money = (cents: number | null) => cents === null ? '—' : formatCurrency(cents / 100)

export function PersistedAnalyticsScreen({ snapshot, page }: { snapshot: AnalyticsSnapshot | null; page: 'analytics' | 'performance' }) {
  if (!snapshot) return <main className="mx-auto max-w-[1500px] px-5 py-10"><EmptyState title="Workspace indisponível" description="Entre novamente para acessar seus dados." /></main>
  const { filters, summary, daily } = snapshot
  const maxMagnitude = Math.max(1, ...daily.map((point) => Math.abs(point.netCents)))
  const title = page === 'performance' ? 'Desempenho' : 'Analytics'
  return <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9 xl:px-10">
    <div className="mb-7"><div className="mb-3 flex items-center gap-2"><span className="eyebrow-dot"/><span className="eyebrow">DADOS DO WORKSPACE</span></div><h2 className="text-[26px] font-semibold tracking-[-0.04em] text-white sm:text-[32px]">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Métricas calculadas apenas com trades fechados recebidos e persistidos no Neon.</p></div>
    <form method="get" className={`mb-5 grid gap-2 ${page === 'analytics' ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      <label className="text-[10px] text-zinc-500">Período<select name="days" defaultValue={String(filters.days)} className={`${selectClass} mt-1 w-full`}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option><option value="0">Todo o histórico</option></select></label>
      <label className="text-[10px] text-zinc-500">Conta<select name="accountId" defaultValue={filters.accountId} className={`${selectClass} mt-1 w-full`}><option value="all">Todas as contas</option>{snapshot.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label className="text-[10px] text-zinc-500">Família Hunter<select name="hunterFamily" defaultValue={filters.hunterFamily} className={`${selectClass} mt-1 w-full`}><option value="all">Todas</option>{snapshot.hunterFamilies.map((value) => <option key={value}>{value}</option>)}</select></label>
      {page === 'analytics' && <label className="text-[10px] text-zinc-500">Setup<select name="setup" defaultValue={filters.setup} className={`${selectClass} mt-1 w-full`}><option value="all">Todos</option>{snapshot.setups.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label className="text-[10px] text-zinc-500">Direção<select name="side" defaultValue={filters.side} className={`${selectClass} mt-1 w-full`}><option value="all">Ambas</option><option value="long">Compra / long</option><option value="short">Venda / short</option></select></label>
      <button className="secondary-button min-h-10 self-end" type="submit">Aplicar filtros</button>
    </form>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="P&L líquido" value={summary.tradeCount ? money(summary.netCents) : 'Sem amostra'} icon={CircleDollarSign} tone={summary.netCents < 0 ? 'negative' : 'positive'} note={`${summary.tradeCount} trades com resultado líquido confirmado`} />
      <MetricTile label="Taxa positiva" value={summary.winRate === null ? '—' : `${summary.winRate.toFixed(1).replace('.', ',')}%`} icon={Target} note={`${summary.wins} positivos · ${summary.losses} negativos`} />
      <MetricTile label="Profit factor" value={summary.profitFactor === null ? '—' : summary.profitFactor.toFixed(2).replace('.', ',')} icon={Activity} note="Lucro bruto ÷ perda bruta" />
      <MetricTile label="Expectativa por trade" value={money(summary.expectancyCents)} icon={TrendingUp} note="P&L líquido médio da amostra" />
      <MetricTile label="Ganho médio" value={money(summary.averageWinCents)} icon={TrendingUp} />
      <MetricTile label="Perda média" value={money(summary.averageLossCents)} icon={TrendingDown} />
      <MetricTile label="R:R médio recebido" value={summary.averageRiskReward === null ? '—' : summary.averageRiskReward.toFixed(2).replace('.', ',')} icon={Target} note="Depende do contexto enviado pelo conector" />
      <MetricTile label="Drawdown observado" value={money(summary.maxObservedDrawdownCents)} icon={TrendingDown} note={snapshot.drawdownIsWorkspaceWide ? 'Maior pico a vale entre as contas no período' : 'Pico a vale da conta selecionada no período'} />
    </section>
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Resultado bruto das execuções NinjaTrader" description="Ciclos fechados calculados com fills e valor do ponto do instrumento. Não é misturado ao P&L líquido." /><div className="mt-4"><NinjaTraderGrossCharts series={snapshot.ninjaTraderGross.byCurrency} /></div>{snapshot.ninjaTraderGross.unavailableBecauseContextFilter && <p className="mt-3 text-[10px] text-zinc-500">Remova os filtros de Família Hunter e Setup para incluir execuções NinjaTrader, que não carregam esses campos.</p>}{snapshot.ninjaTraderGross.historyTruncated && <p className="mt-2 text-[10px] text-amber-200">A consulta atingiu o limite de execuções; este recorte pode estar incompleto.</p>}{snapshot.ninjaTraderGross.incompleteFillCount > 0 && <p className="mt-2 text-[10px] text-amber-200">{snapshot.ninjaTraderGross.incompleteFillCount} fills/ciclos sem dados suficientes foram excluídos do P&amp;L bruto.</p>}</Panel>
    <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5 sm:p-6"><SectionHeading title="P&L diário" description="Resultado líquido por data de fechamento, no horário de São Paulo." />{daily.length ? <div className="space-y-3">{daily.map((point) => <div key={point.day} className="grid grid-cols-[90px_1fr_100px] items-center gap-3"><span className="text-[10px] text-zinc-500">{formatDate(point.day)}</span><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${point.netCents < 0 ? 'bg-rose-400' : 'bg-[#b9f227]'}`} style={{ width: `${Math.max(2, Math.abs(point.netCents) / maxMagnitude * 100)}%` }} /></div><span className={`text-right font-mono text-[10px] ${point.netCents < 0 ? 'text-rose-300' : 'text-zinc-300'}`}>{money(point.netCents)}</span></div>)}</div> : <EmptyState title="Sem trades no período" description="Os dados aparecerão após o conector enviar trades fechados." />}</Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Contexto dos trades" description="Médias calculadas quando o conector fornece esses campos." /><div className="grid grid-cols-2 gap-3"><div className="stat-tile"><p className="metric-label">MAE médio</p><p className="mt-2 text-sm font-semibold text-white">{money(summary.averageMaeCents)}</p></div><div className="stat-tile"><p className="metric-label">MFE médio</p><p className="mt-2 text-sm font-semibold text-white">{money(summary.averageMfeCents)}</p></div><div className="stat-tile col-span-2"><p className="metric-label">Fator de recuperação</p><p className="mt-2 text-sm font-semibold text-white">{summary.recoveryFactor === null ? '—' : summary.recoveryFactor.toFixed(2).replace('.', ',')}</p></div></div><p className="mt-4 text-[11px] leading-5 text-zinc-500">Drawdown só é calculado quando a integração envia snapshots. Não é estimado a partir de saldo inicial.</p></Panel>
    </section>
  </main>
}
