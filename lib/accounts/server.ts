import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { requireDatabase } from '@/lib/db'
import { auditRecords, propFirmPlans, propFirms, tradingAccounts, workspaces } from '@/lib/db/schema'
import { resolvePropFirm } from '@/lib/prop-firms/catalog'
import type { AccountKind, DemoAccount, PropAccountStatus } from '@/lib/demo/types'

export type PersistedAccount = Omit<DemoAccount, 'provenance'> & { provenance: 'manual' }

export async function requireWorkspace() {
  const { data, error } = await auth.getSession()
  if (error || !data?.user) return null

  const db = requireDatabase()
  const existing = await db.select().from(workspaces).where(eq(workspaces.ownerId, data.user.id)).limit(1)
  if (existing[0]) return { db, user: data.user, workspace: existing[0] }

  const inserted = await db.insert(workspaces).values({
    ownerId: data.user.id,
    name: `${data.user.name || data.user.email || 'Meu'} workspace`.slice(0, 120),
  }).onConflictDoNothing().returning()
  const workspace = inserted[0] ?? (await db.select().from(workspaces).where(eq(workspaces.ownerId, data.user.id)).limit(1))[0]
  return workspace ? { db, user: data.user, workspace } : null
}

export async function listWorkspaceAccounts(workspaceId: string) {
  const db = requireDatabase()
  const rows = await db.select({
    account: tradingAccounts,
    plan: propFirmPlans,
    firm: propFirms,
  }).from(tradingAccounts)
    .leftJoin(propFirmPlans, eq(tradingAccounts.propFirmPlanId, propFirmPlans.id))
    .leftJoin(propFirms, eq(propFirmPlans.propFirmId, propFirms.id))
    .where(eq(tradingAccounts.workspaceId, workspaceId))

  return rows.map(({ account, plan, firm }): PersistedAccount => ({
    id: account.id,
    name: account.name,
    firm: firm?.name ?? 'Prop firm',
    firmLogoUrl: firm?.logoUrl ?? undefined,
    kind: account.kind,
    stage: account.stage,
    startingCapital: account.startingCapitalCents / 100,
    profitTarget: typeof plan?.rules?.profitTargetCents === 'number' ? plan.rules.profitTargetCents / 100 : undefined,
    consistencyPercent: typeof plan?.rules?.consistencyPercent === 'number' ? plan.rules.consistencyPercent : undefined,
    minimumTradingDays: typeof plan?.rules?.minimumTradingDays === 'number' ? plan.rules.minimumTradingDays : undefined,
    maximumContracts: typeof plan?.rules?.maximumContracts === 'number' ? plan.rules.maximumContracts : undefined,
    additionalRules: typeof plan?.rules?.additionalRules === 'string' ? plan.rules.additionalRules : undefined,
    dailyLossLimit: (plan?.dailyLossLimitCents ?? 0) / 100,
    trailingDrawdownLimit: (plan?.trailingDrawdownLimitCents ?? 0) / 100,
    drawdownBufferPercent: 0,
    lifecycle: account.status === 'archived' ? 'archived' : 'active',
    accountStatus: account.status,
    connectionState: account.connectionStatus === 'connected' ? 'connected' : 'not-configured',
    createdAt: account.createdAt.toISOString(),
    lastSyncedAt: null,
    provenance: 'manual',
  }))
}

export type AccountInput = {
  name: string
  firm: string
  firmLogoUrl?: string
  kind: AccountKind
  stage: string
  startingCapital: number
  profitTarget?: number
  consistencyPercent?: number
  minimumTradingDays?: number
  maximumContracts?: number
  additionalRules?: string
  dailyLossLimit: number
  trailingDrawdownLimit: number
}

