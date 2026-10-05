'use client'

import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import { PageFrame, PrimaryButton } from '@/components/workspace/primitives'
import { calculateSimulation, summarizeMonths } from '@/lib/account-simulator/calculations'
import { defaultSimulatorRules, type AccountProfileId, type MonthlySimulationRow, type SimulationMetrics, type SimulatorRules, type SimulatorTrade } from '@/lib/account-simulator/types'
import { mapTradeCsv, parseTradeTimestamp, type TradeColumnMapping, type TradeDateOrder } from '@/lib/account-simulator/trade-csv'
import { parseNinjaTraderGridTradesCsv } from '@/lib/account-simulator/ninjatrader-grid-csv'
import type { AccountSimulatorData } from '@/lib/account-simulator/server'
import type { CsvAnalysis, GridMonth, HsgSignal } from '@/lib/experiments/csv-analysis'
import { SavedScenarios } from './saved-scenarios'
import { SimulatorFilePicker, type SimulatorFile } from './simulator-file-picker'
import { SimulatorMonths } from './simulator-months'
import { SimulatorResults } from './simulator-results'
import { SimulatorRulesEditor } from './simulator-rules'
import { TradeColumnMapper } from './trade-column-mapper'

type Tab = 'overview' | 'months' | 'settings' | 'scenarios'
type Scenario = AccountSimulatorData['scenarios'][number]
const inputClass = 'h-9 rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-[10px] text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Dashboard' }, { id: 'months', label: 'Meses' }, { id: 'settings', label: 'Configurações' }, { id: 'scenarios', label: 'Cenários' }]
const currencyCents = (value: number | null) => value === null ? null : Math.round(value * 100)

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hydrateRules(value: unknown): SimulatorRules {
  const input = isObject(value) ? value : {}
  const rawProfile = isObject(input.profile) ? input.profile : {}
  const profileId: AccountProfileId = rawProfile.id === '150K' ? '150K' : '50K'
  const base = defaultSimulatorRules(profileId)
  const profileAmount = (key: Exclude<keyof SimulatorRules['profile'], 'id'>, use150kFallback = false): number => {
    const amount = Number(rawProfile[key])
    return Number.isFinite(amount) && !(use150kFallback && profileId === '150K' && amount <= 0) ? amount : base.profile[key]
  }
  const risk = isObject(input.riskByCategory) ? input.riskByCategory : {}
  const readRisk = (key: 'DIRECT' | 'ABSORPTION' | 'CONVENTIONAL') => {
    const row = isObject(risk[key]) ? risk[key] : {}
    return { enabled: typeof row.enabled === 'boolean' ? row.enabled : base.riskByCategory[key].enabled, riskCents: Number.isFinite(Number(row.riskCents)) ? Number(row.riskCents) : base.riskByCategory[key].riskCents }
  }
  const entryMarket = isObject(input.entryMarket) ? input.entryMarket : {}
  const dailyLoss = isObject(input.dailyLoss) ? input.dailyLoss : {}
  const dailyStops = isObject(input.dailyStops) ? input.dailyStops : {}
  const tomahawk = isObject(input.tomahawk) ? input.tomahawk : {}
  const drawdownRule = input.drawdownRule === 'end-of-day' ? 'end-of-day' : 'closed-trade'
  const mode = input.mode === 'payout' ? 'payout' : 'evaluation'
  return {
    profile: {
      id: profileId,
      startBalanceCents: profileAmount('startBalanceCents'),
      targetCents: profileAmount('targetCents', true),
      maxLossCents: profileAmount('maxLossCents', true),
      payoutDetachCents: profileAmount('payoutDetachCents'),
    },
    drawdownRule, mode,
    timezone: typeof input.timezone === 'string' ? input.timezone : base.timezone,
    referenceRiskCents: Number.isFinite(Number(input.referenceRiskCents)) ? Number(input.referenceRiskCents) : base.referenceRiskCents,
    riskByCategory: { DIRECT: readRisk('DIRECT'), ABSORPTION: readRisk('ABSORPTION'), CONVENTIONAL: readRisk('CONVENTIONAL') },
    entryMarket: { enabled: entryMarket.enabled === true, allowBuy: entryMarket.allowBuy !== false, allowSell: entryMarket.allowSell !== false },
    dailyLoss: { enabled: dailyLoss.enabled === true, maxLossCents: Number.isFinite(Number(dailyLoss.maxLossCents)) ? Number(dailyLoss.maxLossCents) : base.dailyLoss.maxLossCents },
    dailyStops: { enabled: dailyStops.enabled === true, maxStops: Number.isFinite(Number(dailyStops.maxStops)) ? Math.max(1, Number(dailyStops.maxStops)) : base.dailyStops.maxStops, lossWithoutExitReasonIsStop: dailyStops.lossWithoutExitReasonIsStop === true },
    tomahawk: { enabled: tomahawk.enabled === true, profitPercent: Number.isFinite(Number(tomahawk.profitPercent)) ? Number(tomahawk.profitPercent) : base.tomahawk.profitPercent, maxBaseMultiple: Number.isFinite(Number(tomahawk.maxBaseMultiple)) ? Number(tomahawk.maxBaseMultiple) : base.tomahawk.maxBaseMultiple },
  }
}

