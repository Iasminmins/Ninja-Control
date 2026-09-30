'use client'

import type { TradeColumnMapping, TradeCsvAnalysis } from '@/lib/account-simulator/trade-csv'

const selectClass = 'mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-[10px] text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

export function TradeColumnMapper({ analysis, mapping, onChange, validRows, warnings }: {
  analysis: TradeCsvAnalysis
  mapping: TradeColumnMapping
  onChange: (mapping: TradeColumnMapping) => void
  validRows: number
  warnings: string[]
}) {
  const field = (label: string, key: keyof Omit<TradeColumnMapping, 'pnlIncludesCosts'>, required = false) => <label key={key} className="text-[9px] text-zinc-500">{label}{required && <span className="ml-1 text-rose-300">*</span>}<select className={selectClass} value={mapping[key] ?? ''} onChange={(event) => onChange({ ...mapping, [key]: event.target.value || undefined })}><option value="">Não mapeado</option>{analysis.headers.map((header) => <option key={`${key}-${header}`} value={header}>{header}</option>)}</select></label>
  return <section className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold text-zinc-200">Mapear colunas de trades</h3><p className="mt-1 text-[9px] text-zinc-500">Revise os campos detectados. Data sem horário vira fechamento às 00:00 no fuso escolhido.</p></div><span className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] text-zinc-400">{validRows} linhas válidas</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{field('Data e hora de fechamento', 'timestamp')}{field('Data', 'date')}{field('Hora', 'time')}{field('P&L por operação', 'pnl', true)}{field('Comissão', 'commission')}{field('Slippage', 'slippage')}{field('Direção', 'direction')}{field('Categoria de risco', 'riskCategory')}{field('Entry Market', 'entryMarket')}{field('Risco original do trade', 'originalRisk')}{field('Motivo da saída', 'exitReason')}</div>
    <label className="mt-3 block max-w-sm text-[9px] text-zinc-500">Os custos já estão incluídos no P&amp;L?<select className={selectClass} value={mapping.pnlIncludesCosts ? 'yes' : 'no'} onChange={(event) => onChange({ ...mapping, pnlIncludesCosts: event.target.value === 'yes' })}><option value="yes">Sim, P&amp;L líquido</option><option value="no">Não, subtrair comissão e slippage</option></select></label>
    {warnings.length > 0 && <div className="mt-3 space-y-1">{warnings.map((warning) => <p key={warning} className="text-[9px] leading-4 text-amber-200">{warning}</p>)}</div>}
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-y border-white/[0.06] text-[8px] uppercase tracking-wide text-zinc-600"><th className="px-2 py-2">Linha</th><th className="px-2 py-2">Data</th><th className="px-2 py-2">P&amp;L</th><th className="px-2 py-2">Direção</th><th className="px-2 py-2">Categoria</th></tr></thead><tbody>{analysis.rows.slice(0, 5).map((row, index) => <tr key={`${analysis.fileName}-${index}`} className="border-b border-white/[0.04] text-[9px] text-zinc-400"><td className="px-2 py-2">{index + 2}</td><td className="px-2 py-2">{row[mapping.timestamp ?? mapping.date ?? ''] ?? '—'}{mapping.time ? ` ${row[mapping.time] ?? ''}` : ''}</td><td className="px-2 py-2">{row[mapping.pnl] ?? '—'}</td><td className="px-2 py-2">{mapping.direction ? row[mapping.direction] ?? '—' : '—'}</td><td className="px-2 py-2">{mapping.riskCategory ? row[mapping.riskCategory] ?? '—' : '—'}</td></tr>)}</tbody></table></div>
  </section>
}
