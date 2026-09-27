'use client'

import { useMemo, useState } from 'react'
import { CircleDollarSign, Plus, Search, ShieldCheck, Wallet } from 'lucide-react'
import { AccountForm } from './account-form'
import { FirmLogo } from './firm-logo'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SecondaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { PersistedAccount } from '@/lib/accounts/server'
import type { AccountLifecycle, DemoAccount } from '@/lib/demo/types'
import { formatCurrency } from '@/lib/format'

export function PersistedAccountsScreen({ initialAccounts, loadError }: { initialAccounts: PersistedAccount[]; loadError?: string }) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [query, setQuery] = useState('')
  const [firm, setFirm] = useState('all')
  const [lifecycle, setLifecycle] = useState<AccountLifecycle | 'all'>('active')
  const [sort, setSort] = useState<'name' | 'capital'>('name')
  const [formAccount, setFormAccount] = useState<DemoAccount | null | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const firms = [...new Set(accounts.map((account) => account.firm))].sort()
  const filtered = useMemo(() => accounts.filter((account) => {
    const matchesQuery = `${account.name} ${account.firm}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))
    const matchesFirm = firm === 'all' || firm === account.firm
    const matchesLifecycle = lifecycle === 'all' || account.lifecycle === lifecycle
    return matchesQuery && matchesFirm && matchesLifecycle
  }).sort((a, b) => sort === 'capital' ? b.startingCapital - a.startingCapital : a.name.localeCompare(b.name, 'pt-BR')), [accounts, query, firm, lifecycle, sort])
  const active = accounts.filter((account) => account.accountStatus === 'active')
  const totalCapital = active.reduce((sum, account) => sum + account.startingCapital, 0)
  const funded = active.filter((account) => account.kind === 'funded').length
  const inputClass = 'h-10 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

  async function saveAccount(account: DemoAccount) {
    setPending(true)
    setError('')
    const editing = formAccount !== null
    const endpoint = editing ? `/api/accounts/${encodeURIComponent(account.id)}` : '/api/accounts'
    const response = await fetch(endpoint, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    }).catch(() => null)
    const payload = response ? await response.json().catch(() => ({})) as { error?: string; account?: { id?: string } } : {}
    if (!response?.ok) {
      setError(payload.error ?? 'Não foi possível salvar. Verifique sua conexão e tente novamente.')
      setPending(false)
      return
    }

    const id = editing ? account.id : payload.account?.id
    const refreshed = await fetch('/api/accounts', { cache: 'no-store' }).then((result) => result.ok ? result.json() as Promise<{ accounts: PersistedAccount[] }> : null).catch(() => null)
    if (refreshed) setAccounts(refreshed.accounts)
    setFormAccount(undefined)
    setNotice(editing ? 'Alterações salvas no Neon.' : `Conta criada${id ? ` (${account.name})` : ''} no Neon.`)
    setPending(false)
  }

  async function toggleArchive(account: PersistedAccount) {
    setError('')
    const archived = account.lifecycle === 'active'
    const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }) }).catch(() => null)
    if (!response?.ok) {
      setError('Não foi possível atualizar o estado desta conta.')
      return
    }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, lifecycle: archived ? 'archived' : 'active', accountStatus: archived ? 'archived' : 'active' } : item))
    setNotice(archived ? 'Conta arquivada; histórico preservado.' : 'Conta reativada.')
  }

  async function changeStatus(account: PersistedAccount, accountStatus: 'active' | 'paused' | 'breached') {
    setError('')
    const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountStatus }) }).catch(() => null)
    const payload = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) { setError(payload.error ?? 'Não foi possível atualizar o status.'); return }
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, accountStatus } : item))
    setNotice(`Status da conta atualizado para ${accountStatus.toUpperCase()} e registrado na auditoria.`)
  }

  return <PageFrame title="Contas e prop firms" description="Cadastre os termos das contas e acompanhe os dados conectados ao seu workspace." eyebrow="PROP FIRM MANAGER" showDemoNotice={false} actions={<PrimaryButton onClick={() => { setError(''); setFormAccount(null) }}><Plus className="size-4" /> Nova conta</PrimaryButton>}>
    {loadError && <div className="mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] px-4 py-3 text-xs text-rose-200" role="alert">{loadError}</div>}
    {(notice || error) && <div className={`mb-5 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><button className="text-zinc-500 hover:text-white" onClick={() => { setNotice(''); setError('') }} aria-label="Fechar mensagem">Fechar</button></div>}

    <section className="mb-6 grid gap-3 sm:grid-cols-3">
      <MetricTile label="Capital inicial declarado" value={formatCurrency(totalCapital)} note={`${active.length} contas ativas · termos informados por você`} icon={Wallet} />
      <MetricTile label="Contas financiadas" value={`${funded}`} note={`de ${active.length} contas operacionais ativas`} icon={ShieldCheck} />
      <MetricTile label="Payouts" value="Pendente" note="Conecte ou registre os dados de payout para calcular valores." icon={CircleDollarSign} />
    </section>

    <Panel className="mb-6 p-5 sm:p-6">
      <SectionHeading title="Portfólio de contas" description="Termos cadastrados. Saldo, P&L e drawdown atual aparecem após a integração de operações." action={<span className="text-[10px] text-zinc-600">{filtered.length} exibidas</span>} />
      <div className="mb-4 grid gap-2 md:grid-cols-[minmax(180px,1fr)_170px_170px_170px]">
        <label className="relative"><span className="sr-only">Buscar conta</span><Search className="absolute left-3 top-3 size-4 text-zinc-600" /><input className={`${inputClass} w-full pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conta ou prop firm" /></label>
        <label className="sr-only" htmlFor="account-firm">Empresa</label><select id="account-firm" className={inputClass} value={firm} onChange={(event) => setFirm(event.target.value)}><option value="all">Todas as empresas</option>{firms.map((value) => <option key={value}>{value}</option>)}</select>
        <label className="sr-only" htmlFor="account-state">Estado</label><select id="account-state" className={inputClass} value={lifecycle} onChange={(event) => setLifecycle(event.target.value as AccountLifecycle | 'all')}><option value="active">Ativas</option><option value="archived">Arquivadas</option><option value="all">Todas</option></select>
        <label className="sr-only" htmlFor="account-sort">Ordenar</label><select id="account-sort" className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="name">Ordenar: nome</option><option value="capital">Ordenar: capital</option></select>
      </div>
      {filtered.length === 0 ? <EmptyState title={accounts.length ? 'Nenhuma conta encontrada' : 'Seu portfólio começa aqui'} description={accounts.length ? 'Ajuste os filtros ou pesquise por outra prop firm.' : 'Cadastre uma conta; saldos e performance ficam pendentes até conectar uma fonte de operações.'} /> : <div className="grid gap-3 xl:grid-cols-2">
        {filtered.map((account) => <article key={account.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><FirmLogo firm={account.firm} customLogoUrl={account.firmLogoUrl} /><div><h3 className="text-sm font-semibold text-white">{account.name}</h3><p className="mt-1 text-[10px] tracking-wide text-zinc-500">{account.firm} · {account.stage} · Cadastro manual</p></div></div><div className="flex items-center gap-2"><StatusPill tone={account.accountStatus === 'active' ? 'positive' : account.accountStatus === 'breached' ? 'danger' : account.accountStatus === 'paused' ? 'warning' : 'neutral'}>{(account.accountStatus ?? 'active').toUpperCase()}</StatusPill><StatusPill tone="warning">INTEGRAÇÃO PENDENTE</StatusPill></div></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="metric-label">Capital inicial</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(account.startingCapital)}</p></div><div><p className="metric-label">Profit target</p><p className="mt-1 text-sm font-semibold text-white">{account.profitTarget ? formatCurrency(account.profitTarget) : 'Não informado'}</p></div><div><p className="metric-label">Limite diário</p><p className="mt-1 text-sm font-semibold text-white">{account.dailyLossLimit > 0 ? formatCurrency(account.dailyLossLimit) : 'Não informado'}</p></div><div><p className="metric-label">Drawdown máximo</p><p className="mt-1 text-sm font-semibold text-white">{account.trailingDrawdownLimit > 0 ? formatCurrency(account.trailingDrawdownLimit) : 'Não informado'}</p></div></div>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="metric-label">Consistência</p><p className="mt-1 text-xs text-zinc-300">{account.consistencyPercent == null ? 'Não informada' : `${account.consistencyPercent}%`}</p></div><div><p className="metric-label">Dias mínimos</p><p className="mt-1 text-xs text-zinc-300">{account.minimumTradingDays ?? 'Não informados'}</p></div><div><p className="metric-label">Máx. contratos</p><p className="mt-1 text-xs text-zinc-300">{account.maximumContracts ?? 'Não informado'}</p></div><div><p className="metric-label">Outras regras</p><p className="mt-1 line-clamp-2 text-xs text-zinc-300">{account.additionalRules || 'Não informadas'}</p></div></div>
          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[10px] text-zinc-500">P&amp;L, buffer, payout elegível e status de execução serão calculados com dados conectados; não há valores simulados nesta conta.</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2"><label className="sr-only" htmlFor={`account-status-${account.id}`}>Status operacional de {account.name}</label><select id={`account-status-${account.id}`} className={inputClass} aria-label={`Status operacional de ${account.name}`} value={account.accountStatus ?? 'active'} disabled={pending || account.lifecycle === 'archived'} onChange={(event) => void changeStatus(account, event.target.value as 'active' | 'paused' | 'breached')}><option value="active">Ativa</option><option value="paused">Pausada</option><option value="breached">Breached</option><option value="archived">Arquivada</option></select><SecondaryButton className="h-8 px-2.5" onClick={() => { setError(''); setFormAccount({ ...account, provenance: 'demo', firmLogoUrl: account.firmLogoUrl?.startsWith('https://') ? account.firmLogoUrl : undefined }) }}>Editar</SecondaryButton><SecondaryButton className="h-8 px-2.5" onClick={() => void toggleArchive(account)}>{account.lifecycle === 'active' ? 'Arquivar' : 'Reativar'}</SecondaryButton></div>
        </article>)}
      </div>}
    </Panel>

    {formAccount !== undefined && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 pt-[8vh]" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setFormAccount(undefined) }}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-form-title" className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101214] p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><h3 id="account-form-title" className="text-lg font-semibold text-white">{formAccount ? 'Editar conta' : 'Nova conta'}</h3><p className="mt-1 text-xs text-zinc-500">Os termos informados ficam salvos no Neon no seu workspace.</p></div><button className="text-xs text-zinc-500 hover:text-white" disabled={pending} onClick={() => setFormAccount(undefined)}>Fechar</button></div><AccountForm mode="persisted" initial={formAccount} existingNames={accounts.map((account) => account.name)} onSave={(account) => void saveAccount(account)} onCancel={() => setFormAccount(undefined)} />{pending && <p className="mt-3 text-right text-xs text-zinc-500" role="status">Salvando conta…</p>}</div>
    </div>}
  </PageFrame>
}
