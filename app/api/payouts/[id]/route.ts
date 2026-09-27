import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, payouts } from '@/lib/db/schema'
import { payoutStatuses } from '@/lib/payouts/server'

type RouteContext = { params: Promise<{ id: string }> }
const transitions: Record<string, string[]> = { requested: ['processing', 'paid'], processing: ['paid'], almost_eligible: ['eligible', 'requested'], eligible: ['requested'], not_eligible: ['almost_eligible'] }

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão ou conexão necessária.' }, { status: 401 })
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Payout inválido.' }, { status: 400 })
  try {
    const { status } = await request.json() as { status?: unknown }
    if (!payoutStatuses.includes(status as typeof payoutStatuses[number])) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
    const [previous] = await access.db.select().from(payouts).where(and(eq(payouts.id, id), eq(payouts.workspaceId, access.workspace.id))).limit(1)
    if (!previous) return NextResponse.json({ error: 'Payout não encontrado.' }, { status: 404 })
    if (!transitions[previous.status]?.includes(status as string)) return NextResponse.json({ error: 'Essa transição de estado não é permitida.' }, { status: 409 })
    const [updated] = await access.db.update(payouts).set({ status: status as string, paidAt: status === 'paid' ? new Date() : previous.paidAt }).where(and(eq(payouts.id, id), eq(payouts.workspaceId, access.workspace.id))).returning()
    if (!updated) return NextResponse.json({ error: 'Não foi possível atualizar o payout.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'payout.status_changed', entityType: 'payout', entityId: id, before: { status: previous.status }, after: { status: updated.status } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Não foi possível atualizar ou auditar o payout.' }, { status: 500 })
  }
}
