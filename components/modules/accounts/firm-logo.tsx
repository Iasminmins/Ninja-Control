'use client'

import { useState } from 'react'

const firmLogoAssets: Record<string, string> = {
  apex: '/firm-logos/apex.png',
  topstep: '/firm-logos/topstep.webp',
  takeprofit: '/firm-logos/takeprofit.svg',
  'take profit trader': '/firm-logos/takeprofit.svg',
  myfundedfutures: '/firm-logos/myfundedfutures.svg',
  'my funded futures': '/firm-logos/myfundedfutures.svg',
  'the premier': '/firm-logos/myfundedfutures.svg',
  'funded futures family': '/firm-logos/fundedfuturesfamily-mark.png',
  fundedfuturesfamily: '/firm-logos/fundedfuturesfamily-mark.png',
  fff: '/firm-logos/fundedfuturesfamily-mark.png',
}

const squareFirmLogos = new Set(['apex', 'funded futures family', 'fundedfuturesfamily', 'fff'])

function normalizeFirm(firm: string) {
  return firm.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
}

export function firmLogoSource(firm: string, customLogoUrl?: string) {
  const custom = customLogoUrl?.trim()
  if (custom && /^https:\/\//i.test(custom)) return custom
  const normalized = normalizeFirm(firm)
  const logo = firmLogoAssets[normalized]
  if (logo) return logo
  return null
}

export function hasFirmLogo(firm: string, customLogoUrl?: string) {
  return firmLogoSource(firm, customLogoUrl) !== null
}

export function FirmLogo({ firm, customLogoUrl, size = 40 }: {
  firm: string
  customLogoUrl?: string
  size?: number
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const src = firmLogoSource(firm, customLogoUrl)
  const initials = firm.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'

  const width = size * (squareFirmLogos.has(normalizeFirm(firm)) ? 1 : 2.5)

  return <span className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-[10px] font-bold text-zinc-300" style={{ width, height: size }} aria-label={`Logo ${firm}`}>
    {src && failedSource !== src ? <img src={src} alt={`Logo ${firm}`} width={size} height={size} className="h-full w-full object-contain p-1" onError={() => setFailedSource(src)} /> : initials}
  </span>
}

export const supportedFirms = [
  'Apex',
  'Topstep',
  'TakeProfit',
  'MyFundedFutures',
  'Futures Prop Firm',
  'Funded Futures Family',
]
