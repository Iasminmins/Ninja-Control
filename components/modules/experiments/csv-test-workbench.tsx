'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { upload } from '@vercel/blob/client'
import { Activity, AlertTriangle, Download, FileSpreadsheet, FolderOpen, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, MetricTile, Panel, SectionHeading } from '@/components/workspace/primitives'
import { calculateRMetrics, parseExperimentCsv, type CsvAnalysis, type GridMonth, type HsgSignal, type PerformanceMetrics } from '@/lib/experiments/csv-analysis'

type Kind = 'hsg' | 'grid'
type AnalysisItem = { storageId: string; analysis: CsvAnalysis }
type SavedCsvFile = { id: string; fileName: string; byteSize: number; format: Kind | 'trades'; createdAt: string }
type CsvLibraryResponse = { files: SavedCsvFile[]; uploadPrefix: string }
const green = '#b9f227'
const red = '#fb7185'
const chartTooltip = { background: '#101214', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#f4f4f5', fontSize: 11 }
const dateLabel = (value: string) => /^\d{4}-\d{2}$/.test(value) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short', year: '2-digit' }).format(new Date(`${value}-01T12:00:00Z`)) : value
const number = (value: number | null, digits = 2) => value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const money = (value: number | null) => value === null ? '—' : `$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const selectClass = 'mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0b0d0f] px-3 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]'
const safePathName = (fileName: string) => fileName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 255)

async function fetchCsvLibrary(): Promise<CsvLibraryResponse> {
  const response = await fetch('/api/experiment-csv-files', { cache: 'no-store' })
  const result = await response.json().catch(() => ({})) as Partial<CsvLibraryResponse> & { error?: string }
  if (!response.ok || !Array.isArray(result.files) || typeof result.uploadPrefix !== 'string') {
    throw new Error(result.error ?? 'Não foi possível carregar os CSVs salvos.')
  }
  return { files: result.files, uploadPrefix: result.uploadPrefix }
}

function fileSizeLabel(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

function fileDateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function metricRows(signals: HsgSignal[]): PerformanceMetrics {
  return calculateRMetrics(signals)
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(href)
}

function HsgCharts({ baseline, selected }: { baseline: PerformanceMetrics; selected: PerformanceMetrics }) {
  const curve = useMemo(() => {
    const timestamps = [...new Set([...baseline.curve.map((point) => point.at), ...selected.curve.map((point) => point.at)])].sort()
    const points: { at: string; base: number; filtered: number }[] = []
    let baseIndex = 0
    let filteredIndex = 0
    let base = 0
    let filtered = 0
    for (const at of timestamps) {
      while (baseIndex < baseline.curve.length && baseline.curve[baseIndex].at <= at) { base = baseline.curve[baseIndex].cumulative; baseIndex += 1 }
      while (filteredIndex < selected.curve.length && selected.curve[filteredIndex].at <= at) { filtered = selected.curve[filteredIndex].cumulative; filteredIndex += 1 }
      points.push({ at, base, filtered })
    }
    return points
  }, [baseline.curve, selected.curve])
  const monthly = useMemo(() => {
    const keys = new Set([...baseline.monthly.map((item) => item.month), ...selected.monthly.map((item) => item.month)])
    return [...keys].sort().map((month) => ({
      month,
      baseline: baseline.monthly.find((item) => item.month === month)?.result ?? 0,
      filtered: selected.monthly.find((item) => item.month === month)?.result ?? 0,
    }))
  }, [baseline.monthly, selected.monthly])
  const drawdown = selected.curve.map((point) => ({ at: point.at, drawdown: point.drawdown }))
  return <div className="grid gap-4 xl:grid-cols-2">
    <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="mb-2 text-xs font-medium text-zinc-200">Resultado acumulado · R</p><div className="h-[270px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 270 }}><LineChart data={curve}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => dateLabel(String(value))} minTickGap={28} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={45} /><Tooltip labelFormatter={(value) => String(value)} formatter={(value, name) => [`${number(Number(value))}R`, name === 'base' ? 'Base READY' : 'Filtro aplicado']} contentStyle={chartTooltip} /><Legend formatter={(value) => value === 'base' ? 'Base READY' : 'Filtro aplicado'} /><ReferenceLine y={0} stroke="rgba(255,255,255,.25)" /><Line dataKey="base" type="monotone" stroke="#71717a" strokeWidth={1.5} dot={false} connectNulls name="base" /><Line dataKey="filtered" type="monotone" stroke={green} strokeWidth={2} dot={false} connectNulls name="filtered" /></LineChart></ResponsiveContainer></div></div>
    <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="mb-2 text-xs font-medium text-zinc-200">Drawdown do filtro · R</p><div className="h-[270px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 270 }}><AreaChart data={drawdown}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => dateLabel(String(value))} minTickGap={28} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={45} /><Tooltip labelFormatter={(value) => String(value)} formatter={(value) => [`${number(Number(value))}R`, 'Drawdown']} contentStyle={chartTooltip} /><ReferenceLine y={0} stroke="rgba(255,255,255,.25)" /><Area dataKey="drawdown" type="monotone" stroke={red} fill={red} fillOpacity={0.13} strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div></div>
    <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4 xl:col-span-2"><p className="mb-2 text-xs font-medium text-zinc-200">Resultado mensal · R</p><div className="h-[245px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 245 }}><BarChart data={monthly}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={dateLabel} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={45} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value, name) => [`${number(Number(value))}R`, name === 'baseline' ? 'Base READY' : 'Filtro aplicado']} contentStyle={chartTooltip} /><Legend formatter={(value) => value === 'baseline' ? 'Base READY' : 'Filtro aplicado'} /><ReferenceLine y={0} stroke="rgba(255,255,255,.25)" /><Bar dataKey="baseline" fill="#71717a" radius={[3, 3, 0, 0]} /><Bar dataKey="filtered" fill={green} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
  </div>
}

function HsgPanel({ signals }: { signals: HsgSignal[] }) {
  const [decisions, setDecisions] = useState<string[]>(['ALLOW'])
  const [qualities, setQualities] = useState<string[]>(['READY'])
  const [family, setFamily] = useState('all')
  const [direction, setDirection] = useState('all')
  const [mode, setMode] = useState('all')
  const [blockRule, setBlockRule] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const families = useMemo(() => [...new Set(signals.map((signal) => signal.family))].sort(), [signals])
  const decisionOptions = useMemo(() => [...new Set(signals.map((signal) => signal.decision))].sort(), [signals])
  const qualityOptions = useMemo(() => [...new Set(signals.map((signal) => signal.quality))].sort(), [signals])
  const modeOptions = useMemo(() => [...new Set(signals.map((signal) => signal.mode))].sort(), [signals])
  const ruleOptions = useMemo(() => [...new Set(signals.flatMap((signal) => [...signal.blockRules.split(/[+,]/).map((rule) => rule.trim()), ...signal.flags.map((rule) => rule.replace(/^HSG_/, ''))].filter(Boolean)))].sort(), [signals])
  const dates = signals.map((signal) => signal.date).filter(Boolean).sort()
  const comparable = useMemo(() => signals.filter((signal) => signal.quality === 'READY' && (!from || signal.date >= from) && (!to || signal.date <= to) && (family === 'all' || signal.family === family) && (direction === 'all' || signal.direction === direction) && (mode === 'all' || signal.mode === mode)), [signals, from, to, family, direction, mode])
  const candidatePool = useMemo(() => signals.filter((signal) => qualities.includes(signal.quality) && (!from || signal.date >= from) && (!to || signal.date <= to) && (family === 'all' || signal.family === family) && (direction === 'all' || signal.direction === direction) && (mode === 'all' || signal.mode === mode)), [signals, qualities, from, to, family, direction, mode])
  const filtered = useMemo(() => candidatePool.filter((signal) => decisions.includes(signal.decision) && (blockRule === 'all' || signal.blockRules.split(/[+,]/).map((rule) => rule.trim()).includes(blockRule) || signal.flags.some((rule) => rule.replace(/^HSG_/, '') === blockRule))), [candidatePool, decisions, blockRule])
  const baselineMetrics = useMemo(() => metricRows(comparable), [comparable])
  const selectedMetrics = useMemo(() => metricRows(filtered), [filtered])
  const duplicatedIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const signal of signals) counts.set(signal.id, (counts.get(signal.id) ?? 0) + 1)
    return [...counts.values()].filter((count) => count > 1).length
  }, [signals])
  const toggleDecision = (value: string) => setDecisions((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  const toggleQuality = (value: string) => setQualities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  function exportHsgAnalysis() {
    downloadJson('analise-filtro-hsg.json', {
      generatedAt: new Date().toISOString(),
      files: [...new Set(signals.map((signal) => signal.source))],
      filters: { from: from || dates[0] || null, to: to || dates.at(-1) || null, family, direction, mode, qualities, decisions, blockRule },
      baselineReady: baselineMetrics,
      filtered: selectedMetrics,
      warnings: ['Resultados retrospectivos dos sinais registrados; não representam garantia de operação real.'],
    })
  }

  return <div className="space-y-4">
    <Panel className="p-5 sm:p-6"><SectionHeading title="Teste de filtros HSG" description="A base compara todos os sinais READY; o filtro mostra as decisões selecionadas. Métricas calculadas a partir de Result_R dos arquivos." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="text-[10px] text-zinc-500">Data inicial<input type="date" className={selectClass} min={dates[0]} max={dates.at(-1)} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-[10px] text-zinc-500">Data final<input type="date" className={selectClass} min={dates[0]} max={dates.at(-1)} value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="text-[10px] text-zinc-500">Família<select className={selectClass} value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">Todas</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-[10px] text-zinc-500">Direção<select className={selectClass} value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">Todas</option><option value="BUY">BUY</option><option value="SELL">SELL</option></select></label><label className="text-[10px] text-zinc-500">Tipo de entrada<select className={selectClass} value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">Todos</option>{modeOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="mt-4"><p className="text-[10px] text-zinc-500">Qualidade dos dados incluída no filtro</p><div className="mt-2 flex flex-wrap gap-2">{qualityOptions.map((quality) => <label key={quality} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[10px] ${qualities.includes(quality) ? 'border-[#b9f227]/40 bg-[#b9f227]/[0.06] text-zinc-100' : 'border-white/[0.08] text-zinc-500'}`}><input type="checkbox" checked={qualities.includes(quality)} onChange={() => toggleQuality(quality)} className="accent-[#b9f227]" />{quality}<span className="text-zinc-600">{signals.filter((signal) => signal.quality === quality).length}</span></label>)}</div></div>
      <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-zinc-500">Decisões incluídas no filtro</p>{ruleOptions.length > 0 && <label className="text-[10px] text-zinc-500">Regra que bloqueou<select className="ml-2 h-9 rounded-lg border border-white/10 bg-[#0b0d0f] px-2 text-xs text-zinc-200" value={blockRule} onChange={(event) => setBlockRule(event.target.value)}><option value="all">Todas / sem filtro</option>{ruleOptions.map((item) => <option key={item}>{item}</option>)}</select></label>}</div><div className="mt-2 flex flex-wrap gap-2">{decisionOptions.map((decision) => <label key={decision} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[10px] ${decisions.includes(decision) ? 'border-[#b9f227]/40 bg-[#b9f227]/[0.06] text-zinc-100' : 'border-white/[0.08] text-zinc-500'}`}><input type="checkbox" checked={decisions.includes(decision)} onChange={() => toggleDecision(decision)} className="accent-[#b9f227]" />{decision}<span className="text-zinc-600">{candidatePool.filter((signal) => signal.decision === decision).length}</span></label>)}</div></div>
      {duplicatedIds > 0 && <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{duplicatedIds} SignalId aparecem em mais de uma linha. Eles são mantidos como sinais distintos; a data e o arquivo também identificam cada ocorrência.</p>}
    </Panel>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricTile label="Sinais no filtro" value={String(selectedMetrics.count)} icon={Activity} note={`${selectedMetrics.wins} ganhos · ${selectedMetrics.losses} perdas · ${selectedMetrics.flats} zerados`} /><MetricTile label="Resultado total" value={`${number(selectedMetrics.total)}R`} icon={Activity} tone={selectedMetrics.total < 0 ? 'negative' : 'positive'} note="Soma dos Result_R selecionados" /><MetricTile label="Profit factor" value={number(selectedMetrics.profitFactor)} icon={Activity} note="Ganhos em R ÷ perdas em R" /><MetricTile label="Drawdown máximo" value={`${number(selectedMetrics.maxDrawdown)}R`} icon={Activity} tone="negative" note="Calculado na ordem de saída dos sinais" /></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricTile label="Média por sinal" value={`${number(selectedMetrics.average)}R`} icon={Activity} note="Resultado total ÷ sinais com resultado" /><MetricTile label="Taxa de acerto" value={selectedMetrics.winRate === null ? '—' : `${number(selectedMetrics.winRate, 1)}%`} icon={Activity} note="Sinais positivos ÷ amostra" /><MetricTile label="Base READY" value={`${number(baselineMetrics.total)}R`} icon={Activity} note={`${baselineMetrics.count} sinais no mesmo período e filtros`} /><MetricTile label="Diferença vs. base" value={`${number(selectedMetrics.total - baselineMetrics.total)}R`} icon={Activity} tone={selectedMetrics.total < baselineMetrics.total ? 'negative' : 'positive'} note="Filtro aplicado menos Base READY" /></div>
    {selectedMetrics.count ? <HsgCharts baseline={baselineMetrics} selected={selectedMetrics} /> : <Panel className="p-5"><EmptyState title="Nenhum sinal para este filtro" description="Altere as datas, a família, a direção ou as decisões selecionadas." /></Panel>}
    <Panel className="p-5 sm:p-6"><SectionHeading title="Detalhamento mensal do filtro" description="Resultado em R e quantidade de sinais classificados em cada mês." action={<button type="button" onClick={exportHsgAnalysis} className="secondary-button min-h-9 px-3 text-[10px]"><Download className="size-3.5" />Exportar este teste</button>} />
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-y border-white/[0.06] text-[9px] uppercase tracking-wide text-zinc-600"><th className="px-3 py-2">Mês</th><th className="px-3 py-2 text-right">Sinais</th><th className="px-3 py-2 text-right">Resultado</th><th className="px-3 py-2 text-right">Base READY</th></tr></thead><tbody>{selectedMetrics.monthly.map((item) => <tr key={item.month} className="border-b border-white/[0.04] last:border-0"><td className="px-3 py-2 text-xs text-zinc-300">{dateLabel(item.month)}</td><td className="px-3 py-2 text-right text-xs text-zinc-400">{item.count}</td><td className={`px-3 py-2 text-right font-mono text-xs ${item.result < 0 ? 'text-rose-300' : 'text-[#b9f227]'}`}>{number(item.result)}R</td><td className="px-3 py-2 text-right font-mono text-xs text-zinc-500">{number(baselineMetrics.monthly.find((base) => base.month === item.month)?.result ?? 0)}R</td></tr>)}</tbody></table></div>
    </Panel>
    <p className="text-[10px] leading-5 text-zinc-600">Resultado retrospectivo dos sinais registrados nos CSVs. Linhas BLOCK_REAL mostram um resultado hipotético caso aquele sinal bloqueado tivesse sido executado. Não é garantia de execução real, lucro futuro ou aprovação do filtro. HSG é exibido em R; não convertemos R para dólares sem risco monetário por operação.</p>
  </div>
}

