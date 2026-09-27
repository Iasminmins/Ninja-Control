'use client'

import { useState } from 'react'
import { AlertTriangle, Radio, ShieldCheck } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { ExecutionSnapshot } from '@/lib/execution/server'
import { formatDateTime } from '@/lib/format'

export function MasterSlaveScreen({ initial }: { initial: ExecutionSnapshot }) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState('')
  const masters = data.nodes.filter((node) => node.role.toLowerCase() === 'master')
  const slaves = data.nodes.filter((node) => node.role.toLowerCase() === 'slave')
  const online = data.nodes.filter((node) => node.status.toLowerCase() === 'online').length

  async function resolve(id: string) {
    setError('')
    const response = await fetch(`/api/execution-divergences/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolve: true }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível resolver a divergência.')
    else setData((current) => ({ ...current, divergences: current.divergences.filter((item) => item.id !== id) }))
  }

  return <PageFrame title="Master / Slave Monitor" description="Heartbeats, estado de conectividade e divergências registradas pelo conector." eyebrow="EXECUÇÃO">
    {error && <p role="alert" className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-3 text-xs text-rose-200">{error}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Masters online" value={`${masters.filter((node) => node.status === 'online').length} / ${masters.length}`} note="Heartbeats nos últimos 60 segundos" icon={Radio} /><MetricTile label="Slaves online" value={`${slaves.filter((node) => node.status === 'online').length} / ${slaves.length}`} note="Heartbeats nos últimos 60 segundos" icon={Radio} /><MetricTile label="Divergências abertas" value={`${data.divergences.length}`} note="Eventos ainda não resolvidos" icon={AlertTriangle} /></div>
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Nós de execução" description={`${online} de ${data.nodes.length} nós ativos. Heartbeat com mais de 60 segundos é mostrado como offline.`} />
      {data.nodes.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.13em] text-zinc-600"><th className="py-3 pr-4">Papel</th><th className="py-3 pr-4">Nó</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Latência</th><th className="py-3 text-right">Último heartbeat</th></tr></thead><tbody>{data.nodes.map((node) => <tr key={node.id} className="border-b border-white/[0.04] last:border-0"><td className="py-3 pr-4 text-[10px] uppercase text-zinc-500">{node.role}</td><td className="py-3 pr-4 text-xs text-zinc-200">{node.name}</td><td className="py-3 pr-4"><StatusPill tone={node.status === 'online' ? 'positive' : 'neutral'}>{node.status.toUpperCase()}</StatusPill></td><td className="py-3 pr-4 text-xs text-zinc-400">{node.latencyMs === null ? '—' : `${node.latencyMs} ms`}</td><td className="py-3 text-right text-[10px] text-zinc-500">{formatDateTime(node.lastHeartbeatAt)}</td></tr>)}</tbody></table></div> : <div className="mt-4"><EmptyState title="Nenhum heartbeat recebido" description="Configure o token do Hunter e envie eventos de heartbeat para registrar Master e Slaves." /></div>}
    </Panel>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Divergências abertas" description="Cada resolução manual é registrada na auditoria." />
      {data.divergences.length ? <div className="mt-4 space-y-2">{data.divergences.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-amber-300/10 bg-amber-300/[0.02] p-3"><div className="flex min-w-0 gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" /><div><p className="text-xs font-medium text-zinc-200">{item.kind}</p><p className="mt-1 text-[10px] text-zinc-500">{formatDateTime(item.detectedAt)}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-zinc-500">{JSON.stringify(item.details, null, 2)}</pre></div></div><button onClick={() => void resolve(item.id)} className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 px-3 text-[10px] text-zinc-300 hover:bg-white/[0.04]"><ShieldCheck className="size-3" />Resolver</button></article>)}</div> : <div className="mt-4"><EmptyState title="Nenhuma divergência aberta" description="Divergências serão registradas quando o conector comparar execução Master e Slaves." /></div>}
    </Panel>
    <p className="mt-4 text-[10px] leading-5 text-zinc-600">Monitor somente de leitura. O Ninja Control registra eventos, mas não envia comandos à plataforma de trading.</p>
  </PageFrame>
}
