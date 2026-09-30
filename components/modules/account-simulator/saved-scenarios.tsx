'use client'

import { useState } from 'react'
import { Copy, FolderOpen, Trash2 } from 'lucide-react'
import type { AccountSimulatorData } from '@/lib/account-simulator/server'
import { Panel, SectionHeading } from '@/components/workspace/primitives'

type Scenario = AccountSimulatorData['scenarios'][number]
type Metrics = {
  netPnlCents?: number
  count?: number
  winRatePercent?: number | null
  profitFactor?: number | null
  maxDrawdownCents?: number
  remainingBufferCents?: number
  targetReached?: boolean
  breached?: boolean
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function money(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(value / 100)
    : '—'
}

function metric(snapshot: Record<string, unknown>, key: string): string {
  const metrics = object(snapshot.metrics) as Metrics
  const value = metrics[key as keyof Metrics]
  if (key === 'netPnlCents' || key === 'maxDrawdownCents' || key === 'remainingBufferCents') return money(value)
  if (key === 'winRatePercent') return typeof value === 'number' ? `${value.toFixed(1)}%` : '—'
  if (key === 'profitFactor') return typeof value === 'number' ? value.toFixed(2) : '—'
  return typeof value === 'number' ? String(value) : '—'
}

export function SavedScenarios({ scenarios, files, activeId, onOpen, onDuplicate, onDelete }: {
  scenarios: Scenario[]
  files: { id: string; fileName: string }[]
  activeId: string | null
  onOpen: (scenario: Scenario) => void
  onDuplicate: (scenario: Scenario) => void
  onDelete: (scenario: Scenario) => void
}) {
  const [compareIds, setCompareIds] = useState<string[]>([])
  const selected = scenarios.filter((scenario) => compareIds.includes(scenario.id))
  const fileNames = new Map(files.map((file) => [file.id, file.fileName]))
  const toggleCompare = (id: string) => setCompareIds((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : current.length < 4 ? [...current, id] : current)

  return <div className="space-y-4">
    <Panel className="p-4 sm:p-5"><SectionHeading title="Cenários salvos" description="Reabra configurações antigas, compare os últimos resultados salvos e exclua cenários sem apagar os CSVs." />
      {scenarios.length ? <div className="mt-4 space-y-2">{scenarios.map((scenario) => {
        const missing = scenario.sourceFileIds.filter((id) => !fileNames.has(id)).length
        const labels = scenario.sourceFileIds.slice(0, 2).map((id) => fileNames.get(id) ?? `CSV removido (${id.slice(0, 8)})`)
        const configuration = object(scenario.configuration)
        const rules = object(configuration.rules)
        const profile = object(rules.profile)
        return <article key={scenario.id} className={`rounded-lg border p-3 ${scenario.id === activeId ? 'border-[#b9f227]/25 bg-[#b9f227]/[0.025]' : 'border-white/[0.06] bg-black/10'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-xs font-medium text-zinc-200">{scenario.name}</h3><p className="mt-1 text-[9px] text-zinc-500">Conta {typeof profile.id === 'string' ? profile.id : '—'} · {scenario.sourceFileIds.length} fonte(s) · atualizado {dateLabel(scenario.updatedAt)}</p>{labels.length > 0 && <p className="mt-1 max-w-2xl truncate text-[9px] text-zinc-600" title={scenario.sourceFileIds.map((id) => fileNames.get(id) ?? `CSV removido (${id})`).join(' · ')}>{labels.join(' · ')}{scenario.sourceFileIds.length > labels.length ? ` · +${scenario.sourceFileIds.length - labels.length}` : ''}</p>}{missing > 0 && <p className="mt-2 text-[9px] text-amber-200">{missing} fonte(s) CSV foram excluídas ou estão indisponíveis; este cenário permanece salvo.</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><label className="flex min-h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[9px] text-zinc-400"><input type="checkbox" checked={compareIds.includes(scenario.id)} onChange={() => toggleCompare(scenario.id)} disabled={!compareIds.includes(scenario.id) && compareIds.length >= 4} className="accent-[#b9f227]" />Comparar</label><button type="button" onClick={() => onOpen(scenario)} className="secondary-button min-h-8 px-2.5 text-[9px]"><FolderOpen className="size-3.5" />Abrir</button><button type="button" onClick={() => onDuplicate(scenario)} className="secondary-button min-h-8 px-2.5 text-[9px]"><Copy className="size-3.5" />Duplicar</button><button type="button" onClick={() => onDelete(scenario)} aria-label={`Excluir cenário ${scenario.name}`} className="secondary-button min-h-8 px-2 text-rose-200"><Trash2 className="size-3.5" /></button></div></div></article>
      })}</div> : <p className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-center text-[10px] text-zinc-500">Nenhum cenário salvo. Configure os arquivos e regras, dê um nome e salve para voltar a esta análise em outro navegador.</p>}
    </Panel>

    {selected.length > 0 && <Panel className="p-4 sm:p-5"><SectionHeading title="Comparação lado a lado" description="Os valores abaixo são o último resumo gravado para cada cenário. Abra e salve novamente para atualizar após mudar as regras ou os arquivos." /><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left text-[10px]"><thead><tr><th className="border-b border-white/[0.08] p-2 text-zinc-500">Métrica / regra</th>{selected.map((scenario) => <th key={scenario.id} className="max-w-56 border-b border-white/[0.08] p-2 text-zinc-200">{scenario.name}<span className="mt-1 block font-normal text-zinc-600" title={scenario.sourceFileIds.map((id) => fileNames.get(id) ?? `CSV removido (${id})`).join(' · ')}>{scenario.sourceFileIds.slice(0, 2).map((id) => fileNames.get(id) ?? `Removido (${id.slice(0, 8)})`).join(' · ') || 'Sem CSV'}{scenario.sourceFileIds.length > 2 ? ` · +${scenario.sourceFileIds.length - 2}` : ''}</span></th>)}</tr></thead><tbody>
      {([
        ['Conta', (scenario: Scenario) => { const r = object(object(scenario.configuration).rules); return String(object(r.profile).id ?? '—') }],
        ['Modo', (scenario: Scenario) => object(object(scenario.configuration).rules).mode === 'payout' ? 'PA / saque' : 'Avaliação'],
        ['DD', (scenario: Scenario) => object(object(scenario.configuration).rules).drawdownRule === 'end-of-day' ? 'Fim do dia' : 'Trade fechado'],
        ['Meta configurada', (scenario: Scenario) => money(object(object(object(scenario.configuration).rules).profile).targetCents)],
        ['Limite de perda', (scenario: Scenario) => money(object(object(object(scenario.configuration).rules).profile).maxLossCents)],
        ['Risco por categoria', (scenario: Scenario) => {
          const risk = object(object(scenario.configuration).rules).riskByCategory
          const format = (key: string, label: string) => { const item = object(object(risk)[key]); return `${label}: ${item.enabled === true ? money(item.riskCents) : 'desligado'}` }
          return `${format('DIRECT', 'Direta')} · ${format('ABSORPTION', 'Absorção')} · ${format('CONVENTIONAL', 'Convencional')}`
        }],
        ['Entry Market', (scenario: Scenario) => {
          const item = object(object(scenario.configuration).rules).entryMarket
          const entry = object(item)
          return entry.enabled === true ? `Ativo · ${entry.allowBuy === true ? 'compra' : ''}${entry.allowBuy === true && entry.allowSell === true ? ' e ' : ''}${entry.allowSell === true ? 'venda' : ''}` : 'Desligado'
        }],
        ['Travas / Tomahawk', (scenario: Scenario) => {
          const rules = object(object(scenario.configuration).rules)
          const dailyLoss = object(rules.dailyLoss)
          const dailyStops = object(rules.dailyStops)
          const tomahawk = object(rules.tomahawk)
          const enabled = [dailyLoss.enabled === true ? `perda diária ${money(dailyLoss.maxLossCents)}` : '', dailyStops.enabled === true ? `${dailyStops.maxStops} stops/dia` : '', tomahawk.enabled === true ? `Tomahawk ${tomahawk.profitPercent}% (máx. ${tomahawk.maxBaseMultiple}×)` : ''].filter(Boolean)
          return enabled.join(' · ') || 'Desligadas'
        }],
        ['Resultado líquido', (scenario: Scenario) => metric(object(object(scenario.configuration).lastResult), 'netPnlCents')],
        ['Trades', (scenario: Scenario) => metric(object(object(scenario.configuration).lastResult), 'count')],
        ['Acertividade', (scenario: Scenario) => metric(object(object(scenario.configuration).lastResult), 'winRatePercent')],
        ['Profit factor', (scenario: Scenario) => metric(object(object(scenario.configuration).lastResult), 'profitFactor')],
        ['Drawdown máximo', (scenario: Scenario) => metric(object(object(scenario.configuration).lastResult), 'maxDrawdownCents')],
        ['Margem restante', (scenario: Scenario) => metric(object(object(scenario.configuration).lastResult), 'remainingBufferCents')],
        ['Avisos da simulação', (scenario: Scenario) => {
          const snapshot = object(object(scenario.configuration).lastResult)
          const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings.filter((item): item is string => typeof item === 'string') : []
          return warnings.length ? warnings.join(' · ') : snapshot.savedAt ? 'Nenhum aviso gravado' : 'Sem análise salva'
        }],
      ] as [string, (scenario: Scenario) => string][]).map(([label, value]) => <tr key={label}><th className="border-b border-white/[0.05] p-2 font-medium text-zinc-500">{label}</th>{selected.map((scenario) => <td key={scenario.id} className="border-b border-white/[0.05] p-2 text-zinc-300">{value(scenario)}</td>)}</tr>)}
      </tbody></table>{selected.some((scenario) => !object(object(scenario.configuration).lastResult).savedAt) && <p className="mt-3 text-[9px] text-amber-200">Cenário sem resultados gravados mostra traços até ser aberto e salvo com uma análise calculada.</p>}</div></Panel>}
  </div>
}
