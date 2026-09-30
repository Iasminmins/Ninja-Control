import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { getOwnedScenario, parseScenarioInput, scenarioSourcesBelongToWorkspace } from '@/lib/account-simulator/server'
import { accountSimulatorScenarios } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  const input = parseScenarioInput(body)
  if (!input) return NextResponse.json({ error: 'Informe nome, fontes e configuração válidos.' }, { status: 400 })
  try {
    if (!await getOwnedScenario(access.db, access.workspace.id, id)) return NextResponse.json({ error: 'Cenário não encontrado.' }, { status: 404 })
    if (!await scenarioSourcesBelongToWorkspace(access.db, access.workspace.id, input.sourceFileIds)) return NextResponse.json({ error: 'Um ou mais CSVs não pertencem a este workspace.' }, { status: 400 })
    const [row] = await access.db.update(accountSimulatorScenarios).set({ ...input, updatedAt: new Date() })
      .where(and(eq(accountSimulatorScenarios.id, id), eq(accountSimulatorScenarios.workspaceId, access.workspace.id))).returning()
    return row ? NextResponse.json({ scenario: row }, { headers: { 'Cache-Control': 'private, no-store' } }) : NextResponse.json({ error: 'Cenário não encontrado.' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar o cenário.' }, { status: 503 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const { id } = await params
  try {
    if (!await getOwnedScenario(access.db, access.workspace.id, id)) return NextResponse.json({ error: 'Cenário não encontrado.' }, { status: 404 })
    const [deleted] = await access.db.delete(accountSimulatorScenarios)
      .where(and(eq(accountSimulatorScenarios.id, id), eq(accountSimulatorScenarios.workspaceId, access.workspace.id))).returning({ id: accountSimulatorScenarios.id })
    return deleted ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: 'Cenário não encontrado.' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível excluir o cenário.' }, { status: 503 })
  }
}
