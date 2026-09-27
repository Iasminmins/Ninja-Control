'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createInitialDemoWorkspace } from '@/lib/demo/seed'
import { readDemoWorkspace, resetDemoWorkspace, saveDemoWorkspace, subscribeToDemoWorkspace } from '@/lib/demo/storage'
import type { DemoWorkspace } from '@/lib/demo/types'

interface DemoWorkspaceContextValue {
  workspace: DemoWorkspace
  hydrated: boolean
  storageNotice: string | null
  updateWorkspace: (updater: (current: DemoWorkspace) => DemoWorkspace) => void
  resetWorkspace: () => void
}

const DemoWorkspaceContext = createContext<DemoWorkspaceContextValue | null>(null)

export function DemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<DemoWorkspace>(() => createInitialDemoWorkspace())
  const [hydrated, setHydrated] = useState(false)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const workspaceRef = useRef(workspace)

  useEffect(() => {
    const result = readDemoWorkspace()
    workspaceRef.current = result.workspace
    setWorkspace(result.workspace)
    setStorageNotice(result.recovered ? 'Os dados salvos estavam inválidos. Restauramos a demonstração inicial.' : result.storageAvailable ? null : 'O navegador não permite salvar alterações; elas durarão apenas nesta sessão.')
    setHydrated(true)
    return subscribeToDemoWorkspace(() => {
      const latest = readDemoWorkspace()
      workspaceRef.current = latest.workspace
      setWorkspace(latest.workspace)
    })
  }, [])

  const updateWorkspace = useCallback((updater: (current: DemoWorkspace) => DemoWorkspace) => {
    const next = { ...updater(workspaceRef.current), updatedAt: new Date().toISOString() }
    workspaceRef.current = next
    setWorkspace(next)
    setStorageNotice(saveDemoWorkspace(next) ? null : 'Não foi possível salvar neste navegador. As alterações existem apenas nesta sessão.')
  }, [])

  const resetWorkspace = useCallback(() => {
    const fresh = resetDemoWorkspace()
    workspaceRef.current = fresh
    setWorkspace(fresh)
    setStorageNotice('Demonstração restaurada para os dados iniciais.')
  }, [])

  const value = useMemo(() => ({ workspace, hydrated, storageNotice, updateWorkspace, resetWorkspace }), [workspace, hydrated, storageNotice, updateWorkspace, resetWorkspace])
  return <DemoWorkspaceContext.Provider value={value}>{children}</DemoWorkspaceContext.Provider>
}

export function useDemoWorkspace(): DemoWorkspaceContextValue {
  const context = useContext(DemoWorkspaceContext)
  if (!context) throw new Error('useDemoWorkspace precisa estar dentro de DemoWorkspaceProvider')
  return context
}
