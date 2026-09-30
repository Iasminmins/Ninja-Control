export type HsgSignal = {
  id: string
  source: string
  date: string
  entryTime: string
  exitTime: string
  family: string
  mode: string
  direction: string
  quality: string
  decision: string
  blockRules: string
  flags: string[]
  exitReason: string
  resultR: number | null
  maeR: number | null
  mfeR: number | null
}

export type GridMonth = {
  source: string
  month: string
  net: number | null
  longNet: number | null
  shortNet: number | null
  grossProfit: number | null
  grossLoss: number | null
  commission: number | null
  slippage: number | null
  profitFactor: number | null
  maxDrawdown: number | null
  trades: number | null
  wins: number | null
  losses: number | null
  flats: number | null
}

import { parseTradeCsv, type TradeCsvAnalysis } from '@/lib/account-simulator/trade-csv'
import { parseDelimited } from './csv-utils'

export type CsvAnalysis =
  | { kind: 'hsg'; fileName: string; signals: HsgSignal[]; warnings: string[] }
  | { kind: 'grid'; fileName: string; months: GridMonth[]; warnings: string[] }
  | TradeCsvAnalysis

export type PerformanceMetrics = {
  count: number
  wins: number
  losses: number
  flats: number
  total: number
  average: number | null
  winRate: number | null
  profitFactor: number | null
  maxDrawdown: number
  curve: { at: string; cumulative: number; drawdown: number; result: number }[]
  monthly: { month: string; result: number; count: number }[]
}

