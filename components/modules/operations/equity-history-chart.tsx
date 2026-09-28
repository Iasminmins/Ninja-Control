'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { getOperationsSnapshot } from '@/lib/operations/server'

type AccountState = NonNullable<Awaited<ReturnType<typeof getOperationsSnapshot>>>['liveAccountStates'][number]

function money(cents: number, currency: string | null) {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(cents / 100) }
  catch { return `${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${currency ?? ''}` }
}

export function EquityHistoryChart({ accounts }: { accounts: AccountState[] }) {
  const accountsWithEquity = accounts.filter((account) => account.equityHistory.length > 0)
  const [accountId, setAccountId] = useState(accountsWithEquity[0]?.tradingAccountId ?? '')
  const [days, setDays] = useState(7)
  const selected = accountsWithEquity.find((account) => account.tradingAccountId === accountId) ?? accountsWithEquity[0]
  const points = useMemo(() => {
    if (!selected) return []
    const since = days === 0 ? 0 : Date.now() - days * 86_400_000
    return selected.equityHistory.filter((point) => new Date(point.receivedAt).getTime() >= since).map((point) => ({ ...point, equity: point.equityCents / 100 }))
  }, [selected, days])

  return <section className="mt-5 rounded-xl border border-white/[0.07] bg-[#101214] p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Histórico de equity recebido</h3><p className="mt-1 text-[10px] text-zinc-500">Série por conta; horário do servidor e do NinjaTrader ficam identificados.</p></div><div className="flex gap-2"><label className="sr-only" htmlFor="equity-account">Conta do gráfico</label><select id="equity-account" className="h-9 rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200" value={selected?.tradingAccountId ?? accountId} onChange={(event) => setAccountId(event.target.value)}><option value="" disabled>Selecione a conta</option>{accountsWithEquity.map((account) => <option key={account.mappingId} value={account.tradingAccountId ?? ''}>{account.accountName}</option>)}</select><label className="sr-only" htmlFor="equity-period">Período do gráfico</label><select id="equity-period" className="h-9 rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value="1">24 horas</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="0">Todo histórico disponível</option></select></div></div>
    {!selected ? <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-zinc-500">Aguardando snapshots de equity da conta vinculada.</div> : !points.length ? <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-zinc-500">Sem snapshots nesse período.</div> : <div className="h-[270px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 270 }}><AreaChart data={points}><defs><linearGradient id="account-equity" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#61e8bc" stopOpacity={0.24} /><stop offset="100%" stopColor="#61e8bc" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="receivedAt" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))} axisLine={false} tickLine={false} minTickGap={24} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value: number) => value.toLocaleString('pt-BR')} axisLine={false} tickLine={false} width={72} domain={['auto', 'auto']} /><Tooltip labelFormatter={(value) => `Recebido ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(value)))}`} formatter={(value) => [money(Number(value) * 100, points[0]?.currency ?? null), 'Equity']} contentStyle={{ background: '#101214', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#f4f4f5', fontSize: 11 }} /><Area type="monotone" dataKey="equity" stroke="#61e8bc" strokeWidth={2} fill="url(#account-equity)" dot={false} /></AreaChart></ResponsiveContainer></div>}
    {selected && <p className="mt-3 text-[10px] text-zinc-500">{selected.accountName} · último snapshot {selected.snapshot?.capturedAt ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(selected.snapshot.capturedAt)) : '—'} · recebido {selected.snapshot?.receivedAt ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(selected.snapshot.receivedAt)) : '—'} · {selected.dataFreshness === 'online' ? 'DADO ATUAL' : selected.dataFreshness === 'stale' ? 'DADO ATRASADO' : 'DADO OFFLINE'}</p>}
  </section>
}
