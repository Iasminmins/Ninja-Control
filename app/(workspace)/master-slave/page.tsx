import { redirect } from 'next/navigation'
import { MasterSlaveScreen } from '@/components/modules/execution/master-slave-screen'
import { getExecutionSnapshot } from '@/lib/execution/server'

export const dynamic = 'force-dynamic'

export default async function MasterSlavePage() {
  try {
    const snapshot = await getExecutionSnapshot()
    if (!snapshot) redirect('/auth/sign-in')
    return <MasterSlaveScreen initial={snapshot} />
  } catch {
    return <main className="p-6 text-sm text-rose-200">Não foi possível carregar o monitor Master/Slave do Neon.</main>
  }
}
