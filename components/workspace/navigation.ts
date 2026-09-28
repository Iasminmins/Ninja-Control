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
  Flame,
  CircleDollarSign,
  ScrollText,
  Building2,
  RadioTower,
  Microscope,
  GitBranch,
  FlaskConical,
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
    { label: 'Operações', href: '/operations', icon: ClipboardList },
    { label: 'Master / Slave', href: '/master-slave', icon: RadioTower },
    { label: 'Contas', href: '/accounts', icon: Wallet },
    { label: 'Prop firms', href: '/prop-firms', icon: Building2 },
    { label: 'Payouts', href: '/payouts', icon: CircleDollarSign },
    { label: 'Risco', href: '/risk-command', icon: ShieldCheck },
  ] },
  { label: 'INTELIGÊNCIA', items: [
    { label: 'Hunter', href: '/hunter', icon: Bot },
    { label: 'Hunter Versions', href: '/hunter-versions', icon: GitBranch },
    { label: 'Experiments', href: '/experiments', icon: FlaskConical },
    { label: 'HSG', href: '/hsg', icon: Sparkles },
    { label: 'HSD', href: '/hsd', icon: Sparkles },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    { label: 'Pattern Lab', href: '/pattern-lab', icon: Microscope },
    { label: 'Desempenho', href: '/performance', icon: Activity },
    { label: 'Contexto de Mercado', href: '/market-context', icon: Flame },
    { label: 'Comparador', href: '/comparator', icon: LineChart },
    { label: 'Estratégias', href: '/strategies', icon: SlidersHorizontal },
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
