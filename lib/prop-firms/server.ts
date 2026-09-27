import { and, desc, eq } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { accountCosts, payouts, propFirmPlans, propFirms, tradingAccounts } from '@/lib/db/schema'

export async function getPropFirmPortfolio() {
  const access = await requireWorkspace()
  if (!access) return null
  const [accountRows, payoutRows, costRows] = await Promise.all([
    access.db.select({ account: tradingAccounts, plan: propFirmPlans, firm: propFirms })
      .from(tradingAccounts).leftJoin(propFirmPlans, eq(tradingAccounts.propFirmPlanId, propFirmPlans.id)).leftJoin(propFirms, eq(propFirmPlans.propFirmId, propFirms.id)).where(eq(tradingAccounts.workspaceId, access.workspace.id)),
    access.db.select({ payout: payouts, accountName: tradingAccounts.name })
      .from(payouts).innerJoin(tradingAccounts, and(eq(payouts.accountId, tradingAccounts.id), eq(tradingAccounts.workspaceId, access.workspace.id))).where(eq(payouts.workspaceId, access.workspace.id)).orderBy(desc(payouts.requestedAt)).limit(500),
    access.db.select({ cost: accountCosts, accountName: tradingAccounts.name })
      .from(accountCosts).innerJoin(tradingAccounts, and(eq(accountCosts.accountId, tradingAccounts.id), eq(tradingAccounts.workspaceId, access.workspace.id))).where(eq(accountCosts.workspaceId, access.workspace.id)).orderBy(desc(accountCosts.incurredAt)).limit(500),
  ])

  const accounts = accountRows.map(({ account, plan, firm }) => ({ id: account.id, name: account.name, firm: firm?.name ?? 'Prop firm', logoUrl: firm?.logoUrl ?? null, status: account.status, startingCapital: account.startingCapitalCents / 100 }))
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const payoutsList = payoutRows.map(({ payout, accountName }) => ({ id: payout.id, accountId: payout.accountId, accountName, status: payout.status, amount: payout.amountCents / 100, requestedAt: payout.requestedAt.toISOString() }))
  const costs = costRows.map(({ cost, accountName }) => ({ id: cost.id, accountId: cost.accountId, accountName, category: cost.category, description: cost.description, amount: cost.amountCents / 100, incurredAt: cost.incurredAt.toISOString() }))
  const firms = [...new Set(accounts.map((account) => account.firm))].map((name) => {
    const firmAccounts = accounts.filter((account) => account.firm === name)
    const ids = new Set(firmAccounts.map((account) => account.id))
    const firmPayouts = payoutsList.filter((payout) => ids.has(payout.accountId))
    const firmCosts = costs.filter((cost) => ids.has(cost.accountId))
    return { name, logoUrl: firmAccounts[0]?.logoUrl ?? null, accountCount: firmAccounts.length, activeCount: firmAccounts.filter((account) => account.status === 'active').length, startingCapital: firmAccounts.reduce((sum, account) => sum + account.startingCapital, 0), paidPayouts: firmPayouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amount, 0), costs: firmCosts.reduce((sum, cost) => sum + cost.amount, 0), netRecorded: firmPayouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amount, 0) - firmCosts.reduce((sum, cost) => sum + cost.amount, 0) }
  })
  return { accounts, payouts: payoutsList, costs, firms }
}

export type PropFirmPortfolio = NonNullable<Awaited<ReturnType<typeof getPropFirmPortfolio>>>
