import { PersistedAnalyticsScreen } from '@/components/modules/analytics/persisted-analytics-screen'
import { getAnalyticsSnapshot, type AnalyticsFilters } from '@/lib/analytics/server'

type Search = Promise<Record<string, string | string[] | undefined>>
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }
export default async function AnalyticsPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams
  const rawDays = Number(first(query.days) ?? 30)
  const filters: AnalyticsFilters = { days: [0, 7, 30, 90, 365].includes(rawDays) ? rawDays : 30, accountId: first(query.accountId) ?? 'all', hunterFamily: (first(query.hunterFamily) ?? 'all').slice(0, 80), setup: (first(query.setup) ?? 'all').slice(0, 80), side: ['long', 'short'].includes(first(query.side) ?? '') ? first(query.side)! : 'all' }
  return <PersistedAnalyticsScreen snapshot={await getAnalyticsSnapshot(filters)} page="analytics" />
}
