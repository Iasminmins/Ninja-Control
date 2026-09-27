'use client'

import { useState } from 'react'
import { CircleDollarSign, Plus } from 'lucide-react'
import { FirmLogo } from '@/components/modules/accounts/firm-logo'
import { EmptyState, MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { PayoutSnapshot } from '@/lib/payouts/server'
import { formatCurrency, formatDateTime } from '@/lib/format'

const labels: Record<string, string> = { not_eligible: 'NÃO ELEGÍVEL', almost_eligible: 'QUASE ELEGÍVEL', eligible: 'ELEGÍVEL', requested: 'SOLICITADO', processing: 'PROCESSANDO', paid: 'PAGO' }
const nextState: Record<string, string> = { not_eligible: 'almost_eligible', almost_eligible: 'eligible', eligible: 'requested', requested: 'processing', processing: 'paid' }

export function PayoutsScreen({ initial }: { initial: PayoutSnapshot }) {
  const [data, setData] = useState(initial)
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(initial.accounts[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('requested')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const paid = data.payouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amount, 0)
  const pendingTotal = data.payouts.filter((payout) => ['requested', 'processing'].includes(payout.status)).reduce((sum, payout) => sum + payout.amount, 0)

  async function refresh() {
    const response = await fetch('/api/payouts', { cache: 'no-store' })
    if (!response.ok) throw new Error('Falha ao atualizar a lista.')
    const result = await response.json() as { payouts: Array<{ id: string; accountId: string; status: string; amountCents: number; requestedAt: string; paidAt: string | null }> }
    setData((current) => ({ ...current, payouts: result.payouts.map((payout) => ({ id: payout.id, accountId: payout.accountId, accountName: current.accounts.find((account) => account.id === payout.accountId)?.name ?? 'Conta', firm: current.accounts.find((account) => account.id === payout.accountId)?.firm ?? 'Prop firm', status: payout.status, amount: payout.amountCents / 100, requestedAt: payout.requestedAt, paidAt: payout.paidAt })) }))
  }

  async function createPayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const response = await fetch('/api/payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, amount, status, requestedAt: new Date().toISOString() }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível registrar o payout.')
    else {
      await refresh().catch(() => undefined)
      setOpen(false)
      setAmount('')
      setNotice('Payout registrado no Neon e incluído na auditoria.')
    }
    setPending(false)
  }

  async function advance(id: string, current: string) {
    const status = nextState[current]
    if (!status) return
    const response = await fetch(`/api/payouts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => null)
    if (!response?.ok) { setError('Não foi possível avançar o estado do payout.'); return }
    await refresh().catch(() => undefined)
    setNotice(`Payout atualizado para ${labels[status]}.`)
  }

  return <PageFrame title="Payout Manager" description="Registre e acompanhe o ciclo de saques das suas contas." eyebrow="PROP FIRM MANAGER" actions={<PrimaryButton onClick={() => { setError(''); setOpen(true) }} disabled={data.accounts.length === 0}><Plus className="size-4" /> Registrar payout</PrimaryButton>}>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2"><MetricTile label="Payouts registrados como pagos" value={formatCurrency(paid)} note="Soma dos registros marcados como pagos" icon={CircleDollarSign} /><MetricTile label="Solicitados ou processando" value={formatCurrency(pendingTotal)} note="Valores informados manualmente; sem verificação com prop firm" icon={CircleDollarSign} /></div>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Histórico de payouts" description="Elegibilidade automática depende de equity, dias operados e regras confirmadas da prop firm." />
      {data.payouts.length === 0 ? <div className="mt-4"><EmptyState title="Nenhum payout registrado" description={data.accounts.length ? 'Registre um payout confirmado para manter o histórico.' : 'Cadastre uma conta antes de registrar um payout.'} /></div> : <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.13em] text-zinc-600"><th className="py-3 pr-4">Conta</th><th className="py-3 pr-4">Prop firm</th><th className="py-3 pr-4">Solicitado</th><th className="py-3 pr-4">Estado</th><th className="py-3 pr-4 text-right">Valor</th><th className="py-3 text-right">Ação</th></tr></thead><tbody>{data.payouts.map((payout) => <tr key={payout.id} className="border-b border-white/[0.04] last:border-0"><td className="py-3 pr-4 text-xs text-zinc-300">{payout.accountName}</td><td className="py-3 pr-4 text-xs text-zinc-500">{payout.firm}</td><td className="py-3 pr-4 text-xs text-zinc-500">{formatDateTime(payout.requestedAt)}</td><td className="py-3 pr-4"><StatusPill tone={payout.status === 'paid' ? 'positive' : payout.status === 'not_eligible' ? 'danger' : 'warning'}>{labels[payout.status] ?? payout.status.toUpperCase()}</StatusPill></td><td className="py-3 pr-4 text-right font-mono text-xs text-zinc-200">{formatCurrency(payout.amount)}</td><td className="py-3 text-right">{nextState[payout.status] && <button className="text-[10px] font-medium text-[#b9f227] hover:underline" onClick={() => void advance(payout.id, payout.status)}>Marcar {labels[nextState[payout.status]].toLocaleLowerCase('pt-BR')}</button>}</td></tr>)}</tbody></table></div>}
    </Panel>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}><form onSubmit={(event) => void createPayout(event)} className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#101214] p-6"><SectionHeading title="Registrar payout" description="Informe os dados confirmados no painel da prop firm." /><label className="block text-xs text-zinc-400">Conta<select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{data.accounts.map((account) => <option value={account.id} key={account.id}>{account.firm} · {account.name}</option>)}</select></label><label className="block text-xs text-zinc-400">Valor (USD)<input className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label className="block text-xs text-zinc-400">Estado<select className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>{['requested', 'processing', 'paid'].map((value) => <option value={value} key={value}>{labels[value]}</option>)}</select></label><p className="text-[10px] text-zinc-500">Esse registro não confirma elegibilidade nem consulta a prop firm automaticamente.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">Cancelar</button><PrimaryButton disabled={pending}>{pending ? 'Salvando…' : 'Salvar payout'}</PrimaryButton></div></form></div>}
  </PageFrame>
}
