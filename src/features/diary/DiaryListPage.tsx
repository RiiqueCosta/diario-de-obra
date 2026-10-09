import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { useQuery } from '@/lib/useQuery'
import { addDaysISO, formatDate, formatDateTime, todayISO } from '@/lib/format'
import { REPORT_STATUS, options } from '@/lib/labels'
import { Badge, Button, Checkbox, EmptyState, ErrorBox, FilterPanel, Loading, PageHeader, Panel, SelectField, TextField } from '@/ui/components'
import { useProjectOptions } from '../projects/hooks'
import { DateStamp } from '../dashboard/DashboardPage'
import { listReports } from './api'

export function DiaryListPage() {
  const org = useOrg()
  const { session } = useAuth()
  const navigate = useNavigate()
  const params = useSearchParams()
  const projects = useProjectOptions(org.organization_id, true)
  const [project, setProject] = useState(params.get('obra') ?? '')
  const [status, setStatus] = useState(params.get('situacao') ?? '')
  const [mine, setMine] = useState(params.get('meus') === '1')
  const [from, setFrom] = useState(params.get('de') ?? addDaysISO(todayISO(), -60))
  const [to, setTo] = useState(params.get('ate') ?? todayISO())
  const [page, setPage] = useState(0)

  useEffect(() => { setPage(0) }, [project, status, mine, from, to])
  useEffect(() => {
    const q = new URLSearchParams()
    if (project) q.set('obra', project)
    if (status) q.set('situacao', status)
    if (mine) q.set('meus', '1')
    q.set('de', from); q.set('ate', to)
    window.history.replaceState(null, '', `/diarios?${q}`)
  }, [project, status, mine, from, to])

  const key = `reports:list:${org.organization_id}:${project}:${status}:${mine}:${from}:${to}:${page}`
  const q = useQuery(key, () => listReports({ orgId: org.organization_id, projectId: project || undefined, status: status || undefined, authorId: mine ? session?.user.id : undefined, from, to, page }))
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1
  const active = [project, status, mine ? '1' : ''].filter(Boolean).length
  const projectName = useMemo(() => projects.data?.find((p) => p.id === project)?.name, [projects.data, project])

  return (
    <>
      <PageHeader title="Diários de obra" subtitle={projectName ? `Registros de ${projectName}.` : 'Registros diários de todas as obras que você acessa.'}
        actions={<Button icon="mais" size="lg" onClick={() => navigate(`/diarios/novo${project ? `?obra=${project}` : ''}`)}>Novo diário</Button>} />
      <FilterPanel active={active}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Todas" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todas" options={options(REPORT_STATUS)} />
          <TextField label="De" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Até" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <div style={{ alignSelf: 'center', paddingTop: 22 }}><Checkbox label="Só os meus" checked={mine} onChange={(e) => setMine(e.target.checked)} /></div>
        </div>
      </FilterPanel>
      <div className="mt-16" />
      <ErrorBox error={q.error} onRetry={q.refetch} />
      <Panel padded={false}>
        {q.loading && !q.data ? <Loading /> : !q.data?.rows.length ? (
          <EmptyState icon="diario" title="Nenhum diário no período" action={<Button icon="mais" onClick={() => navigate(`/diarios/novo${project ? `?obra=${project}` : ''}`)}>Registrar o diário de hoje</Button>}>
            Ajuste o período ou os filtros, ou registre um novo diário.
          </EmptyState>
        ) : (
          <ul className="list">
            {q.data.rows.map((r) => {
              const st = REPORT_STATUS[r.status]
              return (
                <li key={r.id}>
                  <Link to={`/diarios/${r.id}`} className="row-link">
                    <DateStamp iso={r.report_date} small />
                    <div className="row-main">
                      <strong>{r.project?.name}{r.kind === 'complementar' && ' — complementar'}</strong>
                      <span>{r.author?.name || r.author?.email} — atualizado em {formatDateTime(r.updated_at)}{r.version > 1 && ` — versão ${r.version}`}</span>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {q.data && pages > 1 && (
          <div className="pager">
            <span>Página {page + 1} de {pages} — {q.data.total} diários</span>
            <div className="row">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Panel>
      <p className="field-hint mt-8">Período de {formatDate(from)} a {formatDate(to)}.</p>
    </>
  )
}
