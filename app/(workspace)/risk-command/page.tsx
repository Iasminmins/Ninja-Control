import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { PersistedRiskScreen } from '@/components/modules/risk/persisted-risk-screen'
import { requireWorkspace } from '@/lib/accounts/server'
import { riskRules } from '@/lib/db/schema'
import { defaultRiskThresholds, parseRiskThresholds } from '@/lib/risk/settings'

export const dynamic = 'force-dynamic'

export default async function RiskCommandPage() {
  const access = await requireWorkspace()
  if (!access) redirect('/auth/sign-in')
  try {
    const [row] = await access.db.select().from(riskRules).where(and(eq(riskRules.workspaceId, access.workspace.id), eq(riskRules.name, 'Risk Engine simulation thresholds'))).limit(1)
    return <PersistedRiskScreen initial={parseRiskThresholds(row?.parameters) ?? defaultRiskThresholds} configured={Boolean(row)} />
  } catch {
    return <PersistedRiskScreen initial={defaultRiskThresholds} configured={false} loadError="Não foi possível consultar as regras no Neon." />
  }
}
