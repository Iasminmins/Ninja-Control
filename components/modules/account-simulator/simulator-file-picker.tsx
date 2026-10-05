'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { upload } from '@vercel/blob/client'
import { AlertTriangle, FileSpreadsheet, FolderOpen, Trash2, Upload } from 'lucide-react'
import { parseNinjaTraderGridTradesCsv } from '@/lib/account-simulator/ninjatrader-grid-csv'
import type { TradeCsvAnalysis } from '@/lib/account-simulator/trade-csv'

export type SimulatorFile = { id: string; fileName: string; byteSize: number; format: 'hsg' | 'grid' | 'trades'; createdAt: string }

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

function formatLabel(format: SimulatorFile['format']) {
  return format === 'trades' ? 'NinjaTrader Grid · trades individuais' : 'Formato incompatível'
}

export function SimulatorFilePicker({ files, selectedFileIds, onFilesChange, onSelectionChange, onAnalysis }: {
  files: SimulatorFile[]
  selectedFileIds: string[]
  onFilesChange: (files: SimulatorFile[]) => void
  onSelectionChange: (ids: string[]) => void
  onAnalysis: (id: string, analysis: TradeCsvAnalysis) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [prefix, setPrefix] = useState('')
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshLibrary() {
    const response = await fetch('/api/experiment-csv-files', { cache: 'no-store' })
    const body = await response.json().catch(() => ({})) as { files?: SimulatorFile[]; uploadPrefix?: string; error?: string }
    if (!response.ok || !Array.isArray(body.files) || !body.uploadPrefix) throw new Error(body.error ?? 'A biblioteca privada de CSVs não está disponível.')
    setPrefix(body.uploadPrefix)
    onFilesChange(body.files)
  }

  async function loadFile(file: SimulatorFile) {
    setBusyId(file.id); setError(''); setMessage(`Lendo ${file.fileName}…`)
    try {
      const response = await fetch(`/api/experiment-csv-files/${file.id}`, { cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? 'Não foi possível abrir o CSV.')
      const analysis = parseNinjaTraderGridTradesCsv(file.fileName, await response.text())
      onAnalysis(file.id, analysis)
      onSelectionChange(selectedFileIds.includes(file.id) ? selectedFileIds : [...selectedFileIds, file.id])
      setMessage(`${file.fileName} carregado para a simulação.`)
    } catch (cause) {
      setError(`${file.fileName}: ${cause instanceof Error ? cause.message : 'não foi possível ler o arquivo.'}`)
      setMessage('')
    } finally { setBusyId('') }
  }

  async function addFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setError(''); setMessage('Validando o arquivo…'); setBusyId('upload')
    try {
      if (!file.name.toLowerCase().endsWith('.csv') || file.size > 25 * 1024 * 1024) throw new Error('Selecione um CSV de até 25 MB.')
      const analysis = parseNinjaTraderGridTradesCsv(file.name, await file.text())
      let uploadPrefix = prefix
      if (!uploadPrefix) {
        const response = await fetch('/api/experiment-csv-files', { cache: 'no-store' })
        const library = await response.json().catch(() => ({})) as { uploadPrefix?: string; error?: string }
        if (!response.ok || !library.uploadPrefix) throw new Error(library.error ?? 'Armazenamento não configurado.')
        uploadPrefix = library.uploadPrefix
        setPrefix(uploadPrefix)
      }
      const id = crypto.randomUUID()
      const safeName = file.name.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 255)
      setMessage(`Salvando ${file.name}…`)
      await upload(`${uploadPrefix}${id}-${safeName}`, file, {
        access: 'private', contentType: 'text/csv', handleUploadUrl: '/api/experiment-csv-files/upload',
        clientPayload: JSON.stringify({ fileId: id, fileName: file.name }), multipart: file.size > 4.5 * 1024 * 1024,
      })
      const deadline = Date.now() + 15_000
      let saved: SimulatorFile | undefined
      while (Date.now() < deadline && !saved) {
        const response = await fetch('/api/experiment-csv-files', { cache: 'no-store' })
        const library = await response.json().catch(() => ({})) as { files?: SimulatorFile[]; uploadPrefix?: string; error?: string }
        if (!response.ok || !Array.isArray(library.files)) throw new Error(library.error ?? 'Não foi possível confirmar o CSV salvo.')
        setPrefix(library.uploadPrefix ?? uploadPrefix)
        onFilesChange(library.files)
        saved = library.files.find((item) => item.id === id)
        if (!saved) await new Promise((resolve) => window.setTimeout(resolve, 500))
      }
      if (!saved) throw new Error('O upload terminou, mas o registro ainda não apareceu na biblioteca. Atualize a lista antes de reenviar.')
      onAnalysis(saved.id, analysis)
      onSelectionChange([...new Set([...selectedFileIds, saved.id])])
      setMessage(`${file.name} salvo e selecionado para simulação.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o arquivo.')
      setMessage('')
    } finally { setBusyId('') }
  }

  async function deleteFile(file: SimulatorFile) {
    if (!window.confirm(`Excluir permanentemente ${file.fileName}? Cenários que o usam continuarão salvos e mostrarão a fonte como indisponível.`)) return
    setBusyId(file.id); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/experiment-csv-files/${file.id}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível excluir o arquivo.')
      onFilesChange(files.filter((candidate) => candidate.id !== file.id))
      onSelectionChange(selectedFileIds.filter((id) => id !== file.id))
      setMessage(`${file.fileName} excluído da biblioteca.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir o arquivo.') }
    finally { setBusyId('') }
  }

  return <section className="rounded-xl border border-white/[0.07] bg-[#111315] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-zinc-100">Arquivos para simular</h2><p className="mt-1 text-[10px] leading-5 text-zinc-500">Aceita somente o CSV de trades individuais exportado pelo NinjaTrader Grid, no formato do arquivo de exemplo.</p></div><div><input ref={input} type="file" accept=".csv,text/csv" onChange={(event) => void addFile(event)} className="sr-only" /><button type="button" disabled={Boolean(busyId)} onClick={() => input.current?.click()} className="primary-button min-h-9 px-3 text-[10px] disabled:opacity-50"><Upload className="size-3.5" />Enviar CSV</button></div></div>
    {(error || message) && <p role={error ? 'alert' : 'status'} className={`mt-3 rounded-lg border p-3 text-[10px] leading-5 ${error ? 'border-rose-300/20 bg-rose-300/[0.04] text-rose-200' : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'}`}>{error || message}</p>}
    {files.length ? <div className="mt-4 space-y-2">{files.map((file) => {
      const selected = selectedFileIds.includes(file.id)
      return <article key={file.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${selected ? 'border-[#b9f227]/25 bg-[#b9f227]/[0.025]' : 'border-white/[0.06] bg-black/10'}`}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"><input type="checkbox" checked={selected} onChange={() => selected ? onSelectionChange(selectedFileIds.filter((id) => id !== file.id)) : void loadFile(file)} className="mt-1 accent-[#b9f227]" /><span className="min-w-0"><span className="block truncate text-xs text-zinc-200">{file.fileName}</span><span className="mt-1 block text-[9px] text-zinc-500">{formatLabel(file.format)} · {sizeLabel(file.byteSize)}</span></span></label>
        <div className="flex shrink-0 gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => void loadFile(file)} className="secondary-button min-h-8 px-2.5 text-[9px] disabled:opacity-50"><FolderOpen className="size-3.5" />{busyId === file.id ? 'Lendo…' : 'Ler CSV'}</button><button type="button" disabled={Boolean(busyId)} onClick={() => void deleteFile(file)} aria-label={`Excluir ${file.fileName}`} className="secondary-button min-h-8 px-2 text-rose-200 disabled:opacity-50"><Trash2 className="size-3.5" /></button></div>
      </article>
    })}</div> : <div className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-center"><FileSpreadsheet className="mx-auto size-5 text-zinc-600" /><p className="mt-2 text-xs text-zinc-300">Nenhum CSV salvo</p><p className="mt-1 text-[10px] text-zinc-500">Envie o CSV de trades individuais do NinjaTrader Grid.</p></div>}
    <p className="mt-3 flex items-start gap-2 text-[9px] leading-5 text-zinc-600"><AlertTriangle className="mt-0.5 size-3 shrink-0" />Excluir um CSV remove o original do armazenamento. Cenários associados não são apagados, mas deixam de poder recalcular essa fonte.</p>
  </section>
}
