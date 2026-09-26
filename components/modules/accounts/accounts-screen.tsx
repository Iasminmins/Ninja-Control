'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CircleDollarSign, Plus, RotateCcw, Search, ShieldCheck, Wallet } from 'lucide-react'
import { AccountForm } from './account-form'
import { FirmLogo } from './firm-logo'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SecondaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { accountBalance, accountNetPnl, selectAccounts, selectTrades } from '@/lib/demo/selectors'
import type { AccountLifecycle, DemoAccount } from '@/lib/demo/types'
import { formatCurrency, formatDateTime } from '@/lib/format'

export function AccountsScreen() {
  const { workspace, updateWorkspace, resetWorkspace, storageNotice } = useDemoWorkspace()
  const [query, setQuery] = useState('')
  const [firm, setFirm] = useState('all')
  const [lifecycle, setLifecycle] = useState<AccountLifecycle | 'all'>('active')
  const [sort, setSort] = useState<'name' | 'balance' | 'pnl'>('name')
  const [formAccount, setFormAccount] = useState<DemoAccount | null | undefined>(undefined)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const accounts = useMemo(() => {
    const filtered = selectAccounts(workspace, { search: query, firm, lifecycle })
    return [...filtered].sort((a, b) => sort === 'balance' ? accountBalance(workspace, b) - accountBalance(workspace, a) : sort === 'pnl' ? accountNetPnl(workspace, b.id) - accountNetPnl(workspace, a.id) : a.name.localeCompare(b.name, 'pt-BR'))
  }, [workspace, query, firm, lifecycle, sort])
  const activeAccounts = workspace.accounts.filter((account) => account.lifecycle === 'active')
  const capital = activeAccounts.reduce((sum, account) => sum + account.startingCapital, 0)
  const funded = activeAccounts.filter((account) => account.kind === 'funded').length
  const pendingPayouts = workspace.payouts.filter((payout) => payout.status === 'requested' || payout.status === 'approved' || payout.status === 'processing').reduce((sum, payout) => sum + payout.amount, 0)
  const selectedAccount = workspace.accounts.find((account) => account.id === detailId)
  const detailsTrades = detailId ? selectTrades(workspace, { accountId: detailId }) : []
  const detailsPayouts = workspace.payouts.filter((payout) => payout.accountId === detailId)
  const firms = [...new Set(workspace.accounts.map((account) => account.firm))]

  function saveAccount(account: DemoAccount) {
    updateWorkspace((current) => ({ ...current, accounts: current.accounts.some((item) => item.id === account.id) ? current.accounts.map((item) => item.id === account.id ? account : item) : [...current.accounts, account] }))
    setFormAccount(undefined)
    setMessage(`${account.name} salva nos dados de demonstração.`)
    setError('')
  }

  function archiveAccount(account: DemoAccount) {
    updateWorkspace((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === account.id ? { ...item, lifecycle: item.lifecycle === 'active' ? 'archived' : 'active' } : item) }))
    setMessage(`${account.name} ${account.lifecycle === 'active' ? 'arquivada' : 'reativada'}; o histórico foi preservado.`)
  }

  function restoreDemo() {
    if (window.confirm('Restaurar todos os dados desta demonstração? As alterações locais atuais serão substituídas.')) {
      resetWorkspace()
      setQuery('')
      setFirm('all')
      setLifecycle('active')
      setFormAccount(undefined)
      setDetailId(null)
      setMessage('Conjunto demonstrativo restaurado.')
    }
  }

  const inputClass = 'h-10 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
  return <PageFrame title="Contas e funding" description="Organize contas de demonstração, limites e saques em um portfólio único." eyebrow="MESA DE CAPITAL" actions={<><SecondaryButton onClick={restoreDemo}><RotateCcw className="size-3.5" /> Restaurar demonstração</SecondaryButton><PrimaryButton onClick={() => { setFormAccount(null); setError('') }}><Plus className="size-4" /> Nova conta</PrimaryButton></>}>
    {(storageNotice || message) && <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-zinc-300" role="status"><span>{message || storageNotice}</span><button className="text-zinc-500 hover:text-white" onClick={() => setMessage('')} aria-label="Fechar mensagem">Fechar</button></div>}
    <section className="mb-6 grid gap-3 sm:grid-cols-3">
      <MetricTile label="Capital inicial monitorado" value={formatCurrency(capital)} note={`${activeAccounts.length} contas ativas · somente demonstração`} icon={Wallet} />
      <MetricTile label="Contas financiadas" value={`${funded}`} note={`de ${activeAccounts.length} contas ativas`} icon={ShieldCheck} />
      <MetricTile label="Saques pendentes" value={formatCurrency(pendingPayouts)} note="Solicitados, aprovados ou em processamento" icon={CircleDollarSign} />
    </section>

    <Panel className="mb-6 p-5 sm:p-6">
      <SectionHeading title="Portfólio de contas" description="Saldos calculados a partir do capital inicial e dos trades sintéticos." action={<span className="text-[10px] text-zinc-600">{accounts.length} exibidas</span>} />
      <div className="mb-4 grid gap-2 md:grid-cols-[minmax(180px,1fr)_170px_170px_170px]">
        <label className="relative"><span className="sr-only">Buscar conta</span><Search className="absolute left-3 top-3 size-4 text-zinc-600" /><input className={`${inputClass} w-full pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conta ou provedor" /></label>
        <label className="sr-only" htmlFor="account-firm">Empresa</label><select id="account-firm" className={inputClass} value={firm} onChange={(event) => setFirm(event.target.value)}><option value="all">Todas as empresas</option>{firms.map((value) => <option key={value}>{value}</option>)}</select>
        <label className="sr-only" htmlFor="account-state">Estado</label><select id="account-state" className={inputClass} value={lifecycle} onChange={(event) => setLifecycle(event.target.value as AccountLifecycle | 'all')}><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select>
        <label className="sr-only" htmlFor="account-sort">Ordenar por</label><select id="account-sort" className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="name">Ordenar: nome</option><option value="balance">Ordenar: saldo</option><option value="pnl">Ordenar: P&amp;L</option></select>
      </div>
      {accounts.length === 0 ? <EmptyState title="Nenhuma conta encontrada" description="Ajuste os filtros ou cadastre uma conta de demonstração." /> : <div className="grid gap-3 xl:grid-cols-2">
        {accounts.map((account) => <article id={account.id} key={account.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><FirmLogo firm={account.firm} customLogoUrl={account.firmLogoUrl} /><div><h3 className="text-sm font-semibold text-white">{account.name.trim() || `Conta ${account.firm}`}</h3><p className="mt-1 text-[10px] tracking-wide text-zinc-500">{account.firm} · {account.stage} · Dados fictícios</p></div></div><div className="flex items-center gap-2"><StatusPill tone={account.lifecycle === 'active' ? 'positive' : 'neutral'}>{account.lifecycle === 'active' ? 'ATIVA' : 'ARQUIVADA'}</StatusPill><StatusPill tone="warning">NÃO CONECTADA</StatusPill></div></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="metric-label">Saldo demonstrativo</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(accountBalance(workspace, account))}</p></div><div><p className="metric-label">P&amp;L da amostra</p><p className={`mt-1 text-sm font-semibold ${accountNetPnl(workspace, account.id) >= 0 ? 'text-[#b9f227]' : 'text-rose-300'}`}>{formatCurrency(accountNetPnl(workspace, account.id))}</p></div><div><p className="metric-label">Buffer simulado</p><p className={`mt-1 text-sm font-semibold ${account.drawdownBufferPercent < 40 ? 'text-amber-200' : 'text-zinc-100'}`}>{account.drawdownBufferPercent}%</p></div><div><p className="metric-label">Trades de exemplo</p><p className="mt-1 text-sm font-semibold text-white">{workspace.trades.filter((trade) => trade.accountId === account.id).length}</p></div></div>
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-3"><button className="text-xs font-medium text-[#b9f227] hover:underline" onClick={() => setDetailId(detailId === account.id ? null : account.id)} aria-expanded={detailId === account.id}>{detailId === account.id ? 'Fechar detalhes' : 'Ver detalhes'}</button><div className="flex gap-2"><SecondaryButton className="h-8 px-2.5" onClick={() => setFormAccount(account)}>Editar</SecondaryButton><SecondaryButton className="h-8 px-2.5" onClick={() => archiveAccount(account)}>{account.lifecycle === 'active' ? 'Arquivar' : 'Reativar'}</SecondaryButton></div></div>
          {detailId === account.id && selectedAccount && <div className="mt-4 grid gap-4 border-t border-white/[0.06] pt-4 md:grid-cols-2"><div><h4 className="text-xs font-semibold text-zinc-300">Limites e atualização</h4><p className="mt-2 text-xs leading-5 text-zinc-500">Limite diário {formatCurrency(selectedAccount.dailyLossLimit)} · drawdown móvel {formatCurrency(selectedAccount.trailingDrawdownLimit)} · última sincronização: {formatDateTime(selectedAccount.lastSyncedAt)}</p><p className="mt-2 text-[10px] text-amber-200">Valores ilustrativos; nenhum provedor está conectado.</p></div><div><h4 className="text-xs font-semibold text-zinc-300">Histórico associado</h4><p className="mt-2 text-xs text-zinc-500">{detailsTrades.length} trades · {detailsPayouts.length} saques</p><div className="mt-2 flex flex-wrap gap-2">{detailsTrades.slice(0, 3).map((trade) => <Link key={trade.id} href={`/trading-journal#${trade.id}`} className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10">{trade.instrument} · {formatCurrency(trade.netPnl)}</Link>)}</div>{detailsPayouts.map((payout) => <p key={payout.id} className="mt-2 text-[10px] text-zinc-500">Saque {formatCurrency(payout.amount)} · {payout.status}</p>)}</div></div>}
        </article>)}
      </div>}
    </Panel>

    <Panel className="overflow-hidden">
      <div className="p-5 sm:p-6"><SectionHeading title="Registro de saques" description="Estados de exemplo vinculados às contas acima." /></div>
      {workspace.payouts.length === 0 ? <div className="px-5 pb-5"><EmptyState title="Nenhum saque na demonstração" description="Saques associados às contas aparecerão aqui." /></div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-y border-white/[0.06] text-[9px] uppercase tracking-[0.14em] text-zinc-600"><th className="px-5 py-3 font-medium">Conta</th><th className="px-3 py-3 font-medium">Solicitado</th><th className="px-3 py-3 font-medium">Divisão</th><th className="px-3 py-3 font-medium">Estado demonstrativo</th><th className="px-5 py-3 text-right font-medium">Valor</th></tr></thead><tbody>{workspace.payouts.map((payout) => <tr key={payout.id} className="border-b border-white/[0.04] last:border-0"><td className="px-5 py-3 text-xs text-zinc-300">{workspace.accounts.find((account) => account.id === payout.accountId)?.name ?? 'Conta arquivada'}</td><td className="px-3 py-3 text-xs text-zinc-500">{formatDateTime(payout.requestedAt)}</td><td className="px-3 py-3 text-xs text-zinc-400">{payout.splitLabel}</td><td className="px-3 py-3 text-xs capitalize text-zinc-400">{payout.status}</td><td className="px-5 py-3 text-right font-mono text-xs text-zinc-200">{formatCurrency(payout.amount)}</td></tr>)}</tbody></table></div>}
    </Panel>

    {formAccount !== undefined && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-[8vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormAccount(undefined) }}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-form-title" className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101214] p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><h3 id="account-form-title" className="text-lg font-semibold text-white">{formAccount ? 'Editar conta' : 'Nova conta demonstrativa'}</h3><p className="mt-1 text-xs text-zinc-500">Os dados ficam salvos apenas neste navegador.</p></div><button className="text-xs text-zinc-500 hover:text-white" onClick={() => setFormAccount(undefined)}>Fechar</button></div><AccountForm initial={formAccount} existingNames={workspace.accounts.map((account) => account.name)} onSave={saveAccount} onCancel={() => setFormAccount(undefined)} /></div>
    </div>}
  </PageFrame>
}
