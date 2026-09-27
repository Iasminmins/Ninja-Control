import { redirect } from 'next/navigation'
import { PersistedComparatorScreen } from '@/components/modules/comparator/persisted-comparator-screen'
import { getComparatorData, type CompareType } from '@/lib/comparator/server'

export const dynamic = 'force-dynamic'
type Search = Promise<Record<string, string | string[] | undefined>>
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function ComparatorPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams
  const type: CompareType = first(query.type) === 'strategy' ? 'strategy' : 'account'
  const rawDays = Number(first(query.days) ?? 30)
  const days = [0, 7, 30, 90, 365].includes(rawDays) ? rawDays : 30
  let data
  try { data = await getComparatorData(type, first(query.a) ?? '', first(query.b) ?? '', days) }
  catch { return <main className="p-6 text-sm text-rose-200">Não foi possível calcular a comparação com os dados do Neon.</main> }
  if (!data) redirect('/auth/sign-in')
  return <PersistedComparatorScreen data={data} />
}
