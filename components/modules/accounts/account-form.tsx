'use client'

import { useState, type FormEvent } from 'react'
import type { AccountKind, DemoAccount } from '@/lib/demo/types'
import { PrimaryButton, SecondaryButton } from '@/components/workspace/primitives'
import { FirmLogo, hasFirmLogo, supportedFirms } from './firm-logo'

export function AccountForm({ initial, existingNames, onSave, onCancel }: {
  initial: DemoAccount | null
  existingNames: string[]
  onSave: (account: DemoAccount) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [firm, setFirm] = useState(initial?.firm ?? '')
  const [firmLogoUrl, setFirmLogoUrl] = useState(initial?.firmLogoUrl ?? '')
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'evaluation')
  const [stage, setStage] = useState(initial?.stage ?? 'Avaliação')
  const [capital, setCapital] = useState(String(initial?.startingCapital ?? 50_000))
  const [dailyLimit, setDailyLimit] = useState(String(initial?.dailyLossLimit ?? 2_500))
  const [trailingLimit, setTrailingLimit] = useState(String(initial?.trailingDrawdownLimit ?? 2_250))
  const [buffer, setBuffer] = useState(String(initial?.drawdownBufferPercent ?? 100))
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (existingNames.some((value) => value.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR') && value !== initial?.name)) {
      setError('Já existe uma conta com esse nome.')
      return
    }
    if (!hasFirmLogo(firm, firmLogoUrl)) {
      setError('Escolha uma empresa com logo oficial ou informe o link HTTPS da logo da empresa.')
      return
    }
    const capitalValue = Number(capital)
    const dailyValue = Number(dailyLimit)
    const trailingValue = Number(trailingLimit)
    const bufferValue = Number(buffer)
    if (![capitalValue, dailyValue, trailingValue, bufferValue].every(Number.isFinite) || capitalValue <= 0 || dailyValue <= 0 || trailingValue <= 0 || bufferValue < 0 || bufferValue > 100) {
      setError('Confira os valores. Capital e limites devem ser positivos; o buffer deve ficar entre 0% e 100%.')
      return
    }
    setError('')
    onSave({
      id: initial?.id ?? `account-${crypto.randomUUID()}`,
      name: normalizedName,
      firm: firm.trim(),
      firmLogoUrl: firmLogoUrl.trim() || undefined,
      kind,
      stage: stage.trim(),
      startingCapital: capitalValue,
      dailyLossLimit: dailyValue,
      trailingDrawdownLimit: trailingValue,
      drawdownBufferPercent: bufferValue,
      lifecycle: initial?.lifecycle ?? 'active',
      connectionState: 'not-configured',
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      lastSyncedAt: null,
      provenance: 'demo',
    })
  }

  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
    <label className="text-xs text-zinc-400">Nome da conta<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={48} autoFocus /></label>
    <label className="text-xs text-zinc-400">Empresa de avaliação<input className={inputClass} list="account-firms" value={firm} onChange={(event) => { setFirm(event.target.value); setFirmLogoUrl('') }} required maxLength={48} /><datalist id="account-firms">{supportedFirms.map((value) => <option value={value} key={value} />)}</datalist></label>
    <label className="text-xs text-zinc-400">Link da logo oficial (HTTPS, se necessário)<input className={inputClass} type="url" value={firmLogoUrl} onChange={(event) => setFirmLogoUrl(event.target.value)} placeholder="Preenchido automaticamente para empresas conhecidas" /></label>
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-400"><FirmLogo firm={firm} customLogoUrl={firmLogoUrl} />{firm.trim() ? `Logo da ${firm}` : 'A logo da empresa aparecerá aqui'}</div>
    <label className="text-xs text-zinc-400">Tipo<select className={inputClass} value={kind} onChange={(event) => { const next = event.target.value as AccountKind; setKind(next); setStage(next === 'funded' ? 'Financiada' : next === 'combine' ? 'Combine' : 'Avaliação') }}><option value="evaluation">Avaliação</option><option value="funded">Financiada</option><option value="combine">Combine</option></select></label>
    <label className="text-xs text-zinc-400">Etapa<input className={inputClass} value={stage} onChange={(event) => setStage(event.target.value)} required maxLength={48} /></label>
    <label className="text-xs text-zinc-400">Capital inicial (USD)<input className={inputClass} type="number" min="1" step="0.01" value={capital} onChange={(event) => setCapital(event.target.value)} required /></label>
    <label className="text-xs text-zinc-400">Limite de perda diária (USD)<input className={inputClass} type="number" min="1" step="0.01" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} required /></label>
    <label className="text-xs text-zinc-400">Drawdown móvel (USD)<input className={inputClass} type="number" min="1" step="0.01" value={trailingLimit} onChange={(event) => setTrailingLimit(event.target.value)} required /></label>
    <label className="text-xs text-zinc-400">Buffer demonstrativo (%)<input className={inputClass} type="number" min="0" max="100" step="1" value={buffer} onChange={(event) => setBuffer(event.target.value)} required /></label>
    {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-3 text-xs text-rose-200 sm:col-span-2">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><SecondaryButton type="button" onClick={onCancel}>Cancelar</SecondaryButton><PrimaryButton type="submit">{initial ? 'Salvar alterações' : 'Criar conta de demonstração'}</PrimaryButton></div>
  </form>
}
