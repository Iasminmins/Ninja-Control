import Link from 'next/link'
import { Activity, AlertTriangle, Radio, Wallet } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { FirmLogo } from '@/components/modules/accounts/firm-logo'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { getOperationsSnapshot } from '@/lib/operations/server'
import type { getDashboardChartsData } from '@/lib/dashboard/server'
import { DashboardPerformanceCharts } from './dashboard-performance-charts'

type Snapshot = NonNullable<Awaited<ReturnType<typeof getOperationsSnapshot>>>
type Charts = Awaited<ReturnType<typeof getDashboardChartsData>>

export function PersistedDashboardScreen({ snapshot, charts, loadError }: { snapshot: Snapshot | null; charts: Charts; loadError?: string }) {
  if (!snapshot) return <PageFrame title="Dashboard" description="Resumo do workspace e das contas conectadas." eyebrow="VISÃO GERAL" showDemoNotice={false}>
    <p className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-4 text-sm text-rose-200">{loadError ?? 'Sessão necessária. Entre novamente.'}</p>
  </PageFrame>

  const activeAccounts = snapshot.accounts.filter((account) => account.status === 'active')
  const onlineStates = snapshot.liveAccountStates.filter((account) => account.freshness === 'online')

  return <PageFrame title="Dashboard" description="Resumo do workspace, das contas e dos resultados registrados." eyebrow="VISÃO GERAL" showDemoNotice={false}>
    {loadError && <p className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-4 text-xs text-rose-200" role="alert">{loadError}</p>}

    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Contas ativas" value={`${snapshot.activeAccountCount} / ${snapshot.totalAccountCount}`} note="Contas cadastradas no workspace" icon={Wallet} />
      <MetricTile label="P&L fechado hoje" value={snapshot.todayPnlCents === null ? '—' : formatCurrency(snapshot.todayPnlCents / 100)} note={snapshot.todayPnlCents === null ? 'Nenhum resultado registrado hoje' : 'Trades fechados no horário de São Paulo'} icon={Activity} tone={snapshot.todayPnlCents === null ? 'neutral' : snapshot.todayPnlCents < 0 ? 'negative' : 'positive'} />
      <MetricTile label="Contas conectadas" value={`${onlineStates.length} / ${snapshot.totalAccountCount}`} note="Com dados atuais recebidos" icon={Radio} tone={onlineStates.length ? 'positive' : 'neutral'} />
      <MetricTile label="Alertas críticos" value={String(snapshot.criticalAlerts)} note={`${snapshot.openDivergences} divergências abertas`} icon={AlertTriangle} tone={snapshot.criticalAlerts ? 'warning' : 'neutral'} />
    </section>

    <DashboardPerformanceCharts data={charts} accounts={snapshot.accounts.map((account) => ({ id: account.id, name: account.name }))} />

    <Panel className="p-5 sm:p-6">
      <SectionHeading title="Resumo das contas" description="Último estado recebido de cada conta cadastrada." action={<Link href="/accounts" className="text-xs font-medium text-[#b9f227] hover:underline">Ver todas as contas</Link>} />
      {activeAccounts.length ? <div className="grid gap-3 xl:grid-cols-2">{activeAccounts.map((account) => {
        const live = snapshot.liveAccountStates.find((state) => state.tradingAccountId === account.id) ?? account.liveState
        const freshness = live?.freshness
        const freshnessTone = freshness === 'online' ? 'positive' : freshness === 'stale' ? 'warning' : freshness === 'offline' ? 'danger' : 'neutral'
        const freshnessLabel = freshness === 'online' ? 'ONLINE' : freshness === 'stale' ? 'ATRASADA' : freshness === 'offline' ? 'OFFLINE' : 'SEM CONEXÃO'
        return <Link key={account.id} href={`/accounts#${account.id}`} className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-4 transition-colors hover:bg-white/[0.035]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><FirmLogo firm={account.firm} customLogoUrl={account.logoUrl ?? undefined} size={32} /><div><p className="text-xs font-medium text-zinc-200">{account.name}</p><p className="mt-1 text-[10px] text-zinc-500">{account.firm} · {account.stage}</p></div></div>
            <div className="flex gap-2"><StatusPill tone={account.status === 'active' ? 'positive' : 'neutral'}>{account.status.toUpperCase()}</StatusPill><StatusPill tone={freshnessTone}>{freshnessLabel}</StatusPill></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="metric-label">Equity</p><p className="mt-1 text-xs font-semibold text-white">{live?.snapshot?.equityCents == null ? '—' : formatCurrency(live.snapshot.equityCents / 100)}</p></div>
            <div><p className="metric-label">Saldo</p><p className="mt-1 text-xs font-semibold text-white">{live?.snapshot?.balanceCents == null ? '—' : formatCurrency(live.snapshot.balanceCents / 100)}</p></div>
            <div><p className="metric-label">Posições</p><p className="mt-1 text-xs font-semibold text-white">{live?.positions.length ?? 0}</p></div>
            <div><p className="metric-label">Atualizado</p><p className="mt-1 text-xs font-semibold text-white">{formatDateTime(live?.lastSeenAt ?? null)}</p></div>
          </div>
        </Link>
      })}</div> : <EmptyState title="Nenhuma conta ativa" description="Cadastre uma conta para acompanhar seu estado e resultados neste painel." />}
    </Panel>

    <section className="mt-5 grid gap-3 sm:grid-cols-2">
      <Link href="/operations" className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 hover:bg-white/[0.04]"><p className="text-xs font-semibold text-zinc-200">Acompanhar operações</p><p className="mt-1 text-[11px] text-zinc-500">Ordens, eventos recentes e nós Master / Slave.</p></Link>
      <Link href="/integrations" className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 hover:bg-white/[0.04]"><p className="text-xs font-semibold text-zinc-200">Configurar integrações</p><p className="mt-1 text-[11px] text-zinc-500">Conecte o NinjaTrader para receber estados atualizados.</p></Link>
    </section>
  </PageFrame>
}
