'use client'

import { Activity, Gauge, Target, TrendingDown } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, Panel, SectionHeading } from '@/components/workspace/primitives'
import type { SimulationMetrics, SimulationResult, SimulatorTrade } from '@/lib/account-simulator/types'

const blue = '#60a5fa'
const teal = '#2dd4bf'
const amber = '#fbbf24'
const rose = '#fb7185'
const money = (cents: number | null) => cents === null ? '—' : `US$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tooltip = { background: '#101214', border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, color: '#f4f4f5', fontSize: 12 }
const shortMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const dateLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(value))

function getStrategySeries(trades: SimulatorTrade[], simulation: SimulationResult, startBalanceCents: number) {
  const ordered = [...trades].filter((trade) => Number.isFinite(trade.pnlCents) && Number.isFinite(Date.parse(trade.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.source.localeCompare(b.source) || a.rowNumber - b.rowNumber)
  const simulationByTrade = new Map(simulation.points.map((point) => [point.tradeId, point]))
  let cumulative = 0
  let peak = 0
  let strategyMaxDrawdownCents = 0
  let strategyWins = 0
  let strategyLosses = 0
  let strategyFlats = 0
  let strategyGrossWinsCents = 0
  let strategyGrossLossesCents = 0
  let accountBalanceCents = startBalanceCents
  let accountFloorCents = simulation.points[0]?.floorCents ?? startBalanceCents
  let accountDrawdownCents = 0
  const data = ordered.map((trade) => {
    cumulative += trade.pnlCents
    if (trade.pnlCents > 0) { strategyWins += 1; strategyGrossWinsCents += trade.pnlCents }
    else if (trade.pnlCents < 0) { strategyLosses += 1; strategyGrossLossesCents += Math.abs(trade.pnlCents) }
    else strategyFlats += 1
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
  return {
    data,
    strategyMaxDrawdownCents,
    strategyNetPnlCents: cumulative,
    strategyTradeCount: ordered.length,
    strategyWins,
    strategyLosses,
    strategyFlats,
    strategyWinRatePercent: ordered.length ? strategyWins / ordered.length * 100 : null,
    strategyProfitFactor: strategyGrossLossesCents ? strategyGrossWinsCents / strategyGrossLossesCents : null,
  }
}

function SummaryStat({ label, value, note, icon: Icon, tone = 'neutral' }: {
  label: string
  value: string
  note: string
  icon: typeof Activity
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  const color = tone === 'positive' ? 'text-[#c7f36a]' : tone === 'negative' ? 'text-rose-300' : 'text-zinc-100'
  return <div className="min-w-0 rounded-xl border border-white/[0.07] bg-[#111416] p-4 transition-colors hover:border-white/[0.12] sm:p-5">
    <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-zinc-400"><Icon className="size-4" /></span><p className="text-xs font-medium leading-4 text-zinc-400">{label}</p></div>
    <p className={`mt-4 whitespace-nowrap text-lg font-semibold tracking-tight sm:text-xl ${color}`}>{value}</p>
    <p className="mt-1.5 min-h-8 text-[11px] leading-4 text-zinc-500">{note}</p>
  </div>
}

export function SimulatorResults({ simulation, metrics, granularity, sourceDescription, sourceTrades, startBalanceCents, targetCents, accountLabel }: {
  simulation: SimulationResult
  metrics: SimulationMetrics
  granularity: 'trade' | 'monthly' | 'none'
  sourceDescription: string
  sourceTrades: SimulatorTrade[]
  startBalanceCents: number
  targetCents: number
  accountLabel: string
}) {
  const strategy = getStrategySeries(sourceTrades, simulation, startBalanceCents)
  const targetProgress = metrics.targetReached ? 100 : targetCents > 0 ? Math.min(100, Math.max(0, metrics.netPnlCents / targetCents * 100)) : 0
  const axis = (value: number) => shortMoney(value)
  const formatTradeCount = strategy.strategyTradeCount.toLocaleString('pt-BR')
  const statusLabel = metrics.targetReached ? 'Meta atingida' : metrics.breached ? 'Piso atingido' : strategy.strategyTradeCount ? 'Em andamento' : 'Aguardando arquivo'
  const statusStyle = metrics.targetReached ? 'border-[#b9f227]/25 bg-[#b9f227]/[0.08] text-[#c7f36a]' : metrics.breached ? 'border-rose-300/20 bg-rose-300/[0.07] text-rose-200' : 'border-white/[0.1] bg-white/[0.04] text-zinc-300'
  return <div className="space-y-5">
    {granularity === 'monthly' && <p className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-xs leading-5 text-amber-100">{sourceDescription} A curva da conta é uma estimativa por fechamento mensal; ela não revela a sequência de ganhos e perdas dentro de cada mês.</p>}
    {simulation.warnings.length > 0 && <div className="space-y-2">{simulation.warnings.map((warning, index) => <p key={`${warning}-${index}`} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.03] p-4 text-xs leading-5 text-amber-100">{warning}</p>)}</div>}

    <section className="relative overflow-hidden rounded-2xl border border-[#b9f227]/15 bg-[linear-gradient(120deg,rgba(185,242,39,0.085),rgba(17,19,21,0.98)_44%,rgba(17,19,21,1))] p-5 sm:p-7">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c7f36a]">Simulação da conta</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusStyle}`}><span className="mr-1.5 inline-block size-1.5 rounded-full bg-current align-middle" />{statusLabel}</span></div>
          <p className="mt-4 text-xs font-medium text-zinc-400">Saldo da conta · {accountLabel}</p>
          <p className="mt-1 whitespace-nowrap text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{money(metrics.finalBalanceCents)}</p>
          <div className="mt-5 max-w-2xl">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-zinc-300">Progresso da meta</span><span className="font-semibold tabular-nums text-[#d8f9a0]">{Math.round(targetProgress)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/[0.06]"><div className={`h-full rounded-full transition-[width] duration-500 ${metrics.breached ? 'bg-rose-400' : 'bg-[#b9f227]'}`} style={{ width: `${targetProgress}%` }} /></div>
            <p className="mt-2 text-[11px] leading-4 text-zinc-500">{metrics.targetReached ? 'A conta atingiu a meta; o saldo fica fixo enquanto a estratégia segue na amostra.' : metrics.breached ? 'O saldo tocou o piso configurado e a conta simulada parou.' : `Meta de ${money(targetCents)} · resultado atual ${money(metrics.netPnlCents)}.`}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 xl:border-l xl:border-white/[0.08] xl:pl-6">
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Resultado da conta</p><p className={`mt-2 whitespace-nowrap text-base font-semibold tabular-nums ${metrics.netPnlCents < 0 ? 'text-rose-300' : 'text-[#c7f36a]'}`}>{money(metrics.netPnlCents)}</p></div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Trades até o evento</p><p className="mt-2 text-base font-semibold tabular-nums text-zinc-100">{metrics.count.toLocaleString('pt-BR')} <span className="text-xs font-normal text-zinc-500">/ {formatTradeCount}</span></p></div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">DD disponível</p><p className="mt-2 whitespace-nowrap text-base font-semibold tabular-nums text-zinc-100">{money(metrics.remainingBufferCents)}</p></div>
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">DD da conta</p><p className="mt-2 whitespace-nowrap text-base font-semibold tabular-nums text-zinc-100">{money(metrics.maxDrawdownCents)}</p></div>
        </div>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <SummaryStat label="Resultado dos trades" value={money(strategy.strategyNetPnlCents)} icon={Activity} note="Estratégia · amostra completa" tone={strategy.strategyNetPnlCents >= 0 ? 'positive' : 'negative'} />
      <SummaryStat label="Trades analisados" value={formatTradeCount} icon={Gauge} note={`${strategy.strategyWins} ganhos · ${strategy.strategyLosses} perdas · ${strategy.strategyFlats} zerados`} />
      <SummaryStat label="Acerto da amostra" value={strategy.strategyWinRatePercent === null ? '—' : `${strategy.strategyWinRatePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} icon={Target} note={`Profit factor ${strategy.strategyProfitFactor === null ? '—' : strategy.strategyProfitFactor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`} tone="positive" />
      <SummaryStat label="Maior DD observado" value={money(strategy.strategyMaxDrawdownCents)} icon={TrendingDown} note="Sequência completa da estratégia" tone="negative" />
    </div>

    {strategy.data.length ? <>
      <Panel className="overflow-hidden border-white/[0.08] p-4 sm:p-6">
        <SectionHeading title="Estratégia e saldo da conta" description="A estratégia mostra todos os trades. A conta simulada para na meta ou no piso e permanece nesse nível." />
        <div className="mt-4 h-[360px] min-w-0 sm:h-[440px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1000, height: 440 }}>
            <AreaChart data={strategy.data} margin={{ top: 12, right: 18, bottom: 4, left: 8 }}>
              <defs><linearGradient id="strategyBalanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={teal} stopOpacity={0.24} /><stop offset="100%" stopColor={teal} stopOpacity={0.015} /></linearGradient></defs>
              <CartesianGrid stroke="rgba(255,255,255,.075)" vertical={false} />
              <XAxis dataKey="at" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={dateLabel} minTickGap={36} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={axis} axisLine={false} tickLine={false} width={88} domain={['auto', 'auto']} />
              <Tooltip labelFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(String(value)))} formatter={(value, name) => [money(Number(value)), name === 'strategyBalance' ? 'Estratégia · amostra completa' : name === 'accountBalance' ? 'Conta simulada' : 'Piso da conta']} contentStyle={tooltip} />
              <Legend formatter={(value) => value === 'strategyBalance' ? 'Estratégia · amostra completa' : value === 'accountBalance' ? 'Conta simulada' : 'Piso da conta'} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Area dataKey="strategyBalance" type="linear" stroke={teal} strokeWidth={2.5} fill="url(#strategyBalanceFill)" dot={{ r: 2.5, fill: teal, stroke: '#111315', strokeWidth: 1 }} activeDot={{ r: 5 }} name="strategyBalance" />
              <Line dataKey="accountBalance" type="stepAfter" stroke={blue} strokeWidth={2.5} strokeDasharray="7 4" dot={false} activeDot={{ r: 5 }} name="accountBalance" />
              <Line dataKey="accountFloor" type="stepAfter" stroke={amber} strokeWidth={2} dot={false} name="accountFloor" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel className="overflow-hidden border-white/[0.08] p-4 sm:p-6">
        <SectionHeading title="Drawdown ao longo da amostra" description={`Compara o recuo da estratégia nos ${formatTradeCount} trades com o drawdown da conta até o evento.`} />
        <div className="mt-4 h-[280px] min-w-0 sm:h-[340px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1000, height: 340 }}>
            <AreaChart data={strategy.data} margin={{ top: 12, right: 18, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,.075)" vertical={false} />
              <XAxis dataKey="at" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={dateLabel} minTickGap={36} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={axis} axisLine={false} tickLine={false} width={88} />
              <Tooltip labelFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(String(value)))} formatter={(value, name) => [money(Number(value)), name === 'strategyDrawdown' ? 'DD da estratégia' : 'DD da conta simulada']} contentStyle={tooltip} />
              <Legend formatter={(value) => value === 'strategyDrawdown' ? 'Estratégia · amostra completa' : 'Conta simulada · até o evento'} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,.3)" />
              <Area dataKey="strategyDrawdown" type="monotone" stroke={amber} fill={amber} fillOpacity={0.14} strokeWidth={2.5} name="strategyDrawdown" />
              <Line dataKey="accountDrawdown" type="stepAfter" stroke={rose} strokeWidth={2.5} dot={false} name="accountDrawdown" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </> : <Panel className="p-6"><EmptyState title="Selecione um arquivo e leia os dados" description="A curva e as métricas aparecem depois de carregar uma fonte válida e configurar a conta simulada." /></Panel>}
  </div>
}
