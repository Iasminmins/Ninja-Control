import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { BlobNotFoundError, del, get, head, type PutBlobResult } from '@vercel/blob'
import { parseExperimentCsv, type CsvAnalysis } from '@/lib/experiments/csv-analysis'
import { experimentCsvFiles, workspaces } from '@/lib/db/schema'
import { requireWorkspace } from '@/lib/accounts/server'

export const MAX_EXPERIMENT_CSV_BYTES = 25 * 1024 * 1024
const PATH_PREFIX = 'experiment-csv/'

export type StoredCsvFile = {
  id: string
  fileName: string
  byteSize: number
  format: 'hsg' | 'grid' | 'trades'
  createdAt: string
}

type Database = NonNullable<Awaited<ReturnType<typeof requireWorkspace>>>['db']
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

export function safeCsvFileName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const fileName = value.split(/[\\/]/).pop()?.trim() ?? ''
  if (!fileName || fileName.length > 255 || !fileName.toLowerCase().endsWith('.csv')) return null
  if (/[\u0000-\u001f]/.test(fileName)) return null
  return fileName
}

export function safeCsvPathName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 255)
}

export function experimentCsvUploadPrefix(workspaceId: string) {
  return `${PATH_PREFIX}${workspaceId}/`
}

export function isExperimentCsvPath(pathname: string, workspaceId: string, fileId?: string) {
  const prefix = experimentCsvUploadPrefix(workspaceId)
  const expectedId = fileId ? `${fileId}-` : `${uuidPattern}-`
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedPrefix}${expectedId}[\\p{L}\\p{N}._ -]{1,255}\\.csv$`, 'iu').test(pathname)
}

function parseUploadPayload(payload: string | null): { workspaceId: string; userId: string; fileId: string; fileName: string } | null {
  if (!payload) return null
  try {
    const value = JSON.parse(payload) as Record<string, unknown>
    const workspaceId = typeof value.workspaceId === 'string' ? value.workspaceId : ''
    const userId = typeof value.userId === 'string' ? value.userId : ''
    const fileId = typeof value.fileId === 'string' ? value.fileId : ''
    const fileName = safeCsvFileName(value.fileName)
    return workspaceId && userId && fileName && new RegExp(`^${uuidPattern}$`, 'i').test(fileId) ? { workspaceId, userId, fileId, fileName } : null
  } catch {
    return null
  }
}

export async function registerCompletedCsv(
  db: Database,
  blob: PutBlobResult,
  tokenPayload: string | null | undefined,
) {
  const owner = parseUploadPayload(tokenPayload ?? null)
  if (!owner || !isExperimentCsvPath(blob.pathname, owner.workspaceId, owner.fileId)) {
    await del(blob.pathname).catch(() => undefined)
    throw new Error('Upload CSV inválido ou fora do limite permitido.')
  }

  try {
    const [workspace] = await db.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, owner.workspaceId), eq(workspaces.ownerId, owner.userId))).limit(1)
    if (!workspace) throw new Error('Workspace do upload não está mais disponível.')
    const metadata = await head(blob.pathname)
    if (metadata.size < 1 || metadata.size > MAX_EXPERIMENT_CSV_BYTES) throw new Error('Arquivo excede o limite permitido.')
    const stored = await get(blob.pathname, { access: 'private', useCache: false })
    if (!stored || stored.statusCode !== 200 || !stored.stream) throw new Error('Arquivo enviado não foi encontrado.')
    const csvText = await new Response(stored.stream).text()
    const analysis: CsvAnalysis = parseExperimentCsv(owner.fileName, csvText)

    const [inserted] = await db.insert(experimentCsvFiles).values({
      id: owner.fileId,
      workspaceId: owner.workspaceId,
      fileName: owner.fileName,
      blobPath: blob.pathname,
      byteSize: metadata.size,
      format: analysis.kind,
    }).onConflictDoNothing({ target: experimentCsvFiles.blobPath }).returning({ id: experimentCsvFiles.id })
    if (!inserted) {
      const [existing] = await db.select({ id: experimentCsvFiles.id }).from(experimentCsvFiles)
        .where(and(eq(experimentCsvFiles.workspaceId, owner.workspaceId), eq(experimentCsvFiles.blobPath, blob.pathname), eq(experimentCsvFiles.id, owner.fileId))).limit(1)
      if (!existing) throw new Error('Este caminho de arquivo já está associado a outro registro.')
    }
  } catch (error) {
    // Callback retries can arrive after registration; the unique path makes them safe.
    try {
      const [existing] = await db.select({ id: experimentCsvFiles.id }).from(experimentCsvFiles)
        .where(and(eq(experimentCsvFiles.workspaceId, owner.workspaceId), eq(experimentCsvFiles.blobPath, blob.pathname), eq(experimentCsvFiles.id, owner.fileId))).limit(1)
      if (existing) return
    } catch {
      // Preserve the upload if the database is temporarily unavailable; it is not listed as saved.
      throw error
    }
    await del(blob.pathname).catch(() => undefined)
    throw error
  }
}

export async function listWorkspaceCsvFiles(db: Database, workspaceId: string): Promise<StoredCsvFile[]> {
  const rows = await db.select({
    id: experimentCsvFiles.id,
    fileName: experimentCsvFiles.fileName,
    byteSize: experimentCsvFiles.byteSize,
    format: experimentCsvFiles.format,
    createdAt: experimentCsvFiles.createdAt,
  }).from(experimentCsvFiles).where(eq(experimentCsvFiles.workspaceId, workspaceId)).orderBy(desc(experimentCsvFiles.createdAt))
  return rows.map((row) => ({ ...row, format: row.format === 'grid' ? 'grid' : row.format === 'trades' ? 'trades' : 'hsg', createdAt: row.createdAt.toISOString() }))
}

export async function getWorkspaceCsvFile(db: Database, workspaceId: string, id: string) {
  const [row] = await db.select().from(experimentCsvFiles)
    .where(and(eq(experimentCsvFiles.id, id), eq(experimentCsvFiles.workspaceId, workspaceId))).limit(1)
  return row ?? null
}

export async function deleteWorkspaceCsvFile(db: Database, workspaceId: string, id: string) {
  const row = await getWorkspaceCsvFile(db, workspaceId, id)
  if (!row) return { deleted: false as const, missing: true as const }
  try { await del(row.blobPath) }
  catch (error) { if (!(error instanceof BlobNotFoundError)) throw error }
  await db.delete(experimentCsvFiles).where(and(eq(experimentCsvFiles.id, id), eq(experimentCsvFiles.workspaceId, workspaceId)))
  return { deleted: true as const, missing: false as const }
}

export async function deleteAllWorkspaceCsvFiles(db: Database, workspaceId: string) {
  const rows = await db.select({ id: experimentCsvFiles.id, blobPath: experimentCsvFiles.blobPath })
    .from(experimentCsvFiles).where(eq(experimentCsvFiles.workspaceId, workspaceId))
  const deletedIds: string[] = []
  const failedIds: string[] = []
  for (const row of rows) {
    try {
      try { await del(row.blobPath) }
      catch (error) { if (!(error instanceof BlobNotFoundError)) throw error }
      await db.delete(experimentCsvFiles).where(and(eq(experimentCsvFiles.id, row.id), eq(experimentCsvFiles.workspaceId, workspaceId)))
      deletedIds.push(row.id)
    } catch {
      failedIds.push(row.id)
    }
  }
  return { deletedIds, failedIds }
}

export async function streamWorkspaceCsvFile(db: Database, workspaceId: string, id: string) {
  const row = await getWorkspaceCsvFile(db, workspaceId, id)
  if (!row) return null
  let stored
  try { stored = await get(row.blobPath, { access: 'private', useCache: false }) }
  catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error
    await db.delete(experimentCsvFiles).where(and(eq(experimentCsvFiles.id, id), eq(experimentCsvFiles.workspaceId, workspaceId)))
    return null
  }
  if (!stored || stored.statusCode !== 200 || !stored.stream) {
    await db.delete(experimentCsvFiles).where(and(eq(experimentCsvFiles.id, id), eq(experimentCsvFiles.workspaceId, workspaceId)))
    return null
  }
  return { row, stream: stored.stream }
}
