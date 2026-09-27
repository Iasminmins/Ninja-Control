'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Save, ShieldCheck } from 'lucide-react'
import { MetricTile, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { defaultRiskThresholds, simulateRiskTier, type RiskThresholds } from '@/lib/risk/settings'

const inputClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'

export function PersistedRiskScreen({ initial, configured, loadError }: { initial: RiskThresholds; configured: boolean; loadError?: string }) {
  const [thresholds, setThresholds] = useState(initial)
  const [buffer, setBuffer] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState(configured ? 'Regras carregadas do workspace.' : 'Limites padrão carregados; ainda não foram salvos.')
  const [error, setError] = useState(loadError ?? '')
  const simulated = buffer === '' ? null : simulateRiskTier(Number(buffer), thresholds)

  useEffect(() => {
    setThresholds(initial)
  }, [initial])

  function update(field: keyof Omit<RiskThresholds, 'mode'>, value: string) {
    setThresholds((current) => ({ ...current, [field]: Number(value) }))
  }

  async function save() {
    setPending(true)
    setError('')
    setMessage('')
    const response = await fetch('/api/risk-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(thresholds) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string } : {}
    if (!response?.ok) setError(result.error ?? 'Não foi possível salvar as regras.')
    else setMessage('Limites salvos e registrados no log de auditoria. A aplicação continua em modo simulação.')
    setPending(false)
  }

  return <PageFrame title="Risk Engine" description="Configure os níveis de risco e simule decisões sem interferir em ordens ou contratos." eyebrow="RISK ENGINE" showDemoNotice={false}>
    {(error || message) && <p className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`} role={error ? 'alert' : 'status'}>{error || message}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Modo" value="SIMULAÇÃO" note="Nenhum comando de execução será enviado." icon={ShieldCheck} /><MetricTile label="Dados de risco ao vivo" value="Pendente" note="Saldo e equity dependem de integração." icon={AlertTriangle} /><MetricTile label="Auditoria" value="Ativa" note="Alterações desta configuração são registradas." icon={Save} /></div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel className="p-5 sm:p-6"><SectionHeading title="Níveis por buffer disponível" description="Os valores são configuráveis e permanecem em simulação." />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="text-xs text-zinc-400">NORMAL a partir de (%)<input className={inputClass} type="number" min="1" max="100" value={thresholds.normalMinBuffer} onChange={(event) => update('normalMinBuffer', event.target.value)} /></label>
          <label className="text-xs text-zinc-400">REDUCED a partir de (%)<input className={inputClass} type="number" min="1" max="99" value={thresholds.reducedMinBuffer} onChange={(event) => update('reducedMinBuffer', event.target.value)} /></label>
          <label className="text-xs text-zinc-400">DEFENSIVE a partir de (%)<input className={inputClass} type="number" min="0" max="98" value={thresholds.defensiveMinBuffer} onChange={(event) => update('defensiveMinBuffer', event.target.value)} /></label>
        </div>
        <div className="mt-5 flex justify-end"><PrimaryButton onClick={() => void save()} disabled={pending}><Save className="size-4" />{pending ? 'Salvando…' : 'Salvar regras'}</PrimaryButton></div>
      </Panel>

      <Panel className="p-5 sm:p-6"><SectionHeading title="Prévia de simulação" description="Informe um buffer de exemplo para ver qual faixa seria aplicada." />
        <label className="mt-5 block max-w-xs text-xs text-zinc-400">Buffer restante (%)<input className={inputClass} type="number" min="-100" max="100" value={buffer} onChange={(event) => setBuffer(event.target.value)} placeholder="Sem dados" /></label>
        {simulated ? <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">{simulated.label}</span><StatusPill tone={simulated.key === 'normal' ? 'positive' : simulated.key === 'reduced' ? 'warning' : 'danger'}>SIMULADO</StatusPill></div><p className="mt-2 text-xs text-zinc-400">{simulated.description}</p></div> : <p className="mt-5 rounded-xl border border-dashed border-white/10 p-4 text-xs text-zinc-500">Dados insuficientes para avaliar uma conta real. Use a prévia apenas para simulação.</p>}
        <p className="mt-4 text-[10px] leading-5 text-zinc-500">LOCKED e BREACHED são estados de simulação nesta fase. A plataforma não bloqueia ordens automaticamente.</p>
      </Panel>
    </div>
  </PageFrame>
}
