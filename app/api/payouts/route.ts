import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, payouts, tradingAccounts } from '@/lib/db/schema'
import { parsePayoutInput } from '@/lib/payouts/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão ou conexão necessária.' }, { status: 401 })
  try {
    const [rows] = await Promise.all([access.db.select().from(payouts).where(eq(payouts.workspaceId, access.workspace.id)).limit(100)])
    return NextResponse.json({ payouts: rows })
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar payouts.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão ou conexão necessária.' }, { status: 401 })
  try {
    const input = parsePayoutInput(await request.json())
    if (!input) return NextResponse.json({ error: 'Confira conta, valor, data e estado do payout.' }, { status: 400 })
    const [ownedAccount] = await access.db.select({ id: tradingAccounts.id }).from(tradingAccounts).where(and(eq(tradingAccounts.id, input.accountId), eq(tradingAccounts.workspaceId, access.workspace.id))).limit(1)
    if (!ownedAccount) return NextResponse.json({ error: 'Conta não encontrada neste workspace.' }, { status: 404 })
    const [created] = await access.db.insert(payouts).values({ workspaceId: access.workspace.id, accountId: input.accountId, status: input.status, amountCents: Math.round(input.amount * 100), requestedAt: input.requestedAt, paidAt: input.status === 'paid' ? input.requestedAt : null, origin: 'manual' }).returning()
    if (!created) return NextResponse.json({ error: 'Não foi possível registrar o payout.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'payout.created', entityType: 'payout', entityId: created.id, before: null, after: { accountId: created.accountId, amountCents: created.amountCents, status: created.status } })
    return NextResponse.json({ id: created.id }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível registrar ou auditar o payout.' }, { status: 500 })
  }
}
