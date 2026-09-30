import { auth } from '@/lib/auth/server'

export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!api/auth|api/experiment-csv-files/upload|api/integrations/hunter-webhook/events|api/integrations/ninjatrader-desktop/events|auth|downloads|_next/static|_next/image|favicon.ico).*)'],
}
