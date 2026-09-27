import 'server-only'

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const databaseUrl = process.env.DATABASE_URL

export const database = databaseUrl
  ? drizzle(neon(databaseUrl), { schema })
  : null

export function requireDatabase() {
  if (!database) {
    throw new Error('DATABASE_URL is required to use the Neon database.')
  }
  return database
}
