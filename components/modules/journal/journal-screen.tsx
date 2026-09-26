'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpen, Save, Search } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { selectTrades } from '@/lib/demo/selectors'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { DemoJournalEntry } from '@/lib/demo/types'

export function JournalScreen() {
  const { workspace, updateWorkspace } = useDemoWorkspace()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(workspace.trades[0]?.id ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const trades = useMemo(() => selectTrades(workspace).filter((trade) => {
    const account = workspace.accounts.find((item) => item.id === trade.accountId)?.name ?? ''
    const strategy = workspace.strategies.find((item) => item.id === trade.strategyId)?.name ?? ''
    return `${trade.instrument} ${account} ${strategy} ${trade.side}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
  }), [workspace, query])
  const selected = workspace.trades.find((trade) => trade.id === selectedId)
  const existing = workspace.journalEntries.find((entry) => entry.tradeId === selectedId)
  const [plan, setPlan] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [review, setReview] = useState('')
  const [loadedEntryId, setLoadedEntryId] = useState('')

  useEffect(() => {
    if (!selectedId || loadedEntryId === selectedId) return
    setPlan(existing?.plan ?? '')
    setNotes(existing?.notes ?? '')
    setTags(existing?.tags.join(', ') ?? '')
    setReview(existing?.review ?? '')
    setLoadedEntryId(selectedId)
  }, [selectedId, loadedEntryId, existing])

  function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const entry: DemoJournalEntry = { id: existing?.id ?? `journal-${crypto.randomUUID()}`, tradeId: selected.id, plan: plan.trim(), notes: notes.trim(), tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), review: review.trim(), updatedAt: new Date().toISOString(), provenance: 'demo' }
    updateWorkspace((current) => ({ ...current, journalEntries: current.journalEntries.some((item) => item.tradeId === selected.id) ? current.journalEntries.map((item) => item.tradeId === selected.id ? entry : item) : [...current.journalEntries, entry] }))
    setMessage('Anotação salva localmente para este trade de demonstração.')
    setError('')
  }

  function selectTrade(id: string) { setSelectedId(id); setLoadedEntryId(''); setMessage('') }
  const textAreaClass = 'mt-1 min-h-24 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 py-2 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

  return <PageFrame title="Diário de trading" description="Registre plano, contexto e revisão pós-trade ligados ao histórico de demonstração." eyebrow="REFLEXÃO PÓS-TRADE">
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Trades disponíveis" value={String(workspace.trades.length)} icon={BookOpen} note="Todos são registros sintéticos." /><MetricTile label="Trades com anotação" value={String(workspace.journalEntries.length)} icon={Save} note="Notas ficam neste navegador." /><MetricTile label="P&L documentado" value={formatCurrency(workspace.journalEntries.reduce((sum, entry) => sum + (workspace.trades.find((trade) => trade.id === entry.tradeId)?.netPnl ?? 0), 0))} icon={BookOpen} note="P&L dos trades que têm diário." /></section>
    {message && <p role="status" className="mb-4 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.03] px-4 py-3 text-xs text-emerald-200">{message}</p>}{error && <p role="alert" className="mb-4 text-xs text-rose-200">{error}</p>}
    <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><Panel className="p-5"><SectionHeading title="Trades" description="Selecione um registro para abrir ou editar seu diário." /><label className="relative mb-4 block"><span className="sr-only">Buscar trades</span><Search className="absolute left-3 top-3 size-3.5 text-zinc-600" /><input className="h-9 w-full rounded-lg border border-white/10 bg-[#0b0d0f] pl-9 pr-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Instrumento, conta ou estratégia" /></label>{trades.length ? <div className="flex max-h-[620px] flex-col gap-2 overflow-y-auto">{trades.map((trade) => { const journal = workspace.journalEntries.some((entry) => entry.tradeId === trade.id); return <button id={trade.id} key={trade.id} onClick={() => selectTrade(trade.id)} aria-pressed={selectedId === trade.id} className={`rounded-lg border p-3 text-left transition-colors ${selectedId === trade.id ? 'border-[#b9f227]/30 bg-[#b9f227]/[0.045]' : 'border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.04]'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-200">{trade.instrument}</span><span className={`font-mono text-xs ${trade.netPnl < 0 ? 'text-rose-300' : 'text-zinc-200'}`}>{formatCurrency(trade.netPnl)}</span></div><p className="mt-1 text-[10px] text-zinc-500">{workspace.accounts.find((account) => account.id === trade.accountId)?.name} · {formatDateTime(trade.closedAt)}</p><span className="mt-2 inline-flex"><StatusPill tone={journal ? 'positive' : 'neutral'}>{journal ? 'COM ANOTAÇÃO' : 'SEM ANOTAÇÃO'}</StatusPill></span></button> })}</div> : <EmptyState title="Nenhum trade encontrado" description="Altere sua busca para localizar outro registro." />}</Panel>
      <Panel className="p-5 sm:p-6">{selected ? <><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><SectionHeading title={`${selected.instrument} · ${selected.side === 'long' ? 'Compra' : 'Venda'}`} description={`${workspace.accounts.find((account) => account.id === selected.accountId)?.name ?? 'Conta arquivada'} · ${formatDateTime(selected.closedAt)}`} /><StatusPill tone="warning">TRADE DE DEMONSTRAÇÃO</StatusPill></div><div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="stat-tile"><p className="metric-label">Quantidade</p><p className="mt-1 text-sm font-semibold text-white">{selected.quantity}</p></div><div className="stat-tile"><p className="metric-label">Entrada</p><p className="mt-1 text-sm font-semibold text-white">{selected.entryPrice.toLocaleString('pt-BR')}</p></div><div className="stat-tile"><p className="metric-label">Saída</p><p className="mt-1 text-sm font-semibold text-white">{selected.exitPrice.toLocaleString('pt-BR')}</p></div><div className="stat-tile"><p className="metric-label">P&amp;L líquido</p><p className={`mt-1 text-sm font-semibold ${selected.netPnl < 0 ? 'text-rose-300' : 'text-[#b9f227]'}`}>{formatCurrency(selected.netPnl)}</p></div></div><form onSubmit={saveEntry} className="flex flex-col gap-4"><label className="text-xs text-zinc-400">Plano antes da operação<textarea className={textAreaClass} value={plan} onChange={(event) => setPlan(event.target.value)} maxLength={2000} placeholder="O que eu esperava observar?" /></label><label className="text-xs text-zinc-400">Contexto e notas<textarea className={textAreaClass} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4000} placeholder="Registre o contexto da decisão." /></label><label className="text-xs text-zinc-400">Tags separadas por vírgula<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="disciplina, abertura" /></label><label className="text-xs text-zinc-400">Revisão pós-trade<textarea className={textAreaClass} value={review} onChange={(event) => setReview(event.target.value)} maxLength={3000} placeholder="O que funcionou e o que faria diferente?" /></label><div className="flex justify-end"><button className="primary-button min-h-9" type="submit"><Save className="size-3.5" /> Salvar diário</button></div></form></> : <EmptyState title="Selecione um trade" description="Escolha um registro na lista para documentar o plano e a revisão." />}</Panel>
    </section>
  </PageFrame>
}
