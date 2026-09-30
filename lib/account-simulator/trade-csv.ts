import { parseDelimited } from '@/lib/experiments/csv-utils'
import type { AccountProfileId, RiskCategory, SimulatorTrade } from './types'

export type TradeColumnMapping = {
  timestamp?: string
  date?: string
  time?: string
  pnl: string
  commission?: string
  slippage?: string
  pnlIncludesCosts: boolean
  direction?: string
  riskCategory?: string
  entryMarket?: string
  originalRisk?: string
  exitReason?: string
}

export type TradeCsvAnalysis = {
  kind: 'trades'
  fileName: string
  headers: string[]
  rows: Record<string, string>[]
  autoMapping: TradeColumnMapping
  warnings: string[]
}

export type TradeDateOrder = 'auto' | 'dmy' | 'mdy'

const headerAliases: Record<keyof Omit<TradeColumnMapping, 'pnlIncludesCosts'>, string[]> = {
  timestamp: ['timestamp', 'exit time', 'exittime', 'closed time', 'close time', 'data hora saida', 'data hora fechamento', 'date time'],
  date: ['date', 'data', 'exit date', 'closed date', 'close date', 'data saida', 'data fechamento'],
  time: ['time', 'hora', 'exit clock', 'hora saida', 'hora fechamento'],
  pnl: ['net profit', 'profit loss', 'profitloss', 'pnl', 'profit', 'lucro liquido', 'resultado liquido', 'resultado', 'lucro'],
  commission: ['commission', 'commissions', 'comissao', 'corretagem'],
  slippage: ['slippage', 'deslizamento'],
  direction: ['direction', 'side', 'market position', 'market pos', 'direcao', 'lado'],
  riskCategory: ['entry family', 'entry category', 'risk category', 'entryfamily', 'categoria entrada'],
  entryMarket: ['entry market', 'entrymarket', 'market entry', 'entrada mercado'],
  originalRisk: ['original risk', 'risk amount', 'risk dollars', 'risk usd', 'risco original', 'risco usd'],
  exitReason: ['exit reason', 'exitname', 'exit name', 'motivo saida', 'saida'],
}

function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findHeader(headers: string[], field: keyof typeof headerAliases) {
  const aliases = new Set(headerAliases[field].map(normalizeHeader))
  return headers.find((header) => aliases.has(normalizeHeader(header)))
}

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) return null
  let text = value.trim().replace(/[\s$]/g, '').replace(/R\$/gi, '').replace(/^\((.*)\)$/, '-$1')
  const comma = text.lastIndexOf(',')
  const dot = text.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  else if (comma >= 0) text = text.replace(/\./g, '').replace(',', '.')
  text = text.replace(/[^0-9.+-]/g, '')
  const parsed = Number(text)
  return text && Number.isFinite(parsed) ? parsed : null
}

