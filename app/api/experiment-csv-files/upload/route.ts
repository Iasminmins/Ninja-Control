import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { requireDatabase } from '@/lib/db'
import { isBlobConfigured, isExperimentCsvPath, MAX_EXPERIMENT_CSV_BYTES, registerCompletedCsv, safeCsvFileName, safeCsvPathName } from '@/lib/experiments/storage'

export const dynamic = 'force-dynamic'

type ClientPayload = { fileId?: unknown; fileName?: unknown }

function parseClientPayload(value: string | null) {
  if (!value) return null
  try { return JSON.parse(value) as ClientPayload } catch { return null }
}

export async function POST(request: Request) {
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Armazenamento privado ainda não configurado.' }, { status: 503 })
  let body: HandleUploadBody
  try { body = await request.json() as HandleUploadBody }
  catch { return NextResponse.json({ error: 'Solicitação de upload inválida.' }, { status: 400 }) }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const access = await requireWorkspace()
        if (!access) throw new Error('Sessão necessária.')
        const payload = parseClientPayload(clientPayload)
        const fileName = safeCsvFileName(payload?.fileName)
        const fileId = typeof payload?.fileId === 'string' ? payload.fileId : ''
        if (!fileName || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fileId) ||
          !isExperimentCsvPath(pathname, access.workspace.id, fileId) || !pathname.endsWith(`-${safeCsvPathName(fileName)}`)) {
          throw new Error('Selecione um arquivo CSV válido.')
        }
        return {
          allowedContentTypes: ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'],
          maximumSizeInBytes: MAX_EXPERIMENT_CSV_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ workspaceId: access.workspace.id, userId: access.user.id, fileId, fileName }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        await registerCompletedCsv(requireDatabase(), blob, tokenPayload)
      },
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'Sessão necessária.') return NextResponse.json({ error: message }, { status: 401 })
    if (message === 'Selecione um arquivo CSV válido.') return NextResponse.json({ error: message }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível enviar este CSV. Confira se o armazenamento privado está ativo.' }, { status: 503 })
  }
}