function GridCharts({ months }: { months: GridMonth[] }) {
  const rows = [...months].sort((a, b) => a.month.localeCompare(b.month))
  const drawdownRows = rows.map((month) => ({ ...month, drawdownMagnitude: month.maxDrawdown === null ? null : Math.abs(month.maxDrawdown) }))
  return <div className="grid gap-4 xl:grid-cols-2">
    <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="mb-2 text-xs font-medium text-zinc-200">Resultado mensal por direção</p><div className="h-[265px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 265 }}><BarChart data={rows}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={dateLabel} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => `$${Number(value).toLocaleString('pt-BR')}`} axisLine={false} tickLine={false} width={64} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value, name) => [money(Number(value)), name === 'longNet' ? 'Long' : name === 'shortNet' ? 'Short' : 'Total reportado']} contentStyle={chartTooltip} /><Legend formatter={(value) => value === 'longNet' ? 'Long' : value === 'shortNet' ? 'Short' : 'Total reportado'} /><ReferenceLine y={0} stroke="rgba(255,255,255,.25)" /><Bar dataKey="longNet" fill="#60a5fa" radius={[3, 3, 0, 0]} /><Bar dataKey="shortNet" fill={green} radius={[3, 3, 0, 0]} /><Line dataKey="net" stroke="#f4f4f5" strokeWidth={2} dot={false} /></BarChart></ResponsiveContainer></div></div>
    <div className="rounded-xl border border-white/[0.06] bg-black/10 p-4"><p className="mb-1 text-xs font-medium text-zinc-200">Perda máxima no mês (USD)</p><p className="mb-2 text-[10px] text-zinc-500">A barra sobe a partir de zero; quanto maior, maior o drawdown informado.</p><div className="h-[265px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: 265 }}><BarChart data={drawdownRows}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={dateLabel} axisLine={false} tickLine={false} /><YAxis domain={[0, 'auto']} tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => `$${Number(value).toLocaleString('pt-BR')}`} axisLine={false} tickLine={false} width={64} /><Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value) => [money(Number(value)), 'Perda máxima no mês']} contentStyle={chartTooltip} /><ReferenceLine y={0} stroke="rgba(255,255,255,.25)" /><Bar dataKey="drawdownMagnitude" fill={red} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
  </div>
}