export function parseTradeCsv(fileName: string, text: string): TradeCsvAnalysis {
  const rawRows = parseDelimited(text)
  if (rawRows.length < 2) throw new Error('O CSV de trades precisa conter cabeçalho e pelo menos uma linha.')
  const headers = rawRows[0].map((value, index) => value.trim() || `Coluna ${index + 1}`)
  const date = findHeader(headers, 'date')
  const timestamp = findHeader(headers, 'timestamp')
  const time = findHeader(headers, 'time')
  const pnl = findHeader(headers, 'pnl')
  if ((!timestamp && !date) || !pnl) throw new Error('CSV não reconhecido. São necessárias colunas identificáveis de data/saída e P&L para salvar um relatório de trades.')
  if (rawRows.length - 1 > 250_000) throw new Error('O CSV excede o limite de 250.000 linhas para análise por trade.')
  const rows = rawRows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ''])))
  const autoMapping: TradeColumnMapping = {
    ...(timestamp ? { timestamp } : {}),
    ...(date ? { date } : {}),
    ...(time ? { time } : {}),
    pnl,
    ...(findHeader(headers, 'commission') ? { commission: findHeader(headers, 'commission') } : {}),
    ...(findHeader(headers, 'slippage') ? { slippage: findHeader(headers, 'slippage') } : {}),
    pnlIncludesCosts: true,
    ...(findHeader(headers, 'direction') ? { direction: findHeader(headers, 'direction') } : {}),
    ...(findHeader(headers, 'riskCategory') ? { riskCategory: findHeader(headers, 'riskCategory') } : {}),
    ...(findHeader(headers, 'entryMarket') ? { entryMarket: findHeader(headers, 'entryMarket') } : {}),
    ...(findHeader(headers, 'originalRisk') ? { originalRisk: findHeader(headers, 'originalRisk') } : {}),
    ...(findHeader(headers, 'exitReason') ? { exitReason: findHeader(headers, 'exitReason') } : {}),
  }
  const warnings: string[] = []
  if (!autoMapping.direction) warnings.push('Direção não detectada; o filtro Entry Market por compra/venda ficará indisponível até mapear uma coluna.')
  if (!autoMapping.riskCategory) warnings.push('Categoria de risco não detectada; o risco por Direta/Absorção/Convencional ficará indisponível até mapear uma coluna.')
  if (!autoMapping.commission) warnings.push('O CSV não informa comissão; confira se o P&L selecionado já é líquido de custos.')
  return { kind: 'trades', fileName, headers, rows, autoMapping, warnings }
}

function parseDateParts(value: string, order: TradeDateOrder) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
  const parts = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (!parts) return null
  const first = Number(parts[1]); const second = Number(parts[2]); let year = Number(parts[3])
  if (year < 100) year += year < 70 ? 2000 : 1900
  const monthFirst = order === 'mdy' || (order === 'auto' && first <= 12 && second > 12)
  return monthFirst ? { year, month: first, day: second } : { year, month: second, day: first }
}

function timezoneOffsetMinutes(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]))
  const renderedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
  return (renderedAsUtc - instant) / 60_000
}

export function parseTradeTimestamp(value: string, dateOrder: TradeDateOrder, timezone: string): string | null {
  const native = new Date(value)
  if (/^\d{4}-\d\d-\d\d[ T].*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(native.getTime())) return native.toISOString()
  const combined = value.trim().match(/^([^ T]+)(?:[ T]+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?))?$/i)
  if (!combined) return null
  const dateText = combined[1]
  const timeText = combined[2] ?? '00:00:00'
  const date = parseDateParts(dateText, dateOrder)
  if (!date || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null
  const checkDate = new Date(Date.UTC(date.year, date.month - 1, date.day))
  if (checkDate.getUTCFullYear() !== date.year || checkDate.getUTCMonth() !== date.month - 1 || checkDate.getUTCDate() !== date.day) return null
  const clock = timeText.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!clock) return null
  let hour = clock ? Number(clock[1]) : 0
  const minute = clock ? Number(clock[2]) : 0
  const second = clock ? Number(clock[3] ?? 0) : 0
  if (clock?.[4]) { if (hour < 1 || hour > 12) return null; hour = hour % 12 + (/PM/i.test(clock[4]) ? 12 : 0) }
  if (hour > 23 || minute > 59 || second > 59) return null
  const localAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, second)
  try {
    let utc = localAsUtc - timezoneOffsetMinutes(localAsUtc, timezone) * 60_000
    utc = localAsUtc - timezoneOffsetMinutes(utc, timezone) * 60_000
    return new Date(utc).toISOString()
  } catch {
    return null
  }
}

function mapCategory(value: string): RiskCategory | null {
  const normalized = normalizeHeader(value)
  if (['direta', 'direct'].includes(normalized)) return 'DIRECT'
  if (['absorcao', 'absorption'].includes(normalized)) return 'ABSORPTION'
  if (['convencional', 'conventional'].includes(normalized)) return 'CONVENTIONAL'
  return null
}

