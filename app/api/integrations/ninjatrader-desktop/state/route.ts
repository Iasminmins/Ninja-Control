import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { getNinjaTraderAccountState } from '@/lib/ninjatrader/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  try {
    const accounts = await getNinjaTraderAccountState(access.db, access.workspace.id)
    return NextResponse.json({ accounts, capturedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar o estado das contas NinjaTrader.' }, { status: 500 })
  }
}
