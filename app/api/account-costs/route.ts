import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountCosts, auditRecords, tradingAccounts } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
const categories = ['evaluation', 'reset', 'activation', 'other'] as const

export async function POST(request: Request) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão ou conexão necessária.' }, { status: 401 })
  try {
    const body = await request.json() as Record<string, unknown>
    const accountId = typeof body.accountId === 'string' ? body.accountId : ''
    const category = body.category
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 240) : null
    const amount = Number(body.amount)
    const incurredAt = typeof body.incurredAt === 'string' ? new Date(body.incurredAt) : new Date()
    if (!/^[0-9a-f-]{36}$/i.test(accountId) || !categories.includes(category as typeof categories[number]) || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || Number.isNaN(incurredAt.valueOf())) return NextResponse.json({ error: 'Confira conta, categoria, valor e data.' }, { status: 400 })
    const [owned] = await access.db.select({ id: tradingAccounts.id }).from(tradingAccounts).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, access.workspace.id))).limit(1)
    if (!owned) return NextResponse.json({ error: 'Conta não encontrada neste workspace.' }, { status: 404 })
    const [created] = await access.db.insert(accountCosts).values({ workspaceId: access.workspace.id, accountId, category: category as string, description, amountCents: Math.round(amount * 100), incurredAt, origin: 'manual' }).returning()
    if (!created) return NextResponse.json({ error: 'Não foi possível salvar o custo.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'account.cost_recorded', entityType: 'account_cost', entityId: created.id, before: null, after: { accountId, category, amountCents: created.amountCents } })
    return NextResponse.json({ id: created.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar ou auditar o custo.' }, { status: 500 })
  }
}
