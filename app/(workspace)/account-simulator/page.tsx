import { redirect } from 'next/navigation'
import { AccountSimulatorScreen } from '@/components/modules/account-simulator/account-simulator-screen'
import { getAccountSimulatorData } from '@/lib/account-simulator/server'

export const dynamic = 'force-dynamic'

export default async function AccountSimulatorPage() {
  let initial
  try { initial = await getAccountSimulatorData() }
  catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar o simulador do workspace.</main> }
  if (!initial) redirect('/auth/sign-in')
  return <AccountSimulatorScreen initial={initial} />
}
