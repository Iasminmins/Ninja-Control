import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { HunterConnectorScreen } from '@/components/modules/integrations/hunter-connector-screen'
import { NinjaTraderDesktopScreen } from '@/components/modules/integrations/ninjatrader-desktop-screen'
import { requireWorkspace } from '@/lib/accounts/server'
import { integrationConnections } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export default async function IntegrationsPage() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) redirect('/auth/sign-in')
  try {
    const [connection] = await access.db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, 'hunter-webhook'))).limit(1)
    const [ninjaTrader] = await access.db.select().from(integrationConnections).where(and(eq(integrationConnections.workspaceId, access.workspace.id), eq(integrationConnections.provider, 'ninjatrader-desktop'))).limit(1)
    return <><NinjaTraderDesktopScreen initialConfigured={Boolean(ninjaTrader?.metadata.tokenHash)} initialStatus={ninjaTrader?.status ?? 'not_configured'} lastSyncedAt={ninjaTrader?.lastSyncedAt?.toISOString() ?? null} /><HunterConnectorScreen initialConfigured={Boolean(connection?.metadata.tokenHash)} initialStatus={connection?.status ?? 'not_configured'} lastSyncedAt={connection?.lastSyncedAt?.toISOString() ?? null} /></>
  } catch {
    return <><NinjaTraderDesktopScreen initialConfigured={false} initialStatus="not_configured" lastSyncedAt={null} /><HunterConnectorScreen initialConfigured={false} initialStatus="not_configured" lastSyncedAt={null} loadError="Não foi possível ler o estado do conector no Neon." /></>
  }
}
