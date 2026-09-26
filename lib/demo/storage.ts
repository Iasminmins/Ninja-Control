import { createInitialDemoWorkspace } from './seed'
import type { DemoWorkspace, StorageLike } from './types'

export const DEMO_STORAGE_KEY = 'ninja-control.demo.v1'
function browserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isDemoWorkspace(value: unknown): value is DemoWorkspace {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<DemoWorkspace>
  return candidate.schemaVersion === 1
    && Array.isArray(candidate.accounts)
    && Array.isArray(candidate.trades)
    && Array.isArray(candidate.strategies)
    && Array.isArray(candidate.payouts)
    && Array.isArray(candidate.operationEvents)
    && Array.isArray(candidate.riskRules)
    && Array.isArray(candidate.alertRules)
    && Array.isArray(candidate.alertEvents)
    && Array.isArray(candidate.journalEntries)
    && Array.isArray(candidate.integrations)
}

export function subscribeToDemoWorkspace(listener: () => void): () => void {
  const handle = (event: StorageEvent) => {
    if (event.key === DEMO_STORAGE_KEY || event.key === null) listener()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handle)
  }
  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('storage', handle)
  }
}

export interface DemoWorkspaceLoadResult {
  workspace: DemoWorkspace
  recovered: boolean
  storageAvailable: boolean
}

export function readDemoWorkspace(storage?: StorageLike): DemoWorkspaceLoadResult {
  const source = storage ?? browserStorage()
  if (!source) return { workspace: createInitialDemoWorkspace(), recovered: false, storageAvailable: false }
  try {
    const raw = source.getItem(DEMO_STORAGE_KEY)
    if (!raw) return { workspace: createInitialDemoWorkspace(), recovered: false, storageAvailable: true }
    const parsed: unknown = JSON.parse(raw)
    if (isDemoWorkspace(parsed)) return { workspace: parsed, recovered: false, storageAvailable: true }
    return { workspace: createInitialDemoWorkspace(), recovered: true, storageAvailable: true }
  } catch {
    return { workspace: createInitialDemoWorkspace(), recovered: true, storageAvailable: true }
  }
}

export function loadDemoWorkspace(storage?: StorageLike): DemoWorkspace {
  return readDemoWorkspace(storage).workspace
}

export function saveDemoWorkspace(workspace: DemoWorkspace, storage?: StorageLike): boolean {
  const destination = storage ?? browserStorage()
  if (!destination) return false
  try {
    destination.setItem(DEMO_STORAGE_KEY, JSON.stringify(workspace))
    return true
  } catch {
    return false
  }
}

export function resetDemoWorkspace(storage?: StorageLike): DemoWorkspace {
  const fresh = createInitialDemoWorkspace()
  const destination = storage ?? browserStorage()
  try {
    destination?.removeItem(DEMO_STORAGE_KEY)
  } catch {
    // Keep the fresh in-memory workspace if the browser rejects storage access.
  }
  if (destination) saveDemoWorkspace(fresh, destination)
  return fresh
}

export function updateDemoWorkspace(updater: (current: DemoWorkspace) => DemoWorkspace): DemoWorkspace {
  const next = updater(loadDemoWorkspace())
  saveDemoWorkspace(next)
  return next
}
