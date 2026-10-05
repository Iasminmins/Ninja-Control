'use client'

import { Activity, CircleDollarSign, Gauge, Target, TrendingDown } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, MetricTile, Panel, SectionHeading } from '@/components/workspace/primitives'
import type { SimulationMetrics, SimulationResult, SimulatorTrade } from '@/lib/account-simulator/types'

const blue = '#60a5fa'
const teal = '#2dd4bf'
const amber = '#fbbf24'
const rose = '#fb7185'
const money = (cents: number | null) => cents === null ? '—' : `US$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tooltip = { background: '#101214', border: '1px solid rgba(255,255,255,.16)', borderRadius: 10, color: '#f4f4f5', fontSize: 12 }
const shortMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const dateLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(value))

function getStrategySeries(trades: SimulatorTrade[], simulation: SimulationResult, startBalanceCents: number) {
  const ordered = [...trades].filter((trade) => Number.isFinite(trade.pnlCents) && Number.isFinite(Date.parse(trade.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.source.localeCompare(b.source) || a.rowNumber - b.rowNumber)
  const simulationByTrade = new Map(simulation.points.map((point) => [point.tradeId, point]))
  let cumulative = 0
  let peak = 0
  let strategyMaxDrawdownCents = 0
  let accountBalanceCents = startBalanceCents
  let accountFloorCents = simulation.points[0]?.floorCents ?? startBalanceCents
  let accountDrawdownCents = 0
  const data = ordered.map((trade) => {
    cumulative += trade.pnlCents
    peak = Math.max(peak, cumulative)
    const strategyDrawdownCents = peak - cumulative
    strategyMaxDrawdownCents = Math.max(strategyMaxDrawdownCents, strategyDrawdownCents)
    const point = simulationByTrade.get(trade.id)
    if (point) {
      accountBalanceCents = point.balanceCents
      accountFloorCents = point.floorCents
      accountDrawdownCents = Math.abs(point.drawdownCents)
    }
    return {
      at: trade.timestamp,
      strategyBalance: startBalanceCents + cumulative,
      accountBalance: accountBalanceCents,
      accountFloor: accountFloorCents,
      strategyDrawdown: strategyDrawdownCents,
      accountDrawdown: accountDrawdownCents,
    }
  })
  return { data, strategyMaxDrawdownCents, strategyNetPnlCents: cumulative, strategyTradeCount: ordered.length }
}

export function SimulatorResults({ simulation, metrics, granularity, sourceDescription, sourceTrades, startBalanceCents, targetCents }: {
  simulation: SimulationResult
  metrics: SimulationMetrics
  granularity: 'trade' | 'monthly' | 'none'
  sourceDescription: string
  sourceTrades: SimulatorTrade[]
  startBalanceCents: number
  targetCents: number
}) {
  const strategy = getStrategySeries(sourceTrades, simulation, startBalanceCents)
  const targetProgress = metrics.targetReached ? 100 : targetCents > 0 ? Math.min(100, Math.max(0, metrics.netPnlCents / targetCents * 100)) : 0
  const axis = (value: number) => shortMoney(value)
  const formatTradeCount = strategy.strategyTradeCount.toLocaleString('pt-BR')
  return <div className="space-y-4">
    {granularity === 'monthly' && <p className="rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3 text-xs leading-5 text-amber-100">{sourceDescription} A curva da conta é uma estimativa por fechamento mensal; ela não revela a sequência de ganhos e perdas dentro de cada mês.</p>}
    {simulation.warnings.length > 0 && <div className="space-y-2">{simulation.warnings.map((warning, index) => <p key={`${warning}-${index}`} className="rounded-lg border border-amber-300/15 bg-amber-300/[0.03] p-3 text-xs leading-5 text-amber-100">{warning}</p>)}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Resultado líquido simulado" value={money(metrics.netPnlCents)} icon={CircleDollarSign} tone={metrics.netPnlCents < 0 ? 'negative' : 'positive'} note={granularity === 'monthly' ? 'Soma dos resultados reportados por mês' : 'Resultado da conta até a meta, quebra ou fim da amostra'} />
      <MetricTile label="Trades considerados" value={String(metrics.count)} icon={Activity} note={`${metrics.wins} ganhos · ${metrics.losses} perdas · ${metrics.flats} zerados · ${formatTradeCount} na amostra`} />
      <MetricTile label="Acerto" value={metrics.winRatePercent === null ? '—' : `${metrics.winRatePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} icon={Target} note="Trades positivos ÷ trades considerados" />
      <MetricTile label="Profit factor" value={metrics.profitFactor === null ? '—' : metrics.profitFactor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} icon={Gauge} note="Ganhos brutos ÷ perdas brutas da conta simulada" />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricTile label="DD da estratégia · amostra" value={money(strategy.strategyMaxDrawdownCents)} icon={TrendingDown} tone="negative" note={`${formatTradeCount} trades · P&L ${money(strategy.strategyNetPnlCents)}`} />
      <MetricTile label="DD da conta simulada" value={money(metrics.maxDrawdownCents)} icon={TrendingDown} tone="negative" note="Somente até o evento da conta" />
      <MetricTile label="Saldo final da conta" value={money(metrics.finalBalanceCents)} icon={CircleDollarSign} note="Saldo inicial + resultado simulado" />
      <MetricTile label="Buffer até o piso" value={money(metrics.remainingBufferCents)} icon={Gauge} tone={metrics.remainingBufferCents < 50_000 ? 'negative' : 'positive'} note="Saldo da conta menos o piso" />
      <MetricTile label="Risco máximo aplicado" value={money(metrics.maxAppliedRiskCents)} icon={Activity} note={`${metrics.adjustedTrades} trade(s) redimensionados`} />
    </div>
    {strategy.data.length ? <>
      <Panel className="p-4 sm:p-5"><SectionHeading title="Estratégia e saldo da conta" description="Saldo em dólares. A estratégia mostra todos os trades; a conta simulada fica no nível da meta ou do piso após o evento." /><div className="mt-3 h-[380px] min-w-0 sm:h-[420px]"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1000, height: 420 }}><LineChart data={strategy.data} margin={{ top: 12, right: 18, bottom: 4, left: 8 }}><CartesianGrid stroke="rgba(255,255,255,.09)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={dateLabel} minTickGap={36} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={axis} axisLine={false} tickLine={false} width={86} domain={['auto', 'auto']} /><Tooltip labelFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(String(value)))} formatter={(value, name) => [money(Number(value)), name === 'strategyBalance' ? 'Estratégia · amostra completa' : name === 'accountBalance' ? 'Conta simulada' : 'Piso da conta']} contentStyle={tooltip} /><Legend formatter={(value) => value === 'strategyBalance' ? 'Estratégia · amostra completa' : value === 'accountBalance' ? 'Conta simulada' : 'Piso da conta'} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} /><Line dataKey="strategyBalance" type="linear" stroke={teal} strokeWidth={2.5} dot={{ r: 2.5, fill: teal, stroke: '#111315', strokeWidth: 1 }} activeDot={{ r: 5 }} name="strategyBalance" /><Line dataKey="accountBalance" type="stepAfter" stroke={blue} strokeWidth={2.5} strokeDasharray="7 4" dot={false} activeDot={{ r: 5 }} name="accountBalance" /><Line dataKey="accountFloor" type="stepAfter" stroke={amber} strokeWidth={2} dot={false} name="accountFloor" /></LineChart></ResponsiveContainer></div></Panel>
      <Panel className="p-4 sm:p-5"><SectionHeading title="Drawdown ao longo da amostra" description={`Compara o recuo da estratégia nos ${formatTradeCount} trades com o drawdown da conta até o evento.`} /><div className="mt-3 h-[300px] min-w-0 sm:h-[340px]"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1000, height: 340 }}><AreaChart data={strategy.data} margin={{ top: 12, right: 18, bottom: 4, left: 8 }}><CartesianGrid stroke="rgba(255,255,255,.09)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={dateLabel} minTickGap={36} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={axis} axisLine={false} tickLine={false} width={86} /><Tooltip labelFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(String(value)))} formatter={(value, name) => [money(Number(value)), name === 'strategyDrawdown' ? 'DD da estratégia' : 'DD da conta simulada']} contentStyle={tooltip} /><Legend formatter={(value) => value === 'strategyDrawdown' ? 'Estratégia · amostra completa' : 'Conta simulada · até o evento'} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} /><ReferenceLine y={0} stroke="rgba(255,255,255,.35)" /><Area dataKey="strategyDrawdown" type="monotone" stroke={amber} fill={amber} fillOpacity={0.16} strokeWidth={2.5} name="strategyDrawdown" /><Line dataKey="accountDrawdown" type="stepAfter" stroke={rose} strokeWidth={2.5} dot={false} name="accountDrawdown" /></AreaChart></ResponsiveContainer></div></Panel>
    </> : <Panel className="p-6"><EmptyState title="Selecione um arquivo e leia os dados" description="A curva e as métricas aparecem depois de carregar uma fonte válida e configurar a conta simulada." /></Panel>}
    <Panel className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-zinc-200">Progresso da meta</h2><p className="mt-1 text-xs text-zinc-400">{metrics.targetReached ? 'Meta atingida na sequência simulada.' : metrics.breached ? 'O piso configurado foi tocado.' : 'Resultado da conta comparado com a meta configurada.'}</p></div><span className="text-sm font-semibold text-zinc-200">{Math.round(targetProgress)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]"><div className={`h-full rounded-full ${metrics.breached ? 'bg-rose-400' : 'bg-[#b9f227]'}`} style={{ width: `${targetProgress}%` }} /></div><div className="mt-3 grid gap-3 text-xs text-zinc-400 sm:grid-cols-3"><p>Meta: <strong className="text-zinc-100">{money(targetCents)}</strong></p><p>Trades bloqueados pela trava diária: <strong className="text-zinc-100">{metrics.blockedByDailyLock}</strong></p><p>Trades removidos pelo Entry Market: <strong className="text-zinc-100">{metrics.skippedByEntryMarket}</strong></p></div></Panel>
  </div>
}
