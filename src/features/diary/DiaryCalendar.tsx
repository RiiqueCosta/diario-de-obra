import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@/app/router'
import { useQuery } from '@/lib/useQuery'
import { todayISO } from '@/lib/format'
import { REPORT_STATUS } from '@/lib/labels'
import { Badge, Button, ErrorBox, Loading, Panel } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { listReportsInRange } from './api'

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function monthInfo(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { offset: first.getUTCDay(), days, iso, from: iso(1), to: iso(days), label: first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
}

/** Calendário do diário de uma obra: mostra a situação de cada dia e abre ou cria o registro. */
export function DiaryCalendar({ projectId, canCreate, startDate }: { projectId: string; canCreate: boolean; startDate?: string | null }) {
  const navigate = useNavigate()
  const today = todayISO()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const info = monthInfo(ym.y, ym.m)
  const q = useQuery(`reports:calendar:${projectId}:${info.from}`, () => listReportsInRange(projectId, info.from, info.to))

  const byDay = useMemo(() => {
    const map = new Map<string, Array<{ id: string; kind: string; status: keyof typeof REPORT_STATUS }>>()
    for (const r of q.data ?? []) map.set(r.report_date, [...(map.get(r.report_date) ?? []), r])
    return map
  }, [q.data])

  const shift = (d: number) => setYm(({ y, m }) => { const n = m + d; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 } })
  const cells = [...Array(info.offset).fill(null), ...Array.from({ length: info.days }, (_, i) => i + 1)]
  const missing = Array.from({ length: info.days }, (_, i) => info.iso(i + 1))
    .filter((d) => d <= today && (!startDate || d >= startDate) && !byDay.has(d) && new Date(`${d}T12:00:00Z`).getUTCDay() !== 0).length

  return (
    <Panel title={info.label.charAt(0).toUpperCase() + info.label.slice(1)}
      actions={<div className="row">
        <Button size="sm" variant="secondary" icon="voltar" onClick={() => shift(-1)} aria-label="Mês anterior" />
        <Button size="sm" variant="secondary" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>Hoje</Button>
        <Button size="sm" variant="secondary" icon="avancar" onClick={() => shift(1)} aria-label="Próximo mês" />
      </div>}>
      <ErrorBox error={q.error} onRetry={q.refetch} />
      {q.loading && !q.data ? <Loading /> : (
        <>
          <div className="cal" role="grid">
            {WEEK.map((w) => <div key={w} className="cal-head" role="columnheader">{w}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={`v${i}`} className="cal-cell empty" />
              const iso = info.iso(d)
              const items = byDay.get(iso) ?? []
              const main = items.find((x) => x.kind === 'principal')
              const isFuture = iso > today
              const cls = `cal-cell${iso === today ? ' today' : ''}${isFuture ? ' future' : ''}${main ? ` st-${main.status}` : ''}`
              const label = `${d}: ${main ? REPORT_STATUS[main.status].label : isFuture ? 'futuro' : 'sem diário'}`
              if (main) return (
                <Link key={iso} to={`/diarios/${main.id}`} className={cls} aria-label={label}>
                  <span className="cal-day">{d}</span>
                  <span className="cal-dot" />
                  {items.length > 1 && <span className="cal-extra">+{items.length - 1}</span>}
                </Link>
              )
              return (
                <button key={iso} type="button" className={cls} aria-label={label} disabled={isFuture || !canCreate}
                  onClick={() => navigate(`/diarios/novo?obra=${projectId}&data=${iso}`)}>
                  <span className="cal-day">{d}</span>
                  {!isFuture && canCreate && <Icon name="mais" size={14} className="cal-add" />}
                </button>
              )
            })}
          </div>
          <div className="row mt-16 small">
            {(['aprovado', 'enviado', 'devolvido', 'rascunho'] as const).map((s) => <span key={s} className="row" style={{ gap: 6 }}><span className={`cal-key st-${s}`} />{REPORT_STATUS[s].label}</span>)}
          </div>
          {missing > 0 && <p className="mt-8"><Badge tone="yellow">{missing} {missing === 1 ? 'dia útil sem diário' : 'dias úteis sem diário'} neste mês</Badge></p>}
        </>
      )}
    </Panel>
  )
}
