import { redirect } from 'next/navigation'
import { PatternLabScreen } from '@/components/modules/patterns/pattern-lab-screen'
import { getPatternLabData } from '@/lib/patterns/server'

export const dynamic = 'force-dynamic'

export default async function PatternLabPage() {
  let initial
  try { initial = await getPatternLabData() }
  catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar o Pattern Lab do Neon.</main> }
  if (!initial) redirect('/auth/sign-in')
  return <PatternLabScreen initial={initial} />
}
