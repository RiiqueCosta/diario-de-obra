import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { useQuery } from '@/lib/useQuery'
import { formatDate, formatPercent } from '@/lib/format'
import { PROJECT_STATUS } from '@/lib/labels'
import { Badge, Button, EmptyState, ErrorBox, Loading, PageHeader, ProgressBar, SelectField, Tabs, TextField } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { listProjects, signedUrl, type Project } from './api'

function CoverImage({ storageKey }: { storageKey: string | null }) {
  const { data } = useQuery(storageKey ? `signed:${storageKey}` : null, () => signedUrl(storageKey))
  return (
    <div className="project-cover" style={data ? { backgroundImage: `url("${data}")` } : undefined}>
      {!data && <Icon name="obra" size={30} />}
    </div>
  )
}

export function ProjectCard({ p }: { p: Project }) {
  const st = PROJECT_STATUS[p.status]
  return (
    <Link to={`/obras/${p.id}`} className="project-card">
      <CoverImage storageKey={p.cover_storage_key} />
      <div className="project-card-body">
        <div className="project-card-top">
          <span className="project-code">{p.code}</span>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <h3>{p.name}</h3>
        <p className="project-meta">{p.client_name}{p.city ? ` — ${p.city}${p.state ? `/${p.state}` : ''}` : ''}</p>
        <p className="project-meta">Previsão: {formatDate(p.expected_end_date)}</p>
        <div className="progress-line">
          <ProgressBar value={p.progress_percentage} />
          <span className="num">{formatPercent(p.progress_percentage)}</span>
        </div>
      </div>
    </Link>
  )
}

export function ProjectsListPage() {
  const org = useOrg()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const params = useSearchParams()
  const [view, setView] = useState<'ativas' | 'arquivadas'>(params.get('ver') === 'arquivadas' ? 'arquivadas' : 'ativas')
  const [search, setSearch] = useState(params.get('busca') ?? '')
  const [debounced, setDebounced] = useState(search)
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [page, setPage] = useState(0)

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(0) }, [debounced, status, view])
  useEffect(() => {
    const q = new URLSearchParams()
    if (debounced) q.set('busca', debounced)
    if (status) q.set('status', status)
    if (view === 'arquivadas') q.set('ver', 'arquivadas')
    const qs = q.toString()
    window.history.replaceState(null, '', `/obras${qs ? `?${qs}` : ''}`)
  }, [debounced, status, view])

  const key = `projects:list:${org.organization_id}:${view}:${status}:${debounced}:${page}`
  const { data, loading, error, refetch } = useQuery(key, () =>
    listProjects(org.organization_id, { search: debounced, status, archived: view === 'arquivadas', page }))

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const filtering = !!debounced || !!status

  return (
    <>
      <PageHeader
        title="Obras"
        subtitle={isAdmin ? 'Todas as obras da empresa.' : 'Obras às quais você tem acesso.'}
        actions={isAdmin && <Button icon="mais" onClick={() => navigate('/obras/nova')}>Nova obra</Button>}
      />
      <Tabs tabs={[{ id: 'ativas', label: 'Ativas' }, { id: 'arquivadas', label: 'Arquivadas' }]} value={view} onChange={setView} />
      <div className="toolbar">
        <TextField className="search" label="Buscar" type="search" placeholder="Nome, código, cliente ou cidade" value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todas"
          options={Object.entries(PROJECT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <ErrorBox error={error} onRetry={refetch} />
      {loading && !data ? <Loading /> : data && data.rows.length === 0 ? (
        filtering ? (
          <EmptyState icon="busca" title="Nenhuma obra encontrada" action={<Button variant="secondary" onClick={() => { setSearch(''); setStatus('') }}>Limpar filtros</Button>}>
            Nenhuma obra corresponde à busca e aos filtros escolhidos.
          </EmptyState>
        ) : view === 'arquivadas' ? (
          <EmptyState icon="arquivar" title="Nenhuma obra arquivada">Obras arquivadas continuam consultáveis aqui, com todo o histórico.</EmptyState>
        ) : isAdmin ? (
          <EmptyState icon="obra" title="Cadastre a primeira obra" action={<Button icon="mais" onClick={() => navigate('/obras/nova')}>Nova obra</Button>}>
            Cada obra tem seu próprio diário, equipe, fotos, ocorrências e relatórios.
          </EmptyState>
        ) : (
          <EmptyState icon="obra" title="Nenhuma obra liberada para você">Peça ao administrador da empresa para incluir você na equipe de uma obra.</EmptyState>
        )
      ) : data && (
        <>
          <div className="project-cards">{data.rows.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
          {totalPages > 1 && (
            <div className="pager panel mt-16">
              <span>Página {page + 1} de {totalPages} — {data.total} obras</span>
              <div className="row">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
