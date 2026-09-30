export function parseDelimited(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1 }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
    } else cell += char
  }
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}
