'use client'

import { useEffect, useState } from 'react'
import { Check, Clipboard, Download, KeyRound, Radio, ShieldOff } from 'lucide-react'
import { EmptyState, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { formatDateTime } from '@/lib/format'

type Discovered = { id: string; externalAccountId: string; externalAccountName: string; tradingAccountId: string | null; lastSeenAt: string; positions: { instrument: string; quantity: number; averagePrice: number | null; unrealizedPnlCents: number | null }[] }
type TradingAccount = { id: string; name: string }

export function NinjaTraderDesktopScreen({ initialConfigured, initialStatus, lastSyncedAt }: { initialConfigured: boolean; initialStatus: string; lastSyncedAt: string | null }) {
  const [configured, setConfigured] = useState(initialConfigured)
  const [status, setStatus] = useState(initialStatus)
  const [lastSync, setLastSync] = useState(lastSyncedAt)
  const [token, setToken] = useState('')
  const [accounts, setAccounts] = useState<Discovered[]>([])
  const [tradingAccounts, setTradingAccounts] = useState<TradingAccount[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const endpoint = typeof window === 'undefined' ? '/api/integrations/ninjatrader-desktop/events' : `${window.location.origin}/api/integrations/ninjatrader-desktop/events`

  async function loadAccounts() {
    const response = await fetch('/api/integrations/ninjatrader-desktop/accounts', { cache: 'no-store' }).catch(() => null)
    const data = response?.ok ? await response.json().catch(() => ({})) as { accounts?: Discovered[]; tradingAccounts?: TradingAccount[] } : {}
    setAccounts(data.accounts ?? [])
    setTradingAccounts(data.tradingAccounts ?? [])
  }
  useEffect(() => { void loadAccounts() }, [])

  async function createToken() {
    setPending(true); setError(''); setToken('')
    const response = await fetch('/api/integrations/ninjatrader-desktop', { method: 'POST' }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { token?: string; status?: string; error?: string } : {}
    if (!response?.ok || !result.token) setError(result.error ?? 'Não foi possível criar o token.')
    else { setToken(result.token); setConfigured(true); setStatus(result.status ?? 'disconnected'); setNotice('Token criado. Copie para a configuração do AddOn; ele aparece uma única vez.') }
    setPending(false)
  }
  async function revokeToken() {
    setPending(true); setError('')
    const response = await fetch('/api/integrations/ninjatrader-desktop', { method: 'DELETE' }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível revogar o token.')
    else { setConfigured(false); setStatus('not_configured'); setLastSync(null); setToken(''); setNotice('Token revogado.') }
    setPending(false)
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Copiado.') }
    catch { setError('Não foi possível copiar; selecione o texto e copie manualmente.') }
  }
  async function linkAccount(mappingId: string, tradingAccountId: string) {
    setPending(true); setError('')
    const response = await fetch('/api/integrations/ninjatrader-desktop/accounts', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mappingId, tradingAccountId: tradingAccountId || null }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível salvar o vínculo.')
    else { setNotice('Vínculo de conta atualizado.'); await loadAccounts() }
    setPending(false)
  }

  return <PageFrame title="NinjaTrader 8 Desktop" description="Sincronize operações de contas LIVE ou Sim/demo conectadas ao NinjaTrader no seu computador. O conector só lê dados e envia eventos para o Ninja Control." eyebrow="INTEGRAÇÃO DE PLATAFORMA" showDemoNotice={false}>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-4 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="p-5 sm:p-6"><SectionHeading title="Pareamento do AddOn" description="Token exclusivo deste workspace. O Neon armazena somente o hash SHA-256." />
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><div className="flex items-center gap-2"><Radio className="size-4 text-zinc-500" /><span className="text-xs text-zinc-300">{configured ? 'Token configurado' : 'Aguardando configuração'}</span></div><StatusPill tone={status === 'connected' ? 'positive' : 'warning'}>{status === 'connected' ? 'CONECTADO' : configured ? 'AGUARDANDO ADDON' : 'PENDENTE'}</StatusPill></div>
        <p className="mt-3 text-[10px] text-zinc-500">Último evento: {lastSync ? formatDateTime(lastSync) : 'Nenhum evento recebido'}</p>
        <div className="mt-4 flex flex-wrap gap-2"><PrimaryButton onClick={() => void createToken()} disabled={pending}><KeyRound className="size-4" />{configured ? 'Gerar novo token' : 'Criar token'}</PrimaryButton>{configured && <button onClick={() => void revokeToken()} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 hover:bg-white/[0.04] disabled:opacity-50"><ShieldOff className="size-4" />Revogar</button>}</div>
        {token && <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3"><p className="text-xs font-semibold text-amber-100">Copie o token para o AddOn agora</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all rounded bg-black/25 p-2 text-[10px] text-zinc-200">{token}</code><button onClick={() => void copy(token)} className="icon-button" aria-label="Copiar token"><Clipboard className="size-4" /></button></div></div>}
        <label className="mt-4 block text-[10px] text-zinc-500">Endpoint de eventos<div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs text-zinc-300">{endpoint}</code><button onClick={() => void copy(endpoint)} className="icon-button" aria-label="Copiar endpoint"><Clipboard className="size-4" /></button></div></label>
        <a href="/downloads/NinjaControl-NinjaTrader8.zip" download className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-zinc-200 hover:bg-white/[0.04]"><Download className="size-4" />Baixar AddOn para Windows</a>
        <p className="mt-3 text-[10px] leading-5 text-zinc-500">Descompacte e compile <code className="text-zinc-300">NinjaControlAddOn.cs</code> no NinjaTrader 8. Depois informe endpoint e token e escolha uma conta. LIVE opera com dinheiro real; confirme o modo exibido antes de iniciar. O AddOn não envia, altera ou cancela ordens.</p>
      </Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Contas descobertas" description="Associe cada conta do NinjaTrader a uma conta existente do Ninja Control." />
        {!accounts.length ? <EmptyState title="Nenhuma conta descoberta ainda" description="Crie o token, conecte o AddOn e aguarde a descoberta da conta LIVE ou Sim/demo." /> : <div className="flex flex-col gap-3">{accounts.map((account) => <article key={account.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-zinc-200">{account.externalAccountName}</h3><p className="mt-1 text-[10px] text-zinc-500">ID externo: {account.externalAccountId} · visto {formatDateTime(account.lastSeenAt)}</p></div><StatusPill tone={account.tradingAccountId ? 'positive' : 'warning'}>{account.tradingAccountId ? 'VINCULADA' : 'AGUARDANDO VÍNCULO'}</StatusPill></div><div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label={`Vincular ${account.externalAccountName}`} value={account.tradingAccountId ?? ''} onChange={(event) => void linkAccount(account.id, event.target.value)} disabled={pending} className="min-h-9 min-w-56 flex-1 rounded-lg border border-white/10 bg-[#101214] px-3 text-xs text-zinc-200"><option value="">Selecione uma conta do Ninja Control</option>{tradingAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{account.positions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{account.positions.map((position) => <span key={position.instrument} className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-400">{position.instrument}: {position.quantity} · P&L aberto {position.unrealizedPnlCents === null ? '—' : `$${(position.unrealizedPnlCents / 100).toFixed(2)}`}</span>)}</div>}</article>)}</div>}
      </Panel>
    </div>
    <Panel className="mt-4 border-emerald-400/10 bg-emerald-400/[0.02] p-4"><p className="flex items-start gap-2 text-[11px] leading-5 text-zinc-400"><Check className="mt-0.5 size-4 shrink-0 text-emerald-300" /><span><strong className="text-emerald-100">Somente leitura, inclusive em LIVE.</strong> O AddOn transmite descoberta de conta, saldo, posições, atualizações de ordens e execuções. Ele não envia, altera, cancela ou liquida ordens; eventos são idempotentes.</span></p></Panel>
  </PageFrame>
}
