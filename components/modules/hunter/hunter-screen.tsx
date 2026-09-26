'use client'

import Link from 'next/link'
import { ArrowUpRight, Bot, CircleHelp } from 'lucide-react'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { selectTrades, strategyNetPnl } from '@/lib/demo/selectors'
import { formatCurrency, formatDateTime } from '@/lib/format'

export function HunterScreen() {
  const { workspace } = useDemoWorkspace()
  const strategy = workspace.strategies.find((item) => item.id === 'strategy-hunter') ?? workspace.strategies.find((item) => item.name.toLocaleLowerCase('pt-BR').includes('hunter'))
  const trades = strategy ? selectTrades(workspace, { strategyId: strategy.id }) : []
  const pendingFields = ['Entrada e saída do sinal', 'Instrumentos e janelas permitidas', 'Parâmetros e gestão de posição', 'Critérios de invalidação e risco']
  return <PageFrame title="Hunter" description="Área da estratégia separada do catálogo. A lógica precisa ser definida antes de interpretar sinais ou métricas." eyebrow="ESTRATÉGIA · CONFIGURAÇÃO PENDENTE" actions={<Link href="/strategies" className="secondary-button min-h-9">Abrir catálogo <ArrowUpRight className="size-3.5" /></Link>}>
    <section className="mb-5 grid gap-3 sm:grid-cols-3"><MetricTile label="Estado" value="Aguardando definição" icon={Bot} tone="warning" note="Nenhum sinal é gerado por esta demonstração." /><MetricTile label="Trades vinculados" value={String(trades.length)} icon={CircleHelp} note="Registros sintéticos associados no catálogo." /><MetricTile label="P&L da amostra" value={formatCurrency(strategy ? strategyNetPnl(workspace, strategy.id) : null)} icon={Bot} note="Não representa edge, estratégia ativa ou resultado ao vivo." /></section>
    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><Panel className="p-5 sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><SectionHeading title="Definição da estratégia" description="Campos pendentes para tornar esta área significativa." /><StatusPill tone="warning">NÃO CONFIGURADA</StatusPill></div><div className="flex flex-col gap-3">{pendingFields.map((field, index) => <div key={field} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><span className="flex size-7 items-center justify-center rounded-md bg-white/[0.05] text-[10px] font-semibold text-zinc-400">0{index + 1}</span><span className="text-xs text-zinc-300">{field}</span><span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-600">A definir</span></div>)}</div><div className="mt-5 rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-3 text-[11px] leading-5 text-zinc-400">Nenhuma regra, parâmetro ou recomendação foi inferida. Forneça a especificação funcional de Hunter para completar os controles.</div></Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Registros associados" description="Trades sintéticos marcados com Hunter no conjunto de exemplo." />{trades.length ? <div className="flex flex-col gap-3">{trades.map((trade) => <article key={trade.id} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-200">{trade.instrument}</span><span className={`font-mono text-xs ${trade.netPnl < 0 ? 'text-rose-300' : 'text-zinc-300'}`}>{formatCurrency(trade.netPnl)}</span></div><p className="mt-2 text-[10px] text-zinc-500">{formatDateTime(trade.closedAt)} · {workspace.accounts.find((account) => account.id === trade.accountId)?.name ?? 'Conta arquivada'} · registro fictício</p></article>)}</div> : <EmptyState title="Sem registros associados" description="Quando houver trades sintéticos vinculados, eles aparecerão aqui sem serem tratados como sinais da estratégia." />}</Panel>
    </section>
  </PageFrame>
}
