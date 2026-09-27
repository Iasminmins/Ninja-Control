import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, executionDivergences } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Divergência inválida.' }, { status: 400 })
  const body = await request.json().catch(() => null) as { resolve?: unknown } | null
  if (body?.resolve !== true) return NextResponse.json({ error: 'Confirme a resolução da divergência.' }, { status: 400 })
  try {
    const [existing] = await access.db.select().from(executionDivergences).where(and(eq(executionDivergences.id, id), eq(executionDivergences.workspaceId, access.workspace.id), isNull(executionDivergences.resolvedAt))).limit(1)
    if (!existing) return NextResponse.json({ error: 'Divergência não encontrada ou já resolvida.' }, { status: 404 })
    const [updated] = await access.db.update(executionDivergences).set({ resolvedAt: new Date() }).where(and(eq(executionDivergences.id, id), eq(executionDivergences.workspaceId, access.workspace.id))).returning()
    if (!updated) return NextResponse.json({ error: 'Não foi possível resolver.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'execution.divergence_resolved', entityType: 'execution_divergence', entityId: id, before: { resolvedAt: null, kind: existing.kind }, after: { resolvedAt: updated.resolvedAt?.toISOString() } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar ou auditar a divergência.' }, { status: 500 })
  }
}
