import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords, strategies, strategyExperiments, strategyVersions } from '@/lib/db/schema'
import { experimentStages, hunterAreas, versionStages } from '@/lib/hunter-lab/constants'

export const dynamic = 'force-dynamic'
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const clean = (value: unknown, max = 3000) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export async function GET() {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const rows = await access.db.select().from(strategies).where(eq(strategies.workspaceId, access.workspace.id)).orderBy(strategies.name)
    return NextResponse.json({ strategies: rows })
  } catch { return NextResponse.json({ error: 'Não foi possível carregar as áreas Hunter.' }, { status: 500 }) }
}

export async function POST(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const body: unknown = await request.json()
    if (!isRecord(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

    if (body.kind === 'version') {
      const area = clean(body.area, 20)
      const label = clean(body.label, 40)
      const changeSummary = clean(body.changeSummary, 4000)
      const stage = clean(body.stage, 30)
      const parameters = isRecord(body.parameters) ? body.parameters : {}
      const filters = isRecord(body.filters) ? body.filters : {}
      const evidence = isRecord(body.evidence) ? body.evidence : {}
      if (!hunterAreas.includes(area as typeof hunterAreas[number]) || !label || !changeSummary || !versionStages.includes(stage as typeof versionStages[number])) return NextResponse.json({ error: 'Preencha área, versão, alterações e etapa válida.' }, { status: 400 })

      const existingStrategy = (await access.db.select().from(strategies).where(and(eq(strategies.workspaceId, access.workspace.id), eq(strategies.name, area))).limit(1))[0]
      const strategy = existingStrategy ?? (await access.db.insert(strategies).values({ workspaceId: access.workspace.id, name: area, description: `Versões e experimentos do módulo ${area}.` }).onConflictDoNothing().returning())[0]
        ?? (await access.db.select().from(strategies).where(and(eq(strategies.workspaceId, access.workspace.id), eq(strategies.name, area))).limit(1))[0]
      if (!strategy) return NextResponse.json({ error: 'Não foi possível inicializar a área.' }, { status: 500 })
      const previous = await access.db.select().from(strategyVersions).where(eq(strategyVersions.strategyId, strategy.id))
      if (previous.some((row) => row.parameters.displayVersion === label)) return NextResponse.json({ error: 'Essa versão já foi cadastrada.' }, { status: 409 })
      const row = (await access.db.insert(strategyVersions).values({
        strategyId: strategy.id,
        version: Math.max(0, ...previous.map((item) => item.version)) + 1,
        parameters: { displayVersion: label, stage, parameters, filters, evidence, expectedImpact: clean(body.expectedImpact, 1000) },
        notes: changeSummary,
      }).returning())[0]
      if (!row) return NextResponse.json({ error: 'Não foi possível salvar a versão.' }, { status: 500 })
      await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'hunter.version.created', entityType: 'strategy_version', entityId: row.id, before: null, after: { area, displayVersion: label, stage, parameters, filters, evidence, changeSummary } })
      return NextResponse.json({ version: row }, { status: 201 })
    }

    if (body.kind === 'experiment') {
      const name = clean(body.name, 120)
      const hypothesis = clean(body.hypothesis, 4000)
      const versionId = clean(body.versionId, 50)
      const dataset = clean(body.dataset, 500)
      const period = clean(body.period, 200)
      const baseline = clean(body.baseline, 500)
      const variant = clean(body.variant, 1000)
      if (!name || !hypothesis || !versionId || !dataset || !period || !baseline || !variant) return NextResponse.json({ error: 'Preencha hipótese, versão, dataset, período, baseline e alteração.' }, { status: 400 })
      const owned = await access.db.select({ version: strategyVersions }).from(strategyVersions).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id)).where(and(eq(strategyVersions.id, versionId), eq(strategies.workspaceId, access.workspace.id))).limit(1)
      if (!owned[0]) return NextResponse.json({ error: 'Versão não encontrada neste workspace.' }, { status: 404 })
      const row = (await access.db.insert(strategyExperiments).values({ strategyVersionId: versionId, name, hypothesis, status: 'IDEA', metrics: { dataset, period, baseline, variant, results: {}, conclusion: '' } }).returning())[0]
      if (!row) return NextResponse.json({ error: 'Não foi possível salvar o experimento.' }, { status: 500 })
      await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'hunter.experiment.created', entityType: 'strategy_experiment', entityId: row.id, before: null, after: { name, hypothesis, strategyVersionId: versionId, dataset, period, baseline, variant, status: 'IDEA' } })
      return NextResponse.json({ experiment: row }, { status: 201 })
    }
    return NextResponse.json({ error: 'Tipo de registro inválido.' }, { status: 400 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível salvar o registro Hunter.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const body: unknown = await request.json()
    if (!isRecord(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
    const id = clean(body.id, 50)

    if (body.kind === 'version') {
      const stage = clean(body.stage, 30)
      if (!versionStages.includes(stage as typeof versionStages[number])) return NextResponse.json({ error: 'Etapa inválida.' }, { status: 400 })
      const rows = await access.db.select({ version: strategyVersions }).from(strategyVersions).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id)).where(and(eq(strategyVersions.id, id), eq(strategies.workspaceId, access.workspace.id))).limit(1)
      const previous = rows[0]?.version
      if (!previous) return NextResponse.json({ error: 'Versão não encontrada.' }, { status: 404 })
      const parameters = { ...previous.parameters, stage }
      const updated = (await access.db.update(strategyVersions).set({ parameters }).where(eq(strategyVersions.id, id)).returning())[0]
      await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'hunter.version.stage_updated', entityType: 'strategy_version', entityId: id, before: { stage: previous.parameters.stage ?? 'BACKTEST' }, after: { stage } })
      return NextResponse.json({ version: updated })
    }

    if (body.kind === 'experiment') {
      const status = clean(body.status, 30)
      const conclusion = clean(body.conclusion, 4000)
      if (!experimentStages.includes(status as typeof experimentStages[number])) return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
      const owned = await access.db.select({ experiment: strategyExperiments }).from(strategyExperiments).innerJoin(strategyVersions, eq(strategyExperiments.strategyVersionId, strategyVersions.id)).innerJoin(strategies, eq(strategyVersions.strategyId, strategies.id)).where(and(eq(strategyExperiments.id, id), eq(strategies.workspaceId, access.workspace.id))).limit(1)
      const previous = owned[0]?.experiment
      if (!previous) return NextResponse.json({ error: 'Experimento não encontrado.' }, { status: 404 })
      const metrics = { ...previous.metrics, conclusion, results: isRecord(body.results) ? body.results : previous.metrics.results }
      const updated = (await access.db.update(strategyExperiments).set({ status, metrics, completedAt: ['VALIDATED', 'REJECTED', 'DEPLOYED'].includes(status) ? new Date() : null, startedAt: status === 'TESTING' && !previous.startedAt ? new Date() : previous.startedAt }).where(and(eq(strategyExperiments.id, id), eq(strategyExperiments.status, previous.status))).returning())[0]
      if (!updated) return NextResponse.json({ error: 'O experimento foi alterado por outra ação. Recarregue a página.' }, { status: 409 })
      await access.db.insert(auditRecords).values({ workspaceId: access.workspace.id, actorId: access.user.id, action: 'hunter.experiment.updated', entityType: 'strategy_experiment', entityId: id, before: { status: previous.status, metrics: previous.metrics }, after: { status, metrics } })
      return NextResponse.json({ experiment: updated })
    }
    return NextResponse.json({ error: 'Tipo de registro inválido.' }, { status: 400 })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível atualizar o registro Hunter.' }, { status: 500 })
  }
}
