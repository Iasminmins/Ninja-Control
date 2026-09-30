'use client'

import { Activity, CircleDollarSign, Gauge, Target, TrendingDown } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, MetricTile, Panel, SectionHeading } from '@/components/workspace/primitives'
import type { SimulationMetrics, SimulationResult } from '@/lib/account-simulator/types'

const lime = '#b9f227'
const blue = '#60a5fa'
const amber = '#fbbf24'
const rose = '#fb7185'
const money = (cents: number | null) => cents === null ? '—' : `US$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tooltip = { background: '#101214', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#f4f4f5', fontSize: 10 }
const shortMoney = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function SimulatorResults({ simulation, metrics, granularity, sourceDescription, startBalanceCents, targetCents }: {
  simulation: SimulationResult
  metrics: SimulationMetrics
  granularity: 'trade' | 'monthly' | 'none'
  sourceDescription: string
  startBalanceCents: number
  targetCents: number
}) {
  const chartData = simulation.points.map((point) => ({
    at: point.timestamp,
    balance: point.balanceCents - startBalanceCents,
    floor: point.floorCents - startBalanceCents,
    drawdown: Math.abs(point.drawdownCents),
  }))
  const targetProgress = metrics.targetReached ? 100 : targetCents > 0 ? Math.min(100, Math.max(0, metrics.netPnlCents / targetCents * 100)) : 0
  const axis = (value: number) => shortMoney(value)
  return <div className="space-y-4">
    {granularity === 'monthly' && <p className="rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100">{sourceDescription} A curva da conta é uma estimativa por fechamento mensal; ela não revela a sequência de ganhos e perdas dentro de cada mês.</p>}
    {simulation.warnings.length > 0 && <div className="space-y-2">{simulation.warnings.map((warning, index) => <p key={`${warning}-${index}`} className="rounded-lg border border-amber-300/15 bg-amber-300/[0.03] p-3 text-[10px] leading-5 text-amber-100">{warning}</p>)}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Resultado líquido simulado" value={money(metrics.netPnlCents)} icon={CircleDollarSign} tone={metrics.netPnlCents < 0 ? 'negative' : 'positive'} note={granularity === 'monthly' ? 'Soma dos resultados reportados por mês' : 'Depois dos filtros e risco configurados'} />
      <MetricTile label="Trades considerados" value={String(metrics.count)} icon={Activity} note={`${metrics.wins} ganhos · ${metrics.losses} perdas · ${metrics.flats} zerados`} />
      <MetricTile label="Acerto" value={metrics.winRatePercent === null ? '—' : `${metrics.winRatePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} icon={Target} note="Trades positivos ÷ trades considerados" />
      <MetricTile label="Profit factor" value={metrics.profitFactor === null ? '—' : metrics.profitFactor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} icon={Gauge} note="Ganhos brutos ÷ perdas brutas" />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Maior drawdown observado" value={money(metrics.maxDrawdownCents)} icon={TrendingDown} tone="negative" note={granularity === 'monthly' ? 'Máximo informado nos relatórios mensais' : 'Pico a vale na ordem cronológica dos trades'} />
      <MetricTile label="Saldo final da simulação" value={money(metrics.finalBalanceCents)} icon={CircleDollarSign} note="Saldo inicial mais resultado simulado" />
      <MetricTile label="Buffer até o piso" value={money(metrics.remainingBufferCents)} icon={Gauge} tone={metrics.remainingBufferCents < 50_000 ? 'negative' : 'positive'} note="Saldo simulado menos piso da conta" />
      <MetricTile label="Risco máximo aplicado" value={money(metrics.maxAppliedRiskCents)} icon={Activity} note={`${metrics.adjustedTrades} trade(s) redimensionados pelas regras`} />
    </div>
    {chartData.length ? <>
      <Panel className="p-4 sm:p-5"><SectionHeading title="Resultado acumulado e piso da conta" description="Valores relativos ao saldo inicial: a linha zero marca o início; o piso mostra o limite de perda." /><div className="mt-3 h-[300px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 300 }}><LineChart data={chartData}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 7)}-01T12:00:00Z`))} minTickGap={28} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={axis} axisLine={false} tickLine={false} width={65} /><Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString('pt-BR')} formatter={(value, name) => [money(Number(value)), name === 'balance' ? 'Resultado acumulado' : 'Piso relativo ao saldo inicial']} contentStyle={tooltip} /><Legend formatter={(value) => value === 'balance' ? 'Resultado acumulado' : 'Piso da conta'}/><ReferenceLine y={0} stroke="rgba(255,255,255,.32)" strokeDasharray="4 4" /><Line dataKey="balance" type="stepAfter" stroke={blue} strokeWidth={2} dot={false} name="balance" /><Line dataKey="floor" type="stepAfter" stroke={rose} strokeWidth={1.5} dot={false} name="floor" /></LineChart></ResponsiveContainer></div></Panel>
      <Panel className="p-4 sm:p-5"><SectionHeading title="Drawdown acumulado" description="Valor positivo da queda a partir do pico, em dólares; valores maiores indicam recuo maior." /><div className="mt-3 h-[250px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 250 }}><AreaChart data={chartData}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 7)}-01T12:00:00Z`))} minTickGap={28} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={axis} axisLine={false} tickLine={false} width={65} /><Tooltip labelFormatter={(value) => new Date(String(value)).toLocaleString('pt-BR')} formatter={(value) => [money(Number(value)), 'Drawdown']} contentStyle={tooltip} /><ReferenceLine y={0} stroke="rgba(255,255,255,.25)" /><Area dataKey="drawdown" type="monotone" stroke={rose} fill={rose} fillOpacity={0.15} strokeWidth={2} name="drawdown" /></AreaChart></ResponsiveContainer></div></Panel>
    </> : <Panel className="p-6"><EmptyState title="Selecione um arquivo e leia os dados" description="A curva e as métricas aparecem depois de carregar uma fonte válida e configurar a conta simulada." /></Panel>}
    <Panel className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xs font-semibold text-zinc-200">Progresso da meta</h2><p className="mt-1 text-[9px] text-zinc-500">{metrics.targetReached ? 'Meta atingida na sequência analisada.' : metrics.breached ? 'O piso configurado foi tocado.' : 'Resultado histórico comparado com a meta configurada.'}</p></div><span className="text-xs font-semibold text-zinc-200">{Math.round(targetProgress)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${metrics.breached ? 'bg-rose-400' : 'bg-[#b9f227]'}`} style={{ width: `${targetProgress}%` }} /></div><div className="mt-3 grid gap-3 text-[9px] text-zinc-500 sm:grid-cols-3"><p>Meta: <strong className="text-zinc-200">{money(targetCents)}</strong></p><p>Trades bloqueados pela trava diária: <strong className="text-zinc-200">{metrics.blockedByDailyLock}</strong></p><p>Trades removidos pelo Entry Market: <strong className="text-zinc-200">{metrics.skippedByEntryMarket}</strong></p></div></Panel>
  </div>
}
