'use client'

import { useMemo, useState } from 'react'
import { Activity, CircleAlert, Radio, RefreshCw } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SecondaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { dateRangeForPeriod, selectTrades } from '@/lib/demo/selectors'
import type { DemoOperationEvent } from '@/lib/demo/types'
import { formatCurrency, formatDateTime } from '@/lib/format'

type Period = '1D' | '7D' | '30D'

const statusLabel: Record<DemoOperationEvent['status'], string> = { success: 'Concluído (demo)', attention: 'Atenção (demo)', error: 'Erro simulado', info: 'Informação (demo)' }
const tone: Record<DemoOperationEvent['status'], 'positive' | 'warning' | 'danger' | 'neutral'> = { success: 'positive', attention: 'warning', error: 'danger', info: 'neutral' }

export function OperationsScreen() {
  const { workspace } = useDemoWorkspace()
  const [period, setPeriod] = useState<Period>('7D')
  const [accountId, setAccountId] = useState('all')
  const [category, setCategory] = useState('all')
  const [refreshMessage, setRefreshMessage] = useState('')
  const range = dateRangeForPeriod(period === '1D' ? '7D' : period, workspace.asOfDate)
  const filteredEvents = useMemo(() => workspace.operationEvents
    .filter((event) => period !== '1D' || event.occurredAt >= `${workspace.asOfDate}T00:00:00-03:00`)
    .filter((event) => event.occurredAt >= range.from && event.occurredAt <= range.to)
    .filter((event) => accountId === 'all' || event.accountId === accountId)
    .filter((event) => category === 'all' || event.category === category)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [workspace.operationEvents, workspace.asOfDate, period, range.from, range.to, accountId, category])
  const recentTrades = selectTrades(workspace, { from: period === '1D' ? `${workspace.asOfDate}T00:00:00-03:00` : range.from, to: range.to })
  const attentionCount = filteredEvents.filter((event) => event.status === 'attention' || event.status === 'error').length
  const configured = workspace.integrations.filter((integration) => integration.connectionState === 'connected').length

  return <PageFrame title="Operações e sincronização" description="Linha do tempo de execuções, eventos de risco e conectores, separados por estado real ou demonstrativo." eyebrow="SALA DE CONTROLE" actions={<SecondaryButton onClick={() => setRefreshMessage(`Visão local atualizada às ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', timeStyle: 'short' }).format(new Date())}. Nenhum serviço externo foi consultado.`)}><RefreshCw className="size-3.5" /> Atualizar visão local</SecondaryButton>}>
    {refreshMessage && <p role="status" className="mb-5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-zinc-400">{refreshMessage}</p>}
    <section className="mb-6 grid gap-3 sm:grid-cols-3"><MetricTile label={`Trades na amostra · ${period}`} value={String(recentTrades.length)} icon={Activity} note="Execuções sintéticas; nenhuma ordem real." /><MetricTile label="Eventos para revisar" value={String(attentionCount)} icon={CircleAlert} tone={attentionCount ? 'warning' : 'neutral'} note="Alertas e falhas simulados." /><MetricTile label="Conectores ativos" value={`${configured} / ${workspace.integrations.length}`} icon={Radio} note="Nenhuma integração real está configurada." /></section>

    <section className="grid gap-4 xl:grid-cols-[0.85fr_1.4fr]">
      <Panel className="p-5 sm:p-6"><SectionHeading title="Conectores" description="Estado atual do ambiente local." /><div className="flex flex-col gap-3">{workspace.integrations.map((integration) => <div key={integration.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.015] p-3"><div><p className="text-xs font-medium text-zinc-200">{integration.name}</p><p className="mt-1 text-[10px] text-zinc-500">{integration.category === 'broker' ? 'Corretora' : 'Empresa de avaliação'}</p></div><StatusPill tone="warning">NÃO CONFIGURADO</StatusPill></div>)}</div><p className="mt-4 text-[10px] leading-4 text-zinc-600">Os estados são de configuração local; credenciais e serviços externos não foram fornecidos.</p></Panel>

      <Panel className="overflow-hidden"><div className="p-5 sm:p-6"><SectionHeading title="Linha do tempo" description="Eventos ligados às contas e trades demonstrativos." /></div><div className="grid gap-2 px-5 pb-5 sm:grid-cols-3"><label className="text-[10px] text-zinc-500">Período<select className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="1D">Hoje</option><option value="7D">7 dias</option><option value="30D">30 dias</option></select></label><label className="text-[10px] text-zinc-500">Conta<select className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="all">Todas as contas</option>{workspace.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="text-[10px] text-zinc-500">Tipo<select className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todos os eventos</option><option value="execution">Execuções</option><option value="sync">Sincronização</option><option value="risk">Risco</option><option value="order">Ordens</option><option value="system">Sistema</option></select></label></div>
        {filteredEvents.length ? <div>{filteredEvents.map((event) => <article key={event.id} className="flex flex-col gap-3 border-t border-white/[0.05] p-4 sm:flex-row sm:items-start"><time className="min-w-32 font-mono text-[10px] text-zinc-500">{formatDateTime(event.occurredAt)}</time><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-medium text-zinc-200">{event.title}</h3><StatusPill tone={tone[event.status]}>{statusLabel[event.status]}</StatusPill></div><p className="mt-1 text-[11px] leading-5 text-zinc-500">{event.detail}</p><p className="mt-1 text-[10px] text-zinc-600">{event.accountId ? workspace.accounts.find((account) => account.id === event.accountId)?.name ?? 'Conta arquivada' : 'Evento geral'}</p></div>{event.amount != null && <span className={`font-mono text-xs ${event.amount < 0 ? 'text-rose-300' : 'text-zinc-300'}`}>{formatCurrency(event.amount)}</span>}</article>)}</div> : <div className="px-5 pb-5"><EmptyState title="Nenhum evento neste filtro" description="Tente ampliar o período ou selecionar outra conta ou tipo." /></div>}
      </Panel>
    </section>
  </PageFrame>
}
