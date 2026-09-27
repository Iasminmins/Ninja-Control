'use client'

import { useState } from 'react'
import { Check, Clipboard, KeyRound, Radio, RotateCw, ShieldOff } from 'lucide-react'
import { EmptyState, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { formatDateTime } from '@/lib/format'

export function HunterConnectorScreen({ initialConfigured, initialStatus, lastSyncedAt, loadError }: { initialConfigured: boolean; initialStatus: string; lastSyncedAt: string | null; loadError?: string }) {
  const [configured, setConfigured] = useState(initialConfigured)
  const [status, setStatus] = useState(initialStatus)
  const [lastSync, setLastSync] = useState(lastSyncedAt)
  const [token, setToken] = useState('')
  const [error, setError] = useState(loadError ?? '')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const endpoint = typeof window === 'undefined' ? '/api/integrations/hunter-webhook/events' : `${window.location.origin}/api/integrations/hunter-webhook/events`

  async function createToken() {
    setPending(true)
    setError('')
    setToken('')
    const response = await fetch('/api/integrations/hunter-webhook', { method: 'POST' }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { token?: string; status?: string; error?: string } : {}
    if (!response?.ok || !result.token) setError(result.error ?? 'Não foi possível criar o token.')
    else { setToken(result.token); setConfigured(true); setStatus(result.status ?? 'disconnected'); setNotice('Token criado. Copie agora; ele não será exibido novamente.') }
    setPending(false)
  }

  async function revokeToken() {
    setPending(true)
    setError('')
    const response = await fetch('/api/integrations/hunter-webhook', { method: 'DELETE' }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível revogar o token.')
    else { setConfigured(false); setStatus('not_configured'); setLastSync(null); setToken(''); setNotice('Token revogado. O conector não poderá mais enviar eventos.') }
    setPending(false)
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Copiado para a área de transferência.') }
    catch { setError('O navegador não permitiu copiar. Selecione o conteúdo e copie manualmente.') }
  }

  return <PageFrame title="Integrações Hunter" description="Receba eventos do Hunter/NinjaTrader para alimentar trades, contexto, risco e execução." eyebrow="CONECTORES">
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel className="p-5 sm:p-6"><SectionHeading title="Hunter Event Connector" description="Token exclusivo do seu workspace; somente o hash é guardado no Neon." />
        <div className="mt-5 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><div className="flex items-center gap-2"><Radio className="size-4 text-zinc-500" /><span className="text-xs text-zinc-300">{configured ? 'Token configurado' : 'Aguardando configuração'}</span></div><StatusPill tone={status === 'connected' ? 'positive' : 'warning'}>{status === 'connected' ? 'CONECTADO' : configured ? 'AGUARDANDO EVENTO' : 'PENDENTE'}</StatusPill></div>
        <p className="mt-3 text-[10px] text-zinc-500">Último evento recebido: {lastSync ? formatDateTime(lastSync) : 'Nenhum evento'}</p>
        <div className="mt-5 flex flex-wrap gap-2"><PrimaryButton onClick={() => void createToken()} disabled={pending}><KeyRound className="size-4" />{pending ? 'Aguarde…' : configured ? 'Gerar novo token' : 'Criar token'}</PrimaryButton>{configured && <button onClick={() => void revokeToken()} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50"><ShieldOff className="size-4" />Revogar</button>}</div>
        {token && <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3"><p className="text-xs font-semibold text-amber-100">Copie e guarde este token agora</p><p className="mt-1 text-[10px] text-amber-100/65">Ele aparece somente uma vez. Gere outro para substituir este.</p><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 break-all rounded bg-black/25 p-2 text-[10px] text-zinc-200">{token}</code><button onClick={() => void copy(token)} className="icon-button self-start" aria-label="Copiar token"><Clipboard className="size-4" /></button></div></div>}
      </Panel>

      <Panel className="p-5 sm:p-6"><SectionHeading title="Contrato de eventos" description="Endpoint somente de ingestão. Eventos repetidos com o mesmo eventId são tratados uma única vez." />
        <label className="mt-5 block text-[10px] text-zinc-500">URL do endpoint<div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs text-zinc-300">{endpoint}</code><button onClick={() => void copy(endpoint)} className="icon-button" aria-label="Copiar URL"><Clipboard className="size-4" /></button></div></label>
        <p className="mt-4 text-[10px] leading-5 text-zinc-500">Use <code className="text-zinc-300">Authorization: Bearer &lt;token&gt;</code> no conector. Tipos aceitos: <code className="text-zinc-300">heartbeat</code>, <code className="text-zinc-300">trade</code>, <code className="text-zinc-300">order</code>, <code className="text-zinc-300">risk_snapshot</code>, <code className="text-zinc-300">divergence</code> e <code className="text-zinc-300">alert</code>.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/25 p-3 text-[10px] leading-5 text-zinc-400">{`{
  "eventId": "unique-id-from-your-connector",
  "type": "heartbeat",
  "occurredAt": "2026-09-27T15:00:00.000Z",
  "nodeName": "Hunter Master",
  "role": "master",
  "latencyMs": 12
}`}</pre>
        <p className="mt-3 text-[10px] text-zinc-500">Ordens são registradas para acompanhamento. Nenhuma ordem é enviada ou alterada por este endpoint.</p>
        <span className="mt-3 inline-flex items-center gap-2 text-[10px] text-zinc-500"><Check className="size-3" />Contrato completo em docs/integrations/hunter-webhook.md</span>
      </Panel>
    </div>
  </PageFrame>
}