function mapDirection(value: string): 'BUY' | 'SELL' | null {
  const normalized = normalizeHeader(value)
  if (/\b(buy|long|compra|comprado)\b/.test(normalized)) return 'BUY'
  if (/\b(sell|short|venda|vendido)\b/.test(normalized)) return 'SELL'
  return null
}

function mapEntryMarket(value: string): boolean | null {
  const normalized = normalizeHeader(value)
  if (['1', 'yes', 'sim', 'true', 'market', 'entry market'].includes(normalized)) return true
  if (['0', 'no', 'nao', 'false', 'limit', 'non market', 'nao market'].includes(normalized)) return false
  return null
}

export function mapTradeCsv(analysis: TradeCsvAnalysis, mapping: TradeColumnMapping, dateOrder: TradeDateOrder, timezone: string): { trades: SimulatorTrade[]; warnings: string[] } {
  const warnings: string[] = []
  const headers = new Set(analysis.headers)
  const selectedColumns = [mapping.timestamp, mapping.date, mapping.time, mapping.pnl, mapping.commission, mapping.slippage, mapping.direction, mapping.riskCategory, mapping.entryMarket, mapping.originalRisk, mapping.exitReason].filter(Boolean)
  if (selectedColumns.some((column) => !headers.has(column!))) throw new Error('Uma coluna selecionada não pertence mais ao cabeçalho deste arquivo.')
  if (!mapping.pnl || (!mapping.timestamp && !mapping.date)) throw new Error('Selecione as colunas de P&L e data/hora para continuar.')
  let invalidRows = 0
  const trades = analysis.rows.flatMap((row, index) => {
    const timeText = mapping.timestamp ? row[mapping.timestamp] : `${row[mapping.date!] ?? ''} ${mapping.time ? row[mapping.time] : ''}`.trim()
    const timestamp = parseTradeTimestamp(timeText, dateOrder, timezone)
    const pnl = parseNumber(row[mapping.pnl])
    if (!timestamp || pnl === null) { invalidRows += 1; return [] }
    const commission = mapping.commission ? parseNumber(row[mapping.commission]) ?? 0 : 0
    const slippage = mapping.slippage ? parseNumber(row[mapping.slippage]) ?? 0 : 0
    const rawPnlCents = Math.round(pnl * 100)
    const pnlCents = mapping.pnlIncludesCosts ? rawPnlCents : rawPnlCents - Math.round((Math.abs(commission) + Math.abs(slippage)) * 100)
    const direction = mapping.direction ? mapDirection(row[mapping.direction] ?? '') : null
    const category = mapping.riskCategory ? mapCategory(row[mapping.riskCategory] ?? '') : null
    const entryMarket = mapping.entryMarket ? mapEntryMarket(row[mapping.entryMarket] ?? '') : null
    const riskValue = mapping.originalRisk ? parseNumber(row[mapping.originalRisk]) : null
    return [{
      id: `${analysis.fileName}:${index + 2}`,
      source: analysis.fileName,
      rowNumber: index + 2,
      timestamp,
      pnlCents,
      direction,
      riskCategory: category,
      entryMarket,
      originalRiskCents: riskValue === null ? null : Math.round(Math.abs(riskValue) * 100),
      exitReason: mapping.exitReason ? row[mapping.exitReason] || null : null,
    }]
  })
  if (invalidRows) warnings.push(`${invalidRows} linha(s) sem data ou P&L válido foram ignoradas.`)
  if (mapping.entryMarket && trades.some((trade) => trade.entryMarket === false) && trades.some((trade) => trade.entryMarket === null)) warnings.push('Os valores de Entry Market têm mais de um formato; confirme a coluna mapeada.')
  return { trades, warnings }
}

export const accountProfileChoices: AccountProfileId[] = ['50K', '150K']