function GridPanel({ months }: { months: GridMonth[] }) {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month))
  const totalNet = months.reduce((sum, month) => sum + (month.net ?? 0), 0)
  const totalTrades = months.reduce((sum, month) => sum + (month.trades ?? 0), 0)
  const totalGrossWin = months.reduce((sum, month) => sum + (month.grossProfit ?? 0), 0)
  const totalGrossLoss = Math.abs(months.reduce((sum, month) => sum + (month.grossLoss ?? 0), 0))
  const totalWins = months.reduce((sum, month) => sum + (month.wins ?? 0), 0)
  const totalLosses = months.reduce((sum, month) => sum + (month.losses ?? 0), 0)
  const countsComplete = months.every((month) => month.wins !== null && month.losses !== null)
  const payoffInputsComplete = countsComplete && months.every((month) => month.grossProfit !== null && month.grossLoss !== null)
  const winRate = countsComplete && totalWins + totalLosses > 0 ? (totalWins / (totalWins + totalLosses)) * 100 : null
  const averageWin = payoffInputsComplete && totalWins > 0 ? totalGrossWin / totalWins : null
  const averageLoss = payoffInputsComplete && totalLosses > 0 ? totalGrossLoss / totalLosses : null
  const payoff = averageWin !== null && averageLoss !== null && averageLoss > 0 ? averageWin / averageLoss : null
  const factor = totalGrossLoss ? totalGrossWin / totalGrossLoss : null
  const totalLong = months.reduce((sum, month) => sum + (month.longNet ?? 0), 0)
  const totalShort = months.reduce((sum, month) => sum + (month.shortNet ?? 0), 0)
  const worstMonthlyDrawdown = Math.min(...months.map((month) => month.maxDrawdown ?? 0))
  const repeatedMonths = [...new Set(months.map((month) => month.month))].filter((month) => months.filter((row) => row.month === month).length > 1)
  const commission = months.reduce((sum, month) => sum + (month.commission ?? 0), 0)
  const slippage = months.reduce((sum, month) => sum + (month.slippage ?? 0), 0)
  function exportGridAnalysis() {
    downloadJson('analise-ninjatrader-grid.json', {
      generatedAt: new Date().toISOString(),
      months: ordered,
      summary: { months: months.length, net: totalNet, longNet: totalLong, shortNet: totalShort, worstMonthlyDrawdown, trades: totalTrades, wins: countsComplete ? totalWins : null, losses: countsComplete ? totalLosses : null, winRatePercent: winRate, averageWin, averageLoss, payoff, profitFactor: factor, commission, slippage },
      warning: 'Drawdown disponível somente por mês conforme os relatórios; não há dados por operação para reconstruir a curva total.',
    })
  }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricTile label="Resultado dos meses" value={money(totalNet)} icon={Activity} tone={totalNet < 0 ? 'negative' : 'positive'} note="Soma dos lucros líquidos reportados" /><MetricTile label="Meses carregados" value={String(months.length)} icon={FileSpreadsheet} note="Cada arquivo representa um mês" /><MetricTile label="Negociações reportadas" value={number(totalTrades, 0)} icon={Activity} note="Somatório das contagens mensais" /><MetricTile label="Profit factor agregado" value={number(factor)} icon={Activity} note="Lucro bruto ÷ perda bruta somados" /><MetricTile label="Resultado Long" value={money(totalLong)} icon={Activity} tone={totalLong < 0 ? 'negative' : 'positive'} /><MetricTile label="Resultado Short" value={money(totalShort)} icon={Activity} tone={totalShort < 0 ? 'negative' : 'positive'} /><MetricTile label="Pior drawdown mensal" value={money(worstMonthlyDrawdown)} icon={Activity} tone="negative" note="Maior perda máxima informada em um mês" /><MetricTile label="Meses no prejuízo" value={String(months.filter((month) => (month.net ?? 0) < 0).length)} icon={Activity} note="Contagem dos resumos carregados" /></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricTile label="Comissão nos relatórios" value={money(commission)} icon={Activity} note="Confira se os custos foram realmente preenchidos" /><MetricTile label="Slippage nos relatórios" value={money(slippage)} icon={Activity} note="Zero pode indicar custo não configurado" /><MetricTile label="Payoff" value={number(payoff)} icon={Activity} note={averageWin !== null && averageLoss !== null ? `Ganho médio ${money(averageWin)} ÷ perda média ${money(averageLoss)}` : 'Média dos ganhos ÷ média das perdas'} /><MetricTile label="Taxa de acerto" value={winRate === null ? '—' : `${number(winRate, 1)}%`} icon={Activity} note={countsComplete ? `${number(totalWins, 0)} vitórias ÷ vitórias e derrotas; zeradas ficam fora` : 'Contagens de vitórias e derrotas indisponíveis'} /></div>
    {repeatedMonths.length > 0 && <p className="flex gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Há mais de um arquivo para {repeatedMonths.map(dateLabel).join(', ')}. Os arquivos foram mantidos e entram separadamente nos totais; remova uma versão se forem duplicados.</p>}
    <GridCharts months={ordered} />
    <Panel className="p-5 sm:p-6"><SectionHeading title="Meses importados" description="Valores mantidos como reportados pelo NinjaTrader; sem reconstruir a curva por operação." action={<button type="button" onClick={exportGridAnalysis} className="secondary-button min-h-9 px-3 text-[10px]"><Download className="size-3.5" />Exportar este teste</button>} />
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-y border-white/[0.06] text-[9px] uppercase tracking-wide text-zinc-600"><th className="px-3 py-2">Arquivo / mês</th><th className="px-3 py-2 text-right">Negociações</th><th className="px-3 py-2 text-right">Lucro reportado</th><th className="px-3 py-2 text-right">Drawdown do mês</th><th className="px-3 py-2 text-right">PF</th><th className="px-3 py-2 text-right">Custos</th></tr></thead><tbody>{ordered.map((month) => <tr key={`${month.source}-${month.month}`} className="border-b border-white/[0.04] last:border-0"><td className="px-3 py-2 text-xs text-zinc-300">{month.source}<span className="ml-2 text-zinc-600">{dateLabel(month.month)}</span></td><td className="px-3 py-2 text-right text-xs text-zinc-400">{number(month.trades, 0)}</td><td className={`px-3 py-2 text-right font-mono text-xs ${(month.net ?? 0) < 0 ? 'text-rose-300' : 'text-[#b9f227]'}`}>{money(month.net)}</td><td className="px-3 py-2 text-right font-mono text-xs text-rose-300">{money(month.maxDrawdown)}</td><td className="px-3 py-2 text-right font-mono text-xs text-zinc-400">{number(month.profitFactor)}</td><td className="px-3 py-2 text-right text-[10px] text-zinc-500">{money(month.commission)} · slip {money(month.slippage)}</td></tr>)}</tbody></table></div>
    </Panel>
    <p className="text-[10px] leading-5 text-zinc-600">Os CSVs Grid são resumos mensais. O gráfico usa o lucro mensal e o drawdown mensal já calculados no relatório; não representa drawdown acumulado entre meses. Comissão e slippage zerados não confirmam ausência de custos reais.</p>
  </div>
}

