import { redirect } from 'next/navigation'
import { PropFirmsScreen } from '@/components/modules/prop-firms/prop-firms-screen'
import { getPropFirmPortfolio } from '@/lib/prop-firms/server'

export const dynamic = 'force-dynamic'

export default async function PropFirmsPage() {
  let initial
  try {
    initial = await getPropFirmPortfolio()
  } catch {
    return <PropFirmsScreen initial={{ accounts: [], payouts: [], costs: [], firms: [] }} />
  }
  if (!initial) redirect('/auth/sign-in')
  return <PropFirmsScreen initial={initial} />
}
