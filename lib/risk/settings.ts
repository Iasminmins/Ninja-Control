export type RiskThresholds = {
  normalMinBuffer: number
  reducedMinBuffer: number
  defensiveMinBuffer: number
  mode: 'simulation'
}

export const defaultRiskThresholds: RiskThresholds = {
  normalMinBuffer: 70,
  reducedMinBuffer: 40,
  defensiveMinBuffer: 20,
  mode: 'simulation',
}

export function parseRiskThresholds(input: unknown): RiskThresholds | null {
  if (!input || typeof input !== 'object') return null
  const data = input as Record<string, unknown>
  const normalMinBuffer = Number(data.normalMinBuffer)
  const reducedMinBuffer = Number(data.reducedMinBuffer)
  const defensiveMinBuffer = Number(data.defensiveMinBuffer)
  if (![normalMinBuffer, reducedMinBuffer, defensiveMinBuffer].every((value) => Number.isInteger(value) && value >= 0 && value <= 100)) return null
  if (!(normalMinBuffer > reducedMinBuffer && reducedMinBuffer > defensiveMinBuffer)) return null
  return { normalMinBuffer, reducedMinBuffer, defensiveMinBuffer, mode: 'simulation' }
}

export function simulateRiskTier(buffer: number, thresholds: RiskThresholds) {
  if (buffer < 0) return { key: 'breached', label: 'BREACHED', description: 'O valor informado ultrapassou o limite disponível.' }
  if (buffer < thresholds.defensiveMinBuffer) return { key: 'locked', label: 'LOCKED', description: 'Simulação: novas operações seriam bloqueadas.' }
  if (buffer < thresholds.reducedMinBuffer) return { key: 'defensive', label: 'DEFENSIVE', description: 'Simulação: somente padrões permitidos.' }
  if (buffer < thresholds.normalMinBuffer) return { key: 'reduced', label: 'REDUCED', description: 'Simulação: reduzir contratos.' }
  return { key: 'normal', label: 'NORMAL', description: 'Simulação: operação normal.' }
}
