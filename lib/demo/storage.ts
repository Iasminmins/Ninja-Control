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

function hasDemoCollections(value: Record<string, unknown>): boolean {
  return Array.isArray(value.accounts)
    && Array.isArray(value.trades)
    && Array.isArray(value.strategies)
    && Array.isArray(value.payouts)
    && Array.isArray(value.operationEvents)
    && Array.isArray(value.riskRules)
    && Array.isArray(value.alertRules)
    && Array.isArray(value.alertEvents)
    && Array.isArray(value.journalEntries)
    && Array.isArray(value.integrations)
}

function migrateDemoWorkspace(value: unknown): DemoWorkspace | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (!hasDemoCollections(candidate)) return null

  if (candidate.schemaVersion === 1) {
    return {
      ...candidate,
      schemaVersion: 2,
      mode: 'demo',
      updatedAt: new Date().toISOString(),
    } as unknown as DemoWorkspace
  }

  if (candidate.schemaVersion === 2 && candidate.mode === 'demo' && typeof candidate.updatedAt === 'string') {
    return candidate as unknown as DemoWorkspace
  }

  return null
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
    const migrated = migrateDemoWorkspace(parsed)
    if (migrated) {
      if (migrated.schemaVersion !== (parsed as Record<string, unknown>).schemaVersion) {
        saveDemoWorkspace(migrated, source)
      }
      return { workspace: migrated, recovered: false, storageAvailable: true }
    }
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
  const next = { ...updater(loadDemoWorkspace()), updatedAt: new Date().toISOString() }
  saveDemoWorkspace(next)
  return next
}
