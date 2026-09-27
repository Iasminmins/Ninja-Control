'use client'

import { useMemo, useState } from 'react'
import { Building2, CircleDollarSign, Plus, Wallet } from 'lucide-react'
import { FirmLogo } from '@/components/modules/accounts/firm-logo'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { PropFirmPortfolio } from '@/lib/prop-firms/server'
import { formatCurrency, formatDateTime } from '@/lib/format'

const categoryLabels: Record<string, string> = { evaluation: 'Avaliação', reset: 'Reset', activation: 'Ativação', other: 'Outro' }

export function PropFirmsScreen({ initial }: { initial: PropFirmPortfolio }) {
  const [data, setData] = useState(initial)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [accountId, setAccountId] = useState(initial.accounts[0]?.id ?? '')
  const [category, setCategory] = useState('evaluation')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const firmRows = useMemo(() => [...new Set(data.accounts.map((account) => account.firm))].map((name) => {
    const accounts = data.accounts.filter((account) => account.firm === name)
    const ids = new Set(accounts.map((account) => account.id))
    const payouts = data.payouts.filter((payout) => ids.has(payout.accountId))
    const costs = data.costs.filter((cost) => ids.has(cost.accountId))
    const paid = payouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amount, 0)
    const invested = costs.reduce((sum, cost) => sum + cost.amount, 0)
    return { name, logoUrl: accounts[0]?.logoUrl, accounts, paid, invested, net: paid - invested }
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data])
  const costsTotal = data.costs.reduce((sum, cost) => sum + cost.amount, 0)
  const payoutTotal = data.payouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amount, 0)

  async function saveCost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const response = await fetch('/api/account-costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, category, amount, description, incurredAt: new Date().toISOString() }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { id?: string; error?: string } : {}
    if (!response?.ok || !result.id) setError(result.error ?? 'Não foi possível salvar o custo.')
    else {
      const account = data.accounts.find((item) => item.id === accountId)
      setData((current) => ({ ...current, costs: [{ id: result.id!, accountId, accountName: account?.name ?? 'Conta', category, description: description || null, amount: Number(amount), incurredAt: new Date().toISOString() }, ...current.costs] }))
      setOpen(false)
      setAmount('')
      setDescription('')
      setNotice('Custo registrado e enviado para auditoria.')
    }
    setPending(false)
  }

  return <PageFrame title="Prop Firm Manager" description="Visão por empresa de contas, custos e payouts informados no workspace." eyebrow="MESA DE CAPITAL" actions={<PrimaryButton onClick={() => { setOpen(true); setError('') }} disabled={data.accounts.length === 0}><Plus className="size-4" /> Registrar custo</PrimaryButton>}>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Prop firms" value={`${firmRows.length}`} note="Empresas vinculadas às contas cadastradas" icon={Building2} /><MetricTile label="Custos registrados" value={formatCurrency(costsTotal)} note="Avaliação, resets, ativação e outros custos" icon={Wallet} /><MetricTile label="Payouts marcados como pagos" value={formatCurrency(payoutTotal)} note="Valores registrados manualmente" icon={CircleDollarSign} /></div>
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Portfólio por empresa" description="Lucro líquido abaixo considera somente payouts marcados como pagos menos custos registrados. Trades ainda não estão incluídos." />
      {firmRows.length ? <div className="mt-4 grid gap-3 xl:grid-cols-2">{firmRows.map((firm) => <article key={firm.name} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 sm:p-5"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><FirmLogo firm={firm.name} customLogoUrl={firm.logoUrl ?? undefined} /><div><h3 className="text-sm font-semibold text-white">{firm.name}</h3><p className="mt-1 text-[10px] text-zinc-500">{firm.accounts.length} contas · {firm.accounts.filter((a) => a.status === 'active').length} ativas</p></div></div><StatusPill tone="neutral">DADOS MANUAIS</StatusPill></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="metric-label">Capital das contas</p><p className="mt-1 text-xs font-semibold text-zinc-200">{formatCurrency(firm.accounts.reduce((sum, a) => sum + a.startingCapital, 0))}</p></div><div><p className="metric-label">Custos</p><p className="mt-1 text-xs font-semibold text-zinc-200">{formatCurrency(firm.invested)}</p></div><div><p className="metric-label">Payout pago</p><p className="mt-1 text-xs font-semibold text-zinc-200">{formatCurrency(firm.paid)}</p></div><div><p className="metric-label">Payout − custos</p><p className={`mt-1 text-xs font-semibold ${firm.net >= 0 ? 'text-[#b9f227]' : 'text-rose-300'}`}>{formatCurrency(firm.net)}</p></div></div><div className="mt-4 space-y-1 border-t border-white/[0.06] pt-3">{firm.accounts.map((account) => <p key={account.id} className="flex justify-between gap-2 py-1 text-[10px] text-zinc-500"><span>{account.name}</span><span>{formatCurrency(account.startingCapital)} · {account.status}</span></p>)}</div></article>)}</div> : <div className="mt-4"><EmptyState title="Nenhuma prop firm cadastrada" description="Cadastre suas contas; elas serão agrupadas pela empresa escolhida." /></div>}
    </Panel>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Custos e taxas" description="Os valores precisam ser informados a partir dos seus comprovantes ou do painel da empresa." />{data.costs.length ? <div className="mt-4 space-y-2">{data.costs.map((cost) => <div key={cost.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-white/[0.06] p-3"><div><p className="text-xs text-zinc-200">{cost.accountName} · {categoryLabels[cost.category] ?? cost.category}</p><p className="mt-1 text-[10px] text-zinc-500">{cost.description || 'Sem descrição'} · {formatDateTime(cost.incurredAt)}</p></div><p className="font-mono text-xs text-zinc-300">{formatCurrency(cost.amount)}</p></div>)}</div> : <div className="mt-4"><EmptyState title="Nenhum custo lançado" description="Registre taxa de avaliação, reset ou ativação para calcular o líquido registrado." /></div>}</Panel>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><form onSubmit={(event) => void saveCost(event)} className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#101214] p-6"><SectionHeading title="Registrar custo da conta" description="Use valores confirmados; o registro será auditado." /><label className="block text-xs text-zinc-400">Conta<select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.firm} · {account.name}</option>)}</select></label><label className="block text-xs text-zinc-400">Categoria<select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-xs text-zinc-400">Valor (USD)<input className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label className="block text-xs text-zinc-400">Descrição<input className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder="Número da cobrança ou observação" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">Cancelar</button><PrimaryButton disabled={pending}>{pending ? 'Salvando…' : 'Salvar custo'}</PrimaryButton></div></form></div>}
  </PageFrame>
}
