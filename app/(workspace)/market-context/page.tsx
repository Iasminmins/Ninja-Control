import { redirect } from 'next/navigation'
import { MarketContextScreen } from '@/components/modules/market-context/market-context-screen'
import { requireWorkspace } from '@/lib/accounts/server'
import { getMarketContext } from '@/lib/market-context/server'

export const dynamic = 'force-dynamic'

export default async function MarketContextPage() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) redirect('/auth/sign-in')
  try {
    const initial = await getMarketContext(access.workspace.id)
    return <MarketContextScreen initial={initial} />
  } catch {
    return <MarketContextScreen initial={null} loadError="Não foi possível ler os dados de mercado agora." />
  }
}