function signalTrades(signals: HsgSignal[], riskCents: number, dateOrder: TradeDateOrder, timezone: string): SimulatorTrade[] {
  return signals.flatMap((signal, index) => {
    if (signal.resultR === null) return []
    const close = signal.exitTime || signal.entryTime
    const timestamp = Number.isFinite(Date.parse(close)) && /^\d{4}-\d\d-\d\d/.test(close) ? new Date(close).toISOString() : parseTradeTimestamp(`${signal.date} ${close}`, dateOrder, timezone)
    if (!timestamp) return []
    const directionText = signal.direction.toUpperCase()
    const direction = directionText.includes('BUY') || directionText.includes('LONG') ? 'BUY' : directionText.includes('SELL') || directionText.includes('SHORT') ? 'SELL' : null
    const family = signal.family.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const riskCategory = family === 'direta' || family === 'direct' ? 'DIRECT' : family === 'absorcao' || family === 'absorption' ? 'ABSORPTION' : family === 'convencional' || family === 'conventional' ? 'CONVENTIONAL' : null
    return [{ id: `${signal.source}:${signal.id}:${index}`, source: signal.source, rowNumber: index + 2, timestamp, pnlCents: Math.round(signal.resultR * riskCents), direction, riskCategory, entryMarket: null, originalRiskCents: null, exitReason: signal.exitReason || null }]
  })
}

function gridTrades(months: GridMonth[]): SimulatorTrade[] {
  return months.flatMap((month, index) => month.net === null ? [] : [{ id: `${month.source}:${month.month}:${index}`, source: month.source, rowNumber: index + 1, timestamp: `${month.month}-01T12:00:00.000Z`, pnlCents: currencyCents(month.net) ?? 0, direction: null, riskCategory: null, entryMarket: null, originalRiskCents: null, exitReason: null }])
}

function summarizeGrid(months: GridMonth[]): MonthlySimulationRow[] {
  const grouped = new Map<string, GridMonth[]>()
  for (const row of months) grouped.set(row.month, [...(grouped.get(row.month) ?? []), row])
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
    const wins = rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.wins ?? 0)), 0)
    const losses = rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.losses ?? 0)), 0)
    const flats = rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.flats ?? 0)), 0)
    const count = rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.trades ?? ((row.wins ?? 0) + (row.losses ?? 0) + (row.flats ?? 0)))), 0)
    const netPnlCents = rows.reduce((sum, row) => sum + (currencyCents(row.net) ?? 0), 0)
    const maxDrawdownCents = rows.reduce((maximum, row) => Math.max(maximum, Math.abs(currencyCents(row.maxDrawdown) ?? 0)), 0)
    return { month, count, wins, losses, flats, netPnlCents, winRatePercent: count ? wins / count * 100 : null, maxDrawdownCents }
  })
}