export function CsvTestWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<AnalysisItem[]>([])
  const [savedFiles, setSavedFiles] = useState<SavedCsvFile[]>([])
  const [uploadPrefix, setUploadPrefix] = useState('')
  const [loadingLibrary, setLoadingLibrary] = useState(true)
  const [storageError, setStorageError] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [activeKind, setActiveKind] = useState<Kind>('hsg')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const allSignals = useMemo(() => items.flatMap(({ analysis }) => analysis.kind === 'hsg' ? analysis.signals : []), [items])
  const allMonths = useMemo(() => items.flatMap(({ analysis }) => analysis.kind === 'grid' ? analysis.months : []), [items])
  const currentKind: Kind = activeKind === 'hsg' && allSignals.length ? 'hsg' : allMonths.length ? 'grid' : 'hsg'
  const warnings = items.flatMap(({ analysis }) => analysis.warnings.map((warning) => `${analysis.fileName}: ${warning}`))

  async function refreshLibrary() {
    const library = await fetchCsvLibrary()
    setSavedFiles(library.files)
    setUploadPrefix(library.uploadPrefix)
    setStorageError('')
    return library
  }

  useEffect(() => {
    let mounted = true
    void fetchCsvLibrary().then((library) => {
      if (!mounted) return
      setSavedFiles(library.files)
      setUploadPrefix(library.uploadPrefix)
      setStorageError('')
    }).catch((error) => {
      if (mounted) setStorageError(error instanceof Error ? error.message : 'Armazenamento indisponível.')
    }).finally(() => { if (mounted) setLoadingLibrary(false) })
    return () => { mounted = false }
  }, [])

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    if (!selected.length) return
    const totalBytes = selected.reduce((sum, file) => sum + file.size, 0)
    if (selected.length > 100 || totalBytes > 25 * 1024 * 1024) {
      setErrors(['Selecione até 100 arquivos CSV, com no máximo 25 MB no total.'])
      return
    }
    setBusy(true); setProgress('Lendo e validando arquivos…')
    const parsed: { file: File; analysis: CsvAnalysis }[] = []
    const nextErrors: string[] = []
    for (const file of selected) {
      if (!file.name.toLowerCase().endsWith('.csv') || file.size > 25 * 1024 * 1024) { nextErrors.push(`${file.name}: envie um arquivo CSV de até 25 MB.`); continue }
      try { parsed.push({ file, analysis: parseExperimentCsv(file.name, await file.text()) }) }
      catch (error) { nextErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'não foi possível ler este arquivo.'}`) }
    }
    if (!uploadPrefix && parsed.length) nextErrors.push('O armazenamento da conta ainda não está disponível. Atualize a página e tente novamente.')
    const added: AnalysisItem[] = []
    for (let index = 0; index < parsed.length && uploadPrefix; index += 1) {
      const { file, analysis } = parsed[index]
      const storageId = crypto.randomUUID()
      const path = `${uploadPrefix}${storageId}-${safePathName(file.name)}`
      setProgress(`Enviando ${index + 1} de ${parsed.length}: ${file.name}`)
      try {
        await upload(path, file, {
          access: 'private',
          contentType: 'text/csv',
          handleUploadUrl: '/api/experiment-csv-files/upload',
          clientPayload: JSON.stringify({ fileId: storageId, fileName: file.name }),
          multipart: file.size > 4.5 * 1024 * 1024,
        })

        let registered = false
        const deadline = Date.now() + 15_000
        while (Date.now() < deadline) {
          const library = await refreshLibrary()
          if (library.files.some((saved) => saved.id === storageId)) { registered = true; break }
          await new Promise((resolve) => window.setTimeout(resolve, 500))
        }
        if (!registered) throw new Error('O envio terminou, mas o arquivo ainda não foi confirmado no armazenamento. Atualize a lista antes de reenviar.')
        added.push({ storageId, analysis })
      } catch (error) {
        nextErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'não foi possível salvar este arquivo.'}`)
      }
    }
    if (added.length) {
      setItems((current) => [...current, ...added.filter((item) => !current.some((existing) => existing.storageId === item.storageId))])
      if (added.some((item) => item.analysis.kind === 'hsg')) setActiveKind('hsg')
      else if (added.some((item) => item.analysis.kind === 'grid')) setActiveKind('grid')
    }
    setErrors(nextErrors)
    setProgress('')
    setBusy(false)
  }

  function exportImportedData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      notice: 'Dados importados para análise retrospectiva; não são recomendação nem garantia de resultado.',
      hsgFiles: items.filter(({ analysis }) => analysis.kind === 'hsg').map(({ analysis }) => ({ fileName: analysis.fileName, signals: analysis.kind === 'hsg' ? analysis.signals.length : 0 })),
      gridFiles: items.flatMap(({ analysis }) => analysis.kind === 'grid' ? analysis.months : []),
      hsgSignals: allSignals,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = 'experimento-csv-resultados.json'
    anchor.click()
    URL.revokeObjectURL(href)
  }

  async function loadSavedFile(file: SavedCsvFile) {
    setBusy(true); setProgress(`Carregando ${file.fileName}…`)
    try {
      const response = await fetch(`/api/experiment-csv-files/${file.id}`, { cache: 'no-store' })
      if (!response.ok) {
        if (response.status === 404) setSavedFiles((current) => current.filter((saved) => saved.id !== file.id))
        throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? 'Não foi possível recuperar o arquivo.')
      }
      const analysis = parseExperimentCsv(file.fileName, await response.text())
      setItems((current) => current.some((item) => item.storageId === file.id) ? current : [...current, { storageId: file.id, analysis }])
      if (analysis.kind === 'hsg' || analysis.kind === 'grid') setActiveKind(analysis.kind)
      setErrors([])
    } catch (error) {
      setErrors([`${file.fileName}: ${error instanceof Error ? error.message : 'não foi possível ler este arquivo.'}`])
    } finally { setProgress(''); setBusy(false) }
  }

  async function deleteSavedFile(file: SavedCsvFile) {
    if (!window.confirm(`Excluir permanentemente ${file.fileName}? O arquivo será removido da sua conta.`)) return
    setBusy(true); setErrors([])
    try {
      const response = await fetch(`/api/experiment-csv-files/${file.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível excluir o arquivo.')
      setSavedFiles((current) => current.filter((item) => item.id !== file.id))
      setItems((current) => current.filter((item) => item.storageId !== file.id))
    } catch (error) { setErrors([`${file.fileName}: ${error instanceof Error ? error.message : 'não foi possível excluir o arquivo.'}`]) }
    finally { setBusy(false) }
  }

  async function deleteAllSavedFiles() {
    if (!window.confirm(`Excluir permanentemente os ${savedFiles.length} CSVs salvos nesta conta? Esta ação não pode ser desfeita.`)) return
    setBusy(true); setErrors([])
    try {
      const response = await fetch('/api/experiment-csv-files', { method: 'DELETE' })
      const result = await response.json().catch(() => ({})) as { deletedIds?: string[]; failedIds?: string[]; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível excluir os arquivos.')
      const deleted = new Set(result.deletedIds ?? [])
      setSavedFiles((current) => current.filter((file) => !deleted.has(file.id)))
      setItems((current) => current.filter((item) => !deleted.has(item.storageId)))
      if (result.failedIds?.length) setErrors([`${result.failedIds.length} arquivo(s) não foram excluídos. Eles continuam na lista para você tentar novamente.`])
    } catch (error) { setErrors([error instanceof Error ? error.message : 'Não foi possível excluir os arquivos.']) }
    finally { setBusy(false) }
  }

  const hsgCount = items.filter(({ analysis }) => analysis.kind === 'hsg').length
  const gridCount = items.filter(({ analysis }) => analysis.kind === 'grid').length
  const tradeFileCount = items.filter(({ analysis }) => analysis.kind === 'trades').length
  const savedInAnalysis = new Set(items.map((item) => item.storageId))
  return <Panel className="mb-5 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading title="Bancada de teste por arquivos" description="Carregue exports HSG e NinjaTrader Grid para analisar filtros e comparar resultados sem alterar os dados do workspace." />{items.length > 0 && <div className="flex gap-2"><button type="button" onClick={exportImportedData} className="secondary-button min-h-9 px-3 text-[10px]"><Download className="size-3.5" />Exportar análise</button><button type="button" onClick={() => { setItems([]); setErrors([]) }} className="secondary-button min-h-9 px-3 text-[10px]"><RotateCcw className="size-3.5" />Limpar análise</button></div>}</div>
    <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/10 p-5 sm:p-6"><div className="flex flex-col items-center text-center"><div className="flex size-10 items-center justify-center rounded-xl border border-[#b9f227]/20 bg-[#b9f227]/[0.06] text-[#b9f227]"><Upload className="size-5" /></div><p className="mt-3 text-sm font-medium text-zinc-200">Selecione os arquivos CSV</p><p className="mt-1 max-w-2xl text-[10px] leading-5 text-zinc-500">Aceita relatórios <span className="font-mono">Hunter_HSG_*.csv</span>, <span className="font-mono">NinjaTrader Grid *.csv</span> e CSV detalhado de trades com data/hora e P&amp;L. Os originais válidos ficam privados na sua conta e podem ser carregados novamente em outro navegador.</p><input ref={inputRef} type="file" accept=".csv,text/csv" multiple onChange={(event) => void importFiles(event)} className="sr-only" /><button type="button" disabled={busy || loadingLibrary || !uploadPrefix} onClick={() => inputRef.current?.click()} className="primary-button mt-4 min-h-10 px-4 text-xs disabled:opacity-50"><FileSpreadsheet className="size-4" />{busy ? 'Processando…' : 'Escolher CSVs'}</button><p className="mt-2 text-[9px] text-zinc-600">Até 100 arquivos e 25 MB por importação.</p>{progress && <p role="status" className="mt-2 text-[10px] text-[#b9f227]">{progress}</p>}</div></div>
    {(storageError || errors.length > 0 || warnings.length > 0) && <div className="mt-3 space-y-2">{storageError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100"><span>{storageError}</span><button type="button" disabled={busy} onClick={() => { setLoadingLibrary(true); void refreshLibrary().catch((error) => setStorageError(error instanceof Error ? error.message : 'Armazenamento indisponível.')).finally(() => setLoadingLibrary(false)) }} className="underline disabled:opacity-50">Tentar novamente</button></div>}{errors.map((error) => <p key={error} role="alert" className="flex gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-3 text-[10px] leading-5 text-rose-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{error}</p>)}{warnings.map((warning, index) => <p key={`${warning}-${index}`} className="flex gap-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-3 text-[10px] leading-5 text-amber-100"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{warning}</p>)}</div>}
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium text-zinc-200">Arquivos salvos na conta</p><p className="mt-1 text-[10px] text-zinc-500">{loadingLibrary ? 'Carregando arquivos…' : `${savedFiles.length} CSV${savedFiles.length === 1 ? '' : 's'} privado${savedFiles.length === 1 ? '' : 's'}`}</p></div>{savedFiles.length > 0 && <button type="button" disabled={busy} onClick={() => void deleteAllSavedFiles()} className="secondary-button min-h-9 px-3 text-[10px] text-rose-200 disabled:opacity-50"><Trash2 className="size-3.5" />Excluir tudo</button>}</div>
      {!loadingLibrary && savedFiles.length === 0 && !storageError && <p className="mt-3 rounded-lg border border-dashed border-white/10 p-4 text-center text-[10px] text-zinc-500">Nenhum arquivo salvo ainda. Os CSVs enviados aparecerão aqui.</p>}
      {savedFiles.length > 0 && <div className="mt-3 space-y-2">{savedFiles.map((file) => <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><div className="min-w-0"><p className="truncate text-xs text-zinc-200">{file.fileName}</p><p className="mt-1 text-[9px] text-zinc-500">{file.format === 'hsg' ? 'Hunter HSG' : file.format === 'grid' ? 'NinjaTrader Grid' : 'Trades individuais'} · {fileSizeLabel(file.byteSize)} · {fileDateLabel(file.createdAt)}</p></div><div className="flex shrink-0 gap-2"><button type="button" disabled={busy || savedInAnalysis.has(file.id)} onClick={() => void loadSavedFile(file)} className="secondary-button min-h-8 px-3 text-[10px] disabled:opacity-50"><FolderOpen className="size-3.5" />{savedInAnalysis.has(file.id) ? 'Na análise' : 'Carregar para análise'}</button><button type="button" disabled={busy} onClick={() => void deleteSavedFile(file)} className="secondary-button min-h-8 px-3 text-[10px] text-rose-200 disabled:opacity-50" aria-label={`Excluir permanentemente ${file.fileName}`}><Trash2 className="size-3.5" />Excluir</button></div></div>)}</div>}
    </div>
    {items.length > 0 && <><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-[10px] text-zinc-400">Na análise: <span className="text-zinc-100">{hsgCount} arquivos HSG · {allSignals.length} sinais</span><span className="mx-2 text-zinc-700">|</span><span className="text-zinc-100">{gridCount} arquivos Grid · {allMonths.length} meses</span>{tradeFileCount > 0 && <><span className="mx-2 text-zinc-700">|</span><span className="text-zinc-100">{tradeFileCount} arquivo(s) de trades</span></>}</p><div className="flex gap-1 rounded-lg border border-white/[0.08] p-1">{(['hsg', 'grid'] as const).map((kind) => { const disabled = kind === 'hsg' ? !allSignals.length : !allMonths.length; return <button key={kind} type="button" disabled={disabled} onClick={() => setActiveKind(kind)} className={`rounded-md px-3 py-2 text-[10px] ${currentKind === kind ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-500'} disabled:cursor-not-allowed disabled:opacity-30`}>{kind === 'hsg' ? 'Hunter HSG' : 'NinjaTrader Grid'}</button> })}</div></div>
      <div className="mt-3 flex flex-wrap gap-2">{items.map(({ storageId, analysis }) => <span key={storageId} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/10 px-3 py-2 text-[9px] text-zinc-400"><span className="text-zinc-200">{analysis.fileName}</span><span>{analysis.kind === 'hsg' ? `${analysis.signals.length} sinais` : analysis.kind === 'grid' ? `${analysis.months.length} mês` : `${analysis.rows.length} trades`}</span><button type="button" onClick={() => setItems((current) => current.filter((candidate) => candidate.storageId !== storageId))} className="ml-1 rounded px-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200" aria-label={`Retirar ${analysis.fileName} da análise`} title="Retirar da análise">×</button></span>)}</div>
      {tradeFileCount > 0 && <p className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.03] p-3 text-[10px] leading-5 text-zinc-400">Os trades individuais ficam salvos na biblioteca. Use a aba Simulador de gerenciamento para mapear colunas, aplicar regras e calcular curvas por operação.</p>}
      <div className="mt-4">{currentKind === 'hsg' ? allSignals.length ? <HsgPanel signals={allSignals} /> : <EmptyState title="Nenhum CSV HSG carregado" description="Selecione os arquivos Hunter_HSG para testar decisões por sinal." /> : allMonths.length ? <GridPanel months={allMonths} /> : <EmptyState title="Nenhum resumo Grid carregado" description="Selecione os arquivos NinjaTrader Grid para comparar os meses." />}</div>
    </>}
  </Panel>
}
