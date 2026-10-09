import { useState } from 'react'
import { useOrg } from '@/auth/AuthProvider'
import { supabase, type Json } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { useQuery } from '@/lib/useQuery'
import { formatDateTime } from '@/lib/format'
import { ACTION_LABEL, ENTITY_LABEL, FIELD_LABEL } from '@/lib/labels'
import { Badge, Button, EmptyState, ErrorBox, Loading, PageHeader, Panel, SelectField } from '@/ui/components'

const PAGE = 30
const HIDDEN = new Set(['updated_at', 'row_version', 'created_at', 'id', 'organization_id', 'project_id', 'created_by'])

function diff(prev: Json | null, next: Json | null): Array<{ field: string; from: unknown; to: unknown }> {
  const a = (prev && typeof prev === 'object' && !Array.isArray(prev) ? prev : {}) as Record<string, unknown>
  const b = (next && typeof next === 'object' && !Array.isArray(next) ? next : {}) as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out: Array<{ field: string; from: unknown; to: unknown }> = []
  for (const k of keys) {
    if (HIDDEN.has(k)) continue
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ field: k, from: a[k], to: b[k] })
  }
  return out
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/')
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Lista de auditoria; com projectId mostra só os eventos da obra. Visível apenas a administradores (RLS). */
export function AuditList({ projectId, entity }: { projectId?: string; entity?: string }) {
  const org = useOrg()
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const key = `audit:${org.organization_id}:${projectId ?? ''}:${entity ?? ''}:${page}`
  const q = useQuery(key, async () => {
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).eq('organization_id', org.organization_id)
    if (projectId) query = query.eq('project_id', projectId)
    if (entity) query = query.eq('entity_type', entity)
    const res = await query.order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    const rows = unwrap(res) ?? []
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[]
    const names: Record<string, string> = {}
    if (userIds.length) {
      const people = unwrap(await supabase.from('profiles').select('id, name, email').in('id', userIds)) ?? []
      for (const p of people) names[p.id] = p.name || p.email
    }
    return { rows, total: res.count ?? 0, names }
  })

  if (q.loading && !q.data) return <Loading />
  if (q.error) return <ErrorBox error={q.error} onRetry={q.refetch} />
  if (!q.data || q.data.rows.length === 0) return <EmptyState icon="historico" title="Nenhum registro de auditoria">As ações importantes aparecem aqui assim que acontecem.</EmptyState>
  const pages = Math.ceil(q.data.total / PAGE)

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Data e hora</th><th>Quem</th><th>O quê</th><th>Ação</th><th>Detalhes</th></tr></thead>
          <tbody>
            {q.data.rows.map((r) => {
              const changes = diff(r.previous_values, r.new_values)
              const name = (r.new_values as Record<string, unknown> | null)?.name ?? (r.previous_values as Record<string, unknown> | null)?.name
              return (
                <tr key={r.id}>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.created_at)}</td>
                  <td>{r.user_id ? q.data!.names[r.user_id] ?? 'Usuário removido' : <span className="muted">Sistema</span>}</td>
                  <td>{ENTITY_LABEL[r.entity_type] ?? r.entity_type}{typeof name === 'string' && <div className="muted small">{name}</div>}</td>
                  <td><Badge tone={r.action === 'delete' ? 'red' : r.action === 'insert' ? 'green' : r.action === 'archive' ? 'yellow' : 'blue'}>{ACTION_LABEL[r.action] ?? r.action}</Badge></td>
                  <td>
                    {r.action === 'update' || r.action === 'archive' ? (
                      <>
                        <button type="button" className="link-btn" onClick={() => setOpen(open === r.id ? null : r.id)}>
                          {changes.length} {changes.length === 1 ? 'campo alterado' : 'campos alterados'}
                        </button>
                        {open === r.id && (
                          <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                            {changes.map((c) => <li key={c.field}><strong>{FIELD_LABEL[c.field] ?? c.field}:</strong> {show(c.from)} → {show(c.to)}</li>)}
                          </ul>
                        )}
                      </>
                    ) : <span className="muted small">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <span>Página {page + 1} de {pages}</span>
          <div className="row">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </>
  )
}

export function AuditPage() {
  const [entity, setEntity] = useState('')
  return (
    <>
      <PageHeader title="Histórico de auditoria" subtitle="Quem fez o quê e quando. Os registros são gravados pelo banco de dados e não podem ser editados." />
      <div className="toolbar">
        <SelectField label="Tipo de registro" value={entity} onChange={(e) => setEntity(e.target.value)} placeholder="Todos"
          options={Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }))} />
      </div>
      <Panel padded={false}><AuditList entity={entity || undefined} /></Panel>
    </>
  )
}
