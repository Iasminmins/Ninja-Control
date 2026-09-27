import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, riskRules } from '@/lib/db/schema'
import { parsePatternThresholds } from '@/lib/patterns/server'

const settingsName = 'Pattern Lab sample thresholds'

export async function PUT(request: Request) {
  const access = await requireWorkspace().catch(() => null)
  if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
  const thresholds = parsePatternThresholds(await request.json().catch(() => null))
  if (!thresholds) return NextResponse.json({ error: 'Amostra mínima deve ser ≥2 e amostra válida maior que a intermediária.' }, { status: 400 })
  try {
    const [existing] = await access.db.select().from(riskRules).where(and(eq(riskRules.workspaceId, access.workspace.id), eq(riskRules.name, settingsName))).limit(1)
    const [record] = existing
      ? await access.db.update(riskRules).set({ threshold: thresholds.lowSample, parameters: thresholds, updatedAt: new Date() }).where(eq(riskRules.id, existing.id)).returning()
      : await access.db.insert(riskRules).values({ workspaceId: access.workspace.id, name: settingsName, condition: 'pattern-sample-size', threshold: thresholds.lowSample, enabled: true, parameters: thresholds }).returning()
    if (!record) return NextResponse.json({ error: 'Não foi possível salvar os thresholds.' }, { status: 500 })
    await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'pattern_lab.thresholds_updated', entityType: 'risk_rule', entityId: record.id, before: existing?.parameters ?? null, after: thresholds })
    return NextResponse.json({ thresholds })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar e auditar os limites.' }, { status: 500 })
  }
}
