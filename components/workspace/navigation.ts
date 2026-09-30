import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ClipboardList,
  Download,
  LayoutDashboard,
  CircleDollarSign,
  ScrollText,
  Building2,
  RadioTower,
  GitBranch,
  FlaskConical,
  Gauge,
  Radio,
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
    { label: 'Operações', href: '/operations', icon: ClipboardList },
    { label: 'Master / Slave', href: '/master-slave', icon: RadioTower },
    { label: 'Contas', href: '/accounts', icon: Wallet },
    { label: 'Prop firms', href: '/prop-firms', icon: Building2 },
    { label: 'Payouts', href: '/payouts', icon: CircleDollarSign },
  ] },
  { label: 'INTELIGÊNCIA', items: [
    { label: 'Hunter', href: '/hunter', icon: Bot },
    { label: 'Hunter Versions', href: '/hunter-versions', icon: GitBranch },
    { label: 'Experiments', href: '/experiments', icon: FlaskConical },
    { label: 'Simulador de gerenciamento', href: '/account-simulator', icon: Gauge },
    { label: 'HSG', href: '/hsg', icon: Sparkles },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Desempenho', href: '/performance', icon: Activity },
  ] },
  { label: 'CONTROLE', items: [
    { label: 'Diário de trading', href: '/trading-journal', icon: BookOpen },
    { label: 'Auditoria', href: '/audit', icon: ScrollText },
    { label: 'Relatórios', href: '/reports', icon: Download },
    { label: 'Alertas', href: '/alerts', icon: Bell },
    { label: 'Integrações', href: '/integrations', icon: Radio },
  ] },
]

export const allNavigationItems = navigationSections.flatMap((section) => section.items)

export function navigationItemForPath(pathname: string): NavigationItem {
  return allNavigationItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? allNavigationItems[0]
}
