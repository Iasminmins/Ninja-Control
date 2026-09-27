import { redirect } from 'next/navigation'
import { PersistedAlertsScreen } from '@/components/modules/alerts/persisted-alerts-screen'
import { getWorkspaceAlerts } from '@/lib/alerts/server'

export const dynamic = 'force-dynamic'
export default async function AlertsPage() {
  let initial
  try { initial = await getWorkspaceAlerts() } catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar alertas do Neon.</main> }
  if (!initial) redirect('/auth/sign-in')
  return <PersistedAlertsScreen initial={initial} />
}
