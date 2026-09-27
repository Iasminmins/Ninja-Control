import { PersistedOperationsScreen } from '@/components/modules/operations/persisted-operations-screen'
import { getOperationsSnapshot } from '@/lib/operations/server'

export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  try {
    const snapshot = await getOperationsSnapshot()
    return <PersistedOperationsScreen snapshot={snapshot} />
  } catch {
    return <PersistedOperationsScreen snapshot={null} loadError="Não foi possível consultar os dados operacionais no Neon." />
  }
}
