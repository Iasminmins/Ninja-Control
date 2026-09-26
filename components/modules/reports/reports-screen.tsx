'use client'

import { useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { calculatePerformance, dateRangeForPeriod, selectTrades } from '@/lib/demo/selectors'
import { formatCurrency, formatDate } from '@/lib/format'

type Period = '7D' | '30D' | '90D' | 'YTD'

function csvCell(value: string | number): string {
  const stringValue = String(value)
  const safe = /^[=+\-@\t\r]/.test(stringValue) ? `'${stringValue}` : stringValue
  return `"${safe.replaceAll('"', '""')}"`
}

export function ReportsScreen() {
  const { workspace } = useDemoWorkspace()
  const [period, setPeriod] = useState<Period>('30D')
  const [accountId, setAccountId] = useState('all')
  const [strategyId, setStrategyId] = useState('all')
  const [message, setMessage] = useState('')
  const range = dateRangeForPeriod(period, workspace.asOfDate)
  const trades = useMemo(() => selectTrades(workspace, { from: range.from, to: range.to, accountId: accountId === 'all' ? undefined : accountId, strategyId: strategyId === 'all' ? undefined : strategyId }), [workspace, range.from, range.to, accountId, strategyId])
  const summary = calculatePerformance(trades)
  const selectClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

  function downloadCsv() {
    if (!trades.length) { setMessage('Não há trades para exportar com os filtros atuais.'); return }
    const rows = [
      ['Tipo', 'Demonstração local'],
      ['Período', `${formatDate(range.from)} — ${formatDate(range.to)}`],
      ['Conta', accountId === 'all' ? 'Todas' : workspace.accounts.find((account) => account.id === accountId)?.name ?? 'Conta'],
      ['Estratégia', strategyId === 'all' ? 'Todas' : workspace.strategies.find((strategy) => strategy.id === strategyId)?.name ?? 'Estratégia'],
      [],
      ['Data e hora', 'Conta', 'Estratégia', 'Instrumento', 'Lado', 'Quantidade', 'P&L líquido USD'],
      ...trades.map((trade) => [trade.closedAt, workspace.accounts.find((account) => account.id === trade.accountId)?.name ?? 'Conta arquivada', workspace.strategies.find((strategy) => strategy.id === trade.strategyId)?.name ?? '', trade.instrument, trade.side === 'long' ? 'Compra' : 'Venda', trade.quantity, trade.netPnl]),
      [],
      ['Resumo P&L líquido USD', summary.netPnl],
      ['Total de trades', summary.tradeCount],
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => csvCell(cell ?? '')).join(';')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ninja-control-demonstracao-${workspace.asOfDate}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('Arquivo CSV de demonstração gerado com os filtros selecionados.')
  }

  return <PageFrame title="Relatórios" description="Monte uma prévia e exporte os registros sintéticos selecionados." eyebrow="RELATÓRIOS LOCAIS">
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Configurar relatório" description="A prévia usa os mesmos registros e cálculos de Desempenho." /><div className="grid gap-3 sm:grid-cols-3"><label className="text-[10px] text-zinc-500">Período<select className={selectClass} value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="7D">7 dias</option><option value="30D">30 dias</option><option value="90D">90 dias</option><option value="YTD">Ano até hoje</option></select></label><label className="text-[10px] text-zinc-500">Conta<select className={selectClass} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="all">Todas as contas</option>{workspace.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></label><label className="text-[10px] text-zinc-500">Estratégia<select className={selectClass} value={strategyId} onChange={(event) => setStrategyId(event.target.value)}><option value="all">Todas as estratégias</option>{workspace.strategies.map((strategy) => <option value={strategy.id} key={strategy.id}>{strategy.name}</option>)}</select></label></div></Panel>
    {message && <p role="status" className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-zinc-300">{message}</p>}
    <Panel className="p-5 sm:p-6"><div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><SectionHeading title="Prévia" description={`${formatDate(range.from)} — ${formatDate(range.to)} · demonstração`} /><PrimaryButton onClick={downloadCsv} disabled={!trades.length}><Download className="size-3.5" /> Baixar CSV</PrimaryButton></div>{trades.length ? <><section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="P&L líquido" value={formatCurrency(summary.netPnl)} icon={FileText} tone={summary.netPnl < 0 ? 'negative' : 'positive'} /><MetricTile label="Trades incluídos" value={String(summary.tradeCount)} icon={FileText} note="Contagem do conjunto filtrado." /><MetricTile label="Trades positivos" value={summary.winRate == null ? '—' : `${summary.winningTrades} · ${Math.round(summary.winRate * 100)}%`} icon={FileText} note="Proporção no conjunto filtrado." /></section><div className="overflow-x-auto rounded-lg border border-white/[0.06]"><table className="w-full text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-wider text-zinc-600"><th className="px-4 py-3">Data</th><th className="px-3 py-3">Conta</th><th className="px-3 py-3">Estratégia</th><th className="px-3 py-3">Instrumento</th><th className="px-4 py-3 text-right">P&amp;L</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id} className="border-b border-white/[0.04] last:border-0"><td className="px-4 py-3 text-[10px] text-zinc-500">{formatDate(trade.closedAt)}</td><td className="px-3 py-3 text-xs text-zinc-300">{workspace.accounts.find((account) => account.id === trade.accountId)?.name}</td><td className="px-3 py-3 text-xs text-zinc-400">{workspace.strategies.find((strategy) => strategy.id === trade.strategyId)?.name}</td><td className="px-3 py-3 font-mono text-[10px] text-zinc-500">{trade.instrument}</td><td className="px-4 py-3 text-right font-mono text-xs text-zinc-200">{formatCurrency(trade.netPnl)}</td></tr>)}</tbody></table></div></> : <EmptyState title="Prévia sem dados" description="Altere os filtros ou período antes de exportar." />}</Panel>
    <p className="mt-4 text-[10px] leading-4 text-zinc-600">O arquivo exportado será marcado como demonstração e conterá apenas os trades sintéticos filtrados, sem credenciais.</p>
  </PageFrame>
}