function aggregateGridMetrics(months: GridMonth[], simulated: SimulationMetrics, rules: SimulatorRules): SimulationMetrics {
  const count = months.reduce((sum, row) => sum + Math.max(0, Math.round(row.trades ?? ((row.wins ?? 0) + (row.losses ?? 0) + (row.flats ?? 0)))), 0)
  const wins = months.reduce((sum, row) => sum + Math.max(0, Math.round(row.wins ?? 0)), 0)
  const losses = months.reduce((sum, row) => sum + Math.max(0, Math.round(row.losses ?? 0)), 0)
  const flats = months.reduce((sum, row) => sum + Math.max(0, Math.round(row.flats ?? 0)), 0)
  const netPnlCents = months.reduce((sum, row) => sum + (currencyCents(row.net) ?? 0), 0)
  const grossWins = months.reduce((sum, row) => sum + Math.max(0, currencyCents(row.grossProfit) ?? 0), 0)
  const grossLosses = months.reduce((sum, row) => sum + Math.abs(currencyCents(row.grossLoss) ?? 0), 0)
  const maxDrawdownCents = months.reduce((maximum, row) => Math.max(maximum, Math.abs(currencyCents(row.maxDrawdown) ?? 0)), 0)
  return { ...simulated, count, wins, losses, flats, netPnlCents, winRatePercent: count ? wins / count * 100 : null, profitFactor: grossLosses ? grossWins / grossLosses : null, maxDrawdownCents, finalBalanceCents: rules.profile.startBalanceCents + netPnlCents }
}

