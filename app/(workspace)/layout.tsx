import type { ReactNode } from 'react'
import { AppShell } from '@/components/workspace/app-shell'
import { DemoWorkspaceProvider } from '@/hooks/use-demo-workspace'

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <DemoWorkspaceProvider>
      <AppShell>{children}</AppShell>
    </DemoWorkspaceProvider>
  )
}
