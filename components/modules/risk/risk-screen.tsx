'use client'

import { useState, type FormEvent } from 'react'
import { AlertTriangle, Plus, ShieldCheck } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { accountBalance, accountDailyLossUsePercent, selectAccounts } from '@/lib/demo/selectors'
import { formatCurrency, formatPercent, formatDateTime } from '@/lib/format'
import type { AlertCondition, DemoRiskRule } from '@/lib/demo/types'

const conditionLabels: Record<AlertCondition, string> = { 'daily-loss-percent': 'Uso do limite diário (%)', 'drawdown-buffer-percent': 'Buffer de drawdown abaixo de (%)', 'sync-error': 'Falha de sincronização' }

export function RiskScreen() {
  const { workspace, updateWorkspace } = useDemoWorkspace()
  const [message, setMessage] = useState('')
  const [newRule, setNewRule] = useState(false)
  const [name, setName] = useState('')
  const [condition, setCondition] = useState<AlertCondition>('drawdown-buffer-percent')
  const [threshold, setThreshold] = useState('40')
  const [error, setError] = useState('')
  const accounts = selectAccounts(workspace, { lifecycle: 'active' })
  const attention = accounts.filter((account) => account.drawdownBufferPercent < 40)
  const enabled = workspace.riskRules.filter((rule) => rule.enabled).length

  function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(threshold)
    if (!name.trim() || !Number.isFinite(value) || value <= 0 || value > 100) { setError('Informe um nome e um limite entre 0 e 100%.'); return }
    const rule: DemoRiskRule = { id: `risk-${crypto.randomUUID()}`, name: name.trim(), description: 'Regra local de monitoramento para dados sintéticos.', condition, threshold: value, enabled: true, scopeAccountIds: [], provenance: 'demo' }
    updateWorkspace((current) => ({ ...current, riskRules: [...current.riskRules, rule] }))
    setNewRule(false); setName(''); setThreshold('40'); setError(''); setMessage('Regra demonstrativa salva. Ela não altera nem protege uma conta real.')
  }

  function updateAccountLimit(accountId: string, field: 'dailyLossLimit' | 'trailingDrawdownLimit' | 'drawdownBufferPercent', raw: string) {
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0 || (field === 'drawdownBufferPercent' && value > 100)) { setMessage('Informe um número válido; buffer deve estar entre 1% e 100%.'); return }
    updateWorkspace((current) => ({ ...current, accounts: current.accounts.map((account) => account.id === accountId ? { ...account, [field]: value } : account) }))
    setMessage('Limite de demonstração atualizado localmente; nenhuma proteção real foi aplicada.')
  }

  function toggleRule(rule: DemoRiskRule) {
    updateWorkspace((current) => ({ ...current, riskRules: current.riskRules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) }))
    setMessage(`Regra ${rule.enabled ? 'pausada' : 'ativada'} somente no ambiente demonstrativo.`)
  }

  const numberClass = 'h-8 w-28 rounded-md border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
  return <PageFrame title="Central de risco" description="Edite limites e regras de monitoramento sobre uma amostra sintética. Nada é enviado à corretora." eyebrow="GUARDRAILS DEMONSTRATIVOS" actions={<PrimaryButton onClick={() => { setNewRule((value) => !value); setError('') }}><Plus className="size-4" /> Nova regra</PrimaryButton>}>
    {message && <p role="status" className="mb-5 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] px-4 py-3 text-xs text-amber-100">{message}</p>}
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Contas ativas" value={String(accounts.length)} icon={ShieldCheck} note="Valores demonstrativos." /><MetricTile label="Contas abaixo de 40%" value={String(attention.length)} icon={AlertTriangle} tone={attention.length ? 'warning' : 'neutral'} note="Limite visual de atenção usado nesta amostra." /><MetricTile label="Regras ligadas" value={`${enabled} / ${workspace.riskRules.length}`} icon={ShieldCheck} note="Ativas apenas como monitoramento local." /></section>
    {newRule && <Panel className="mb-5 p-5"><SectionHeading title="Nova regra demonstrativa" description="A regra só atualiza o estado local e não aciona qualquer proteção externa." /><form onSubmit={saveRule} className="grid gap-3 sm:grid-cols-[1fr_1fr_150px_auto] sm:items-end"><label className="text-[10px] text-zinc-500">Nome<input className={`${numberClass} mt-1 h-10 w-full`} value={name} onChange={(event) => setName(event.target.value)} maxLength={70} required /></label><label className="text-[10px] text-zinc-500">Condição<select className={`${numberClass} mt-1 h-10 w-full`} value={condition} onChange={(event) => setCondition(event.target.value as AlertCondition)}><option value="drawdown-buffer-percent">Buffer abaixo de</option><option value="daily-loss-percent">Uso do limite diário</option><option value="sync-error">Falha de sincronização</option></select></label><label className="text-[10px] text-zinc-500">Limite (%)<input className={`${numberClass} mt-1 h-10 w-full`} type="number" min="1" max="100" value={threshold} onChange={(event) => setThreshold(event.target.value)} required disabled={condition === 'sync-error'} /></label><PrimaryButton type="submit">Salvar</PrimaryButton>{error && <p role="alert" className="text-xs text-rose-200 sm:col-span-4">{error}</p>}</form></Panel>}
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"><Panel className="p-5 sm:p-6"><SectionHeading title="Matriz por conta" description="Limites e buffers editáveis apenas nos dados locais." />{accounts.length ? <div className="flex flex-col gap-4">{accounts.map((account) => <article key={account.id} className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-xs font-semibold text-zinc-200">{account.name}</h3><p className="mt-1 text-[10px] text-zinc-500">Saldo de demonstração · {formatCurrency(accountBalance(workspace, account))}</p></div><StatusPill tone={account.drawdownBufferPercent < 40 ? 'warning' : 'positive'}>{account.drawdownBufferPercent < 40 ? 'ATENÇÃO' : 'AMOSTRA'}</StatusPill></div><div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${account.drawdownBufferPercent < 40 ? 'bg-amber-300' : 'bg-[#b9f227]'}`} style={{ width: `${account.drawdownBufferPercent}%` }} /></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-[9px] text-zinc-500">Buffer (%)<input className={`${numberClass} mt-1 w-full`} type="number" min="1" max="100" defaultValue={account.drawdownBufferPercent} key={`${account.id}-${account.drawdownBufferPercent}`} onBlur={(event) => updateAccountLimit(account.id, 'drawdownBufferPercent', event.target.value)} /></label><label className="text-[9px] text-zinc-500">Limite diário (USD)<input className={`${numberClass} mt-1 w-full`} type="number" min="1" defaultValue={account.dailyLossLimit} key={`${account.id}-daily-${account.dailyLossLimit}`} onBlur={(event) => updateAccountLimit(account.id, 'dailyLossLimit', event.target.value)} /></label><label className="text-[9px] text-zinc-500">Trailing DD (USD)<input className={`${numberClass} mt-1 w-full`} type="number" min="1" defaultValue={account.trailingDrawdownLimit} key={`${account.id}-trail-${account.trailingDrawdownLimit}`} onBlur={(event) => updateAccountLimit(account.id, 'trailingDrawdownLimit', event.target.value)} /></label></div><p className="mt-3 text-[10px] text-zinc-500">Uso do limite diário na amostra: {formatPercent(accountDailyLossUsePercent(workspace, account) / 100)}</p></article>)}</div> : <EmptyState title="Sem contas ativas" description="Cadastre contas demonstrativas para configurar limites locais." />}</Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Regras de monitoramento" description="Ativar aqui não protege contas reais." /><div className="flex flex-col gap-3">{workspace.riskRules.map((rule) => <article key={rule.id} className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-medium text-zinc-200">{rule.name}</h3><p className="mt-1 text-[10px] leading-4 text-zinc-500">{conditionLabels[rule.condition]} · {rule.condition !== 'sync-error' ? `${rule.threshold}%` : 'sem limite numérico'}</p></div><StatusPill tone={rule.enabled ? 'positive' : 'neutral'}>{rule.enabled ? 'LIGADA NA DEMO' : 'PAUSADA'}</StatusPill></div><div className="mt-3 flex justify-end gap-2"><button className="text-[10px] text-zinc-400 hover:text-white" onClick={() => toggleRule(rule)}>{rule.enabled ? 'Pausar' : 'Ativar na demo'}</button><button className="text-[10px] text-rose-300 hover:text-rose-200" onClick={() => updateWorkspace((current) => ({ ...current, riskRules: current.riskRules.filter((item) => item.id !== rule.id) }))}>Excluir</button></div></article>)}</div><div className="mt-5 border-t border-white/[0.06] pt-4"><SectionHeading title="Eventos de risco de exemplo" description="Histórico sintético da operação." />{workspace.operationEvents.filter((event) => event.category === 'risk').length ? workspace.operationEvents.filter((event) => event.category === 'risk').map((event) => <p key={event.id} className="mt-2 text-[10px] leading-4 text-zinc-500">{formatDateTime(event.occurredAt)} · {event.detail}</p>) : <p className="text-[10px] text-zinc-500">Nenhum evento na amostra.</p>}</div></Panel></section>
    <p className="mt-4 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-3 text-[10px] leading-4 text-amber-100">Limites, buffers e regras desta página são uma simulação local. Nenhum alerta foi enviado e nenhuma posição será reduzida ou encerrada.</p>
  </PageFrame>
}