export function AccountSimulatorScreen({ initial }: { initial: AccountSimulatorData }) {
  const [files, setFiles] = useState<SimulatorFile[]>(initial.files)
  const [scenarios, setScenarios] = useState<Scenario[]>(initial.scenarios)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [analyses, setAnalyses] = useState<Record<string, CsvAnalysis>>({})
  const [mappings, setMappings] = useState<Record<string, TradeColumnMapping>>({})
  const [rules, setRules] = useState<SimulatorRules>(() => defaultSimulatorRules())
  const [dateOrder, setDateOrder] = useState<TradeDateOrder>('auto')
  const [convertHsg, setConvertHsg] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null)
  const [scenarioName, setScenarioName] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const selectedAnalyses = selectedFileIds.flatMap((id) => analyses[id] ? [{ id, analysis: analyses[id] }] : [])
  const tradeFiles = selectedAnalyses.filter((item): item is { id: string; analysis: Extract<CsvAnalysis, { kind: 'trades' }> } => item.analysis.kind === 'trades')
  const hsgFiles = selectedAnalyses.filter((item): item is { id: string; analysis: Extract<CsvAnalysis, { kind: 'hsg' }> } => item.analysis.kind === 'hsg')
  const gridFiles = selectedAnalyses.filter((item): item is { id: string; analysis: Extract<CsvAnalysis, { kind: 'grid' }> } => item.analysis.kind === 'grid')

  const mapped = useMemo(() => {
    const trades: SimulatorTrade[] = []
    const warnings: string[] = []
    for (const { id, analysis } of tradeFiles) {
      try {
        const result = mapTradeCsv(analysis, mappings[id] ?? analysis.autoMapping, dateOrder, rules.timezone)
        trades.push(...result.trades)
        warnings.push(...result.warnings.map((warning) => `${analysis.fileName}: ${warning}`))
      } catch (cause) { warnings.push(`${analysis.fileName}: ${cause instanceof Error ? cause.message : 'mapeamento inválido.'}`) }
    }
    return { trades, warnings }
  }, [tradeFiles, mappings, dateOrder, rules.timezone])
  const gridRows = gridFiles.flatMap(({ analysis }) => analysis.months)
  const hsgSignals = hsgFiles.flatMap(({ analysis }) => analysis.signals)
  const granularity: 'trade' | 'monthly' | 'none' = tradeFiles.length ? 'trade' : hsgFiles.length && convertHsg ? 'trade' : gridFiles.length ? 'monthly' : 'none'
  const sourceTrades = granularity === 'trade'
    ? tradeFiles.length ? mapped.trades : signalTrades(hsgSignals, rules.referenceRiskCents, dateOrder, rules.timezone)
    : granularity === 'monthly' ? gridTrades(gridRows) : []
  const effectiveRules = granularity === 'monthly' ? {
    ...rules,
    riskByCategory: { DIRECT: { ...rules.riskByCategory.DIRECT, enabled: false }, ABSORPTION: { ...rules.riskByCategory.ABSORPTION, enabled: false }, CONVENTIONAL: { ...rules.riskByCategory.CONVENTIONAL, enabled: false } },
    entryMarket: { ...rules.entryMarket, enabled: false },
    dailyLoss: { ...rules.dailyLoss, enabled: false }, dailyStops: { ...rules.dailyStops, enabled: false },
    tomahawk: { ...rules.tomahawk, enabled: false },
  } : rules
  const rawSimulation = useMemo(() => calculateSimulation(sourceTrades, effectiveRules), [sourceTrades, effectiveRules])
  const sourceWarnings = [...mapped.warnings]
  if (tradeFiles.length && hsgFiles.length) sourceWarnings.push('Trades HSG e trades individuais foram selecionados; apenas os trades individuais entram na curva para evitar somar fontes possivelmente sobrepostas.')
  if (tradeFiles.length && gridFiles.length) sourceWarnings.push('Os resumos Grid selecionados ficam como referência. A curva usa trades individuais e não soma os dois formatos.')
  if (hsgFiles.length && !convertHsg && !tradeFiles.length) sourceWarnings.push('Hunter HSG mede resultado em R. Ative a conversão usando o risco de referência para simulá-lo em dólares.')
  const metrics = granularity === 'monthly' ? aggregateGridMetrics(gridRows, rawSimulation.metrics, effectiveRules) : rawSimulation.metrics
  const monthlyRows = granularity === 'monthly' ? summarizeGrid(gridRows) : summarizeMonths(sourceTrades, rules.timezone)
  const sourceDescription = granularity === 'monthly' ? 'Este resultado vem de CSVs mensais.' : granularity === 'trade' && tradeFiles.length ? 'Curva reconstruída com operações individuais.' : granularity === 'trade' ? 'R convertido para dólares pelo risco de referência configurado.' : 'Nenhuma fonte carregada.'
  const missingFileCount = selectedFileIds.filter((id) => !files.some((file) => file.id === id)).length
  const canUseTradeRules = granularity === 'trade' && sourceTrades.length > 0 && (!hsgFiles.length || convertHsg)

  if (tradeFiles.length && gridRows.length) {
    const monthlyReference = summarizeGrid(gridRows)
    const monthlyTrades = summarizeMonths(mapped.trades, rules.timezone)
    const referenceByMonth = new Map(monthlyReference.map((row) => [row.month, row.netPnlCents]))
    const matches = monthlyTrades.flatMap((row) => {
      const reported = referenceByMonth.get(row.month)
      if (reported === undefined) return []
      const difference = row.netPnlCents - reported
      return Math.abs(difference) < 100 ? [] : [`${row.month}: trades individuais ${difference > 0 ? 'acima' : 'abaixo'} do Grid em US$ ${Math.abs(difference / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`]
    })
    if (matches.length) sourceWarnings.push(`Diferenças entre trades individuais e resumos mensais (meses correspondentes): ${matches.slice(0, 3).join(' ')}${matches.length > 3 ? ` + ${matches.length - 3} outro(s) mês(es).` : ''}`)
  }
  const simulation = { ...rawSimulation, warnings: [...sourceWarnings, ...rawSimulation.warnings] }

  function updateAnalysis(id: string, analysis: CsvAnalysis) {
    setAnalyses((current) => ({ ...current, [id]: analysis }))
    if (analysis.kind === 'trades') setMappings((current) => ({ ...current, [id]: current[id] ?? analysis.autoMapping }))
  }

  function serializedConfiguration() {
    return {
      schemaVersion: 1,
      rules,
      dateOrder,
      convertHsg,
      mappings,
      lastResult: {
        savedAt: new Date().toISOString(),
        granularity,
        metrics,
        sourceDescription,
        warningCount: simulation.warnings.length,
        warnings: simulation.warnings.slice(0, 25),
      },
    }
  }

  async function saveScenario() {
    setBusy(true); setError(''); setFeedback('')
    const availableIds = selectedFileIds.filter((id) => files.some((file) => file.id === id))
    const payload = { name: scenarioName.trim() || 'Simulação sem título', sourceFileIds: availableIds, configuration: serializedConfiguration() }
    try {
      const response = await fetch(activeScenarioId ? `/api/account-simulator/scenarios/${activeScenarioId}` : '/api/account-simulator/scenarios', { method: activeScenarioId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json().catch(() => ({})) as { scenario?: Scenario; error?: string }
      if (!response.ok || !result.scenario) throw new Error(result.error ?? 'Não foi possível salvar o cenário.')
      setScenarios((current) => [result.scenario!, ...current.filter((scenario) => scenario.id !== result.scenario!.id)])
      setActiveScenarioId(result.scenario.id); setScenarioName(result.scenario.name)
      setFeedback(missingFileCount ? `Cenário salvo. ${missingFileCount} fonte(s) excluída(s) foram removidas do vínculo; os arquivos originais restantes continuam na biblioteca.` : 'Cenário salvo no workspace e disponível em outros navegadores.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cenário.') }
    finally { setBusy(false) }
  }

  async function openScenario(scenario: Scenario) {
    setBusy(true); setError(''); setFeedback('')
    const config = isObject(scenario.configuration) ? scenario.configuration : {}
    const loadedRules = hydrateRules(config.rules)
    const storedMappings = isObject(config.mappings) ? config.mappings as Record<string, TradeColumnMapping> : {}
    setRules(loadedRules)
    setDateOrder(config.dateOrder === 'dmy' || config.dateOrder === 'mdy' ? config.dateOrder : 'auto')
    setConvertHsg(config.convertHsg === true)
    setMappings(storedMappings)
    setSelectedFileIds(scenario.sourceFileIds)
    setScenarioName(scenario.name); setActiveScenarioId(scenario.id); setActiveTab('overview')
    const available = scenario.sourceFileIds.filter((id) => files.some((file) => file.id === id))
    const parsed: Record<string, CsvAnalysis> = {}
    const errors: string[] = []
    for (const id of available) {
      try {
        const response = await fetch(`/api/experiment-csv-files/${id}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Fonte indisponível.')
        const file = files.find((item) => item.id === id)!
        parsed[id] = parseNinjaTraderGridTradesCsv(file.fileName, await response.text())
        if (parsed[id].kind === 'trades' && !storedMappings[id]) storedMappings[id] = parsed[id].autoMapping
      } catch (cause) { errors.push(`${files.find((item) => item.id === id)?.fileName ?? id}: ${cause instanceof Error ? cause.message : 'erro ao reabrir fonte.'}`) }
    }
    setAnalyses((current) => ({ ...current, ...parsed }))
    setMappings(storedMappings)
    setError(errors.join(' · '))
    if (scenario.sourceFileIds.some((id) => !files.some((file) => file.id === id))) setFeedback('Algumas fontes foram excluídas. O cenário e as regras continuam salvos; adicione os CSVs novamente para recalcular.')
    setBusy(false)
  }

  async function deleteScenario(scenario: Scenario) {
    if (!window.confirm(`Excluir o cenário ${scenario.name}? Os CSVs associados serão mantidos.`)) return
    setBusy(true); setError(''); setFeedback('')
    try {
      const response = await fetch(`/api/account-simulator/scenarios/${scenario.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível excluir o cenário.')
      setScenarios((current) => current.filter((item) => item.id !== scenario.id))
      if (activeScenarioId === scenario.id) { setActiveScenarioId(null); setScenarioName('') }
      setFeedback('Cenário excluído; os CSVs originais foram mantidos.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o cenário.') }
    finally { setBusy(false) }
  }

  function duplicateScenario(scenario: Scenario) {
    const config = isObject(scenario.configuration) ? scenario.configuration : {}
    setRules(hydrateRules(config.rules)); setDateOrder(config.dateOrder === 'dmy' || config.dateOrder === 'mdy' ? config.dateOrder : 'auto')
    setConvertHsg(config.convertHsg === true); setMappings(isObject(config.mappings) ? config.mappings as Record<string, TradeColumnMapping> : {})
    setSelectedFileIds(scenario.sourceFileIds); setScenarioName(`${scenario.name} · cópia`); setActiveScenarioId(null); setActiveTab('overview')
    void openScenarioData(scenario.sourceFileIds)
  }

  async function openScenarioData(fileIds: string[]) {
    setBusy(true); setError('')
    const parsed: Record<string, CsvAnalysis> = {}
    const availableIds = fileIds.filter((item) => files.some((file) => file.id === item))
    const errors = fileIds.filter((item) => !files.some((file) => file.id === item)).map((id) => `Fonte removida (${id.slice(0, 8)}).`)
    for (const id of availableIds) {
      try {
        const file = files.find((item) => item.id === id)!
        const response = await fetch(`/api/experiment-csv-files/${id}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Fonte indisponível.')
        parsed[id] = parseNinjaTraderGridTradesCsv(file.fileName, await response.text())
      } catch (cause) { errors.push(`${files.find((file) => file.id === id)?.fileName ?? id}: ${cause instanceof Error ? cause.message : 'erro ao abrir a fonte.'}`) }
    }
    setAnalyses((current) => ({ ...current, ...parsed }))
    setError(errors.join(' · '))
    setBusy(false)
  }

  const tabButton = (tab: { id: Tab; label: string }) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-left text-xs font-semibold transition-colors ${activeTab === tab.id ? 'bg-[#b9f227]/10 text-[#c8f84a]' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'}`}><span>{tab.label}</span>{tab.id === 'scenarios' && scenarios.length > 0 ? <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-zinc-300">{scenarios.length}</span> : null}</button>

  return <PageFrame eyebrow="HUNTER · SIMULAÇÃO" title="Simulador de gerenciamento" description="Analise arquivos NinjaTrader e veja como diferentes regras de conta e risco teriam se comportado na amostra." showDemoNotice={false} actions={<div className="flex flex-wrap items-center gap-2"><input aria-label="Nome do cenário" className={`${inputClass} w-48`} placeholder="Nome do cenário" value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} /><PrimaryButton disabled={busy} onClick={() => void saveScenario()}><Save className="size-3.5" />{busy ? 'Salvando…' : activeScenarioId ? 'Salvar alterações' : 'Salvar cenário'}</PrimaryButton></div>}>
    {(error || feedback) && <p role={error ? 'alert' : 'status'} className={`mb-4 rounded-lg border p-3 text-[10px] leading-5 ${error ? 'border-rose-300/20 bg-rose-300/[0.04] text-rose-200' : 'border-white/[0.07] bg-white/[0.02] text-zinc-300'}`}>{error || feedback}</p>}
    <div className="mb-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.03] p-3 text-[10px] leading-5 text-amber-100">Análise retrospectiva e simulação. Não prevê lucro nem garante aprovação; nenhum dado altera contas reais ou envia ordens.</div>
    <nav aria-label="Seções do simulador" className="mb-4 rounded-xl border border-white/[0.07] bg-[#111315] p-2">
      <div className="flex gap-1 overflow-x-auto">{tabs.map(tabButton)}</div>
    </nav>
    <div className="grid min-w-0 grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
      <section className="min-w-0 space-y-4">
        {activeTab === 'overview' && <>
          <SimulatorFilePicker files={files} selectedFileIds={selectedFileIds} onFilesChange={setFiles} onSelectionChange={setSelectedFileIds} onAnalysis={updateAnalysis} />
          {hsgFiles.length > 0 && !tradeFiles.length && <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-300/15 bg-blue-300/[0.03] p-3 text-[10px] leading-5 text-zinc-300"><input type="checkbox" className="mt-1 accent-[#b9f227]" checked={convertHsg} onChange={(event) => setConvertHsg(event.target.checked)} /><span><strong>Converter Result_R do HSG em dólares usando o risco de referência.</strong> Desmarcado por padrão. HSG não informa P&amp;L em USD; esta conversão depende do risco configurado e serve apenas à simulação.</span></label>}
          {selectedFileIds.length > 0 && <div className="rounded-lg border border-white/[0.06] bg-black/10 p-3 text-[9px] text-zinc-500">{selectedAnalyses.length} arquivo(s) lido(s) · {selectedFileIds.length} selecionado(s){missingFileCount > 0 ? ` · ${missingFileCount} fonte(s) indisponível(is)` : ''}{granularity === 'monthly' ? ' · cálculo estimado por fechamento mensal' : granularity === 'trade' ? ' · sequência por operação' : ''}</div>}
          {tradeFiles.map(({ id, analysis }) => {
            const result = mapTradeCsv(analysis, mappings[id] ?? analysis.autoMapping, dateOrder, rules.timezone)
            return <TradeColumnMapper key={id} analysis={analysis} mapping={mappings[id] ?? analysis.autoMapping} onChange={(mapping) => setMappings((current) => ({ ...current, [id]: mapping }))} validRows={result.trades.length} warnings={[...analysis.warnings, ...result.warnings]} />
          })}
          <SimulatorResults simulation={simulation} metrics={metrics} granularity={granularity} sourceDescription={sourceDescription} sourceTrades={sourceTrades} startBalanceCents={rules.profile.startBalanceCents} targetCents={rules.profile.targetCents} accountLabel={`${rules.profile.id} · ${rules.mode === 'evaluation' ? 'Avaliação' : 'Conta PA'}`} />
        </>}
        {activeTab === 'months' && <div className="space-y-3"><SimulatorMonths rows={monthlyRows} granularity={granularity} /><SimulatorFilePicker files={files} selectedFileIds={selectedFileIds} onFilesChange={setFiles} onSelectionChange={setSelectedFileIds} onAnalysis={updateAnalysis} /></div>}
        {activeTab === 'settings' && <div className="space-y-3"><section className="rounded-xl border border-white/[0.07] bg-[#111315] p-4"><h2 className="text-sm font-semibold text-zinc-100">Dados e leitura dos arquivos</h2><p className="mt-1 text-[10px] leading-5 text-zinc-500">Escolha os CSVs no Dashboard. Aqui você confere o que o simulador conseguiu interpretar e ajusta o mapeamento das operações.</p><div className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2"><p className="rounded-lg border border-white/[0.06] p-3 text-zinc-400">Fonte ativa <strong className="mt-1 block text-zinc-200">{sourceDescription}</strong></p><p className="rounded-lg border border-white/[0.06] p-3 text-zinc-400">Operações lidas <strong className="mt-1 block text-zinc-200">{sourceTrades.length.toLocaleString('pt-BR')}</strong></p><p className="rounded-lg border border-white/[0.06] p-3 text-zinc-400">Arquivos selecionados <strong className="mt-1 block text-zinc-200">{selectedAnalyses.length}</strong></p><p className="rounded-lg border border-white/[0.06] p-3 text-zinc-400">Formato do cálculo <strong className="mt-1 block text-zinc-200">{granularity === 'monthly' ? 'Resumo mensal · sequência intramês indisponível' : granularity === 'trade' ? 'Operação por operação' : 'Aguardando CSV'}</strong></p></div></section>
          {tradeFiles.map(({ id, analysis }) => { const result = mapTradeCsv(analysis, mappings[id] ?? analysis.autoMapping, dateOrder, rules.timezone); return <TradeColumnMapper key={id} analysis={analysis} mapping={mappings[id] ?? analysis.autoMapping} onChange={(mapping) => setMappings((current) => ({ ...current, [id]: mapping }))} validRows={result.trades.length} warnings={[...analysis.warnings, ...result.warnings]} /> })}
          {granularity === 'monthly' && <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.03] p-3 text-[10px] leading-5 text-amber-100">CSV mensal informa resultado agregado. Regras por risco de entrada, Entry Market, trava diária e Tomahawk exigem operações individuais.</p>}</div>}
        {activeTab === 'scenarios' && <SavedScenarios scenarios={scenarios} files={files.map(({ id, fileName }) => ({ id, fileName }))} activeId={activeScenarioId} onOpen={(scenario) => void openScenario(scenario)} onDuplicate={duplicateScenario} onDelete={(scenario) => void deleteScenario(scenario)} />}
      </section>

      <aside aria-label="Configurações de gerenciamento" className="min-w-0 2xl:sticky 2xl:top-24 2xl:max-h-[calc(100vh-7rem)] 2xl:overflow-y-auto 2xl:pr-1">
        <SimulatorRulesEditor rules={rules} onChange={setRules} dateOrder={dateOrder} onDateOrderChange={setDateOrder} canUseTradeRules={canUseTradeRules} />
      </aside>
    </div>
  </PageFrame>
}
