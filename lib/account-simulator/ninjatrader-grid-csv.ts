import { parseDelimited } from '@/lib/experiments/csv-utils'
import { parseTradeCsv } from './trade-csv'

function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Accepts the detailed NinjaTrader Grid trades export supplied for the simulator. */
export function parseNinjaTraderGridTradesCsv(fileName: string, text: string) {
  const headers = new Set((parseDelimited(text)[0] ?? []).map(normalizeHeader))
  const required = ['num neg', 'ativo', 'pos mercado', 'hora entrada', 'hora saida', 'entrada', 'saida', 'profit', 'corretagem']
  if (!required.every((header) => headers.has(header))) {
    throw new Error('Formato não reconhecido. Envie o CSV de trades do NinjaTrader Grid, com as colunas Núm. Neg., Pos mercado., Hora saída e Profit.')
  }
  const analysis = parseTradeCsv(fileName, text)
  return { ...analysis, autoMapping: { ...analysis.autoMapping, pnlIncludesCosts: false } }
}
