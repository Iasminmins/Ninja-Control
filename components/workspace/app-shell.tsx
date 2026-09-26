'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Bell, ChevronRight, Command, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound, X } from 'lucide-react'
import { useDemoWorkspace } from '@/hooks/use-demo-workspace'
import { accountBalance } from '@/lib/demo/selectors'
import { formatCurrency } from '@/lib/format'
import { navigationItemForPath, navigationSections } from './navigation'

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" className="flex min-w-0 items-center" aria-label="Ninja Control — abrir dashboard">
    <span className="brand-mark"><Command className="size-4" /></span>
    {!compact && <span className="ml-3 min-w-0"><span className="block whitespace-nowrap text-[13px] font-semibold tracking-[0.2em] text-white">NINJA<span className="text-[#b9f227]">CONTROL</span></span><span className="mt-0.5 block whitespace-nowrap text-[9px] tracking-[0.18em] text-zinc-600">TRADING INTELLIGENCE</span></span>}
  </Link>
}

function NavigationLinks({ pathname, onNavigate, collapsed = false }: { pathname: string; onNavigate?: () => void; collapsed?: boolean }) {
  const { workspace } = useDemoWorkspace()
  const unread = workspace.alertEvents.filter((event) => !event.readAt).length
  return <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-6">
    {navigationSections.map((section) => <div className="mb-7" key={section.label}>
      {!collapsed && <p className="mb-3 px-3 text-[9px] font-semibold tracking-[0.22em] text-zinc-600">{section.label}</p>}
      {section.items.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={onNavigate} aria-current={isActive(pathname, href) ? 'page' : undefined} title={collapsed ? label : undefined} className={`nav-item ${isActive(pathname, href) ? 'nav-item-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}>
        <Icon className="size-[17px] shrink-0" />
        {!collapsed && <span>{label}</span>}
        {!collapsed && href === '/alerts' && unread > 0 && <span className="ml-auto flex min-w-4 items-center justify-center rounded-full bg-[#b9f227] px-1 text-[9px] font-bold text-black">{unread}</span>}
      </Link>)}
    </div>)}
  </nav>
}

function GlobalSearch() {
  const [query, setQuery] = useState('')
  const { workspace } = useDemoWorkspace()
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalized) return []
    const accounts = workspace.accounts.filter((account) => `${account.name} ${account.firm}`.toLocaleLowerCase('pt-BR').includes(normalized)).slice(0, 4)
    const trades = workspace.trades.filter((trade) => `${trade.instrument} ${trade.side}`.toLocaleLowerCase('pt-BR').includes(normalized)).slice(0, 4)
    return [
      ...accounts.map((account) => ({ key: account.id, title: account.name, subtitle: `${account.firm} · ${formatCurrency(accountBalance(workspace, account))}`, href: `/accounts#${account.id}` })),
      ...trades.map((trade) => ({ key: trade.id, title: trade.instrument, subtitle: `${trade.side === 'long' ? 'Compra' : 'Venda'} · ${formatCurrency(trade.netPnl)}`, href: `/trading-journal#${trade.id}` })),
    ]
  }, [query, workspace])

  return <details className="relative">
    <summary className="icon-button list-none" aria-label="Abrir busca global"><Search className="size-4" /><span className="sr-only">Buscar contas e trades</span></summary>
    <div className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-[#111416] p-3 shadow-2xl">
      <label htmlFor="global-search" className="metric-label">Buscar na demonstração</label>
      <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder="Conta, provedor ou instrumento" className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f227]" />
      {query.trim() && <div className="mt-2 flex flex-col gap-1" aria-live="polite">
        {matches.map((match) => <Link key={match.key} href={match.href} className="rounded-lg px-3 py-2 hover:bg-white/[0.05]"><span className="block text-xs text-zinc-200">{match.title}</span><span className="mt-1 block text-[10px] text-zinc-500">{match.subtitle}</span></Link>)}
        {matches.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">Nenhum resultado nos dados de demonstração.</p>}
      </div>}
    </div>
  </details>
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const item = navigationItemForPath(pathname)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { workspace } = useDemoWorkspace()
  const unread = workspace.alertEvents.filter((event) => !event.readAt).length

  return <div className="min-h-screen bg-[#090a0c] text-zinc-100">
    <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/[0.07] bg-[#0d0f11] transition-[width] duration-200 lg:flex ${collapsed ? 'w-[76px]' : 'w-[242px]'}`}>
      <div className={`flex h-[72px] items-center border-b border-white/[0.07] ${collapsed ? 'justify-center px-3' : 'px-5'}`}><Brand compact={collapsed} /></div>
      <NavigationLinks pathname={pathname} collapsed={collapsed} />
      <div className="border-t border-white/[0.07] p-3">
        {!collapsed && <div className="mb-3 flex items-center gap-3 rounded-lg bg-white/[0.035] p-3"><div className="flex size-8 items-center justify-center rounded-full bg-amber-300/10 text-amber-200"><UserRound className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs font-medium">Ambiente local</p><p className="truncate text-[10px] text-zinc-600">Dados de demonstração</p></div></div>}
        <button onClick={() => setCollapsed((value) => !value)} className="nav-item w-full justify-center text-zinc-500" aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : undefined}>{collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /><span className="text-[11px]">Recolher menu</span></>}</button>
      </div>
    </aside>

    <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[242px]'}`}>
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-white/[0.07] bg-[#090a0c]/90 px-5 backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button className="icon-button lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir navegação"><Menu className="size-5" /></button>
          <div className="min-w-0"><div className="flex items-center gap-2 text-xs text-zinc-500"><span>Workspace</span><ChevronRight className="size-3" /><span className="truncate text-zinc-300">{item.label}</span></div><h1 className="mt-1 truncate text-sm font-semibold tracking-tight">{item.label}</h1></div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <span className="hidden items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/[0.04] px-3 py-1.5 sm:flex"><span className="size-1.5 rounded-full bg-amber-300" /><span className="text-[10px] font-medium tracking-wide text-amber-200">MODO DEMONSTRAÇÃO</span></span>
          <GlobalSearch />
          <Link className="icon-button relative" href="/alerts" aria-label={`Abrir alertas${unread ? `, ${unread} não lidos` : ''}`}><Bell className="size-4" />{unread > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#b9f227]" />}</Link>
          <span className="hidden h-6 w-px bg-white/[0.08] sm:block" />
          <span className="hidden text-[10px] text-zinc-500 md:block">Somente dados locais</span>
        </div>
      </header>
      {children}
    </div>

    {mobileOpen && <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setMobileOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Navegação principal" className="flex h-full w-[min(300px,86vw)] flex-col border-r border-white/10 bg-[#0d0f11] p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex h-10 items-center justify-between"><Brand /><button className="icon-button" onClick={() => setMobileOpen(false)} aria-label="Fechar navegação"><X className="size-5" /></button></div>
        <NavigationLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        <p className="border-t border-white/[0.07] px-3 pt-4 text-[10px] text-zinc-500">Modo demonstração · alterações salvas neste navegador</p>
      </div>
    </div>}
  </div>
}
