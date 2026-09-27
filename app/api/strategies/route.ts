import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, strategies } from '@/lib/db/schema'
import { getStrategyCatalog } from '@/lib/strategies/server'

export const dynamic = 'force-dynamic'
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export async function GET() {
  try {
    const rows = await getStrategyCatalog()
    if (!rows) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    return NextResponse.json({ strategies: rows })
  } catch { return NextResponse.json({ error: 'Não foi possível carregar o catálogo.' }, { status: 500 }) }
}

export async function POST(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const body: unknown = await request.json()
    if (!isRecord(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    const name = clean(body.name, 120)
    const description = clean(body.description, 3000)
    if (!name) return NextResponse.json({ error: 'Informe o nome da estratégia.' }, { status: 400 })
    const [strategy] = await access.db.insert(strategies).values({ workspaceId: access.workspace.id, name, description: description || null }).onConflictDoNothing().returning()
    if (!strategy) return NextResponse.json({ error: 'Já existe uma estratégia com esse nome.' }, { status: 409 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'strategy.created', entityType: 'strategy', entityId: strategy.id, before: null, after: { name, description } })
    return NextResponse.json({ strategy }, { status: 201 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível criar a estratégia.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const body: unknown = await request.json()
    if (!isRecord(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    const id = clean(body.id, 50)
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Estratégia inválida.' }, { status: 400 })
    const [previous] = await access.db.select().from(strategies).where(and(eq(strategies.id, id), eq(strategies.workspaceId, access.workspace.id))).limit(1)
    if (!previous) return NextResponse.json({ error: 'Estratégia não encontrada.' }, { status: 404 })
    const archivedAt = typeof body.archived === 'boolean' ? body.archived ? new Date() : null : previous.archivedAt
    const name = body.name === undefined ? previous.name : clean(body.name, 120)
    const description = body.description === undefined ? previous.description : clean(body.description, 3000) || null
    if (!name) return NextResponse.json({ error: 'Informe o nome da estratégia.' }, { status: 400 })
    const [updated] = await access.db.update(strategies).set({ name, description, archivedAt, updatedAt: new Date() }).where(and(eq(strategies.id, id), eq(strategies.workspaceId, access.workspace.id))).returning()
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: body.archived === undefined ? 'strategy.updated' : archivedAt ? 'strategy.archived' : 'strategy.reactivated', entityType: 'strategy', entityId: id, before: { name: previous.name, description: previous.description, archivedAt: previous.archivedAt }, after: { name: updated.name, description: updated.description, archivedAt: updated.archivedAt } })
    return NextResponse.json({ strategy: updated })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível atualizar a estratégia.' }, { status: 500 })
  }
}
