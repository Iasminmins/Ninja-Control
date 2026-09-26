'use client'

import { useState } from 'react'
import { Bot, Plus, Sparkles, SlidersHorizontal } from 'lucide-react'
import { StrategyForm } from './strategy-form'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SecondaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { strategyNetPnl } from '@/lib/demo/selectors'
import { formatCurrency } from '@/lib/format'
import type { DemoStrategy } from '@/lib/demo/types'

export function StrategiesScreen() {
  const { workspace, updateWorkspace } = useDemoWorkspace()
  const [editing, setEditing] = useState<DemoStrategy | null | undefined>(undefined)
  const [message, setMessage] = useState('')
  const visible = workspace.strategies.filter((strategy) => strategy.status !== 'archived')

  function save(strategy: DemoStrategy) {
    updateWorkspace((current) => ({ ...current, strategies: current.strategies.some((item) => item.id === strategy.id) ? current.strategies.map((item) => item.id === strategy.id ? strategy : item) : [...current.strategies, strategy] }))
    setEditing(undefined)
    setMessage(`${strategy.name}: metadados salvos localmente.`)
  }

  function updateStatus(strategy: DemoStrategy, status: DemoStrategy['status']) {
    updateWorkspace((current) => ({ ...current, strategies: current.strategies.map((item) => item.id === strategy.id ? { ...item, status } : item) }))
    setMessage(`${strategy.name}: status de catálogo alterado; nenhuma execução foi iniciada.`)
  }

  return <PageFrame title="Estratégias" description="Catálogo de metadados e associações; estados aqui não controlam execução." eyebrow="CATÁLOGO DE SISTEMAS" actions={<PrimaryButton onClick={() => setEditing(null)}><Plus className="size-4" /> Nova estratégia</PrimaryButton>}>
    {message && <p role="status" className="mb-5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-zinc-400">{message}</p>}
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Metadados ativos" value={String(visible.length)} icon={SlidersHorizontal} note="Ativo significa visível no catálogo." /><MetricTile label="Aguardando definição" value={String(visible.filter((item) => item.status === 'configuration-pending').length)} icon={Bot} tone="warning" note="Hunter e HSG precisam de regras fornecidas pelo responsável." /><MetricTile label="Resultado demonstrativo" value={formatCurrency(workspace.trades.reduce((sum, trade) => sum + trade.netPnl, 0))} icon={Sparkles} tone="positive" note="Soma da amostra; não atribui edge a uma estratégia." /></section>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Catálogo" description="Edite associações e descrições sem alterar trades ou enviar ordens." />{visible.length ? <div className="grid gap-3 xl:grid-cols-2">{visible.map((strategy) => <article key={strategy.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{strategy.name}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{strategy.description || 'Sem descrição.'}</p></div><StatusPill tone={strategy.status === 'configuration-pending' ? 'warning' : strategy.status === 'active' ? 'positive' : 'neutral'}>{strategy.status === 'configuration-pending' ? 'CONFIGURAÇÃO PENDENTE' : strategy.status === 'active' ? 'ATIVA NO CATÁLOGO' : 'PAUSADA NO CATÁLOGO'}</StatusPill></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="metric-label">Contas associadas</p><p className="mt-1 text-xs text-zinc-300">{strategy.accountIds.map((id) => workspace.accounts.find((account) => account.id === id)?.name ?? 'Conta arquivada').join(', ') || 'Nenhuma'}</p></div><div><p className="metric-label">Instrumentos</p><p className="mt-1 text-xs text-zinc-300">{strategy.instruments.join(', ') || 'Não definidos'}</p></div><div><p className="metric-label">P&amp;L da amostra</p><p className="mt-1 text-xs text-zinc-300">{formatCurrency(strategyNetPnl(workspace, strategy.id))}</p></div></div><div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3"><SecondaryButton onClick={() => setEditing(strategy)}>Editar metadados</SecondaryButton><SecondaryButton onClick={() => updateStatus(strategy, strategy.status === 'paused' ? 'active' : 'paused')}>{strategy.status === 'paused' ? 'Retomar catálogo' : 'Pausar catálogo'}</SecondaryButton><SecondaryButton onClick={() => updateStatus(strategy, 'archived')}>Arquivar</SecondaryButton></div></article>)}</div> : <EmptyState title="Nenhuma estratégia no catálogo" description="Crie uma entrada demonstrativa com informações descritivas." />}</Panel>
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-[8vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(undefined) }}><div role="dialog" aria-modal="true" aria-labelledby="strategy-form-title" className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#101214] p-5 shadow-2xl sm:p-7"><h3 id="strategy-form-title" className="mb-5 text-lg font-semibold text-white">{editing ? 'Editar estratégia' : 'Nova estratégia demonstrativa'}</h3><StrategyForm initial={editing} accountOptions={workspace.accounts.map((account) => ({ id: account.id, name: account.name }))} existingNames={workspace.strategies.map((item) => item.name)} onSave={save} onCancel={() => setEditing(undefined)} /></div></div>}
  </PageFrame>
}
