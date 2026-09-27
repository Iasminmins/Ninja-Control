import { redirect } from 'next/navigation'
import { HunterLabScreen } from '@/components/modules/hunter-lab/hunter-lab-screen'
import { getHunterLabData } from '@/lib/hunter-lab/server'

export const dynamic = 'force-dynamic'

export default async function ExperimentsPage() {
  let initial
  try { initial = await getHunterLabData() }
  catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar os experimentos do Neon.</main> }
  if (!initial) redirect('/auth/sign-in')
  return <HunterLabScreen initial={initial} page="experiments" />
}
