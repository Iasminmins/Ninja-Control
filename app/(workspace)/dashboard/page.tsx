import { PersistedOperationsScreen } from '@/components/modules/operations/persisted-operations-screen'
import { getOperationsSnapshot } from '@/lib/operations/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  return <PersistedOperationsScreen snapshot={await getOperationsSnapshot()} />
}
