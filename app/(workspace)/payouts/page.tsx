import { redirect } from 'next/navigation'
import { PayoutsScreen } from '@/components/modules/payouts/payouts-screen'
import { getWorkspacePayouts } from '@/lib/payouts/server'

export const dynamic = 'force-dynamic'

export default async function PayoutsPage() {
  let initial
  try {
    initial = await getWorkspacePayouts()
  } catch {
    return <PayoutsScreen initial={{ accounts: [], payouts: [] }} />
  }
  if (!initial) redirect('/auth/sign-in')
  return <PayoutsScreen initial={initial} />
}
