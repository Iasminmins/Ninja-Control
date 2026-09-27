'use client'

import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading } from '@/components/workspace/primitives'
import type { WorkspaceTradeReport } from '@/lib/reports/server'
import { formatCurrency, formatDateTime } from '@/lib/format'

const selectClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
const money = (cents: number | null) => cents === null ? '—' : formatCurrency(cents / 100)
function csvCell(value: unknown) {
  const raw = value == null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export function PersistedReportsScreen({ report }: { report: WorkspaceTradeReport }) {
  const [message, setMessage] = useState('')
  const { trades, filters } = report
  const pnlRows = trades.filter((trade) => trade.netPnlCents !== null)
  const pnlCents = pnlRows.reduce((sum, trade) => sum + (trade.netPnlCents ?? 0), 0)
  const wins = pnlRows.filter((trade) => (trade.netPnlCents ?? 0) > 0).length

  function downloadCsv() {
    if (!trades.length) return
    const header = ['Fechado em', 'Aberto em', 'Conta', 'Área', 'Versão', 'Família Hunter', 'Setup', 'Instrumento', 'Lado', 'Quantidade', 'Entrada', 'Saída', 'P&L líquido USD', 'MAE USD', 'MFE USD', 'R:R']
    const data = trades.map((trade) => [trade.closedAt, trade.openedAt, trade.accountName, trade.strategyName, trade.displayVersion, trade.hunterFamily, trade.setupCode, trade.instrument, trade.side === 'buy' ? 'Compra' : 'Venda', trade.quantity, trade.entryPrice, trade.exitPrice, trade.netPnlCents === null ? null : trade.netPnlCents / 100, trade.maeCents === null ? null : trade.maeCents / 100, trade.mfeCents === null ? null : trade.mfeCents / 100, trade.riskReward])
    const csv = `\uFEFF${[header, ...data].map((row) => row.map(csvCell).join(';')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ninja-control-trades-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(`${trades.length} trades persistidos exportados para CSV.`)
  }

  return <PageFrame title="Relatórios" description="Exporte os trades fechados recebidos e persistidos no seu workspace." eyebrow="RELATÓRIOS DO WORKSPACE" showDemoNotice={false}>
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Configurar relatório" description="Os mesmos filtros são aplicados à prévia e ao arquivo CSV." />
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-[10px] text-zinc-500">Período<select name="days" className={selectClass} defaultValue={String(filters.days)}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option><option value="0">Todo o histórico</option></select></label><label className="text-[10px] text-zinc-500">Conta<select name="accountId" className={selectClass} defaultValue={filters.accountId}><option value="all">Todas as contas</option>{report.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[10px] text-zinc-500">Estratégia / versão<select name="strategyId" className={selectClass} defaultValue={filters.strategyId}><option value="all">Todas</option>{report.strategies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="secondary-button min-h-10 self-end" type="submit">Aplicar filtros</button></form>
    </Panel>
    {message && <p role="status" className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-zinc-300">{message}</p>}
    <Panel className="p-5 sm:p-6"><div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><SectionHeading title="Prévia" description={`${trades.length}${report.capped ? ' · limite de 2.000 linhas atingida' : ''} trades fechados carregados`} /><PrimaryButton onClick={downloadCsv} disabled={!trades.length}><Download className="size-3.5" /> Baixar CSV</PrimaryButton></div>
      {trades.length ? <><section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="P&L líquido registrado" value={pnlRows.length ? formatCurrency(pnlCents / 100) : 'Dados insuficientes'} icon={FileText} tone={pnlCents < 0 ? 'negative' : 'positive'} note={`${pnlRows.length} trades com P&L recebido`} /><MetricTile label="Trades incluídos" value={String(trades.length)} icon={FileText} /><MetricTile label="Trades positivos" value={pnlRows.length ? `${wins} · ${(wins / pnlRows.length * 100).toFixed(1).replace('.', ',')}%` : '—'} icon={FileText} note="Calculado apenas onde o P&L existe" /></section>
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]"><table className="w-full min-w-[950px] text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-wider text-zinc-600"><th className="px-4 py-3">Data</th><th className="px-3 py-3">Conta</th><th className="px-3 py-3">Hunter / setup</th><th className="px-3 py-3">Instrumento</th><th className="px-3 py-3">Quantidade</th><th className="px-4 py-3 text-right">P&amp;L</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id} className="border-b border-white/[0.04] last:border-0"><td className="px-4 py-3 text-[10px] text-zinc-500">{formatDateTime(trade.closedAt)}</td><td className="px-3 py-3 text-xs text-zinc-300">{trade.accountName}</td><td className="px-3 py-3 text-xs text-zinc-400">{[trade.hunterFamily, trade.displayVersion, trade.setupCode].filter(Boolean).join(' · ') || trade.strategyName || '—'}</td><td className="px-3 py-3 font-mono text-[10px] text-zinc-500">{trade.instrument} · {trade.side === 'buy' ? 'Compra' : 'Venda'}</td><td className="px-3 py-3 text-xs text-zinc-400">{trade.quantity ?? '—'}</td><td className={`px-4 py-3 text-right font-mono text-xs ${(trade.netPnlCents ?? 0) < 0 ? 'text-rose-300' : 'text-zinc-200'}`}>{money(trade.netPnlCents)}</td></tr>)}</tbody></table></div>
      </> : <EmptyState title="Nenhum trade fechado no filtro" description="O CSV será habilitado depois que o workspace receber trades fechados do conector ou de uma importação." />}
    </Panel>
    <p className="mt-4 text-[10px] leading-4 text-zinc-600">O CSV contém no máximo 2.000 trades mais recentes e não inventa valores para campos ausentes.</p>
  </PageFrame>
}
