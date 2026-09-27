import { and, desc, eq } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { journalEntries, propFirmPlans, propFirms, tradeContexts, trades, tradingAccounts } from '@/lib/db/schema'

export async function getJournalEntries() {
  const access = await requireWorkspace()
  if (!access) return null
  const rows = await access.db.select({ trade: trades, context: tradeContexts, journal: journalEntries, account: tradingAccounts, firm: propFirms })
    .from(trades)
    .leftJoin(tradeContexts, and(eq(tradeContexts.tradeId, trades.id), eq(tradeContexts.workspaceId, access.workspace.id)))
    .leftJoin(journalEntries, and(eq(journalEntries.tradeId, trades.id), eq(journalEntries.workspaceId, access.workspace.id)))
    .innerJoin(tradingAccounts, and(eq(trades.accountId, tradingAccounts.id), eq(tradingAccounts.workspaceId, access.workspace.id)))
    .leftJoin(propFirmPlans, eq(tradingAccounts.propFirmPlanId, propFirmPlans.id))
    .leftJoin(propFirms, eq(propFirmPlans.propFirmId, propFirms.id))
    .where(eq(trades.workspaceId, access.workspace.id))
    .orderBy(desc(trades.openedAt)).limit(500)
  return rows.map(({ trade, context, journal, account, firm }) => ({
    id: trade.id,
    accountId: trade.accountId,
    accountName: account.name,
    firmName: firm?.name ?? 'Prop firm',
    instrument: trade.instrument,
    side: trade.side,
    quantity: context?.quantity ?? 0,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt?.toISOString() ?? null,
    netPnl: (trade.netPnlCents ?? 0) / 100,
    setup: context?.setupCode ?? trade.setup,
    hunterFamily: context?.hunterFamily ?? null,
    hunterVersion: context?.hunterVersion ?? null,
    patterns: context?.patternCodes ?? trade.tags,
    entryPrice: context?.entryPrice ?? null,
    exitPrice: context?.exitPrice ?? null,
    mae: context?.maeCents === null || context?.maeCents === undefined ? null : context.maeCents / 100,
    mfe: context?.mfeCents === null || context?.mfeCents === undefined ? null : context.mfeCents / 100,
    riskReward: context?.riskReward ?? null,
    durationSeconds: context?.durationSeconds ?? null,
    factors: context?.factors ?? {},
    filters: context?.filters ?? {},
    plan: journal?.plan ?? '',
    notes: journal?.notes ?? trade.notes ?? '',
    review: journal?.review ?? '',
    journalTags: journal?.tags ?? [],
    updatedAt: journal?.updatedAt?.toISOString() ?? null,
  }))
}

export type JournalEntries = NonNullable<Awaited<ReturnType<typeof getJournalEntries>>>
