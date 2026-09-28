import { timingSafeEqual } from 'node:crypto'
import { lt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireDatabase } from '@/lib/db'
import { marketMinuteAggregates } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/)?.[1]
  if (!secret || !bearer) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const expected = Buffer.from(secret)
  const provided = Buffer.from(bearer)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000)
    await requireDatabase().delete(marketMinuteAggregates).where(lt(marketMinuteAggregates.minuteStart, cutoff))
    return NextResponse.json({ ok: true, retainedAfter: cutoff.toISOString() })
  } catch {
    return NextResponse.json({ error: 'Não foi possível aplicar a retenção do histórico de mercado.' }, { status: 503 })
  }
}
