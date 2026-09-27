export const propFirmCatalog = [
  { name: 'Apex', websiteUrl: 'https://apextraderfunding.com/', logoUrl: '/firm-logos/apex.png' },
  { name: 'Topstep', websiteUrl: 'https://www.topstep.com/', logoUrl: '/firm-logos/topstep.webp' },
  { name: 'Take Profit Trader', websiteUrl: 'https://takeprofittrader.com/', logoUrl: '/firm-logos/takeprofit.svg' },
  { name: 'MyFundedFutures', websiteUrl: 'https://myfundedfutures.com/', logoUrl: '/firm-logos/myfundedfutures.svg' },
  { name: 'Funded Futures Family', websiteUrl: 'https://www.fundedfuturesfamily.com/', logoUrl: '/firm-logos/fundedfuturesfamily.svg' },
] as const

export function resolvePropFirm(name: string, customLogoUrl?: string | null) {
  const normalized = name.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ')
  const aliases: Record<string, string> = {
    takeprofit: 'take profit trader',
    'the premier': 'myfundedfutures',
  }
  const canonical = aliases[normalized] ?? normalized
  const known = propFirmCatalog.find((firm) => firm.name.toLocaleLowerCase('en-US') === canonical)
  const custom = customLogoUrl?.trim()
  if (known) return known
  if (!custom || !/^https:\/\//i.test(custom)) return null
  return { name: name.trim(), websiteUrl: null, logoUrl: custom } as const
}
