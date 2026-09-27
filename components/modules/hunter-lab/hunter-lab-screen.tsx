'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, GitBranch, Plus, Save } from 'lucide-react'
import { EmptyState, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { HunterLabData } from '@/lib/hunter-lab/server'
import { experimentStages, hunterAreas, versionStages } from '@/lib/hunter-lab/constants'

type Area = HunterLabData['areas'][number]
type ExperimentRow = HunterLabData['experiments'][number]
const inputClass = 'mt-1 block min-h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
const stages = (kind: 'version' | 'experiment') => kind === 'version' ? versionStages : experimentStages

export function HunterLabScreen({ initial, page, initialArea = 'Hunter' }: { initial: HunterLabData; page: 'versions' | 'experiments'; initialArea?: typeof hunterAreas[number] }) {
  const [data, setData] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const router = useRouter()
  const versions = data.areas.flatMap(({ strategy, versions: rows }) => rows.map((version) => ({ strategy, version })))

  async function submit(event: FormEvent<HTMLFormElement>, kind: 'version' | 'experiment') {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true); setError(''); setNotice('')
    const form = new FormData(event.currentTarget)
    const body: Record<string, unknown> = Object.fromEntries(form.entries())
    body.kind = kind
    for (const key of ['parameters', 'filters', 'evidence']) {
      if (typeof body[key] === 'string' && body[key]) {
        try { body[key] = JSON.parse(body[key] as string) } catch { setError(`O campo ${key} precisa conter JSON válido.`); setBusy(false); return }
      }
    }
    const response = await fetch('/api/hunter-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível salvar.')
    else { setNotice(kind === 'version' ? 'Versão salva e auditada.' : 'Experimento criado com status IDEA.'); formElement.reset(); router.refresh() }
    setBusy(false)
  }

  async function updateVersion(id: string, stage: string) {
    setBusy(true); setError(''); setNotice('')
    const response = await fetch('/api/hunter-lab', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'version', id, stage }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível atualizar a versão.')
    else { setNotice('Etapa atualizada e auditada.'); router.refresh() }
    setBusy(false)
  }

  async function updateExperiment(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const formElement = event.currentTarget
    const fields = new FormData(formElement)
    let results: unknown = {}
    try { results = JSON.parse(String(fields.get('results') || '{}')) } catch { setError('Resultados precisam conter JSON válido.'); setBusy(false); return }
    if (!results || typeof results !== 'object' || Array.isArray(results)) { setError('Resultados precisam ser um objeto JSON.'); setBusy(false); return }
    const response = await fetch('/api/hunter-lab', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'experiment', id, status: fields.get('status'), conclusion: fields.get('conclusion'), results }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível salvar os resultados.')
    else { setNotice('Status e resultados atualizados e auditados.'); router.refresh() }
    setBusy(false)
  }

  const title = page === 'versions' ? 'Hunter Versions' : 'Experiment Lab'
  const description = page === 'versions' ? 'Registre alterações, parâmetros e estágio de validação de Hunter, HSG e HSD.' : 'Transforme hipóteses em experimentos rastreáveis e registre métricas observadas.'
  return <PageFrame title={title} description={description} eyebrow="HUNTER INTELLIGENCE" showDemoNotice={false}>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    {page === 'versions' ? <>
      <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Registrar versão" description="Os resultados de backtest/forward test são informados pelo operador; não são gerados pelo sistema." />
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void submit(event, 'version')}>
          <label className="text-[10px] text-zinc-500">Área<select className={inputClass} name="area" defaultValue={initialArea} required>{hunterAreas.map((area) => <option key={area}>{area}</option>)}</select></label>
          <label className="text-[10px] text-zinc-500">Versão exibida<input className={inputClass} name="label" placeholder="3.6 Experimental" maxLength={40} required /></label>
          <label className="text-[10px] text-zinc-500">Etapa<select className={inputClass} name="stage" defaultValue="BACKTEST">{versionStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
          <label className="text-[10px] text-zinc-500">Impacto esperado<input className={inputClass} name="expectedImpact" placeholder="Ex.: avaliar redução de losses em abertura" maxLength={1000} /></label>
          <label className="text-[10px] text-zinc-500 md:col-span-2">Alterações / changelog<textarea className={inputClass} name="changeSummary" rows={3} placeholder="O que mudou e por quê" maxLength={4000} required /></label>
          <label className="text-[10px] text-zinc-500">Parâmetros em JSON<textarea className={`${inputClass} font-mono`} name="parameters" rows={4} defaultValue="{}" required /></label>
          <label className="text-[10px] text-zinc-500">Filtros em JSON<textarea className={`${inputClass} font-mono`} name="filters" rows={4} defaultValue="{}" required /></label>
          <label className="text-[10px] text-zinc-500 md:col-span-2">Resultados registrados (backtest / forward / live) em JSON<textarea className={`${inputClass} font-mono`} name="evidence" rows={3} defaultValue="{}" placeholder={'Ex.: {"backtest":{"trades":120,"profitFactor":1.4}}'} /></label>
          <div className="md:col-span-2"><PrimaryButton disabled={busy}><Plus className="size-4" />{busy ? 'Salvando…' : 'Criar versão'}</PrimaryButton></div>
        </form>
      </Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Histórico de versões" description="Versões numeradas e isoladas por área do workspace." />
        {versions.length ? <div className="space-y-3">{versions.map(({ strategy, version }) => { const meta = version.parameters; const stage = typeof meta.stage === 'string' ? meta.stage : 'BACKTEST'; return <article key={version.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-zinc-100">{strategy.name} {String(meta.displayVersion ?? `v${version.version}`)}</h3><StatusPill tone={stage === 'APPROVED' ? 'positive' : stage === 'REJECTED' ? 'danger' : 'warning'}>{stage}</StatusPill></div><p className="mt-1 text-[10px] text-zinc-600">Criada em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(version.createdAt)}</p></div><label className="text-[10px] text-zinc-500">Atualizar etapa<select className="ml-2 h-9 rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs" value={stage} disabled={busy} onChange={(event) => void updateVersion(version.id, event.target.value)}>{versionStages.map((value) => <option key={value}>{value}</option>)}</select></label></div><p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-zinc-300">{version.notes}</p>{typeof meta.expectedImpact === 'string' && meta.expectedImpact && <p className="mt-2 text-[10px] text-zinc-500">Esperado: {meta.expectedImpact}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><pre className="overflow-auto rounded-lg bg-black/20 p-3 text-[10px] text-zinc-400">Parâmetros: {JSON.stringify(meta.parameters ?? {}, null, 2)}</pre><pre className="overflow-auto rounded-lg bg-black/20 p-3 text-[10px] text-zinc-400">Filtros: {JSON.stringify(meta.filters ?? {}, null, 2)}</pre><pre className="overflow-auto rounded-lg bg-black/20 p-3 text-[10px] text-zinc-400 sm:col-span-2">Evidências / resultados registrados: {JSON.stringify(meta.evidence ?? {}, null, 2)}</pre></div></article> })}</div> : <EmptyState title="Nenhuma versão registrada" description="Cadastre a versão atual ou experimental para começar um changelog auditável." />}
      </Panel>
    </> : <>
      <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Nova hipótese" description="Registre dataset, período e baseline antes de interpretar os resultados." />
        {!versions.length ? <EmptyState title="Cadastre uma versão primeiro" description="Cada experimento deve apontar para a versão Hunter usada como base." /> : <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void submit(event, 'experiment')}>
          <label className="text-[10px] text-zinc-500">Nome<input className={inputClass} name="name" maxLength={120} required /></label>
          <label className="text-[10px] text-zinc-500">Versão base<select className={inputClass} name="versionId" required>{versions.map(({ strategy, version }) => <option key={version.id} value={version.id}>{strategy.name} {String(version.parameters.displayVersion ?? `v${version.version}`)}</option>)}</select></label>
          <label className="text-[10px] text-zinc-500">Dataset / origem<input className={inputClass} name="dataset" placeholder="Ex.: NQ, trades recebidos" maxLength={500} required /></label>
          <label className="text-[10px] text-zinc-500">Período analisado<input className={inputClass} name="period" placeholder="Ex.: 2026-01 a 2026-03" maxLength={200} required /></label>
          <label className="text-[10px] text-zinc-500">Baseline<input className={inputClass} name="baseline" placeholder="Versão ou conjunto de referência" maxLength={500} required /></label>
          <label className="text-[10px] text-zinc-500">Alteração testada<input className={inputClass} name="variant" placeholder="Parâmetro, filtro ou regra em teste" maxLength={1000} required /></label>
          <label className="text-[10px] text-zinc-500 md:col-span-2">Hipótese<textarea className={inputClass} name="hypothesis" rows={3} maxLength={4000} required /></label>
          <div className="md:col-span-2"><PrimaryButton disabled={busy}><FlaskConical className="size-4" />{busy ? 'Salvando…' : 'Criar experimento'}</PrimaryButton></div>
        </form>}
      </Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Experimentos e resultados" description="Atualize o estágio e registre métricas observadas em JSON, sem inferir aprovação automática." />
        {data.experiments.length ? <div className="space-y-4">{data.experiments.map(({ experiment, version, strategy }: ExperimentRow) => { const info = experiment.metrics; return <article key={experiment.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-zinc-100">{experiment.name}</h3><StatusPill tone={experiment.status === 'VALIDATED' || experiment.status === 'DEPLOYED' ? 'positive' : experiment.status === 'REJECTED' ? 'danger' : 'warning'}>{experiment.status}</StatusPill><span className="text-[10px] text-zinc-500">{strategy.name} {String(version.parameters.displayVersion ?? `v${version.version}`)}</span></div><p className="mt-2 text-xs leading-5 text-zinc-400">{experiment.hypothesis}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><p className="text-[10px] text-zinc-500">Dataset: {String(info.dataset ?? '—')} · período: {String(info.period ?? '—')}</p><p className="text-[10px] text-zinc-500">Baseline: {String(info.baseline ?? '—')} · alteração: {String(info.variant ?? '—')}</p></div><form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void updateExperiment(event, experiment.id)}><label className="text-[10px] text-zinc-500">Estágio<select className={inputClass} name="status" defaultValue={experiment.status}>{experimentStages.map((status) => <option key={status}>{status}</option>)}</select></label><label className="text-[10px] text-zinc-500">Conclusão<textarea className={inputClass} name="conclusion" rows={2} maxLength={4000} defaultValue={String(info.conclusion ?? '')} /></label><label className="text-[10px] text-zinc-500 md:col-span-2">Resultados registrados em JSON<textarea className={`${inputClass} font-mono`} name="results" rows={4} defaultValue={JSON.stringify(info.results ?? {}, null, 2)} /></label><div className="md:col-span-2"><PrimaryButton disabled={busy}><Save className="size-4" />Salvar estágio e métricas</PrimaryButton></div></form></article> })}</div> : <EmptyState title="Nenhum experimento criado" description="Crie uma hipótese ligada a uma versão para registrar resultados e decisões." />}
      </Panel>
    </>}
    <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-600"><GitBranch className="size-3.5" />Toda alteração de versão e experimento gera um registro de auditoria.</div>
  </PageFrame>
}
