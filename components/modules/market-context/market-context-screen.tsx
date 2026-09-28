'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, BarChart3, RefreshCw, Radio, TrendingDown, TrendingUp } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis } from 'recharts'
import type { TreemapNode } from 'recharts'
import { EmptyState, MetricTile, PageFrame, Panel, SectionHeading, StatusPill } from '@/components/workspace/primitives'
import type { MarketContext, MarketInstrumentView, MarketReturnWindow } from '@/lib/market-context/types'

const stateLabel: Record<MarketContext['state'], string> = {
  aligned: 'Alinhado', divergent: 'Divergente', mixed: 'Misto', insufficient_data: 'Dados insuficientes', stale: 'Dados atrasados',
}
const stateTone: Record<MarketContext['state'], 'positive' | 'warning' | 'danger' | 'neutral'> = {
  aligned: 'positive', divergent: 'danger', mixed: 'warning', insufficient_data: 'warning', stale: 'danger',
}
const money = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percentage = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const time = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : 'Sem amostra'
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'não informada'
const age = (seconds: number | null) => seconds === null ? '—' : seconds < 1 ? 'agora' : `${Math.floor(seconds)} s`
const returnWindowLabel: Record<MarketReturnWindow, string> = { session: 'Sessão', '5m': '5 minutos', '15m': '15 minutos' }

function tileColor(change: number | null, isFresh: boolean) {
  if (change === null || !isFresh) return '#27272a'
  const intensity = Math.min(Math.abs(change) / 2, 1)
  const alpha = 0.18 + intensity * 0.7
  return change >= 0 ? `rgba(34, 197, 94, ${alpha})` : `rgba(244, 63, 94, ${alpha})`
}

function MarketTile(node: TreemapNode & { returnPercent?: number | null; instrumentKey?: string; isFresh?: boolean }, onSelect: (key: string) => void) {
  const instrumentKey = typeof node.instrumentKey === 'string' ? node.instrumentKey : ''
  const change = typeof node.returnPercent === 'number' ? node.returnPercent : null
  const isFresh = node.isFresh === true
  const title = `${node.name}: ${percentage(change)}${isFresh ? '' : ' · cotação atrasada ou indisponível'}`
  return <g role="button" tabIndex={0} aria-label={title} onClick={() => instrumentKey && onSelect(instrumentKey)} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && instrumentKey) { event.preventDefault(); onSelect(instrumentKey) } }} style={{ cursor: 'pointer', outline: 'none' }}>
    <title>{title}</title>
    <rect x={node.x} y={node.y} width={node.width} height={node.height} fill={tileColor(change, isFresh)} stroke="#090b0c" strokeWidth={2} rx={4} />
    {node.width > 52 && node.height > 32 && <>
      <text x={node.x + node.width / 2} y={node.y + node.height / 2 - 4} textAnchor="middle" fill="#f4f4f5" fontSize={Math.max(9, Math.min(14, node.width / 7))} fontWeight={700}>{node.name}</text>
      {node.height > 50 && node.width > 68 && <text x={node.x + node.width / 2} y={node.y + node.height / 2 + 13} textAnchor="middle" fill={isFresh ? '#f4f4f5' : '#a1a1aa'} fontSize={10}>{isFresh ? percentage(change) : 'ATRASADO'}</text>}
    </>}
  </g>
}

function emptyContext(returnWindow: MarketReturnWindow): MarketContext {
  return {
    asOf: new Date().toISOString(), latestEventAt: null, marketSessionDate: null, source: 'NinjaTrader · conexão configurada no AddOn', freshnessSeconds: null, returnWindow,
    coverage: { expected: 0, received: 0, percent: 0, minimumPercent: 70, futuresExpected: 0, futuresReceived: 0 }, equities: [], futures: [],
    breadth: { advancers: 0, decliners: 0, unchanged: 0, sampleSize: 0, advancingPercent: null, capWeightedChangePercent: null },
    sectors: [], topContributors: [], concentrationPercent: null, futuresConfirmation: 'unavailable', state: 'insufficient_data',
    reason: 'Conecte o AddOn e configure a lista de ações e o contrato NQ/MNQ.', minuteSeries: [],
  }
}

