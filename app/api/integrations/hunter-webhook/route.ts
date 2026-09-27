import { createHash, randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, integrationConnections } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const provider = 'hunter-webhook'

export async function GET() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const [connection] = await access.db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, provider))).limit(1)
  return NextResponse.json({ configured: Boolean(connection?.metadata.tokenHash), status: connection?.status ?? 'not_configured', lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null })
}

export async function POST() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  try {
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const [existing] = await access.db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, provider))).limit(1)
    const [connection] = existing
      ? await access.db.update(integrationConnections).set({ metadata: { tokenHash }, status: 'disconnected', lastSyncedAt: null, updatedAt: new Date() }).where(eq(integrationConnections.id, existing.id)).returning()
      : await access.db.insert(integrationConnections).values({ workspaceId: access.workspace.id, provider, category: 'broker', status: 'disconnected', metadata: { tokenHash } }).returning()
    if (!connection) return NextResponse.json({ error: 'Não foi possível criar o token.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: existing ? 'hunter_connector.token_rotated' : 'hunter_connector.token_created', entityType: 'integration_connection', entityId: connection.id, before: { configured: Boolean(existing?.metadata.tokenHash) }, after: { configured: true } })
    return NextResponse.json({ token, status: connection.status }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar e auditar o token.' }, { status: 500 })
  }
}

export async function DELETE() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  try {
    const [connection] = await access.db.update(integrationConnections).set({ metadata: {}, status: 'not_configured', lastSyncedAt: null, updatedAt: new Date() }).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, provider))).returning()
    if (connection) await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'hunter_connector.token_revoked', entityType: 'integration_connection', entityId: connection.id, before: { configured: true }, after: { configured: false } })
    return NextResponse.json({ configured: false })
  } catch {
    return NextResponse.json({ error: 'Não foi possível revogar e auditar o token.' }, { status: 500 })
  }
}
