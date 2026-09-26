import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ClipboardList,
  Download,
  LayoutDashboard,
  LineChart,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavigationItem {
  label: string
  href: string
  icon: LucideIcon
}

export interface NavigationSection {
  label: string
  items: NavigationItem[]
}

export const navigationSections: NavigationSection[] = [
  { label: 'ESPAÇO DE TRABALHO', items: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Contas', href: '/accounts', icon: Wallet },
    { label: 'Operações', href: '/operations', icon: ClipboardList },
    { label: 'Desempenho', href: '/performance', icon: Activity },
  ] },
  { label: 'INTELIGÊNCIA', items: [
    { label: 'Estratégias', href: '/strategies', icon: SlidersHorizontal },
    { label: 'Hunter', href: '/hunter', icon: Bot },
    { label: 'HSG', href: '/hsg', icon: Sparkles },
    { label: 'Central de risco', href: '/risk-command', icon: ShieldCheck },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Comparador', href: '/comparator', icon: LineChart },
  ] },
  { label: 'CONTROLE', items: [
    { label: 'Diário de trading', href: '/trading-journal', icon: BookOpen },
    { label: 'Relatórios', href: '/reports', icon: Download },
    { label: 'Alertas', href: '/alerts', icon: Bell },
    { label: 'Integrações', href: '/integrations', icon: Radio },
  ] },
]

export const allNavigationItems = navigationSections.flatMap((section) => section.items)

export function navigationItemForPath(pathname: string): NavigationItem {
  return allNavigationItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? allNavigationItems[0]
}