export function MarketContextScreen({ initial, loadError }: { initial: MarketContext | null; loadError?: string }) {
  const [context, setContext] = useState(initial ?? emptyContext('session'))
  const [returnWindow, setReturnWindow] = useState<MarketReturnWindow>(initial?.returnWindow ?? 'session')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState(initial?.asOf ?? null)
  const [error, setError] = useState(loadError ?? '')
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    setRefreshing(true)
    const response = await fetch(`/api/market-context?window=${returnWindow}`, { cache: 'no-store' }).catch(() => null)
    if (response?.ok) {
      const next = await response.json().catch(() => null) as MarketContext | null
      if (next) { setContext(next); setLastRefresh(new Date().toISOString()); setError('') }
    } else setError(response ? 'A consulta do contexto falhou; exibindo a última amostra recebida.' : 'Sem resposta do servidor; exibindo a última amostra recebida.')
    setRefreshing(false)
  }, [returnWindow])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5_000)
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [refresh])

  const selected = useMemo(() => [...context.equities, ...context.futures].find((item) => item.instrumentKey === selectedKey) ?? null, [context.equities, context.futures, selectedKey])
  const completeWeights = context.equities.length > 0 && context.equities.every((item) => item.marketCapWeight !== null)
  const sectors = useMemo(() => {
    const groups = new Map<string, MarketInstrumentView[]>()
    for (const instrument of context.equities) groups.set(instrument.sector ?? 'Sem classificação', [...(groups.get(instrument.sector ?? 'Sem classificação') ?? []), instrument])
    return [...groups.entries()].map(([name, items]) => ({ name, size: items.reduce((sum, item) => sum + (completeWeights ? item.marketCapWeight! : 1), 0), children: items.map((item) => ({ name: item.symbol, size: completeWeights ? item.marketCapWeight! : 1, returnPercent: item.returnPercent, isFresh: item.isFresh, instrumentKey: item.instrumentKey })) }))
  }, [completeWeights, context.equities])

  const future = context.futures[0] ?? null
  const fullWeights = completeWeights && context.breadth.sampleSize === context.equities.length
  const content = (node: TreemapNode) => node.depth === 1
    ? <g><rect x={node.x} y={node.y} width={node.width} height={node.height} fill="transparent" stroke="rgba(255,255,255,.3)" strokeWidth={1} /><text x={node.x + 6} y={node.y + 13} fill="#d4d4d8" fontSize={9}>{node.name}</text></g>
    : MarketTile(node as TreemapNode & { returnPercent?: number | null; isFresh?: boolean; instrumentKey?: string }, setSelectedKey)

  return <PageFrame eyebrow="INTELIGÊNCIA · DADOS DO NINJATRADER" title="Contexto de Mercado" description="Amplitude das ações do universo configurado e confirmação pelo contrato NQ/MNQ, calculadas somente com cotações recebidas." showDemoNotice={false} actions={<><StatusPill tone={stateTone[context.state]}>{stateLabel[context.state]}</StatusPill><button type="button" onClick={() => void refresh()} disabled={refreshing} className="secondary-button inline-flex min-h-9 items-center gap-2 px-3 text-xs"><RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />Atualizar</button></>}>
    {error && <div role="status" className="mb-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3 text-xs text-amber-100">{error}</div>}
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile label="Cobertura de ações" value={`${context.coverage.received} / ${context.coverage.expected}`} icon={Radio} note={`${context.coverage.percent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% fresca · piso ${context.coverage.minimumPercent}% · ${context.coverage.futuresExpected ? `${context.coverage.futuresReceived} / ${context.coverage.futuresExpected} futuros` : 'NQ/MNQ não configurado'}`} tone={context.coverage.percent >= context.coverage.minimumPercent ? 'positive' : 'warning'} />
      <MetricTile label="Avanços / quedas" value={`${context.breadth.advancers} / ${context.breadth.decliners}`} icon={Activity} note={`${context.breadth.sampleSize} ações válidas na janela`} />
      <MetricTile label="Mudança ponderada" value={percentage(context.breadth.capWeightedChangePercent)} icon={BarChart3} note={fullWeights ? 'Pesos de capitalização cadastrados' : 'Pesos ausentes; não estimamos mudança do índice'} tone={context.breadth.capWeightedChangePercent === null ? 'warning' : context.breadth.capWeightedChangePercent >= 0 ? 'positive' : 'negative'} />
      <MetricTile label="Concentração nos 5 maiores" value={context.concentrationPercent === null ? '—' : `${context.concentrationPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} icon={TrendingUp} note="Fração das contribuições absolutas da amostra" />
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.8fr)]">
      <Panel className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><SectionHeading title="Mapa de calor" description="Usamos peso de mercado com pesos completos no universo; sem essa referência, todos os ativos têm área igual." /><div className="flex items-center gap-2"><label htmlFor="market-window" className="text-[10px] text-zinc-500">Retorno</label><select id="market-window" value={returnWindow} onChange={(event) => setReturnWindow(event.target.value as MarketReturnWindow)} className="min-h-9 rounded-lg border border-white/10 bg-[#101214] px-3 text-xs text-zinc-200">{Object.entries(returnWindowLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500"><span>{context.equities.length} instrumentos configurados · janela {returnWindowLabel[returnWindow]} · pregão de referência (Nova York) {context.marketSessionDate ?? 'indisponível'} · atualizado {time(lastRefresh)}</span><span>{context.source}</span></div>
        {context.equities.length ? <div className="h-[440px] min-w-0 overflow-hidden rounded-xl border border-white/[0.06] bg-[#090b0c]" role="group" aria-label="Mapa de calor interativo por ação"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 440 }}><Treemap data={sectors} dataKey="size" nameKey="name" type="flat" aspectRatio={1.6} content={content} isAnimationActive={false} isUpdateAnimationActive={false} /></ResponsiveContainer></div> : <EmptyState title="Aguardando cotações do AddOn" description="No NinjaTrader: New → Ninja Control, informe símbolos de ações separados por vírgula e um contrato futuro NQ ou MNQ exato. Sua conexão e licença definem quais símbolos podem transmitir." />}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500"><span>Queda forte</span><span className="h-2 w-20 rounded-full bg-gradient-to-r from-rose-500 via-zinc-700 to-emerald-500" /><span>Alta forte</span><span>Escala simétrica limitada a ±2%.</span></div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <SectionHeading title="Leitura do mercado" description="Conclusões condicionadas à qualidade e à cobertura do feed." />
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{stateLabel[context.state]}</p><StatusPill tone={stateTone[context.state]}>{context.returnWindow === 'session' ? 'SESSÃO' : context.returnWindow.toUpperCase()}</StatusPill></div><p className="mt-2 text-xs leading-5 text-zinc-400">{context.reason}</p><p className="mt-3 text-[10px] text-zinc-600">Cotação mais recente: {time(context.latestEventAt)} · idade máxima válida: {age(context.freshnessSeconds)}</p></div>
        <div className="mt-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Contrato de referência</p>{future ? <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{future.instrumentKey}</p><p className="mt-1 text-[10px] text-zinc-500">Vencimento {future.contractExpiry ?? 'não identificado'} · {time(future.eventAt)}</p></div><p className={`font-mono text-sm font-semibold ${(future.returnPercent ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{percentage(future.returnPercent)}</p></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><p className="text-zinc-600">Último</p><p className="mt-1 text-zinc-200">{money(future.last)}</p></div><div><p className="text-zinc-600">Bid / ask</p><p className="mt-1 text-zinc-200">{money(future.bid)} / {money(future.ask)}</p></div><div><p className="text-zinc-600">Volume sessão</p><p className="mt-1 text-zinc-200">{future.sessionVolume?.toLocaleString('pt-BR') ?? '—'}</p></div></div></div> : <EmptyState title="NQ/MNQ não recebido" description="Configure o contrato exato e confirme que a conexão fornece dados de mercado para ele." />}</div>
        {selected && <div className="mt-4 rounded-xl border border-lime-300/15 bg-lime-300/[0.035] p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-white">{selected.symbol}</p><button type="button" onClick={() => setSelectedKey(null)} className="text-[10px] text-zinc-500 hover:text-white">Fechar</button></div><p className="mt-1 text-[10px] text-zinc-500">{selected.displayName ?? selected.sector ?? 'Setor sem referência cadastrada'}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><p>Último <strong className="ml-1 text-zinc-200">{money(selected.last)}</strong></p><p>Variação <strong className="ml-1 text-zinc-200">{percentage(selected.returnPercent)}</strong></p><p>Bid / ask <strong className="ml-1 text-zinc-200">{money(selected.bid)} / {money(selected.ask)}</strong></p><p>Idade <strong className="ml-1 text-zinc-200">{age(selected.quoteAgeSeconds)}</strong></p><p>Peso relativo <strong className="ml-1 text-zinc-200">{selected.marketCapWeight === null ? 'indisponível' : `${selected.marketCapWeight}%`}</strong></p><p>Vigência <strong className="ml-1 text-zinc-200">{dateTime(selected.effectiveFrom)}</strong></p></div><p className="mt-2 text-[9px] text-zinc-600">Fonte dos metadados: {selected.metadataSource ?? 'não informada'} · evento {time(selected.eventAt)} · servidor {time(selected.receivedAt)}</p></div>}
        <div className="mt-4 rounded-lg border border-amber-200/10 bg-amber-200/[0.025] p-3"><p className="flex gap-2 text-[10px] leading-5 text-zinc-400"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-200" /><span>Setor e peso só aparecem quando você os cadastra no formato previsto no AddOn e informa a fonte/licença. Sem peso, a área fica igual e a leitura ponderada do índice é omitida. <Link className="text-lime-300 hover:text-lime-200" href="/integrations">Ver configuração</Link></span></p></div>
      </Panel>
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel className="p-5 sm:p-6"><SectionHeading title="NQ e amplitude" description="Histórico de um minuto recebido no workspace; sem preenchimento de lacunas." />{context.minuteSeries.length ? <div className="h-[240px] min-w-0"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 240 }}><LineChart data={context.minuteSeries}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} /><XAxis dataKey="at" tick={{ fill: '#71717a', fontSize: 9 }} tickFormatter={(value) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value))} axisLine={false} tickLine={false} minTickGap={28} /><YAxis yAxisId="nq" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={56} tickFormatter={(value: number) => `${value.toFixed(1)}%`} /><YAxis yAxisId="breadth" orientation="right" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={42} tickFormatter={(value: number) => `${Math.round(value)}%`} domain={[0, 100]} /><Tooltip labelFormatter={(value) => time(String(value))} formatter={(value, name) => [value === null ? '—' : `${Number(value).toFixed(2)}%`, name === 'nqReturnPercent' ? 'NQ (retorno da sessão)' : 'Ações em alta']} contentStyle={{ background: '#101214', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#f4f4f5', fontSize: 10 }} /><Line yAxisId="nq" dataKey="nqReturnPercent" stroke="#b9f227" strokeWidth={2} dot={false} connectNulls={false} /><Line yAxisId="breadth" dataKey="advancingPercent" stroke="#60a5fa" strokeWidth={1.5} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer></div> : <EmptyState title="Histórico sendo formado" description="O gráfico começa a aparecer depois que o AddOn transmitir atualizações de mercado. São armazenadas barras de um minuto, não cada alteração de tick." />}<div className="mt-2 flex gap-4 text-[10px] text-zinc-500"><span className="text-lime-300">━ NQ (% sessão)</span><span className="text-blue-300">━ ações em alta (%)</span></div></Panel>
      <Panel className="p-5 sm:p-6"><SectionHeading title="Amplitude por setor" description={`${context.breadth.sampleSize} ativos válidos · classificação atual da referência.`} />{context.sectors.length ? <div className="space-y-3">{context.sectors.map((sector) => <div key={sector.name}><div className="mb-1 flex items-center justify-between gap-2 text-[10px]"><span className="text-zinc-300">{sector.name}</span><span className="text-zinc-500">{sector.advancers} altas · {sector.decliners} quedas · {percentage(sector.averageChangePercent)}</span></div><div className="flex h-2 overflow-hidden rounded-full bg-zinc-800"><div className="bg-emerald-400" style={{ width: `${sector.sampleSize ? sector.advancers / sector.sampleSize * 100 : 0}%` }} /><div className="bg-rose-400" style={{ width: `${sector.sampleSize ? sector.decliners / sector.sampleSize * 100 : 0}%` }} /></div></div>)}</div> : <EmptyState title="Sem setor cadastrado" description="As cotações são exibidas sem inventar classificação. Metadados de setor e peso serão necessários para comparar setores e ponderar o índice." />}<div className="mt-5 border-t border-white/[0.06] pt-4"><div className="mb-2 flex items-center gap-2"><TrendingDown className="size-3.5 text-zinc-500" /><p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Maiores contribuições medidas</p></div>{context.topContributors.length ? <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{context.topContributors.map((item, index) => <div key={`${item.symbol}-${item.kind}-${index}`} className="flex justify-between gap-2 text-[10px]"><span className="text-zinc-300">{item.symbol} · {item.sector ?? 'sem setor'}</span><span className={item.kind === 'positive' ? 'text-emerald-300' : 'text-rose-300'}>{percentage(item.returnPercent)}</span></div>)}</div> : <p className="text-[10px] text-zinc-600">Nenhuma contribuição calculável nesta amostra.</p>}</div></Panel>
    </div>

    <p className="mt-4 text-[10px] leading-5 text-zinc-600">Dados somente leitura. Atualização solicitada a cada 5 segundos; a fonte, as licenças e o relógio do provedor controlam a disponibilidade. A ferramenta não calcula probabilidade de trade nem envia ordens.</p>
  </PageFrame>
}
