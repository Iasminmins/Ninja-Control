'use client'

import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Panel, SectionHeading } from '@/components/workspace/primitives'
import type { MonthlySimulationRow } from '@/lib/account-simulator/types'

const money = (cents: number) => `US$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthName = (value: string) => /^\d{4}-\d\d$/.test(value) ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T12:00:00Z`)) : value

function exportRows(rows: MonthlySimulationRow[]) {
  const lines = [['Mês', 'Trades', 'Ganhos', 'Perdas', 'Zerados', 'Acerto %', 'Resultado USD', 'Drawdown USD'], ...rows.map((row) => [row.month, row.count, row.wins, row.losses, row.flats, row.winRatePercent?.toFixed(1) ?? '', (row.netPnlCents / 100).toFixed(2), (row.maxDrawdownCents / 100).toFixed(2)])]
  const csv = `\uFEFF${lines.map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'simulador-resultado-mensal.csv'; anchor.click(); URL.revokeObjectURL(url)
}

export function SimulatorMonths({ rows, granularity }: { rows: MonthlySimulationRow[]; granularity: 'trade' | 'monthly' | 'none' }) {
  const [period, setPeriod] = useState('all')
  const months = useMemo(() => rows.map((row) => row.month).sort(), [rows])
  const visible = useMemo(() => period === 'all' ? rows : rows.filter((row) => row.month === period), [rows, period])
  return <Panel className="p-4 sm:p-5"><SectionHeading title="Resultado por mês" description={granularity === 'monthly' ? 'Resumo informado pelo NinjaTrader; trades e DD permanecem no nível mensal.' : 'Trades classificados pela data/hora de fechamento.'} action={<div className="flex items-center gap-2"><select aria-label="Filtrar mês" className="h-9 rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-[10px] text-zinc-300" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">Todos os meses</option>{months.map((month) => <option key={month} value={month}>{monthName(month)}</option>)}</select><button type="button" disabled={!visible.length} onClick={() => exportRows(visible)} className="secondary-button min-h-9 px-3 text-[10px] disabled:opacity-40"><Download className="size-3.5" />Exportar</button></div>} />
    {visible.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[740px] text-left"><thead><tr className="border-y border-white/[0.06] text-[9px] uppercase tracking-wide text-zinc-600"><th className="px-3 py-2">Mês</th><th className="px-3 py-2 text-right">Trades</th><th className="px-3 py-2 text-right">Ganhos</th><th className="px-3 py-2 text-right">Perdas</th><th className="px-3 py-2 text-right">Acerto</th><th className="px-3 py-2 text-right">Resultado</th><th className="px-3 py-2 text-right">Maior DD</th></tr></thead><tbody>{visible.map((row) => <tr key={row.month} className="border-b border-white/[0.04] text-xs last:border-0"><td className="px-3 py-2.5 text-zinc-300">{monthName(row.month)}</td><td className="px-3 py-2.5 text-right text-zinc-400">{row.count}</td><td className="px-3 py-2.5 text-right text-zinc-400">{row.wins}</td><td className="px-3 py-2.5 text-right text-zinc-400">{row.losses}</td><td className="px-3 py-2.5 text-right text-zinc-400">{row.winRatePercent === null ? '—' : `${row.winRatePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</td><td className={`px-3 py-2.5 text-right font-mono ${row.netPnlCents < 0 ? 'text-rose-300' : 'text-[#b9f227]'}`}>{money(row.netPnlCents)}</td><td className="px-3 py-2.5 text-right font-mono text-rose-300">{money(row.maxDrawdownCents)}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-center text-[10px] text-zinc-500">Selecione e carregue um CSV para montar o histórico mensal.</p>}
  </Panel>
}
