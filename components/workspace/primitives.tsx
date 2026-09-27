import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Database } from 'lucide-react'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'

export function PageFrame({ eyebrow = 'AMBIENTE DE DEMONSTRAÇÃO', title, description, actions, children, showDemoNotice = true }: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
  showDemoNotice?: boolean
}) {
  const module = title.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return <main data-module={module} className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9 xl:px-10">
    <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><div className="mb-3 flex items-center gap-2"><span className="eyebrow-dot" /><span className="eyebrow">{eyebrow}</span></div><h2 className="text-[26px] font-semibold tracking-[-0.04em] text-white sm:text-[32px]">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{description}</p></div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {showDemoNotice && <DemoNotice />}
    {children}
  </main>
}

export function DemoNotice() {
  const { storageNotice } = useDemoWorkspace()
  return <div className="mb-7 flex items-start gap-3 rounded-xl border border-amber-200/[0.14] bg-[#19170f] px-4 py-3.5" role="status">
    {storageNotice?.startsWith('Os dados') ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" /> : <Database className="mt-0.5 size-4 shrink-0 text-amber-300" />}
    <p className="text-xs leading-5 text-zinc-300"><span className="font-semibold text-amber-200">Ambiente de demonstração</span><span className="mx-2 text-amber-200/40">·</span>Dados sintéticos; nenhuma conta está conectada e nenhuma proteção ou ordem real é executada.{storageNotice && <span className="mt-1 block text-amber-200">{storageNotice}</span>}</p>
  </div>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>
}

export function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-start justify-between gap-4"><div><h3 className="section-title">{title}</h3>{description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}</div>{action}</div>
}

export function MetricTile({ label, value, icon: Icon, note, tone = 'neutral' }: { label: string; value: string; icon: LucideIcon; note?: string; tone?: 'neutral' | 'positive' | 'negative' | 'warning' }) {
  const toneClass = tone === 'positive' ? 'text-[#b9f227]' : tone === 'negative' ? 'text-rose-300' : tone === 'warning' ? 'text-amber-200' : 'text-white'
  return <div className="metric-card"><div className="flex items-start justify-between"><div className="metric-icon"><Icon /></div></div><p className="metric-label mt-5">{label}</p><p className={`mt-1 text-xl font-semibold tracking-[-0.025em] ${toneClass}`}>{value}</p>{note && <p className="mt-2 text-[11px] leading-4 text-zinc-500">{note}</p>}</div>
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'positive' | 'warning' | 'danger' | 'neutral' }) {
  const toneClass = tone === 'positive' ? 'bg-emerald-400/10 text-emerald-300' : tone === 'warning' ? 'bg-amber-300/10 text-amber-200' : tone === 'danger' ? 'bg-rose-400/10 text-rose-300' : 'bg-white/[0.06] text-zinc-400'
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold tracking-wider ${toneClass}`}><span className="size-1.5 rounded-full bg-current" />{children}</span>
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center"><p className="text-sm font-medium text-zinc-300">{title}</p><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-zinc-500">{description}</p></div>
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`primary-button min-h-9 disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`}>{children}</button>
}

export function SecondaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`secondary-button min-h-9 disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ''}`}>{children}</button>
}
