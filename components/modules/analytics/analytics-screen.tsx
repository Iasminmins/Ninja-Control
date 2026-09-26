'use client'

import { useMemo, useState } from 'react'
import { Activity, BarChart3, Clock3 } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { dateRangeForPeriod, selectTrades } from '@/lib/demo/selectors'
import { formatCurrency } from '@/lib/format'

type Period = '7D' | '30D' | '90D' | 'YTD'

function breakdown(trades: ReturnType<typeof selectTrades>, key: 'instrument' | 'session' | 'strategyId', workspace: ReturnType<typeof useDemoWorkspace>['workspace']) {
  const result = new Map<string, { count: number; pnl: number; wins: number }>()
  for (const trade of trades) {
    const raw = key === 'strategyId' ? workspace.strategies.find((item) => item.id === trade.strategyId)?.name ?? 'Sem estratégia' : trade[key]
    const current = result.get(raw) ?? { count: 0, pnl: 0, wins: 0 }
    current.count += 1
    current.pnl += trade.netPnl
    current.wins += trade.netPnl > 0 ? 1 : 0
    result.set(raw, current)
  }
  return [...result.entries()].map(([label, values]) => ({ label, ...values })).sort((a, b) => b.pnl - a.pnl)
}

export function AnalyticsScreen() {
  const { workspace } = useDemoWorkspace()
  const [period, setPeriod] = useState<Period>('30D')
  const [accountId, setAccountId] = useState('all')
  const range = dateRangeForPeriod(period, workspace.asOfDate)
  const trades = useMemo(() => selectTrades(workspace, { from: range.from, to: range.to, accountId: accountId === 'all' ? undefined : accountId }), [workspace, range.from, range.to, accountId])
  const instruments = breakdown(trades, 'instrument', workspace)
  const sessions = breakdown(trades, 'session', workspace)
  const strategies = breakdown(trades, 'strategyId', workspace)
  const selectClass = 'h-10 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

  return <PageFrame title="Analytics" description="Investigue como os resultados se distribuem por instrumento, sessão e estratégia." eyebrow="EXPLORAÇÃO DE DADOS">
    <div className="mb-5 grid gap-2 sm:grid-cols-2"><label className="text-[10px] text-zinc-500">Período<select className={`${selectClass} mt-1 w-full`} value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="7D">7 dias</option><option value="30D">30 dias</option><option value="90D">90 dias</option><option value="YTD">Ano até hoje</option></select></label><label className="text-[10px] text-zinc-500">Conta<select className={`${selectClass} mt-1 w-full`} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="all">Todas as contas</option>{workspace.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Trades na amostra" value={String(trades.length)} icon={Activity} note="Filtros aplicados igualmente a todos os recortes." /><MetricTile label="Instrumentos" value={String(instruments.length)} icon={BarChart3} note="Instrumentos presentes no conjunto filtrado." /><MetricTile label="Sessões" value={String(sessions.length)} icon={Clock3} note="Sessões descritas nos registros sintéticos." /></section>
    {!trades.length ? <EmptyState title="A amostra está vazia" description="Altere o período ou selecione outra conta para explorar dados." /> : <section className="grid gap-4 xl:grid-cols-3">
      {[{ title: 'Por instrumento', description: 'P&L e volume por contrato.', rows: instruments }, { title: 'Por sessão', description: 'P&L e volume por sessão informada.', rows: sessions }, { title: 'Por estratégia', description: 'Resultado vinculado aos registros da amostra.', rows: strategies }].map((group) => { const max = Math.max(...group.rows.map((row) => Math.abs(row.pnl)), 1); return <Panel key={group.title} className="p-5"><SectionHeading title={group.title} description={group.description} /><div className="flex flex-col gap-5">{group.rows.map((row) => <div key={row.label}><div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-300">{row.label}</span><span className={`font-mono text-xs ${row.pnl < 0 ? 'text-rose-300' : 'text-zinc-200'}`}>{formatCurrency(row.pnl)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${row.pnl < 0 ? 'bg-rose-300' : 'bg-[#b9f227]'}`} style={{ width: `${Math.max(4, Math.abs(row.pnl) / max * 100)}%` }} /></div><p className="mt-1 text-[10px] text-zinc-600">{row.count} trades · {row.wins} positivos · {row.count ? `${Math.round(row.wins / row.count * 100)}%` : '—'} de acerto</p></div>)}</div></Panel> })}
    </section>}
    <p className="mt-4 text-[10px] leading-4 text-zinc-600">As divisões usam somente atributos presentes nos dados demonstrativos. Uma associação não indica que a estratégia esteja configurada.</p>
  </PageFrame>
}
