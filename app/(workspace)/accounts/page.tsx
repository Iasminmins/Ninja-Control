import { PersistedAccountsScreen } from '@/components/modules/accounts/persisted-accounts-screen'
import { listWorkspaceAccounts, requireWorkspace } from '@/lib/accounts/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const access = await requireWorkspace()
  if (!access) redirect('/auth/sign-in')
  try {
    const accounts = await listWorkspaceAccounts(access.workspace.id)
    return <PersistedAccountsScreen initialAccounts={accounts} />
  } catch {
    return <PersistedAccountsScreen initialAccounts={[]} loadError="Não foi possível consultar o Neon. Confira a conexão do banco e recarregue a página." />
  }
}
