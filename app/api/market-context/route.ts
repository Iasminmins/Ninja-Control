import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { getMarketContext } from '@/lib/market-context/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const windows = new Set(['session', '5m', '15m'])

export async function GET(request: Request) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const requestedWindow = params.get('window') ?? 'session'
  if (!windows.has(requestedWindow)) return NextResponse.json({ error: 'Janela inválida. Use session, 5m ou 15m.' }, { status: 400 })
  try {
    const context = await getMarketContext(access.workspace.id, requestedWindow as 'session' | '5m' | '15m')
    return NextResponse.json(context, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar o contexto de mercado.' }, { status: 503 })
  }
}
