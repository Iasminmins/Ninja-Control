import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, journalEntries, trades } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ tradeId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const { tradeId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(tradeId)) return NextResponse.json({ error: 'Trade inválido.' }, { status: 400 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Corpo JSON inválido.' }, { status: 400 })
  const plan = typeof body.plan === 'string' ? body.plan.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const review = typeof body.review === 'string' ? body.review.trim() : ''
  const tags = Array.isArray(body.tags) ? body.tags : []
  if (plan.length > 4000 || notes.length > 8000 || review.length > 4000 || tags.length > 30 || tags.some((tag) => typeof tag !== 'string' || tag.length > 80)) return NextResponse.json({ error: 'Notas ou tags excedem os limites aceitos.' }, { status: 400 })
  try {
    const [trade] = await access.db.select({ id: trades.id }).from(trades).where(and(eq(trades.id, tradeId), eq(trades.workspaceId, access.workspace.id))).limit(1)
    if (!trade) return NextResponse.json({ error: 'Trade não encontrado neste workspace.' }, { status: 404 })
    const [existing] = await access.db.select().from(journalEntries).where(and(eq(journalEntries.tradeId, tradeId), eq(journalEntries.workspaceId, access.workspace.id))).limit(1)
    const [saved] = existing
      ? await access.db.update(journalEntries).set({ plan, notes, review, tags: tags as string[], updatedAt: new Date() }).where(eq(journalEntries.id, existing.id)).returning()
      : await access.db.insert(journalEntries).values({ workspaceId: access.workspace.id, tradeId, plan, notes, review, tags: tags as string[] }).returning()
    if (!saved) return NextResponse.json({ error: 'Não foi possível salvar o journal.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: existing ? 'journal.entry_updated' : 'journal.entry_created', entityType: 'journal_entry', entityId: saved.id, before: existing ? { plan: existing.plan, notes: existing.notes, review: existing.review, tags: existing.tags } : null, after: { plan, notes, review, tags } })
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar ou auditar a anotação.' }, { status: 500 })
  }
}
