import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountSimulatorScenarios } from '@/lib/db/schema'
import { parseScenarioInput, scenarioSourcesBelongToWorkspace } from '@/lib/account-simulator/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  try {
    const rows = await access.db.select().from(accountSimulatorScenarios).where(eq(accountSimulatorScenarios.workspaceId, access.workspace.id)).orderBy(desc(accountSimulatorScenarios.updatedAt))
    return NextResponse.json({ scenarios: rows }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os cenários.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const input = parseScenarioInput(body)
  if (!input) return NextResponse.json({ error: 'Informe nome, fontes e configuração válidos.' }, { status: 400 })
  try {
    if (!await scenarioSourcesBelongToWorkspace(access.db, access.workspace.id, input.sourceFileIds)) return NextResponse.json({ error: 'Um ou mais CSVs não pertencem a este workspace.' }, { status: 400 })
    const [row] = await access.db.insert(accountSimulatorScenarios).values({ workspaceId: access.workspace.id, ...input }).returning()
    return NextResponse.json({ scenario: row }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar o cenário.' }, { status: 503 })
  }
}