export function parseAccountInput(value: unknown): AccountInput | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const firm = typeof body.firm === 'string' ? body.firm.trim() : ''
  const stage = typeof body.stage === 'string' ? body.stage.trim() : ''
  const kind = body.kind
  const startingCapital = Number(body.startingCapital)
  const dailyLossLimit = Number(body.dailyLossLimit)
  const trailingDrawdownLimit = Number(body.trailingDrawdownLimit)
  const profitTargetValue = body.profitTarget === undefined || body.profitTarget === '' || body.profitTarget === null ? undefined : Number(body.profitTarget)
  const optionalNumber = (value: unknown) => value === undefined || value === '' || value === null ? undefined : Number(value)
  const consistencyPercent = optionalNumber(body.consistencyPercent)
  const minimumTradingDays = optionalNumber(body.minimumTradingDays)
  const maximumContracts = optionalNumber(body.maximumContracts)
  const additionalRules = typeof body.additionalRules === 'string' ? body.additionalRules.trim().slice(0, 2000) : undefined
  const firmLogoUrl = typeof body.firmLogoUrl === 'string' ? body.firmLogoUrl.trim() : undefined

  if (!name || name.length > 120 || !firm || firm.length > 120 || !stage || stage.length > 80) return null
  if (!['evaluation', 'funded', 'combine'].includes(String(kind))) return null
  if (![startingCapital, dailyLossLimit, trailingDrawdownLimit].every((n) => Number.isFinite(n) && n > 0 && n <= 100_000_000)) return null
  if (profitTargetValue !== undefined && (!Number.isFinite(profitTargetValue) || profitTargetValue <= 0 || profitTargetValue > 100_000_000)) return null
  if (consistencyPercent !== undefined && (!Number.isFinite(consistencyPercent) || consistencyPercent < 0 || consistencyPercent > 100)) return null
  if (minimumTradingDays !== undefined && (!Number.isInteger(minimumTradingDays) || minimumTradingDays < 0 || minimumTradingDays > 365)) return null
  if (maximumContracts !== undefined && (!Number.isInteger(maximumContracts) || maximumContracts < 1 || maximumContracts > 100_000)) return null
  if (firmLogoUrl && (!/^https:\/\//i.test(firmLogoUrl) || firmLogoUrl.length > 2000)) return null

  return { name, firm, stage, kind: kind as AccountKind, startingCapital, profitTarget: profitTargetValue, consistencyPercent, minimumTradingDays, maximumContracts, additionalRules, dailyLossLimit, trailingDrawdownLimit, firmLogoUrl }
}

export async function createWorkspaceAccount(workspaceId: string, actorId: string, input: AccountInput) {
  const db = requireDatabase()
  const firmInput = resolvePropFirm(input.firm, input.firmLogoUrl)
  if (!firmInput) throw new Error('Informe o link HTTPS do logo oficial para essa prop firm.')

  const existingFirm = await db.select().from(propFirms).where(eq(propFirms.name, firmInput.name)).limit(1)
  const firm = existingFirm[0] ?? (await db.insert(propFirms).values({
    name: firmInput.name,
    websiteUrl: firmInput.websiteUrl,
    logoUrl: firmInput.logoUrl,
  }).onConflictDoUpdate({
    target: propFirms.name,
    set: { websiteUrl: firmInput.websiteUrl, logoUrl: firmInput.logoUrl, updatedAt: new Date() },
  }).returning())[0]
  if (!firm) throw new Error('Não foi possível cadastrar a prop firm.')

  const startingCapitalCents = Math.round(input.startingCapital * 100)
  const plan = (await db.insert(propFirmPlans).values({
    propFirmId: firm.id,
    name: `${input.name} · ${startingCapitalCents}`.slice(0, 120),
    stage: input.stage,
    startingCapitalCents,
    dailyLossLimitCents: Math.round(input.dailyLossLimit * 100),
    trailingDrawdownLimitCents: Math.round(input.trailingDrawdownLimit * 100),
    rules: { configuredByUser: true, profitTargetCents: input.profitTarget === undefined ? null : Math.round(input.profitTarget * 100), consistencyPercent: input.consistencyPercent ?? null, minimumTradingDays: input.minimumTradingDays ?? null, maximumContracts: input.maximumContracts ?? null, additionalRules: input.additionalRules ?? '' },
  }).returning())[0]
  if (!plan) throw new Error('Não foi possível salvar as regras da conta.')

  let row
  try {
    row = (await db.insert(tradingAccounts).values({
      workspaceId,
      propFirmPlanId: plan.id,
      name: input.name,
      kind: input.kind,
      stage: input.stage,
      status: 'active',
      startingCapitalCents,
      connectionStatus: 'not_configured',
      origin: 'manual',
    }).returning())[0]
  } catch (error) {
    await db.delete(propFirmPlans).where(eq(propFirmPlans.id, plan.id)).catch(() => [])
    throw error
  }
  if (!row) throw new Error('Não foi possível salvar a conta.')
  await db.insert(auditRecords).values({ workspaceId, actorId, action: 'account.created', entityType: 'trading_account', entityId: row.id, before: null, after: { name: row.name, kind: row.kind, stage: row.stage, startingCapitalCents: row.startingCapitalCents } })
  return row
}

export async function updateWorkspaceAccount(workspaceId: string, actorId: string, accountId: string, input: AccountInput) {
  const db = requireDatabase()
  const firmInput = resolvePropFirm(input.firm, input.firmLogoUrl)
  if (!firmInput) throw new Error('Informe o link HTTPS do logo oficial para essa prop firm.')
  const owned = await db.select().from(tradingAccounts).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, workspaceId))).limit(1)
  if (!owned[0]) return null

  const firmRows = await db.select().from(propFirms).where(eq(propFirms.name, firmInput.name)).limit(1)
  const firm = firmRows[0] ?? (await db.insert(propFirms).values({ name: firmInput.name, websiteUrl: firmInput.websiteUrl, logoUrl: firmInput.logoUrl }).onConflictDoUpdate({ target: propFirms.name, set: { websiteUrl: firmInput.websiteUrl, logoUrl: firmInput.logoUrl, updatedAt: new Date() } }).returning())[0]
  if (!firm) throw new Error('Não foi possível cadastrar a prop firm.')

  const capitalCents = Math.round(input.startingCapital * 100)
  const plan = owned[0].propFirmPlanId
    ? (await db.update(propFirmPlans).set({ propFirmId: firm.id, name: `${input.name} · ${capitalCents}`.slice(0, 120), stage: input.stage, startingCapitalCents: capitalCents, dailyLossLimitCents: Math.round(input.dailyLossLimit * 100), trailingDrawdownLimitCents: Math.round(input.trailingDrawdownLimit * 100), rules: { configuredByUser: true, profitTargetCents: input.profitTarget === undefined ? null : Math.round(input.profitTarget * 100), consistencyPercent: input.consistencyPercent ?? null, minimumTradingDays: input.minimumTradingDays ?? null, maximumContracts: input.maximumContracts ?? null, additionalRules: input.additionalRules ?? '' } }).where(eq(propFirmPlans.id, owned[0].propFirmPlanId)).returning())[0]
    : null
  const nextPlan = plan ?? (await db.insert(propFirmPlans).values({ propFirmId: firm.id, name: `${input.name} · ${capitalCents}`.slice(0, 120), stage: input.stage, startingCapitalCents: capitalCents, dailyLossLimitCents: Math.round(input.dailyLossLimit * 100), trailingDrawdownLimitCents: Math.round(input.trailingDrawdownLimit * 100), rules: { configuredByUser: true, profitTargetCents: input.profitTarget === undefined ? null : Math.round(input.profitTarget * 100), consistencyPercent: input.consistencyPercent ?? null, minimumTradingDays: input.minimumTradingDays ?? null, maximumContracts: input.maximumContracts ?? null, additionalRules: input.additionalRules ?? '' } }).returning())[0]
  if (!nextPlan) throw new Error('Não foi possível atualizar as regras da conta.')

  const updated = (await db.update(tradingAccounts).set({ propFirmPlanId: nextPlan.id, name: input.name, kind: input.kind, stage: input.stage, startingCapitalCents: capitalCents, updatedAt: new Date() }).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, workspaceId))).returning())[0] ?? null
  if (updated) await db.insert(auditRecords).values({ workspaceId, actorId, action: 'account.updated', entityType: 'trading_account', entityId: updated.id, before: { name: owned[0].name, kind: owned[0].kind, stage: owned[0].stage, startingCapitalCents: owned[0].startingCapitalCents }, after: { name: updated.name, kind: updated.kind, stage: updated.stage, startingCapitalCents: updated.startingCapitalCents } })
  return updated
}

