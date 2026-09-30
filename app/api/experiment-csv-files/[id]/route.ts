import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { isBlobConfigured, deleteWorkspaceCsvFile, streamWorkspaceCsvFile } from '@/lib/experiments/storage'

export const dynamic = 'force-dynamic'

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Armazenamento privado ainda não configurado.' }, { status: 503 })
  const { id } = await params
  if (!validId(id)) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  try {
    const stored = await streamWorkspaceCsvFile(access.db, access.workspace.id, id)
    if (!stored) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
    return new Response(stored.stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(stored.row.fileName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Não foi possível recuperar este CSV.' }, { status: 503 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Armazenamento privado ainda não configurado.' }, { status: 503 })
  const { id } = await params
  if (!validId(id)) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  try {
    const result = await deleteWorkspaceCsvFile(access.db, access.workspace.id, id)
    return result.missing ? NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 }) : NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir este CSV. Tente novamente.' }, { status: 503 })
  }
}
