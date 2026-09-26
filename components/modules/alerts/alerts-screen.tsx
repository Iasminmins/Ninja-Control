'use client'

import { useState, type FormEvent } from 'react'
import { Bell, CheckCheck, Plus, Trash2 } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { formatDateTime } from '@/lib/format'
import type { AlertCondition, DemoAlertRule } from '@/lib/demo/types'

const labels: Record<AlertCondition, string> = { 'daily-loss-percent': 'Uso do limite diário', 'drawdown-buffer-percent': 'Buffer de drawdown', 'sync-error': 'Falha de sincronização' }

export function AlertsScreen() {
  const { workspace, updateWorkspace } = useDemoWorkspace()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [condition, setCondition] = useState<AlertCondition>('drawdown-buffer-percent')
  const [threshold, setThreshold] = useState('40')
  const [error, setError] = useState('')
  const unread = workspace.alertEvents.filter((event) => !event.readAt)

  function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(threshold)
    if (!name.trim() || (condition !== 'sync-error' && (!Number.isFinite(value) || value < 1 || value > 100))) { setError('Informe um nome e um limite válido entre 1% e 100%.'); return }
    updateWorkspace((current) => editingId
      ? { ...current, alertRules: current.alertRules.map((rule) => rule.id === editingId ? { ...rule, name: name.trim(), condition, threshold: value } : rule) }
      : { ...current, alertRules: [...current.alertRules, { id: `alert-rule-${crypto.randomUUID()}`, name: name.trim(), condition, threshold: value, enabled: true, accountId: null, provenance: 'demo' }] })
    setName(''); setShowForm(false); setEditingId(null); setError('')
  }

  function beginEdit(rule: DemoAlertRule) {
    setEditingId(rule.id); setName(rule.name); setCondition(rule.condition); setThreshold(String(rule.threshold)); setShowForm(true); setError('')
  }

  return <PageFrame title="Central de alertas" description="Acompanhe ocorrências e mantenha regras locais para a amostra demonstrativa." eyebrow="NOTIFICAÇÕES LOCAIS" actions={<PrimaryButton onClick={() => { setShowForm((value) => !value); setError('') }}><Plus className="size-4" /> Nova regra</PrimaryButton>}>
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Não lidos" value={String(unread.length)} icon={Bell} tone={unread.length ? 'warning' : 'neutral'} note="Ocorrências sintéticas." /><MetricTile label="Regras ativas" value={String(workspace.alertRules.filter((rule) => rule.enabled).length)} icon={Bell} note="Monitoramento local apenas." /><MetricTile label="Histórico" value={String(workspace.alertEvents.length)} icon={CheckCheck} note="Eventos neste navegador." /></section>
    {showForm && <Panel className="mb-5 p-5"><SectionHeading title={editingId ? 'Editar regra' : 'Criar regra'} description="A regra fica neste navegador e não envia notificações externas." /><form onSubmit={addRule} className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end"><label className="text-[10px] text-zinc-500">Nome<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200" value={name} onChange={(e) => setName(e.target.value)} maxLength={70} required /></label><label className="text-[10px] text-zinc-500">Condição<select className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200" value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)}><option value="drawdown-buffer-percent">Buffer de drawdown</option><option value="daily-loss-percent">Uso do limite diário</option><option value="sync-error">Falha de sincronização</option></select></label><label className="text-[10px] text-zinc-500">Limite (%)<input className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200" type="number" min="1" max="100" disabled={condition === 'sync-error'} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label><PrimaryButton type="submit">{editingId ? 'Salvar alterações' : 'Salvar regra'}</PrimaryButton>{error && <p role="alert" className="text-xs text-rose-200 sm:col-span-4">{error}</p>}</form></Panel>}
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"><Panel className="p-5 sm:p-6"><div className="mb-4 flex items-start justify-between gap-3"><SectionHeading title="Ocorrências" description="Marque eventos como lidos para organizar sua revisão." /><button className="inline-flex shrink-0 items-center gap-1 text-[10px] text-zinc-400 hover:text-white" onClick={() => updateWorkspace((current) => ({ ...current, alertEvents: current.alertEvents.map((item) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }) }))}><CheckCheck className="size-3.5" /> Marcar todos</button></div>{workspace.alertEvents.length ? <div className="flex flex-col gap-2">{workspace.alertEvents.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((item) => { const rule = workspace.alertRules.find((entry) => entry.id === item.ruleId); const account = workspace.accounts.find((entry) => entry.id === item.accountId); return <article key={item.id} className={`rounded-lg border p-4 ${item.readAt ? 'border-white/[0.06] bg-white/[0.01]' : 'border-amber-300/20 bg-amber-300/[0.025]'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-zinc-200">{item.message}</p><p className="mt-1 text-[10px] text-zinc-500">{formatDateTime(item.occurredAt)}{account ? ` · ${account.name}` : ''}{rule ? ` · ${rule.name}` : ''}</p></div><StatusPill tone={item.readAt ? 'neutral' : 'warning'}>{item.readAt ? 'LIDO' : 'NOVO'}</StatusPill></div>{!item.readAt && <button className="mt-3 text-[10px] text-amber-100 hover:text-white" onClick={() => updateWorkspace((current) => ({ ...current, alertEvents: current.alertEvents.map((event) => event.id === item.id ? { ...event, readAt: new Date().toISOString() } : event) }))}>Marcar como lido</button>}</article> })}</div> : <EmptyState title="Sem ocorrências" description="Eventos de demonstração aparecerão aqui quando existirem na amostra." />}</Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Regras de alerta" description="Configure limites apenas para organizar a demonstração." />{workspace.alertRules.length ? <div className="flex flex-col gap-3">{workspace.alertRules.map((rule) => <article key={rule.id} className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-medium text-zinc-200">{rule.name}</h3><p className="mt-1 text-[10px] text-zinc-500">{labels[rule.condition]}{rule.condition !== 'sync-error' ? ` · ${rule.threshold}%` : ''}</p></div><StatusPill tone={rule.enabled ? 'positive' : 'neutral'}>{rule.enabled ? 'ATIVA NA DEMO' : 'PAUSADA'}</StatusPill></div><div className="mt-3 flex justify-end gap-3"><button className="text-[10px] text-zinc-400 hover:text-white" onClick={() => beginEdit(rule)}>Editar</button><button className="text-[10px] text-zinc-400 hover:text-white" onClick={() => updateWorkspace((current) => ({ ...current, alertRules: current.alertRules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) }))}>{rule.enabled ? 'Pausar' : 'Ativar'}</button><button aria-label={`Excluir regra ${rule.name}`} className="text-rose-300 hover:text-rose-200" onClick={() => updateWorkspace((current) => ({ ...current, alertRules: current.alertRules.filter((item) => item.id !== rule.id), alertEvents: current.alertEvents.filter((item) => item.ruleId !== rule.id) }))}><Trash2 className="size-3.5" /></button></div></article>)}</div> : <EmptyState title="Nenhuma regra" description="Crie uma regra local para organizar o painel de alertas." />}</Panel></section>
    <p className="mt-4 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-3 text-[10px] leading-4 text-amber-100">Alertas não são enviados por e-mail, SMS, corretoras ou outros serviços. Os eventos apresentados são fictícios.</p>
  </PageFrame>
}
