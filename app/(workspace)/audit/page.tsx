import { desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { EmptyState, PageFrame, Panel, SectionHeading } from '@/components/workspace/primitives'
import { requireWorkspace } from '@/lib/accounts/server'
import { auditRecords } from '@/lib/db/schema'
import { formatDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const access = await requireWorkspace().catch(() => null)
  if (!access) redirect('/auth/sign-in')
  const rows = await access.db.select().from(auditRecords).where(eq(auditRecords.workspaceId, access.workspace.id)).orderBy(desc(auditRecords.occurredAt)).limit(100).catch(() => [])
  return <PageFrame title="Auditoria" description="Registro de alterações feitas no workspace." eyebrow="CONTROLE" showDemoNotice={false}>
    <Panel className="p-5 sm:p-6"><SectionHeading title="Últimas ações" description="Até 100 eventos mais recentes, incluindo ator, horário e estado anterior/novo." />
      {rows.length === 0 ? <div className="mt-4"><EmptyState title="Nenhuma ação auditada" description="Alterações de contas, regras de risco e payouts aparecerão aqui." /></div> : <div className="mt-4 space-y-2">{rows.map((record) => <article key={record.id} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-zinc-200">{record.action}</p><time className="text-[10px] text-zinc-500">{formatDateTime(record.occurredAt.toISOString())}</time></div><p className="mt-1 text-[10px] text-zinc-500">{record.entityType} · {record.entityId} · usuário {record.actorId ?? 'sistema'}</p>{Boolean(record.after) && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-black/20 p-2 text-[10px] text-zinc-400">{JSON.stringify({ before: record.before, after: record.after }, null, 2)}</pre>}</article>)}</div>}
    </Panel>
  </PageFrame>
}
