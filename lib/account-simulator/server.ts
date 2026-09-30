import 'server-only'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountSimulatorScenarios, experimentCsvFiles } from '@/lib/db/schema'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ScenarioInput = {
  name: string
  sourceFileIds: string[]
  configuration: Record<string, unknown>
}

export async function getAccountSimulatorData() {
  const access = await requireWorkspace()
  if (!access) return null
  const [scenarios, files] = await Promise.all([
    access.db.select().from(accountSimulatorScenarios).where(eq(accountSimulatorScenarios.workspaceId, access.workspace.id)).orderBy(desc(accountSimulatorScenarios.updatedAt)),
    access.db.select({ id: experimentCsvFiles.id, fileName: experimentCsvFiles.fileName, byteSize: experimentCsvFiles.byteSize, format: experimentCsvFiles.format, createdAt: experimentCsvFiles.createdAt }).from(experimentCsvFiles).where(eq(experimentCsvFiles.workspaceId, access.workspace.id)).orderBy(desc(experimentCsvFiles.createdAt)),
  ])
  return {
    scenarios: scenarios.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    files: files.map((row) => ({ ...row, format: row.format === 'grid' ? 'grid' as const : row.format === 'trades' ? 'trades' as const : 'hsg' as const, createdAt: row.createdAt.toISOString() })),
  }
}

export type AccountSimulatorData = NonNullable<Awaited<ReturnType<typeof getAccountSimulatorData>>>

export function parseScenarioInput(value: unknown): ScenarioInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const sourceFileIds = body.sourceFileIds
  const configuration = body.configuration
  if (!name || name.length > 120 || !Array.isArray(sourceFileIds) || sourceFileIds.length > 100 ||
    !sourceFileIds.every((id) => typeof id === 'string' && uuidPattern.test(id)) ||
    !configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return null
  if (JSON.stringify(configuration).length > 40_000) return null
  return { name, sourceFileIds: [...new Set(sourceFileIds as string[])], configuration: configuration as Record<string, unknown> }
}

export async function scenarioSourcesBelongToWorkspace(db: NonNullable<Awaited<ReturnType<typeof requireWorkspace>>>['db'], workspaceId: string, ids: string[]) {
  if (!ids.length) return true
  const files = await db.select({ id: experimentCsvFiles.id }).from(experimentCsvFiles)
    .where(and(eq(experimentCsvFiles.workspaceId, workspaceId), inArray(experimentCsvFiles.id, ids)))
  return files.length === ids.length
}

export async function getOwnedScenario(db: NonNullable<Awaited<ReturnType<typeof requireWorkspace>>>['db'], workspaceId: string, id: string) {
  if (!uuidPattern.test(id)) return null
  const [row] = await db.select().from(accountSimulatorScenarios)
    .where(and(eq(accountSimulatorScenarios.id, id), eq(accountSimulatorScenarios.workspaceId, workspaceId))).limit(1)
  return row ?? null
}
