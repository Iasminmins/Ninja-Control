import { and, avg, count, eq, sql } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { patternOccurrences, patterns, riskRules, tradeContexts, trades } from '@/lib/db/schema'

export type PatternThresholds = { lowSample: number; validSample: number }
export const defaultPatternThresholds: PatternThresholds = { lowSample: 30, validSample: 100 }

export function parsePatternThresholds(value: unknown): PatternThresholds | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const lowSample = Number(input.lowSample)
  const validSample = Number(input.validSample)
  if (!Number.isInteger(lowSample) || !Number.isInteger(validSample) || lowSample < 2 || validSample <= lowSample || validSample > 100_000) return null
  return { lowSample, validSample }
}

export async function getPatternLabData() {
  const access = await requireWorkspace()
  if (!access) return null
  const [rows, setting] = await Promise.all([
    access.db.select({
      id: patterns.id,
      name: patterns.name,
      sampleSize: sql<number>`count(${trades.id})::int`,
      wins: sql<number>`count(${trades.id}) filter (where ${trades.netPnlCents} > 0)::int`,
      losses: sql<number>`count(${trades.id}) filter (where ${trades.netPnlCents} < 0)::int`,
      netCents: sql<number>`coalesce(sum(${trades.netPnlCents}), 0)::float8`,
      grossWinsCents: sql<number>`coalesce(sum(${trades.netPnlCents}) filter (where ${trades.netPnlCents} > 0), 0)::float8`,
      grossLossesCents: sql<number>`coalesce(sum(abs(${trades.netPnlCents})) filter (where ${trades.netPnlCents} < 0), 0)::float8`,
      averageMaeCents: avg(tradeContexts.maeCents),
      averageMfeCents: avg(tradeContexts.mfeCents),
    }).from(patterns)
      .leftJoin(patternOccurrences, eq(patternOccurrences.patternId, patterns.id))
      .leftJoin(trades, and(eq(patternOccurrences.tradeId, trades.id), eq(trades.workspaceId, access.workspace.id)))
      .leftJoin(tradeContexts, and(eq(tradeContexts.tradeId, trades.id), eq(tradeContexts.workspaceId, access.workspace.id)))
      .where(eq(patterns.workspaceId, access.workspace.id))
      .groupBy(patterns.id, patterns.name),
    access.db.select().from(riskRules).where(and(eq(riskRules.workspaceId, access.workspace.id), eq(riskRules.name, 'Pattern Lab sample thresholds'))).limit(1),
  ])
  const thresholds = parsePatternThresholds(setting[0]?.parameters) ?? defaultPatternThresholds
  const data = rows.map((row) => {
    const sampleSize = Number(row.sampleSize)
    const wins = Number(row.wins)
    const losses = Number(row.losses)
    const grossWins = Number(row.grossWinsCents)
    const grossLosses = Number(row.grossLossesCents)
    return {
      id: row.id,
      name: row.name,
      sampleSize,
      wins,
      losses,
      winRate: sampleSize ? wins / sampleSize * 100 : null,
      profitFactor: grossLosses ? grossWins / grossLosses : null,
      expectancyCents: sampleSize ? Number(row.netCents) / sampleSize : null,
      netCents: Number(row.netCents),
      averageMaeCents: row.averageMaeCents === null ? null : Number(row.averageMaeCents),
      averageMfeCents: row.averageMfeCents === null ? null : Number(row.averageMfeCents),
      sampleQuality: sampleSize < thresholds.lowSample ? 'LOW SAMPLE' : sampleSize < thresholds.validSample ? 'DEVELOPING' : 'VALID SAMPLE',
    }
  }).sort((a, b) => b.sampleSize - a.sampleSize)
  return { patterns: data, thresholds, configured: Boolean(setting[0]) }
}

export type PatternLabData = NonNullable<Awaited<ReturnType<typeof getPatternLabData>>>
