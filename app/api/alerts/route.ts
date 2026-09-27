import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { alertEvents, auditRecords } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    const { id, status } = body as Record<string, unknown>
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || !['ACKNOWLEDGED', 'RESOLVED'].includes(String(status))) return NextResponse.json({ error: 'Alerta ou ação inválida.' }, { status: 400 })
    const [previous] = await access.db.select().from(alertEvents).where(and(eq(alertEvents.id, id), eq(alertEvents.workspaceId, access.workspace.id))).limit(1)
    if (!previous) return NextResponse.json({ error: 'Alerta não encontrado.' }, { status: 404 })
    if (previous.details.status === 'RESOLVED') return NextResponse.json({ error: 'Este alerta já foi resolvido.' }, { status: 409 })
    const nextDetails = { ...previous.details, status }
    const [updated] = await access.db.update(alertEvents).set({ details: nextDetails, readAt: previous.readAt ?? new Date() }).where(and(eq(alertEvents.id, id), eq(alertEvents.workspaceId, access.workspace.id))).returning()
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: `alert.${String(status).toLowerCase()}`, entityType: 'alert_event', entityId: id, before: { status: previous.details.status ?? (previous.readAt ? 'ACKNOWLEDGED' : 'OPEN'), readAt: previous.readAt }, after: { status, readAt: updated.readAt } })
    return NextResponse.json({ alert: updated })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível atualizar o alerta.' }, { status: 500 })
  }
}
