'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, Panel, SectionHeading } from '@/components/workspace/primitives'
import type { getDashboardChartsData } from '@/lib/dashboard/server'
import { formatCurrency, formatDate } from '@/lib/format'

type ChartData = NonNullable<Awaited<ReturnType<typeof getDashboardChartsData>>>

const selectClass = 'h-8 rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-[10px] text-zinc-200'
const formatDay = (value: string) => formatDate(`${value.slice(0, 10)}T12:00:00-03:00`)

export function DashboardPerformanceCharts({ data, accounts }: { data: ChartData | null; accounts: { id: string; name: string }[] }) {
  const [days, setDays] = useState(30)
  const [accountId, setAccountId] = useState('')
  const since = Date.now() - days * 86_400_000

  const profitCurve = useMemo(() => {
    let cumulative = 0
    return (data?.daily ?? []).filter((point) => new Date(`${point.day}T12:00:00-03:00`).getTime() >= since).map((point) => {
      cumulative += point.netCents
      return { ...point, cumulativeCents: cumulative }
    })
  }, [data, since])

  const accountDrawdown = data?.drawdown.find((item) => item.accountId === accountId) ?? data?.drawdown[0]
  const drawdownCurve = (accountDrawdown?.points ?? []).filter((point) => new Date(point.at).getTime() >= since).map((point) => ({ ...point, drawdown: point.drawdownCents / 100 }))
  const selectedAccountName = accounts.find((account) => account.id === (accountDrawdown?.accountId ?? accountId))?.name

  if (!data) return <Panel className="p-5 sm:p-6"><EmptyState title="Gráficos indisponíveis" description="Não foi possível consultar o histórico de lucro e equity do workspace." /></Panel>

  return <section className="mb-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Desempenho</h3><p className="mt-1 text-[11px] text-zinc-500">Lucro fechado e drawdown observado nas contas.</p></div><label className="sr-only" htmlFor="dashboard-chart-period">Período dos gráficos</label><select id="dashboard-chart-period" className={selectClass} value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="p-5 sm:p-6"><SectionHeading title="Lucro acumulado" description="P&L líquido de trades fechados por dia, no horário de São Paulo." />
        {profitCurve.length ? <div className="h-[250px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 250 }}><AreaChart data={profitCurve} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><defs><linearGradient id="dashboard-profit" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b9f227" stopOpacity={0.25} /><stop offset="100%" stopColor="#b9f227" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => formatDay(String(value))} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value: number) => formatCurrency(value / 100)} axisLine={false} tickLine={false} width={82} /><Tooltip labelFormatter={(value) => formatDay(String(value))} formatter={(value) => [formatCurrency(Number(value) / 100), 'Lucro acumulado']} contentStyle={{ background: '#101214', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#f4f4f5', fontSize: 11 }} /><Area type="monotone" dataKey="cumulativeCents" stroke="#b9f227" strokeWidth={2.5} fill="url(#dashboard-profit)" dot={false} /></AreaChart></ResponsiveContainer></div> : <div className="flex h-[250px] items-center justify-center"><EmptyState title="Sem trades fechados nesse período" description="O gráfico será preenchido quando houver resultados líquidos registrados." /></div>}
      </Panel>

      <Panel className="p-5 sm:p-6"><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><SectionHeading title="Drawdown observado" description="Distância entre o pico anterior e a equity recebida." />{accounts.length > 0 && <label className="sr-only" htmlFor="dashboard-drawdown-account">Conta do gráfico de drawdown</label>}<select id="dashboard-drawdown-account" className={selectClass} value={accountDrawdown?.accountId ?? accountId} onChange={(event) => setAccountId(event.target.value)}><option value="" disabled>Selecione a conta</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
        {drawdownCurve.length ? <><div className="h-[250px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 250 }}><AreaChart data={drawdownCurve} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><defs><linearGradient id="dashboard-drawdown" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#fb7185" stopOpacity={0.25} /><stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => formatDate(String(value))} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value: number) => formatCurrency(value)} axisLine={false} tickLine={false} width={82} /><Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value) => [formatCurrency(Number(value)), 'Drawdown']} contentStyle={{ background: '#101214', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#f4f4f5', fontSize: 11 }} /><Area type="monotone" dataKey="drawdown" stroke="#fb7185" strokeWidth={2} fill="url(#dashboard-drawdown)" dot={false} /></AreaChart></ResponsiveContainer></div><p className="mt-2 text-[10px] text-zinc-500">{selectedAccountName} · histórico de equity disponível</p></> : <div className="flex h-[250px] items-center justify-center"><EmptyState title="Histórico de drawdown indisponível" description="Conecte uma conta e aguarde snapshots de equity para visualizar o drawdown observado." /></div>}
      </Panel>
    </div>
  </section>
}
