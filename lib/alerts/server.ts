import { and, desc, eq } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { alertEvents, tradingAccounts } from '@/lib/db/schema'

export async function getWorkspaceAlerts() {
  const access = await requireWorkspace()
  if (!access) return null
  const rows = await access.db.select({ alert: alertEvents, accountName: tradingAccounts.name }).from(alertEvents)
    .leftJoin(tradingAccounts, and(eq(alertEvents.accountId, tradingAccounts.id), eq(tradingAccounts.workspaceId, access.workspace.id)))
    .where(eq(alertEvents.workspaceId, access.workspace.id)).orderBy(desc(alertEvents.occurredAt)).limit(200)
  return rows.map(({ alert, accountName }) => ({ ...alert, accountName, state: alert.details.status === 'RESOLVED' ? 'RESOLVED' : alert.readAt ? 'ACKNOWLEDGED' : 'OPEN' as 'RESOLVED' | 'ACKNOWLEDGED' | 'OPEN' }))
}

export type WorkspaceAlerts = NonNullable<Awaited<ReturnType<typeof getWorkspaceAlerts>>>
