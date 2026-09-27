'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Bot, Plus, Save, SlidersHorizontal } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SecondaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { StrategyCatalog } from '@/lib/strategies/server'
import { formatCurrency } from '@/lib/format'

const inputClass = 'mt-1 block min-h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

export function PersistedStrategiesScreen({ initial }: { initial: StrategyCatalog }) {
  const [items, setItems] = useState(initial)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const active = items.filter((item) => !item.archivedAt)
  const totalVersions = items.reduce((sum, item) => sum + item.versionCount, 0)
  const totalTrades = items.reduce((sum, item) => sum + item.tradeCount, 0)

  async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<boolean> {
    setPending(true); setError(''); setNotice('')
    const response = await fetch('/api/strategies', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) { setError(result.error ?? 'Não foi possível salvar os metadados.'); setPending(false); return false }
    else {
      setNotice('Catálogo salvo no Neon; a alteração foi auditada.')
      const refreshed = await fetch('/api/strategies', { cache: 'no-store' }).then((res) => res.ok ? res.json() as Promise<{ strategies: StrategyCatalog }> : null).catch(() => null)
      if (refreshed) setItems(refreshed.strategies)
      setEditingId('')
      router.refresh()
    }
    setPending(false)
    return true
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (await send('POST', { name, description })) { setName(''); setDescription('') }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    await send('PATCH', { id, name: draftName, description: draftDescription })
  }

  return <PageFrame title="Estratégias" description="Catálogo persistido de versões Hunter/HSG/HSD e outras estratégias; os metadados não controlam execução." eyebrow="CATÁLOGO DO WORKSPACE" showDemoNotice={false}>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Entradas ativas" value={String(active.length)} icon={SlidersHorizontal} note="Visíveis no catálogo" /><MetricTile label="Versões cadastradas" value={String(totalVersions)} icon={Bot} note="Hunter, HSG, HSD e outras" /><MetricTile label="Trades vinculados" value={String(totalTrades)} icon={Bot} note="Somente trades associados a uma versão" /></section>
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Nova entrada do catálogo" description="Use as páginas Hunter Versions para versionamento e changelog." /><form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void create(event)}><label className="text-[10px] text-zinc-500">Nome<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label><label className="text-[10px] text-zinc-500">Descrição<input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} /></label><div className="md:col-span-2"><PrimaryButton disabled={pending}><Plus className="size-4" />Criar estratégia</PrimaryButton></div></form></Panel>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Catálogo" description="Resultados são exibidos apenas quando trades estão vinculados a uma versão persistida." />
      {items.length ? <div className="grid gap-3 xl:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
        {editingId === item.id ? <form className="grid gap-3" onSubmit={(event) => void saveEdit(event, item.id)}><label className="text-[10px] text-zinc-500">Nome<input className={inputClass} value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={120} required /></label><label className="text-[10px] text-zinc-500">Descrição<textarea className={inputClass} rows={3} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={3000} /></label><div className="flex justify-end gap-2"><SecondaryButton type="button" onClick={() => setEditingId('')}>Cancelar</SecondaryButton><PrimaryButton disabled={pending}><Save className="size-4" />Salvar</PrimaryButton></div></form> : <>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-zinc-100">{item.name}</h3><p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">{item.description || 'Sem descrição.'}</p></div><StatusPill tone={item.archivedAt ? 'neutral' : item.versionCount ? 'positive' : 'warning'}>{item.archivedAt ? 'ARQUIVADA' : item.versionCount ? 'VERSIONADA' : 'CONFIGURAÇÃO PENDENTE'}</StatusPill></div>
          <div className="mt-4 grid grid-cols-3 gap-3"><div><p className="metric-label">Versões</p><p className="mt-1 text-xs text-zinc-300">{item.versionCount}</p></div><div><p className="metric-label">Trades vinculados</p><p className="mt-1 text-xs text-zinc-300">{item.tradeCount}</p></div><div><p className="metric-label">P&amp;L recebido</p><p className="mt-1 text-xs text-zinc-300">{item.netPnlCents === null ? 'Dados insuficientes' : formatCurrency(item.netPnlCents / 100)}</p></div></div>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3"><SecondaryButton disabled={pending} onClick={() => { setDraftName(item.name); setDraftDescription(item.description ?? ''); setEditingId(item.id) }}>Editar metadados</SecondaryButton><SecondaryButton disabled={pending} onClick={() => void send('PATCH', { id: item.id, archived: !item.archivedAt })}><Archive className="size-3.5" />{item.archivedAt ? 'Reativar' : 'Arquivar'}</SecondaryButton></div>
        </>}
      </article>)}</div> : <EmptyState title="Catálogo vazio" description="Cadastre as estratégias usadas no ecossistema; valores de amostra não são importados." />}
    </Panel>
  </PageFrame>
}