function numberValue(value: string | undefined): number | null {
  if (!value?.trim()) return null
  let normalized = value.trim().replace(/[\s$]/g, '').replace(/R\$/gi, '')
  if (/^\(.*\)$/.test(normalized)) normalized = `-${normalized.slice(1, -1)}`
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.')
  normalized = normalized.replace(/[^0-9.+-]/g, '')
  if (!normalized || normalized === '-' || normalized === '+') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function getCell(row: string[], header: Map<string, number>, name: string) {
  const index = header.get(name)
  return index === undefined ? '' : (row[index] ?? '').trim()
}

function parseHsg(fileName: string, rows: string[][]): CsvAnalysis {
  const header = new Map(rows[0].map((value, index) => [value.trim(), index]))
  const required = ['SignalId', 'Data', 'Hora', 'EntryFamily', 'Direcao', 'DataQuality', 'HSG_Decision', 'Result_R']
  const missing = required.filter((key) => !header.has(key))
  if (missing.length) throw new Error(`CSV HSG sem colunas obrigatórias: ${missing.join(', ')}`)
  const signals: HsgSignal[] = []
  for (const row of rows.slice(1)) {
    const date = getCell(row, header, 'Data')
    const id = getCell(row, header, 'SignalId')
    if (!id || !date) continue
    signals.push({
      id,
      source: fileName,
      date,
      entryTime: getCell(row, header, 'Hora'),
      exitTime: getCell(row, header, 'ExitTime'),
      family: getCell(row, header, 'EntryFamily') || 'Não informada',
      mode: getCell(row, header, 'EntryMode') || 'Não informado',
      direction: getCell(row, header, 'Direcao') || 'Não informada',
      quality: getCell(row, header, 'DataQuality') || 'DATA_NOT_READY',
      decision: getCell(row, header, 'HSG_Decision') || 'DATA_NOT_READY',
      blockRules: getCell(row, header, 'HSG_BlockRules'),
      flags: [...header.keys()].filter((key) => key.startsWith('HSG_') && !['HSG_BlockRules', 'HSG_Decision', 'HSG_WouldBlock', 'HSG_RealBlocked'].includes(key) && ['1', 'TRUE', 'true'].includes(getCell(row, header, key))),
      exitReason: getCell(row, header, 'ExitReason'),
      resultR: numberValue(getCell(row, header, 'Result_R')),
      maeR: numberValue(getCell(row, header, 'MAE_R')),
      mfeR: numberValue(getCell(row, header, 'MFE_R')),
    })
  }
  const warnings: string[] = []
  if (!signals.length) warnings.push('O arquivo foi reconhecido como HSG, mas não contém sinais com ID e data.')
  if (signals.some((signal) => signal.resultR === null)) warnings.push('Há sinais sem Result_R numérico; eles aparecem na contagem, mas ficam fora dos cálculos de desempenho.')
  return { kind: 'hsg', fileName, signals, warnings }
}

function parseGrid(fileName: string, rows: string[][]): CsvAnalysis {
  const header = rows[0].map((value) => value.trim())
  if (header[0] !== 'Desempenho' || !header.includes('Todas as negociações')) throw new Error('O CSV não corresponde ao resumo mensal NinjaTrader Grid.')
  const allIndex = header.indexOf('Todas as negociações')
  const metrics = new Map<string, string>()
  for (const row of rows.slice(1)) if (row[0]?.trim()) metrics.set(row[0].trim(), row[allIndex] ?? '')
  const dateStart = metrics.get('Data de Start') ?? ''
  const dateMatch = dateStart.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const nameMatch = fileName.match(/(\d{2})-(\d{2})/)
  const month = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}` : nameMatch ? `${nameMatch[2].length === 2 ? `20${nameMatch[2]}` : nameMatch[2]}-${nameMatch[1]}` : 'Período não informado'
  const monthRow: GridMonth = {
    source: fileName,
    month,
    net: numberValue(metrics.get('Lucro líquido total')),
    longNet: numberValue(rows.find((row) => row[0]?.trim() === 'Lucro líquido total')?.[header.indexOf('Negociações Long')]),
    shortNet: numberValue(rows.find((row) => row[0]?.trim() === 'Lucro líquido total')?.[header.indexOf('Negociações Short')]),
    grossProfit: numberValue(metrics.get('Lucro bruto')),
    grossLoss: numberValue(metrics.get('Perda bruta')),
    commission: numberValue(metrics.get('Corretagem')),
    slippage: numberValue(metrics.get('Deslizamento total')),
    profitFactor: numberValue(metrics.get('Fator de lucro')),
    maxDrawdown: numberValue(metrics.get('Max abaixamento')),
    trades: numberValue(metrics.get('# total de negociações')),
    wins: numberValue(metrics.get('# de negociações altas')),
    losses: numberValue(metrics.get('# de negociações baixas')),
    flats: numberValue(metrics.get('# de negociações niveladas')),
  }
  const warnings: string[] = []
  if (monthRow.net === null) warnings.push('Não encontrei "Lucro líquido total" no arquivo.')
  if (monthRow.commission === 0 || monthRow.slippage === 0) warnings.push('O relatório informa comissão ou slippage zerado; o resultado não confirma esses custos.')
  if (monthRow.maxDrawdown !== null) warnings.push('O drawdown disponível é o valor reportado para este mês; o resumo não permite reconstruir o drawdown total por operação.')
  return { kind: 'grid', fileName, months: [monthRow], warnings }
}

export function parseExperimentCsv(fileName: string, text: string): CsvAnalysis {
  const rows = parseDelimited(text)
  if (!rows.length) throw new Error('O CSV está vazio.')
  const header = rows[0].map((value) => value.trim())
  if (header.includes('SignalId') && header.includes('HSG_Decision')) return parseHsg(fileName, rows)
  if (header[0] === 'Desempenho') return parseGrid(fileName, rows)
  return parseTradeCsv(fileName, text)
}

export function calculateRMetrics(signals: HsgSignal[]): PerformanceMetrics {
  const sorted = signals.filter((signal) => signal.resultR !== null).sort((a, b) => {
    const left = `${a.exitTime || a.date} ${a.exitTime ? '' : a.entryTime}`
    const right = `${b.exitTime || b.date} ${b.exitTime ? '' : b.entryTime}`
    return left.localeCompare(right) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id)
  })
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0
  const curve = sorted.map((signal) => {
    const result = signal.resultR ?? 0
    cumulative += result
    peak = Math.max(peak, cumulative)
    const drawdown = cumulative - peak
    maxDrawdown = Math.min(maxDrawdown, drawdown)
    return { at: `${signal.exitTime || signal.date} ${signal.exitTime ? '' : signal.entryTime}`.trim(), cumulative, drawdown, result }
  })
  const wins = sorted.filter((signal) => (signal.resultR ?? 0) > 0).length
  const losses = sorted.filter((signal) => (signal.resultR ?? 0) < 0).length
  const total = sorted.reduce((sum, signal) => sum + (signal.resultR ?? 0), 0)
  const gain = sorted.reduce((sum, signal) => sum + Math.max(signal.resultR ?? 0, 0), 0)
  const loss = Math.abs(sorted.reduce((sum, signal) => sum + Math.min(signal.resultR ?? 0, 0), 0))
  const monthlyMap = new Map<string, { result: number; count: number }>()
  for (const signal of sorted) {
    const month = (signal.exitTime || signal.date).slice(0, 7)
    const current = monthlyMap.get(month) ?? { result: 0, count: 0 }
    current.result += signal.resultR ?? 0
    current.count += 1
    monthlyMap.set(month, current)
  }
  return {
    count: sorted.length,
    wins,
    losses,
    flats: sorted.length - wins - losses,
    total,
    average: sorted.length ? total / sorted.length : null,
    winRate: sorted.length ? wins / sorted.length * 100 : null,
    profitFactor: loss ? gain / loss : null,
    maxDrawdown,
    curve,
    monthly: [...monthlyMap].sort(([a], [b]) => a.localeCompare(b)).map(([month, result]) => ({ month, ...result })),
  }
}
