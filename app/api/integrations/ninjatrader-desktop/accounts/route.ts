import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, integrationAccountMappings, integrationConnections, integrationPositions, tradingAccounts } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
const provider = 'ninjatrader-desktop'

export async function GET() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const [connection] = await access.db.select({ id: integrationConnections.id }).from(integrationConnections).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, provider))).limit(1)
  if (!connection) return NextResponse.json({ accounts: [], tradingAccounts: [] })
  const [accounts, trading, positions] = await Promise.all([
    access.db.select().from(integrationAccountMappings).where(and(eq(integrationAccountMappings.workspaceId, access.workspace.id), eq(integrationAccountMappings.connectionId, connection.id))),
    access.db.select({ id: tradingAccounts.id, name: tradingAccounts.name }).from(tradingAccounts).where(eq(tradingAccounts.workspaceId, access.workspace.id)),
    access.db.select().from(integrationPositions).where(eq(integrationPositions.workspaceId, access.workspace.id)),
  ])
  return NextResponse.json({ accounts: accounts.map((account) => ({ ...account, positions: positions.filter((position) => position.mappingId === account.id) })), tradingAccounts: trading })
}

export async function PATCH(request: Request) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const body = await request.json().catch(() => null) as { mappingId?: unknown; tradingAccountId?: unknown } | null
  if (!body || typeof body.mappingId !== 'string' || (body.tradingAccountId !== null && typeof body.tradingAccountId !== 'string')) return NextResponse.json({ error: 'Vínculo inválido.' }, { status: 400 })
  try {
    const [connection] = await access.db.select({ id: integrationConnections.id }).from(integrationConnections).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, provider))).limit(1)
    const [mapping] = connection ? await access.db.select().from(integrationAccountMappings).where(and(eq(integrationAccountMappings.id, body.mappingId), eq(integrationAccountMappings.workspaceId, access.workspace.id), eq(integrationAccountMappings.connectionId, connection.id))).limit(1) : []
    if (!mapping) return NextResponse.json({ error: 'Conta descoberta não encontrada.' }, { status: 404 })
    const accountId = body.tradingAccountId as string | null
    if (accountId) {
      const [account] = await access.db.select({ id: tradingAccounts.id }).from(tradingAccounts).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, access.workspace.id))).limit(1)
      if (!account) return NextResponse.json({ error: 'A conta selecionada não pertence ao workspace.' }, { status: 404 })
    }
    await access.db.update(integrationAccountMappings).set({ tradingAccountId: accountId, updatedAt: new Date() }).where(eq(integrationAccountMappings.id, mapping.id))
    if (accountId) await access.db.update(tradingAccounts).set({ connectionStatus: 'connected', updatedAt: new Date() }).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, access.workspace.id)))
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: accountId ? 'ninjatrader.account_linked' : 'ninjatrader.account_unlinked', entityType: 'integration_account_mapping', entityId: mapping.id, before: { tradingAccountId: mapping.tradingAccountId }, after: { tradingAccountId: accountId } })
    return NextResponse.json({ saved: true })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar o vínculo.' }, { status: 500 })
  }
}
