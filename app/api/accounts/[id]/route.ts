import { NextResponse } from 'next/server'
import { parseAccountInput, requireWorkspace, setWorkspaceAccountArchived, setWorkspaceAccountStatus, updateWorkspaceAccount } from '@/lib/accounts/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const access = await requireWorkspace()
    if (!access) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401 })
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Conta inválida.' }, { status: 400 })
    const body = await request.json() as Record<string, unknown>

    if (typeof body.archived === 'boolean') {
      const result = await setWorkspaceAccountArchived(access.workspace.id, access.user.id, id, body.archived)
      return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
    }

    if (['active', 'paused', 'breached'].includes(String(body.accountStatus))) {
      const result = await setWorkspaceAccountStatus(access.workspace.id, access.user.id, id, body.accountStatus as 'active' | 'paused' | 'breached')
      return result ? NextResponse.json({ ok: true, accountStatus: result.status }) : NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
    }

    const input = parseAccountInput(body)
    if (!input) return NextResponse.json({ error: 'Confira os campos e valores informados.' }, { status: 400 })
    const result = await updateWorkspaceAccount(access.workspace.id, access.user.id, id, input)
    return result ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível atualizar a conta.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
