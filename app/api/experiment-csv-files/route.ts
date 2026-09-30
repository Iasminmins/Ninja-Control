import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { isBlobConfigured, deleteAllWorkspaceCsvFiles, experimentCsvUploadPrefix, listWorkspaceCsvFiles } from '@/lib/experiments/storage'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Armazenamento privado ainda não configurado.' }, { status: 503 })
  try {
    const files = await listWorkspaceCsvFiles(access.db, access.workspace.id)
    return NextResponse.json({ files, uploadPrefix: experimentCsvUploadPrefix(access.workspace.id) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os CSVs salvos.' }, { status: 503 })
  }
}

export async function DELETE() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Armazenamento privado ainda não configurado.' }, { status: 503 })
  try {
    const result = await deleteAllWorkspaceCsvFiles(access.db, access.workspace.id)
    return NextResponse.json({ ...result, partial: result.failedIds.length > 0 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir os CSVs salvos.' }, { status: 503 })
  }
}
