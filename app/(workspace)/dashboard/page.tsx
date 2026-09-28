import { PersistedDashboardScreen } from '@/components/modules/dashboard/persisted-dashboard-screen'
import { getDashboardChartsData } from '@/lib/dashboard/server'
import { getOperationsSnapshot } from '@/lib/operations/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  try {
    const [snapshot, charts] = await Promise.all([getOperationsSnapshot(), getDashboardChartsData()])
    return <PersistedDashboardScreen snapshot={snapshot} charts={charts} />
  } catch {
    return <PersistedDashboardScreen snapshot={null} charts={null} loadError="Não foi possível consultar os dados do workspace no Neon." />
  }
}