export async function setWorkspaceAccountArchived(workspaceId: string, actorId: string, accountId: string, archived: boolean) {
  const db = requireDatabase()
  const [previous] = await db.select().from(tradingAccounts).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, workspaceId))).limit(1)
  if (!previous) return null
  const updated = (await db.update(tradingAccounts).set({ status: archived ? 'archived' : 'active', updatedAt: new Date() }).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, workspaceId))).returning())[0] ?? null
  if (updated) await db.insert(auditRecords).values({ workspaceId, actorId, action: archived ? 'account.archived' : 'account.reactivated', entityType: 'trading_account', entityId: updated.id, before: { status: previous.status }, after: { status: updated.status } })
  return updated
}

export async function setWorkspaceAccountStatus(workspaceId: string, actorId: string, accountId: string, status: PropAccountStatus) {
  const db = requireDatabase()
  const [previous] = await db.select().from(tradingAccounts).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, workspaceId))).limit(1)
  if (!previous) return null
  const updated = (await db.update(tradingAccounts).set({ status, updatedAt: new Date() }).where(and(eq(tradingAccounts.id, accountId), eq(tradingAccounts.workspaceId, workspaceId))).returning())[0] ?? null
  if (updated) await db.insert(auditRecords).values({ workspaceId, actorId, action: 'account.status_changed', entityType: 'trading_account', entityId: accountId, before: { status: previous.status }, after: { status: updated.status } })
  return updated
}
