'use client'

import { useState } from 'react'
import { ArrowLeftRight, CircleDollarSign, Target, TrendingDown } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { calculatePerformance, dateRangeForPeriod, selectTrades } from '@/lib/demo/selectors'
import { formatCurrency, formatPercent } from '@/lib/format'

type Period = '7D' | '30D' | '90D' | 'YTD'

export function ComparatorScreen() {
  const { workspace } = useDemoWorkspace()
  const [entityType, setEntityType] = useState<'account' | 'strategy'>('account')
  const entities = entityType === 'account' ? workspace.accounts.filter((item) => item.lifecycle === 'active').map((item) => ({ id: item.id, name: item.name })) : workspace.strategies.filter((item) => item.status !== 'archived').map((item) => ({ id: item.id, name: item.name }))
  const [firstId, setFirstId] = useState('account-apex-01')
  const [secondId, setSecondId] = useState('account-topstep-01')
  const [period, setPeriod] = useState<Period>('30D')
  const range = dateRangeForPeriod(period, workspace.asOfDate)
  const byId = new Map(entities.map((item) => [item.id, item]))
  const first = entityType === 'account' ? selectTrades(workspace, { accountId: firstId, from: range.from, to: range.to }) : selectTrades(workspace, { strategyId: firstId, from: range.from, to: range.to })
  const second = entityType === 'account' ? selectTrades(workspace, { accountId: secondId, from: range.from, to: range.to }) : selectTrades(workspace, { strategyId: secondId, from: range.from, to: range.to })
  const firstSummary = calculatePerformance(first)
  const secondSummary = calculatePerformance(second)
  const selectClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

  function changeEntityType(next: 'account' | 'strategy') {
    setEntityType(next)
    const list = next === 'account' ? workspace.accounts.filter((item) => item.lifecycle === 'active') : workspace.strategies.filter((item) => item.status !== 'archived')
    setFirstId(list[0]?.id ?? '')
    setSecondId(list[1]?.id ?? list[0]?.id ?? '')
  }

  return <PageFrame title="Comparador" description="Compare duas contas ou estratégias no mesmo período e com a mesma definição de métricas." eyebrow="COMPARAÇÃO LADO A LADO">
    <Panel className="mb-5 p-5 sm:p-6"><div className="grid gap-3 sm:grid-cols-4"><label className="text-[10px] text-zinc-500">Comparar<select className={selectClass} value={entityType} onChange={(event) => changeEntityType(event.target.value as 'account' | 'strategy')}><option value="account">Contas</option><option value="strategy">Estratégias</option></select></label><label className="text-[10px] text-zinc-500">Item A<select className={selectClass} value={firstId} onChange={(event) => setFirstId(event.target.value)}>{entities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="text-[10px] text-zinc-500">Item B<select className={selectClass} value={secondId} onChange={(event) => setSecondId(event.target.value)}>{entities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="text-[10px] text-zinc-500">Período<select className={selectClass} value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="7D">7 dias</option><option value="30D">30 dias</option><option value="90D">90 dias</option><option value="YTD">Ano até hoje</option></select></label></div></Panel>
    {entities.length < 2 ? <EmptyState title="Ainda não há dois itens para comparar" description="Cadastre contas de demonstração ou crie metadados de estratégias para preencher o comparador." /> : <><div className="mb-4 flex items-center gap-2 text-[10px] text-zinc-500"><ArrowLeftRight className="size-3.5" /> O mesmo intervalo e os mesmos cálculos são aplicados aos dois itens.</div><section className="grid gap-4 xl:grid-cols-2">{[{ id: firstId, summary: firstSummary, trades: first }, { id: secondId, summary: secondSummary, trades: second }].map((item, index) => { const entity = byId.get(item.id); const tone = item.summary.netPnl < 0 ? 'negative' : 'positive'; return <Panel key={`${index}-${item.id}`} className="p-5 sm:p-6"><SectionHeading title={entity?.name ?? 'Selecione um item'} description={`${item.summary.tradeCount} trades no período · dados sintéticos`} /><div className="grid gap-3 sm:grid-cols-3"><MetricTile label="P&L líquido" value={formatCurrency(item.summary.netPnl)} icon={CircleDollarSign} tone={tone} /><MetricTile label="Taxa positiva" value={formatPercent(item.summary.winRate)} icon={Target} note={`${item.summary.winningTrades} trades positivos`} /><MetricTile label="Drawdown máximo" value={formatCurrency(item.summary.maxDrawdown)} icon={TrendingDown} /></div><div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-[10px] text-zinc-500">Profit factor</p><p className="mt-1 text-sm font-semibold text-zinc-200">{item.summary.profitFactor == null ? 'Sem perdas na amostra' : item.summary.profitFactor.toFixed(2).replace('.', ',')}</p><p className="mt-2 text-[10px] text-zinc-600">Trades usados: {item.trades.length}</p></div></Panel> })}</section><p className="mt-4 text-[10px] leading-4 text-zinc-600">Itens podem ter tamanhos de amostra diferentes. Métricas não incluem comissões além do P&amp;L sintético e não representam recomendação de alocação.</p></>}
  </PageFrame>
}
