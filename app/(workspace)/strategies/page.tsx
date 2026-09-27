import { redirect } from 'next/navigation'
import { PersistedStrategiesScreen } from '@/components/modules/strategies/persisted-strategies-screen'
import { getStrategyCatalog } from '@/lib/strategies/server'

export const dynamic = 'force-dynamic'
export default async function StrategiesPage() {
  let initial
  try { initial = await getStrategyCatalog() } catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar o catálogo do Neon.</main> }
  if (!initial) redirect('/auth/sign-in')
  return <PersistedStrategiesScreen initial={initial} />
}
