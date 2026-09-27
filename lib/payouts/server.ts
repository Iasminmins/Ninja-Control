import { and, desc, eq } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { payouts, propFirmPlans, propFirms, tradingAccounts } from '@/lib/db/schema'

export const payoutStatuses = ['not_eligible', 'almost_eligible', 'eligible', 'requested', 'processing', 'paid'] as const
export type PayoutStatus = typeof payoutStatuses[number]

export async function getWorkspacePayouts() {
  const access = await requireWorkspace()
  if (!access) return null
  const [accountRows, payoutRows] = await Promise.all([
    access.db.select({ id: tradingAccounts.id, name: tradingAccounts.name, firmName: propFirms.name, logoUrl: propFirms.logoUrl })
      .from(tradingAccounts).leftJoin(propFirmPlans, eq(tradingAccounts.propFirmPlanId, propFirmPlans.id)).leftJoin(propFirms, eq(propFirmPlans.propFirmId, propFirms.id))
      .where(eq(tradingAccounts.workspaceId, access.workspace.id)),
    access.db.select({ payout: payouts, accountName: tradingAccounts.name, firmName: propFirms.name })
      .from(payouts).innerJoin(tradingAccounts, and(eq(payouts.accountId, tradingAccounts.id), eq(tradingAccounts.workspaceId, access.workspace.id)))
      .leftJoin(propFirmPlans, eq(tradingAccounts.propFirmPlanId, propFirmPlans.id)).leftJoin(propFirms, eq(propFirmPlans.propFirmId, propFirms.id))
      .where(eq(payouts.workspaceId, access.workspace.id)).orderBy(desc(payouts.requestedAt)).limit(100),
  ])
  return {
    accounts: accountRows.map((account) => ({ id: account.id, name: account.name, firm: account.firmName ?? 'Prop firm', logoUrl: account.logoUrl })),
    payouts: payoutRows.map(({ payout, accountName, firmName }) => ({
      id: payout.id,
      accountId: payout.accountId,
      accountName,
      firm: firmName ?? 'Prop firm',
      status: payout.status,
      amount: payout.amountCents / 100,
      requestedAt: payout.requestedAt.toISOString(),
      paidAt: payout.paidAt?.toISOString() ?? null,
    })),
  }
}

export type PayoutSnapshot = NonNullable<Awaited<ReturnType<typeof getWorkspacePayouts>>>

export function parsePayoutInput(input: unknown): { accountId: string; amount: number; requestedAt: Date; status: PayoutStatus } | null {
  if (!input || typeof input !== 'object') return null
  const body = input as Record<string, unknown>
  const accountId = typeof body.accountId === 'string' ? body.accountId : ''
  const amount = Number(body.amount)
  const status = body.status
  const requestedAt = typeof body.requestedAt === 'string' ? new Date(body.requestedAt) : new Date()
  if (!/^[0-9a-f-]{36}$/i.test(accountId) || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || Number.isNaN(requestedAt.valueOf())) return null
  if (!payoutStatuses.includes(status as PayoutStatus)) return null
  return { accountId, amount, requestedAt, status: status as PayoutStatus }
}
