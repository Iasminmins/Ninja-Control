'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { authClient } from '@/lib/auth/client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const signingUp = mode === 'sign-up'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? '').trim()

    try {
      const result = signingUp
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password })

      if (result.error) {
        setError(result.error.message || 'Não foi possível autenticar. Confira seus dados e tente novamente.')
        return
      }

      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError('Não foi possível conectar ao serviço de autenticação. Tente novamente em instantes.')
    } finally {
      setPending(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#090a0c] px-5 py-12 text-zinc-100">
    <section className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-[#111416] p-7 shadow-2xl sm:p-9">
      <Link href="/" className="mb-9 block w-fit" aria-label="Ninja Control">
        <Image src="/brand/ninja-control-horizontal-original.png" alt="Ninja Control — Trading Intelligence" width={2048} height={664} priority className="h-auto w-[300px] max-w-full object-contain mix-blend-screen" />
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{signingUp ? 'Criar sua conta' : 'Acesse seu workspace'}</h1>
      <p className="mt-2 text-sm text-zinc-400">{signingUp ? 'Crie seu acesso para continuar no Ninja Control.' : 'Entre com o e-mail e a senha da sua conta.'}</p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        {signingUp && <label className="block text-xs text-zinc-400">Nome
          <input name="name" type="text" autoComplete="name" required minLength={2} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-[#c5ef58]/60" />
        </label>}
        <label className="block text-xs text-zinc-400">E-mail
          <input name="email" type="email" autoComplete="email" required className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-[#c5ef58]/60" />
        </label>
        <label className="block text-xs text-zinc-400">Senha
          <input name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} required minLength={8} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-[#c5ef58]/60" />
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2.5 text-xs text-red-300">{error}</p>}
        <button disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#c5ef58] px-4 text-sm font-semibold text-[#15180c] transition hover:bg-[#d2f77b] disabled:cursor-wait disabled:opacity-70">
          {pending && <LoaderCircle className="size-4 animate-spin" />}{pending ? 'Aguarde…' : signingUp ? 'Criar conta' : 'Entrar'}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-zinc-500">{signingUp ? 'Já tem acesso?' : 'Ainda não tem acesso?'}{' '}
        <Link href={signingUp ? '/auth/sign-in' : '/auth/sign-up'} className="font-medium text-[#c5ef58] hover:underline">{signingUp ? 'Entrar' : 'Criar conta'}</Link>
      </p>
    </section>
  </main>
}
