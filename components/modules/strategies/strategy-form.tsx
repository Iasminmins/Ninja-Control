'use client'

import { useState, type FormEvent } from 'react'
import type { DemoStrategy } from '@/lib/demo/types'
import { PrimaryButton, SecondaryButton } from '@/components/workspace/primitives'

export function StrategyForm({ initial, accountOptions, existingNames, onSave, onCancel }: {
  initial: DemoStrategy | null
  accountOptions: Array<{ id: string; name: string }>
  existingNames: string[]
  onSave: (strategy: DemoStrategy) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [accountIds, setAccountIds] = useState<string[]>(initial?.accountIds ?? [])
  const [instruments, setInstruments] = useState(initial?.instruments.join(', ') ?? '')
  const [sessions, setSessions] = useState(initial?.sessions.join(', ') ?? '')
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanName = name.trim()
    if (existingNames.some((item) => item.toLocaleLowerCase('pt-BR') === cleanName.toLocaleLowerCase('pt-BR') && item !== initial?.name)) {
      setError('Já existe uma estratégia com esse nome.')
      return
    }
    setError('')
    onSave({ id: initial?.id ?? `strategy-${crypto.randomUUID()}`, name: cleanName, description: description.trim(), accountIds, instruments: instruments.split(',').map((value) => value.trim()).filter(Boolean), sessions: sessions.split(',').map((value) => value.trim()).filter(Boolean), status: initial?.status ?? 'configuration-pending', provenance: 'demo' })
  }

  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
  return <form onSubmit={submit} className="grid gap-4" noValidate>
    <label className="text-xs text-zinc-400">Nome<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={48} autoFocus /></label>
    <label className="text-xs text-zinc-400">Descrição<input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} placeholder="Metadados; não define regras de execução" /></label>
    <fieldset><legend className="text-xs text-zinc-400">Contas associadas</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{accountOptions.map((account) => <label key={account.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2 text-xs text-zinc-300"><input type="checkbox" checked={accountIds.includes(account.id)} onChange={(event) => setAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))} className="accent-[#b9f227]" />{account.name}</label>)}</div></fieldset>
    <label className="text-xs text-zinc-400">Instrumentos, separados por vírgula<input className={inputClass} value={instruments} onChange={(event) => setInstruments(event.target.value)} placeholder="NQ, MNQ" /></label>
    <label className="text-xs text-zinc-400">Sessões permitidas, separadas por vírgula<input className={inputClass} value={sessions} onChange={(event) => setSessions(event.target.value)} placeholder="Manhã, Tarde" /></label>
    <p className="text-[10px] leading-4 text-amber-200">Salvar estes metadados não configura sinais nem ativa execução.</p>
    {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-3 text-xs text-rose-200">{error}</p>}
    <div className="flex justify-end gap-2"><SecondaryButton type="button" onClick={onCancel}>Cancelar</SecondaryButton><PrimaryButton type="submit">Salvar metadados</PrimaryButton></div>
  </form>
}
