import { sql } from 'drizzle-orm'
import { database } from '@/lib/db'

export async function GET() {
  if (!database) {
    return Response.json({ status: 'not_configured', provider: 'neon' }, { status: 503 })
  }

  try {
    await database.execute(sql`select 1`)
    return Response.json({ status: 'ok', provider: 'neon' })
  } catch {
    return Response.json({ status: 'unavailable', provider: 'neon' }, { status: 503 })
  }
}
