import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ninja Control · Trading Intelligence',
  description: 'Painel demonstrativo de operações, desempenho e gestão de risco para trading.',
  generator: 'v0.app',
  icons: {
    icon: [{ url: '/brand/ninja-control-mark-64.png', sizes: '64x64', type: 'image/png' }],
    apple: [{ url: '/brand/ninja-control-mark-180.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
