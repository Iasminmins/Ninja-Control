'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Save, Search } from 'lucide-react'
import { EmptyState, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { JournalEntries } from '@/lib/journal/server'
import { formatCurrency, formatDateTime } from '@/lib/format'

export function PersistedJournalScreen({ initial }: { initial: JournalEntries }) {
  const [entries, setEntries] = useState(initial)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<JournalEntries[number] | null>(null)
  const [plan, setPlan] = useState('')
  const [notes, setNotes] = useState('')
  const [review, setReview] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const filtered = useMemo(() => entries.filter((entry) => `${entry.instrument} ${entry.accountName} ${entry.firmName} ${entry.setup ?? ''} ${entry.patterns.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))), [entries, query])

  function openEntry(entry: JournalEntries[number]) {
    setSelected(entry)
    setPlan(entry.plan)
    setNotes(entry.notes)
    setReview(entry.review)
    setTags(entry.journalTags.join(', '))
    setError('')
  }

  async function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    setPending(true)
    setError('')
    const response = await fetch(`/api/journal/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, notes, review, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível salvar o journal.')
    else {
      const journalTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      setEntries((current) => current.map((entry) => entry.id === selected.id ? { ...entry, plan, notes, review, journalTags, updatedAt: new Date().toISOString() } : entry))
      setNotice('Anotação salva e registrada na auditoria.')
      setSelected(null)
    }
    setPending(false)
  }

  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
  return <PageFrame title="Journal automático" description="Cada trade recebido já cria seu registro; complete a revisão e consulte o contexto capturado." eyebrow="TRADE INTELLIGENCE" showDemoNotice={false}>
    {notice && <p className="mb-5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-zinc-300" role="status">{notice}</p>}
    <Panel className="p-5 sm:p-6"><SectionHeading title="Trades e revisões" description="Entrada, saída, Hunter, fatores, filtros, MAE/MFE e versão aparecem quando o conector os enviar." action={<span className="text-[10px] text-zinc-600">{filtered.length} registros</span>} />
      <label className="relative mt-4 block max-w-lg"><span className="sr-only">Buscar trade</span><Search className="absolute left-3 top-3 size-4 text-zinc-600" /><input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Instrumento, conta, setup ou padrão" /></label>
      {filtered.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.13em] text-zinc-600"><th className="py-3 pr-4">Trade</th><th className="py-3 pr-4">Conta</th><th className="py-3 pr-4">Hunter / setup</th><th className="py-3 pr-4">P&L</th><th className="py-3 pr-4">Padrões</th><th className="py-3 text-right">Horário</th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.id} className="cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.025]" onClick={() => openEntry(entry)}><td className="py-3 pr-4"><p className="text-xs font-medium text-zinc-200">{entry.instrument} · {entry.side.toUpperCase()}</p><p className="mt-1 text-[10px] text-zinc-500">{entry.quantity} contratos · {entry.durationSeconds === null ? 'duração pendente' : `${Math.floor(entry.durationSeconds / 60)}m ${entry.durationSeconds % 60}s`}</p></td><td className="py-3 pr-4"><p className="text-xs text-zinc-300">{entry.accountName}</p><p className="mt-1 text-[10px] text-zinc-500">{entry.firmName}</p></td><td className="py-3 pr-4"><p className="text-xs text-zinc-300">{entry.hunterFamily ?? '—'} · {entry.setup ?? '—'}</p><p className="mt-1 text-[10px] text-zinc-500">{entry.hunterVersion ?? 'versão pendente'}</p></td><td className={`py-3 pr-4 text-xs font-semibold ${entry.netPnl >= 0 ? 'text-[#b9f227]' : 'text-rose-300'}`}>{formatCurrency(entry.netPnl)}</td><td className="py-3 pr-4 text-[10px] text-zinc-500">{entry.patterns.join(', ') || '—'}</td><td className="py-3 text-right text-[10px] text-zinc-500">{formatDateTime(entry.openedAt)}</td></tr>)}</tbody></table></div> : <div className="mt-4"><EmptyState title="Nenhum trade recebido" description="Configure o conector Hunter para preencher o journal automaticamente. Não há trades fictícios nesta página." /><div className="mt-3 text-center"><Link href="/integrations" className="text-xs font-medium text-[#b9f227] hover:underline">Configurar integração</Link></div></div>}
    </Panel>
    {selected && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-[5vh]" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setSelected(null) }}><div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#101214] p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">{selected.instrument} {selected.side.toUpperCase()}</h2><p className="mt-1 text-xs text-zinc-500">{selected.accountName} · {selected.firmName} · {formatDateTime(selected.openedAt)}</p></div><StatusPill tone={selected.netPnl >= 0 ? 'positive' : 'danger'}>{formatCurrency(selected.netPnl)}</StatusPill></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">{[['Entrada', selected.entryPrice], ['Saída', selected.exitPrice], ['MAE', selected.mae], ['MFE', selected.mfe], ['R:R', selected.riskReward], ['Duração', selected.durationSeconds === null ? null : `${selected.durationSeconds}s`], ['Hunter', selected.hunterFamily], ['Versão', selected.hunterVersion]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/[0.06] p-3"><p className="metric-label">{label}</p><p className="mt-1 text-xs text-zinc-200">{value === null || value === undefined ? 'Sem dado' : typeof value === 'number' && ['MAE', 'MFE'].includes(String(label)) ? formatCurrency(value) : String(value)}</p></div>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-white/[0.06] p-3"><p className="metric-label">Fatores de entrada</p><pre className="mt-2 whitespace-pre-wrap text-[10px] text-zinc-400">{Object.keys(selected.factors).length ? JSON.stringify(selected.factors, null, 2) : 'Contexto não enviado'}</pre></div><div className="rounded-lg border border-white/[0.06] p-3"><p className="metric-label">Filtros</p><pre className="mt-2 whitespace-pre-wrap text-[10px] text-zinc-400">{Object.keys(selected.filters).length ? JSON.stringify(selected.filters, null, 2) : 'Filtros não enviados'}</pre></div></div>
      <form onSubmit={(event) => void saveEntry(event)} className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Plano<input className={inputClass} value={plan} onChange={(event) => setPlan(event.target.value)} maxLength={4000} /></label><label className="text-xs text-zinc-400">Tags, separadas por vírgula<input className={inputClass} value={tags} onChange={(event) => setTags(event.target.value)} /></label><label className="text-xs text-zinc-400 sm:col-span-2">Notas<textarea className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-[#0b0d0f] p-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} /></label><label className="text-xs text-zinc-400 sm:col-span-2">Revisão<textarea className="mt-1 min-h-20 w-full rounded-lg border border-white/10 bg-[#0b0d0f] p-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={review} onChange={(event) => setReview(event.target.value)} maxLength={4000} /></label>{error && <p className="text-xs text-rose-200 sm:col-span-2" role="alert">{error}</p>}<div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">Fechar</button><PrimaryButton disabled={pending}><Save className="size-4" />{pending ? 'Salvando…' : 'Salvar journal'}</PrimaryButton></div></form>
    </div></div>}
  </PageFrame>
}
