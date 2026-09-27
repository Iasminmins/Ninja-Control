import { and, desc, eq, isNull } from 'drizzle-orm'
import { requireWorkspace } from '@/lib/accounts/server'
import { executionDivergences, executionNodes } from '@/lib/db/schema'

export async function getExecutionSnapshot() {
  const access = await requireWorkspace()
  if (!access) return null
  const [nodes, divergences] = await Promise.all([
    access.db.select().from(executionNodes).where(eq(executionNodes.workspaceId, access.workspace.id)).orderBy(desc(executionNodes.lastHeartbeatAt)).limit(100),
    access.db.select().from(executionDivergences).where(and(eq(executionDivergences.workspaceId, access.workspace.id), isNull(executionDivergences.resolvedAt))).orderBy(desc(executionDivergences.detectedAt)).limit(100),
  ])
  const now = Date.now()
  return {
    nodes: nodes.map((node) => {
      const heartbeat = node.lastHeartbeatAt?.getTime() ?? 0
      const stale = !heartbeat || now - heartbeat > 60_000
      return { id: node.id, name: node.name, role: node.role, status: stale ? 'offline' : node.status, lastHeartbeatAt: node.lastHeartbeatAt?.toISOString() ?? null, latencyMs: typeof node.metadata.latencyMs === 'number' ? node.metadata.latencyMs : null, position: node.metadata.position ?? null }
    }),
    divergences: divergences.map((item) => ({ id: item.id, kind: item.kind, details: item.details, detectedAt: item.detectedAt.toISOString() })),
  }
}

export type ExecutionSnapshot = NonNullable<Awaited<ReturnType<typeof getExecutionSnapshot>>>
