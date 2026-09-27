'use client'

import { useState } from 'react'
import { GitCompareArrows, Save } from 'lucide-react'
import { EmptyState, PageFrame, Panel, PrimaryButton, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { PatternLabData } from '@/lib/patterns/server'
import { formatCurrency } from '@/lib/format'

export function PatternLabScreen({ initial }: { initial: PatternLabData }) {
  const [data, setData] = useState(initial)
  const [lowSample, setLowSample] = useState(String(initial.thresholds.lowSample))
  const [validSample, setValidSample] = useState(String(initial.thresholds.validSample))
  const [leftId, setLeftId] = useState(initial.patterns[0]?.id ?? '')
  const [rightId, setRightId] = useState(initial.patterns[1]?.id ?? initial.patterns[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const left = data.patterns.find((item) => item.id === leftId)
  const right = data.patterns.find((item) => item.id === rightId)

  async function saveThresholds() {
    setPending(true)
    setError('')
    setNotice('')
    const response = await fetch('/api/pattern-lab', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lowSample: Number(lowSample), validSample: Number(validSample) }) }).catch(() => null)
    const result = response ? await response.json().catch(() => ({})) as { error?: string; thresholds?: PatternLabData['thresholds'] } : {}
    if (!response?.ok || !result.thresholds) setError(result.error ?? 'Não foi possível salvar os limites.')
    else {
      const thresholds = result.thresholds
      setData((current) => ({ ...current, thresholds, configured: true, patterns: current.patterns.map((pattern) => ({ ...pattern, sampleQuality: pattern.sampleSize < thresholds.lowSample ? 'LOW SAMPLE' : pattern.sampleSize < thresholds.validSample ? 'DEVELOPING' : 'VALID SAMPLE' })) }))
      setNotice('Critérios salvos no workspace e registrados na auditoria.')
    }
    setPending(false)
  }

  const metrics = [
    ['Amostra', left?.sampleSize ?? 0, right?.sampleSize ?? 0],
    ['Wins / Losses', left ? `${left.wins} / ${left.losses}` : '—', right ? `${right.wins} / ${right.losses}` : '—'],
    ['Win rate', left?.winRate === null || !left ? '—' : `${left.winRate.toFixed(1)}%`, right?.winRate === null || !right ? '—' : `${right.winRate.toFixed(1)}%`],
    ['Profit factor', left?.profitFactor === null || !left ? '—' : left.profitFactor.toFixed(2), right?.profitFactor === null || !right ? '—' : right.profitFactor.toFixed(2)],
    ['Expectancy', left?.expectancyCents === null || !left ? '—' : formatCurrency(left.expectancyCents / 100), right?.expectancyCents === null || !right ? '—' : formatCurrency(right.expectancyCents / 100)],
    ['P&L líquido', left ? formatCurrency(left.netCents / 100) : '—', right ? formatCurrency(right.netCents / 100) : '—'],
    ['MAE médio', left?.averageMaeCents === null || !left ? '—' : formatCurrency(left.averageMaeCents / 100), right?.averageMaeCents === null || !right ? '—' : formatCurrency(right.averageMaeCents / 100)],
    ['MFE médio', left?.averageMfeCents === null || !left ? '—' : formatCurrency(left.averageMfeCents / 100), right?.averageMfeCents === null || !right ? '—' : formatCurrency(right.averageMfeCents / 100)],
  ]

  return <PageFrame title="Pattern Lab" description="Analise fatores e padrões reconhecidos em trades recebidos do Hunter." eyebrow="HUNTER ANALYTICS">
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-xs ${error ? 'border-rose-400/20 bg-rose-400/[0.04] text-rose-200' : 'border-white/[0.08] bg-white/[0.025] text-zinc-300'}`}>{error || notice}</p>}
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Qualidade da amostra" description="Win rate sempre aparece junto com tamanho da amostra e resultados em dinheiro." />
      <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-xs text-zinc-400">LOW SAMPLE abaixo de<input className="mt-1 block h-10 w-32 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" type="number" min="2" value={lowSample} onChange={(event) => setLowSample(event.target.value)} /></label><label className="text-xs text-zinc-400">VALID SAMPLE a partir de<input className="mt-1 block h-10 w-32 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-sm" type="number" min="3" value={validSample} onChange={(event) => setValidSample(event.target.value)} /></label><PrimaryButton disabled={pending} onClick={() => void saveThresholds()}><Save className="size-4" />{pending ? 'Salvando…' : 'Salvar critérios'}</PrimaryButton><p className="text-[10px] text-zinc-500">Entre os dois limites: DEVELOPING.</p></div>
    </Panel>
    <Panel className="mb-5 p-5 sm:p-6"><SectionHeading title="Padrões observados" description="Métricas calculadas somente com trades/contextos enviados pelo conector." />
      {data.patterns.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-[0.12em] text-zinc-600">{['Padrão', 'Amostra', 'Wins / losses', 'Win rate', 'Profit factor', 'Expectancy', 'P&L', 'MAE', 'MFE', 'Qualidade'].map((name) => <th key={name} className="py-3 pr-4">{name}</th>)}</tr></thead><tbody>{data.patterns.map((pattern) => <tr key={pattern.id} className="border-b border-white/[0.04] last:border-0"><td className="py-3 pr-4 text-xs font-medium text-zinc-200">{pattern.name}</td><td className="py-3 pr-4 text-xs text-zinc-300">{pattern.sampleSize}</td><td className="py-3 pr-4 text-xs text-zinc-400">{pattern.wins} / {pattern.losses}</td><td className="py-3 pr-4 text-xs text-zinc-300">{pattern.winRate === null ? '—' : `${pattern.winRate.toFixed(1)}%`}</td><td className="py-3 pr-4 text-xs text-zinc-300">{pattern.profitFactor === null ? '—' : pattern.profitFactor.toFixed(2)}</td><td className="py-3 pr-4 text-xs text-zinc-300">{pattern.expectancyCents === null ? '—' : formatCurrency(pattern.expectancyCents / 100)}</td><td className="py-3 pr-4 text-xs text-zinc-300">{formatCurrency(pattern.netCents / 100)}</td><td className="py-3 pr-4 text-xs text-zinc-400">{pattern.averageMaeCents === null ? '—' : formatCurrency(pattern.averageMaeCents / 100)}</td><td className="py-3 pr-4 text-xs text-zinc-400">{pattern.averageMfeCents === null ? '—' : formatCurrency(pattern.averageMfeCents / 100)}</td><td className="py-3 pr-4"><StatusPill tone={pattern.sampleQuality === 'VALID SAMPLE' ? 'positive' : pattern.sampleQuality === 'DEVELOPING' ? 'warning' : 'neutral'}>{pattern.sampleQuality}</StatusPill></td></tr>)}</tbody></table></div> : <div className="mt-4"><EmptyState title="Dados insuficientes" description="Nenhuma ocorrência de padrão foi recebida. Envie trades com patternCodes pelo conector Hunter." /></div>}
    </Panel>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Pattern Comparator" description="Compare dois padrões observados sem esconder a diferença de amostra." />
      {!data.patterns.length ? <div className="mt-4"><EmptyState title="Comparador aguardando padrões" description="Envie trades com códigos de padrões para habilitar a comparação." /></div> : <><div className="mt-4 flex flex-wrap items-center gap-2"><select aria-label="Padrão A" className="h-10 min-w-48 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs" value={leftId} onChange={(event) => setLeftId(event.target.value)}>{data.patterns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><GitCompareArrows className="size-4 text-zinc-500" /><select aria-label="Padrão B" className="h-10 min-w-48 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs" value={rightId} onChange={(event) => setRightId(event.target.value)}>{data.patterns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-white/[0.06] text-[9px] uppercase tracking-wide text-zinc-600"><th className="py-2 pr-3">Métrica</th><th className="py-2 pr-3">{left?.name ?? 'A'}</th><th className="py-2">{right?.name ?? 'B'}</th></tr></thead><tbody>{metrics.map(([label, a, b]) => <tr key={String(label)} className="border-b border-white/[0.04] last:border-0"><td className="py-2 pr-3 text-[10px] text-zinc-500">{label}</td><td className="py-2 pr-3 text-xs text-zinc-300">{a}</td><td className="py-2 text-xs text-zinc-300">{b}</td></tr>)}</tbody></table></div></>}
    </Panel>
    <p className="mt-4 text-[10px] leading-5 text-zinc-600">Drawdown, melhores/piores horários e EV em R exigem snapshots e risco por trade; aparecem quando o conector fornecer esses dados.</p>
  </PageFrame>
}
