import { NextResponse } from 'next/server'
import { createWorkspaceAccount, listWorkspaceAccounts, parseAccountInput, requireWorkspace } from '@/lib/accounts/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const accounts = await listWorkspaceAccounts(access.workspace.id)
    return NextResponse.json({ accounts })
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as contas.' }, { status: process.env.DATABASE_URL ? 500 : 503 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const input = parseAccountInput(await request.json())
    if (!input) return NextResponse.json({ error: 'Confira nome, prop firm, etapa, tipo e valores informados.' }, { status: 400 })
    const account = await createWorkspaceAccount(access.workspace.id, access.user.id, input)
    return NextResponse.json({ account: { id: account.id } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível salvar a conta.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
