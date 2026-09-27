import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { parseRiskThresholds, defaultRiskThresholds } from '@/lib/risk/settings'
import { auditRecords, riskRules } from '@/lib/db/schema'
import { requireWorkspace } from '@/lib/accounts/server'

export const dynamic = 'force-dynamic'
const settingsName = 'Risk Engine simulation thresholds'

export async function GET() {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const [row] = await access.db.select().from(riskRules).where(and(eq(riskRules.workspaceId, access.workspace.id), eq(riskRules.name, settingsName))).limit(1)
    const thresholds = parseRiskThresholds(row?.parameters) ?? defaultRiskThresholds
    return NextResponse.json({ thresholds, configured: Boolean(row) })
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as regras de risco.' }, { status: process.env.DATABASE_URL ? 500 : 503 })
  }
}

export async function PUT(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const parsed = parseRiskThresholds(await request.json())
    if (!parsed) return NextResponse.json({ error: 'Use limites inteiros de 0 a 100, em ordem decrescente.' }, { status: 400 })
    const [current] = await access.db.select().from(riskRules).where(and(eq(riskRules.workspaceId, access.workspace.id), eq(riskRules.name, settingsName))).limit(1)
    const row = current
      ? (await access.db.update(riskRules).set({ threshold: parsed.normalMinBuffer, parameters: parsed, updatedAt: new Date() }).where(eq(riskRules.id, current.id)).returning())[0]
      : (await access.db.insert(riskRules).values({ workspaceId: access.workspace.id, name: settingsName, condition: 'drawdown-buffer-percent', threshold: parsed.normalMinBuffer, enabled: true, parameters: parsed }).returning())[0]
    if (!row) return NextResponse.json({ error: 'Não foi possível salvar as regras.' }, { status: 500 })
    await access.db.insert(auditRecords).values({
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      action: 'risk_engine.settings.updated',
      entityType: 'risk_rule',
      entityId: row.id,
      before: current?.parameters ?? null,
      after: parsed,
    })
    return NextResponse.json({ thresholds: parsed, configured: true })
  } catch {
    return NextResponse.json({ error: 'As regras foram recebidas, mas o salvamento ou o log de auditoria falhou. Recarregue para confirmar o estado.' }, { status: 500 })
  }
}
