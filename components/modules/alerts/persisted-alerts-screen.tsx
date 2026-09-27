'use client'

import { useState } from 'react'
import { AlertTriangle, Bell, Check, CircleCheck, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { EmptyState, MetricTile, PageFrame, Panel, SecondaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { WorkspaceAlerts } from '@/lib/alerts/server'
import { formatDateTime } from '@/lib/format'

const text = (value: unknown) => typeof value === 'string' ? value : ''

export function PersistedAlertsScreen({ initial }: { initial: WorkspaceAlerts }) {
  const [rows, setRows] = useState(initial)
  const [error, setError] = useState('')
  const [pending, setPending] = useState('')
  const router = useRouter()
  const open = rows.filter((row) => row.state === 'OPEN').length
  const acknowledged = rows.filter((row) => row.state === 'ACKNOWLEDGED').length
  const critical = rows.filter((row) => row.severity.toUpperCase() === 'CRITICAL' && row.state !== 'RESOLVED').length

  async function changeStatus(id: string, status: 'ACKNOWLEDGED' | 'RESOLVED') {
    setPending(id); setError('')
    const response = await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível salvar a alteração.')
    else {
      const now = new Date().toISOString()
      setRows((current) => current.map((row) => row.id === id ? { ...row, state: status, readAt: row.readAt ?? new Date(now), details: { ...row.details, status } } : row))
      router.refresh()
    }
    setPending('')
  }

  return <PageFrame title="Central de alertas" description="Eventos recebidos dos conectores e persistidos neste workspace." eyebrow="ALERT CENTER" showDemoNotice={false}>
    {error && <p role="alert" className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-4 py-3 text-xs text-rose-200">{error}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Abertos" value={String(open)} icon={Bell} tone={open ? 'warning' : 'neutral'} note="Aguardando confirmação" /><MetricTile label="Críticos não resolvidos" value={String(critical)} icon={ShieldAlert} tone={critical ? 'negative' : 'neutral'} note="Precisam de atenção" /><MetricTile label="Confirmados" value={String(acknowledged)} icon={Check} note="Reconhecidos, ainda não resolvidos" /></div>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Eventos mais recentes" description="Até 200 alertas do Neon. Resolver e confirmar são ações auditadas." />
      {rows.length ? <div className="space-y-3">{rows.map((row) => {
        const severity = row.severity.toUpperCase()
        const tone = severity === 'CRITICAL' || severity === 'HIGH' ? 'danger' : severity === 'WARNING' || severity === 'RISK' ? 'warning' : 'neutral'
        const category = text(row.details.category) || text(row.details.source) || 'SYSTEM'
        const recommended = text(row.details.recommendedAction)
        return <article key={row.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill tone={tone}>{severity}</StatusPill><span className="text-[9px] uppercase tracking-wide text-zinc-500">{category}</span><StatusPill tone={row.state === 'RESOLVED' ? 'positive' : row.state === 'ACKNOWLEDGED' ? 'warning' : 'neutral'}>{row.state}</StatusPill></div><h3 className="text-sm font-medium text-zinc-100">{row.message}</h3><p className="mt-1 text-[10px] text-zinc-500">{row.accountName ? `Conta: ${row.accountName} · ` : ''}{formatDateTime(row.occurredAt.toISOString())}</p>{recommended && <p className="mt-3 text-xs leading-5 text-zinc-400">Ação recomendada: {recommended}</p>}</div><div className="flex shrink-0 gap-2">{row.state === 'OPEN' && <SecondaryButton className="h-8 px-2.5" disabled={pending === row.id} onClick={() => void changeStatus(row.id, 'ACKNOWLEDGED')}><Check className="size-3.5"/>Confirmar</SecondaryButton>}{row.state !== 'RESOLVED' && <SecondaryButton className="h-8 px-2.5" disabled={pending === row.id} onClick={() => void changeStatus(row.id, 'RESOLVED')}><CircleCheck className="size-3.5"/>Resolver</SecondaryButton>}</div></div></article>
      })}</div> : <EmptyState title="Nenhum alerta recebido" description="Alertas de risco, execução, contas e Hunter aparecerão aqui quando um conector ou regra os enviar." />}
      {!rows.length && <p className="mt-4 flex items-center gap-2 text-[10px] text-zinc-600"><AlertTriangle className="size-3.5" />Sem eventos não é possível concluir que a operação está sem risco; confirme se a integração está ativa.</p>}
    </Panel>
  </PageFrame>
}
