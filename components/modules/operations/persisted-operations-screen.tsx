'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Radio, ShieldCheck, Wallet } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { FirmLogo } from '@/components/modules/accounts/firm-logo'
import { formatCurrency, formatDateTime } from '@/lib/format'

import type { getOperationsSnapshot } from '@/lib/operations/server'

type Snapshot = NonNullable<Awaited<ReturnType<typeof getOperationsSnapshot>>>

export function PersistedOperationsScreen({ snapshot, loadError }: { snapshot: Snapshot | null; loadError?: string }) {
  const [liveAccountStates, setLiveAccountStates] = useState<Snapshot['liveAccountStates']>(snapshot?.liveAccountStates ?? [])
  useEffect(() => {
    if (!snapshot) return
    let active = true
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const response = await fetch('/api/integrations/ninjatrader-desktop/state', { cache: 'no-store' }).catch(() => null)
      if (!response?.ok) return
      const data = await response.json().catch(() => ({})) as { accounts?: Snapshot['liveAccountStates'] }
      if (active && data.accounts) setLiveAccountStates(data.accounts)
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [snapshot])
  if (!snapshot) return <PageFrame title="Hunter Command Center" description="Visão operacional a partir dos registros persistidos." eyebrow="OPERATIONS" showDemoNotice={false}><p className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-4 text-sm text-rose-200">{loadError ?? 'Sessão necessária. Entre novamente.'}</p></PageFrame>
  const liveByAccount = new Map(liveAccountStates.flatMap((state) => state.tradingAccountId ? [[state.tradingAccountId, state] as const] : []))
  const onlineNodes = snapshot.nodes.filter((node) => node.status.toLocaleLowerCase() === 'online')
  const masters = onlineNodes.filter((node) => node.role.toLocaleLowerCase() === 'master')
  const slaves = snapshot.nodes.filter((node) => node.role.toLocaleLowerCase() === 'slave')
  return <PageFrame title="Hunter Command Center" description="O que está acontecendo agora? Somente dados recebidos e salvos no workspace." eyebrow="OPERATIONS" showDemoNotice={false}>
    {loadError && <p className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-4 text-xs text-rose-200" role="alert">{loadError}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Contas ativas" value={snapshot.totalAccountCount ? `${snapshot.activeAccountCount} / ${snapshot.totalAccountCount}` : '0'} note="Contas cadastradas no Neon" icon={Wallet} />
      <MetricTile label="P&L hoje" value={snapshot.todayPnlCents === null ? 'Dados insuficientes' : formatCurrency(snapshot.todayPnlCents / 100)} note={snapshot.todayPnlCents === null ? 'Nenhum trade fechado recebido hoje.' : 'Trades fechados no horário de São Paulo'} icon={Activity} />
      <MetricTile label="Master / Slaves" value={snapshot.nodes.length ? `${masters.length} / ${slaves.length} online` : 'Sem nós'} note="Heartbeat de nós de execução; contas NinjaTrader aparecem no estado das contas." icon={Radio} />
      <MetricTile label="Alertas críticos" value={`${snapshot.criticalAlerts}`} note={`${snapshot.openDivergences} divergências de execução abertas`} icon={AlertTriangle} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel className="p-5 sm:p-6"><SectionHeading title="Estado das contas" description="Equity, drawdown e buffer aparecem quando uma integração enviar snapshots reais." action={<Link href="/accounts" className="text-xs font-medium text-[#b9f227] hover:underline">Gerenciar contas</Link>} />
        {snapshot.accounts.length ? <div className="mt-4 space-y-2">{snapshot.accounts.map((account) => { const live = liveByAccount.get(account.id) ?? account.liveState; const freshness = live?.freshness; return <div key={account.id} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FirmLogo firm={account.firm} customLogoUrl={account.logoUrl ?? undefined} size={32} /><div><p className="text-xs font-medium text-zinc-200">{account.name}</p><p className="mt-1 text-[10px] text-zinc-500">{account.firm} · {account.stage}</p></div></div><div className="flex items-center gap-2"><StatusPill tone={account.status === 'active' ? 'positive' : 'neutral'}>{account.status.toUpperCase()}</StatusPill><StatusPill tone={freshness === 'online' ? 'positive' : freshness === 'stale' ? 'warning' : freshness === 'offline' ? 'danger' : 'neutral'}>{freshness === 'online' ? 'ONLINE' : freshness === 'stale' ? 'ATRASADA' : freshness === 'offline' ? 'OFFLINE' : 'SEM CONEXÃO'}</StatusPill></div></div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="metric-label">Equity recebida</p><p className="mt-1 text-xs font-semibold text-white">{live?.snapshot?.equityCents == null ? '—' : formatCurrency(live.snapshot.equityCents / 100)}</p></div><div><p className="metric-label">Saldo</p><p className="mt-1 text-xs font-semibold text-white">{live?.snapshot?.balanceCents == null ? '—' : formatCurrency(live.snapshot.balanceCents / 100)}</p></div><div><p className="metric-label">Posições abertas</p><p className="mt-1 text-xs font-semibold text-white">{live?.positions.length ?? 0}</p></div><div><p className="metric-label">Ordens trabalhando</p><p className="mt-1 text-xs font-semibold text-white">{live?.orders.length ?? 0}</p></div></div><p className="mt-2 text-[10px] text-zinc-600">Último evento da conta: {formatDateTime(live?.lastSeenAt)} · snapshot: {formatDateTime(live?.snapshot?.capturedAt ?? null)}</p></div> })}</div> : <div className="mt-4"><EmptyState title="Nenhuma conta conectada" description="Cadastre as contas de prop firm para montar o portfólio." /></div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-white/[0.06] p-3"><p className="metric-label">DD disponível</p><p className="mt-2 text-xs text-zinc-500">Aguardando equity e regras da conta</p></div><div className="rounded-lg border border-white/[0.06] p-3"><p className="metric-label">Status Hunter</p><p className="mt-2 text-xs text-zinc-500">Integração pendente</p></div><div className="rounded-lg border border-white/[0.06] p-3"><p className="metric-label">Divergências</p><p className="mt-2 text-xs text-zinc-200">{snapshot.openDivergences} abertas</p></div></div>
      </Panel>

      <Panel className="p-5 sm:p-6"><SectionHeading title="Nós de execução" description="Heartbeats registrados para Master e Slaves." />
        {snapshot.nodes.length ? <div className="mt-4 space-y-2">{snapshot.nodes.map((node) => <div key={node.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] p-3"><div><p className="text-xs font-medium text-zinc-200">{node.name}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">{node.role} · último heartbeat: {formatDateTime(node.lastHeartbeatAt)}</p></div><StatusPill tone={node.status.toLocaleLowerCase() === 'online' ? 'positive' : 'neutral'}>{node.status.toUpperCase()}</StatusPill></div>)}</div> : <div className="mt-4"><EmptyState title="Nenhum nó Master/Slave registrado" description="Essa área monitora nós de execução. A conexão das contas aparece no painel Estado das contas." /></div>}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.035] p-3 text-[10px] leading-5 text-amber-100/70"><ShieldCheck className="mt-0.5 size-4 shrink-0" />O painel é somente leitura. Nenhuma ordem, posição ou parâmetro é alterado pelo Command Center.</div>
      </Panel>
    </div>

    <Panel className="mt-5 p-5 sm:p-6"><SectionHeading title="Ordens e eventos recentes" description="Feed recebido dos conectores; os dados demonstrativos ficam fora desta tela." />
      {!snapshot.orders.length && !snapshot.events.length ? <div className="mt-4"><EmptyState title="Nenhum evento operacional recebido" description="Ordens e eventos aparecerão aqui após conectar uma fonte Hunter/NinjaTrader." /></div> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.13em] text-zinc-600"><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Instrumento / evento</th><th className="py-2 pr-4">Estado</th><th className="py-2 text-right">Horário</th></tr></thead><tbody>{[...snapshot.orders.map((order) => ({ id: order.id, kind: 'ORDEM', label: `${order.instrument} · ${order.side}`, status: order.status, at: order.submittedAt })), ...snapshot.events.map((event) => ({ id: event.id, kind: 'EVENTO', label: event.eventType, status: event.status, at: event.occurredAt }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map((item) => <tr key={item.id} className="border-b border-white/[0.04] last:border-0"><td className="py-3 pr-4 text-[10px] text-zinc-500">{item.kind}</td><td className="py-3 pr-4 text-xs text-zinc-300">{item.label}</td><td className="py-3 pr-4 text-xs text-zinc-400">{item.status}</td><td className="py-3 text-right text-[10px] text-zinc-500">{formatDateTime(item.at)}</td></tr>)}</tbody></table></div>}
    </Panel>
  </PageFrame>
}
