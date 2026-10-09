// Formatação em português do Brasil. Datas DD/MM/AAAA, horas 24h, valores em R$.
const TZ = 'America/Sao_Paulo'

/** Converte 'AAAA-MM-DD' (data pura do banco) em DD/MM/AAAA sem deslocamento de fuso. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (m && value.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { timeZone: TZ })
}

/** Data e hora (timestamptz) em DD/MM/AAAA HH:mm, fuso de São Paulo. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR', { timeZone: TZ })} ${d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })}`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 5)
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits })
}

/** Data de hoje em São Paulo no formato do banco (AAAA-MM-DD). */
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return parts // en-CA já produz AAAA-MM-DD
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Partes da data para o "carimbo" visual: dia, mês abreviado, ano, dia da semana. */
export function dateStamp(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return {
    day: String(d).padStart(2, '0'),
    month: dt.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
    year: String(y),
    weekday: dt.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }),
  }
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatDocument(value: string | null | undefined): string {
  if (!value) return '—'
  const d = onlyDigits(value)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value
}

/** Máscara progressiva para digitação de CPF/CNPJ. */
export function maskDocument(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w))
  if (!parts.length) return '?'
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}
