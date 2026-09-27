import { redirect } from 'next/navigation'
import { PersistedJournalScreen } from '@/components/modules/journal/persisted-journal-screen'
import { getJournalEntries } from '@/lib/journal/server'

export const dynamic = 'force-dynamic'

export default async function TradingJournalPage() {
  let initial
  try { initial = await getJournalEntries() }
  catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar o journal do Neon.</main> }
  if (!initial) redirect('/auth/sign-in')
  return <PersistedJournalScreen initial={initial} />
}
