import { redirect } from 'next/navigation'
import { PersistedReportsScreen } from '@/components/modules/reports/persisted-reports-screen'
import { getWorkspaceTradeReport, type ReportFilters } from '@/lib/reports/server'

export const dynamic = 'force-dynamic'
type Search = Promise<Record<string, string | string[] | undefined>>
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams
  const daysValue = Number(first(query.days) ?? 30)
  const filters: ReportFilters = { days: [0, 7, 30, 90, 365].includes(daysValue) ? daysValue : 30, accountId: first(query.accountId) ?? 'all', strategyId: first(query.strategyId) ?? 'all' }
  let report
  try { report = await getWorkspaceTradeReport(filters) } catch { return <main className="p-6 text-sm text-rose-200">Não foi possível carregar o relatório do Neon.</main> }
  if (!report) redirect('/auth/sign-in')
  return <PersistedReportsScreen report={report} />
}
