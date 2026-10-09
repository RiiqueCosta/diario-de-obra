import { useEffect, useState } from 'react'
import { Link, useSearchParams } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatDate, formatDateTime, todayISO } from '@/lib/format'
import { OCCURRENCE_STATUS, PRIORITY, options } from '@/lib/labels'
import type { Enums } from '@/lib/supabase'
import { Alert, Avatar, Badge, Button, Checkbox, EmptyState, ErrorBox, FilterPanel, Loading, Modal, PageHeader, Panel, SelectField, TextAreaField, TextField, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { useProjectOptions, useProjectPerms } from '../projects/hooks'
import { listProjectMembers } from '../projects/api'
import { listPhotos, PhotoGrid, PhotoUploader, PhotoViewer, type Photo } from '../photos/photos'
import { OccurrenceFormModal } from './OccurrenceFormModal'
import { addComment, getHistory, getOccurrence, listOccurrences, updateOccurrence } from './api'

export function OccurrencesListPage() {
  const org = useOrg()
  const params = useSearchParams()
  const projects = useProjectOptions(org.organization_id)
  const [project, setProject] = useState(params.get('obra') ?? '')
  const [open, setOpen] = useState(params.get('todas') !== '1')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [responsible, setResponsible] = useState(params.get('responsavel') ?? '')
  const [overdue, setOverdue] = useState(params.get('atrasadas') === '1')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newProject, setNewProject] = useState('')
  const perms = useProjectPerms(newProject || null)
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(0) }, [project, open, status, priority, responsible, overdue, debounced])
  const key = `occurrences:${org.organization_id}:${project}:${open}:${status}:${priority}:${responsible}:${overdue}:${debounced}:${page}`
  const q = useQuery(key, () => listOccurrences({ orgId: org.organization_id, projectId: project || undefined, open: open && !status, status: status || undefined, priority: priority || undefined, responsible: responsible || undefined, overdue, search: debounced, page }))
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1
  const today = todayISO()

  return (
    <>
      <PageHeader title="Ocorrências e pendências" subtitle="Problemas, imprevistos e decisões acompanhados até a resolução."
        actions={<Button icon="mais" onClick={() => { setNewProject(project); setCreating(true) }}>Registrar ocorrência</Button>} />
      <FilterPanel active={[project, status, priority, responsible, overdue ? '1' : '', debounced].filter(Boolean).length}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <TextField className="search" label="Buscar" type="search" placeholder="Código, título ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
          <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Todas" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} placeholder={open ? 'Em aberto' : 'Todas'} options={options(OCCURRENCE_STATUS)} />
          <SelectField label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Todas" options={options(PRIORITY)} />
          <SelectField label="Responsável" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Todos" options={[{ value: 'sem', label: 'Sem responsável' }]} />
          <div style={{ alignSelf: 'center', paddingTop: 22 }} className="row">
            <Checkbox label="Só em aberto" checked={open} onChange={(e) => setOpen(e.target.checked)} />
            <Checkbox label="Prazo vencido" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          </div>
        </div>
      </FilterPanel>
      <div className="mt-16" />
      <ErrorBox error={q.error} onRetry={q.refetch} />
      <Panel padded={false}>
        {q.loading && !q.data ? <Loading /> : !q.data?.rows.length ? (
          <EmptyState icon="alerta" title="Nenhuma ocorrência encontrada">{open ? 'Nada pendente com esses filtros.' : 'Ajuste os filtros.'}</EmptyState>
        ) : (
          <ul className="list">{q.data.rows.map((o) => (
            <li key={o.id}>
              <Link to={`/ocorrencias/${o.id}`} className="row-link">
                <div className="row-main">
                  <strong>{o.code} — {o.title}</strong>
                  <span>{o.project?.name} — {o.category} — {formatDateTime(o.occurred_at)}</span>
                  <span>{o.responsible ? `Responsável: ${o.responsible.name || o.responsible.email}` : 'Sem responsável'}{o.due_date && ` — prazo ${formatDate(o.due_date)}`}</span>
                </div>
                <div className="row-badges">
                  <Badge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</Badge>
                  <Badge tone={PRIORITY[o.priority].tone}>{PRIORITY[o.priority].label}</Badge>
                  {o.due_date && o.due_date < today && o.status !== 'resolvida' && o.status !== 'encerrada' && <Badge tone="red">Prazo vencido</Badge>}
                </div>
              </Link>
            </li>))}</ul>
        )}
        {q.data && pages > 1 && (
          <div className="pager"><span>Página {page + 1} de {pages}</span>
            <div className="row"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button></div></div>
        )}
      </Panel>
      {creating && !newProject && (
        <Modal open title="Registrar ocorrência" onClose={() => setCreating(false)} footer={<Button variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>}>
          <SelectField label="Em qual obra?" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Selecione" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </Modal>
      )}
      {creating && newProject && perms.data && !perms.can('ocorrencia.criar') && (
        <Modal open title="Sem permissão" onClose={() => { setCreating(false); setNewProject('') }} footer={<Button onClick={() => { setCreating(false); setNewProject('') }}>Entendi</Button>}>
          <p>Você não pode abrir ocorrências nesta obra. Fale com o gestor da obra.</p>
        </Modal>
      )}
      {creating && newProject && perms.data && perms.can('ocorrencia.criar') && (
        <OccurrenceFormModal projectId={newProject} canAssign={perms.can('ocorrencia.gerenciar')} onClose={() => { setCreating(false); setNewProject('') }}
          onCreated={() => { setCreating(false); setNewProject(''); invalidate('occurrences:'); invalidate('dashboard:') }} />
      )}
    </>
  )
}

const ACTION_LABEL: Record<string, string> = { criada: 'Ocorrência registrada', status_alterado: 'Situação alterada', responsavel_alterado: 'Responsável alterado', atualizada: 'Informações atualizadas' }

export function OccurrenceDetailPage({ id }: { id: string }) {
  const org = useOrg()
  const { session } = useAuth()
  const toast = useToast()
  const q = useQuery(`occurrence:${id}`, () => getOccurrence(id))
  const h = useQuery(`occurrence:hist:${id}`, () => getHistory(id))
  const perms = useProjectPerms(q.data?.project_id)
  const team = useQuery(q.data ? `project_members:${q.data.project_id}` : null, () => listProjectMembers(q.data!.project_id))
  const photos = useQuery(`photos:occ:${id}`, () => listPhotos(org.organization_id, { occurrenceId: id }))
  const [openPhoto, setOpenPhoto] = useState<Photo | null>(null)
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const send = useAction(async () => addComment(id, session!.user.id, comment.trim()))

  if (q.loading && !q.data) return <Loading />
  if (q.error) return <><Link to="/ocorrencias" className="back-link"><Icon name="voltar" size={16} /> Ocorrências</Link><ErrorBox error={q.error} onRetry={q.refetch} /></>
  const o = q.data!
  const isResponsible = o.responsible_user_id === session?.user.id
  const canManage = perms.can('ocorrencia.gerenciar')
  const canUpdate = canManage || (isResponsible && o.status !== 'encerrada') || (o.created_by === session?.user.id && o.status === 'aberta')
  const name = (uid: unknown) => {
    if (!uid) return '—'
    const m = team.data?.find((x) => x.user_id === uid)
    return m?.profile?.name || m?.profile?.email || 'outro usuário'
  }
  const refresh = () => { invalidate(`occurrence:${id}`); invalidate(`occurrence:hist:${id}`); invalidate('occurrences:'); invalidate('dashboard:') }

  return (
    <>
      <PageHeader back={<Link to="/ocorrencias" className="back-link"><Icon name="voltar" size={16} /> Ocorrências</Link>}
        title={`${o.code} — ${o.title}`}
        subtitle={<span className="row"><Badge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</Badge><Badge tone={PRIORITY[o.priority].tone}>Prioridade {PRIORITY[o.priority].label.toLowerCase()}</Badge><Link to={`/obras/${o.project_id}`}>{o.project?.name}</Link></span>}
        actions={canUpdate && <Button icon="editar" onClick={() => setEditing(true)}>Atualizar</Button>} />
      {o.due_date && o.due_date < todayISO() && o.status !== 'resolvida' && o.status !== 'encerrada' && <Alert tone="danger"><p>Prazo vencido em {formatDate(o.due_date)}.</p></Alert>}
      <div className="grid-2 mt-16">
        <Panel title="Detalhes">
          <dl className="dl">
            <dt>Categoria</dt><dd>{o.category}</dd>
            <dt>Quando</dt><dd>{formatDateTime(o.occurred_at)}</dd>
            <dt>Registrada por</dt><dd>{o.author?.name || o.author?.email} em {formatDateTime(o.created_at)}</dd>
            <dt>Responsável</dt><dd>{o.responsible ? (o.responsible.name || o.responsible.email) : <Badge tone="yellow">Sem responsável</Badge>}</dd>
            <dt>Prazo</dt><dd>{formatDate(o.due_date)}</dd>
            {o.report && <><dt>Diário</dt><dd><Link to={`/diarios/${o.report.id}`}>{formatDate(o.report.report_date)}</Link></dd></>}
            {o.activity && <><dt>Atividade</dt><dd>{o.activity.title}</dd></>}
            {o.resolved_at && <><dt>Resolvida em</dt><dd>{formatDateTime(o.resolved_at)}</dd></>}
            {o.closed_at && <><dt>Encerrada em</dt><dd>{formatDateTime(o.closed_at)}</dd></>}
          </dl>
        </Panel>
        <Panel title="Descrição e providências">
          <p className="form-section-title">O que aconteceu</p><p style={{ whiteSpace: 'pre-wrap' }}>{o.description}</p>
          <p className="form-section-title mt-16">Providências tomadas</p><p style={{ whiteSpace: 'pre-wrap' }}>{o.actions_taken || '—'}</p>
          <p className="form-section-title mt-16">Decisões</p><p style={{ whiteSpace: 'pre-wrap' }}>{o.decision || '—'}</p>
          {o.resolution_description && <><p className="form-section-title mt-16">Resolução</p><p style={{ whiteSpace: 'pre-wrap' }}>{o.resolution_description}</p></>}
        </Panel>
      </div>
      <div className="stack mt-16">
        <Panel title="Fotografias e anexos">
          {(perms.can('foto.enviar') || perms.can('ocorrencia.criar')) && o.status !== 'encerrada' && <PhotoUploader compact meta={{ projectId: o.project_id, occurrenceId: o.id, category: 'Ocorrência' }} onUploaded={() => void photos.refetch()} />}
          <div className="mt-16">{photos.loading && !photos.data ? <Loading /> : !photos.data?.length ? <p className="muted">Nenhuma foto.</p> : <PhotoGrid photos={photos.data} onOpen={setOpenPhoto} />}</div>
        </Panel>
        <div className="grid-2">
          <Panel title="Comentários">
            {h.data?.comments.length ? (
              <ul className="list">{h.data.comments.map((c) => (
                <li key={c.id} className="row" style={{ padding: '10px 0', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <Avatar name={c.user?.name || c.user?.email || '?'} />
                  <div><strong>{c.user?.name || c.user?.email}</strong> <span className="muted small">{formatDateTime(c.created_at)}</span><p style={{ whiteSpace: 'pre-wrap' }}>{c.body}</p></div>
                </li>))}</ul>
            ) : <p className="muted">Nenhum comentário.</p>}
            <div className="form mt-16">
              <TextAreaField label="Novo comentário" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
              <div className="row"><Button disabled={!comment.trim()} loading={send.pending} onClick={async () => { if (await send.run()) { setComment(''); void h.refetch() } }}>Comentar</Button></div>
              <ErrorBox error={send.error} />
            </div>
          </Panel>
          <Panel title="Histórico">
            {h.loading && !h.data ? <Loading /> : (
              <ol className="timeline">{(h.data?.history ?? []).map((e) => {
                const nv = (e.new_values ?? {}) as Record<string, unknown>
                const pv = (e.previous_values ?? {}) as Record<string, unknown>
                return (
                  <li key={e.id}>
                    <strong>{ACTION_LABEL[e.action] ?? e.action}</strong>
                    <div className="small">{e.user?.name || e.user?.email || 'Sistema'} — {formatDateTime(e.created_at)}</div>
                    {'status' in nv && <div className="small">{pv.status ? `${OCCURRENCE_STATUS[pv.status as Enums<'occurrence_status'>]?.label} → ` : ''}{OCCURRENCE_STATUS[nv.status as Enums<'occurrence_status'>]?.label}</div>}
                    {'responsible_user_id' in nv && <div className="small">Responsável: {name(pv.responsible_user_id)} → {name(nv.responsible_user_id)}</div>}
                    {'priority' in nv && e.action !== 'criada' && <div className="small">Prioridade: {PRIORITY[nv.priority as Enums<'priority_level'>]?.label}</div>}
                    {'due_date' in nv && e.action !== 'criada' && <div className="small">Prazo: {formatDate(nv.due_date as string | null)}</div>}
                  </li>
                )
              })}</ol>
            )}
          </Panel>
        </div>
      </div>
      {openPhoto && <PhotoViewer photo={openPhoto} canEdit={canManage} onClose={() => setOpenPhoto(null)} onChanged={() => { setOpenPhoto(null); void photos.refetch() }} />}
      {editing && <UpdateModal occurrence={o} canManage={canManage} team={(team.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || '' }))}
        onClose={() => setEditing(false)} onSaved={() => { setEditing(false); toast('ok', 'Ocorrência atualizada.'); refresh() }} />}
    </>
  )
}

function UpdateModal({ occurrence: o, canManage, team, onClose, onSaved }: { occurrence: Awaited<ReturnType<typeof getOccurrence>>; canManage: boolean; team: Array<{ value: string; label: string }>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    status: o.status, priority: o.priority, responsible_user_id: o.responsible_user_id ?? '', due_date: o.due_date ?? '',
    actions_taken: o.actions_taken ?? '', decision: o.decision ?? '', resolution_description: o.resolution_description ?? '',
  })
  const needsResolution = (v.status === 'resolvida' || v.status === 'encerrada') && !v.resolution_description.trim()
  const save = useAction(async () => updateOccurrence(o.id, o.row_version, canManage ? {
    status: v.status, priority: v.priority, responsible_user_id: v.responsible_user_id || null, due_date: v.due_date || null,
    actions_taken: v.actions_taken.trim() || null, decision: v.decision.trim() || null, resolution_description: v.resolution_description.trim() || null,
  } : { status: v.status, actions_taken: v.actions_taken.trim() || null, decision: v.decision.trim() || null, resolution_description: v.resolution_description.trim() || null }))
  const statusOptions = options(OCCURRENCE_STATUS).filter((s) => canManage || s.value !== 'encerrada')
  return (
    <Modal open wide title={`Atualizar ${o.code}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={needsResolution} loading={save.pending} onClick={async () => { if (await save.run()) onSaved() }}>Salvar</Button></>}>
      <div className="form">
        <div className="grid-2">
          <SelectField label="Situação" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Enums<'occurrence_status'> })} options={statusOptions}
            hint={!canManage ? 'Encerrar a ocorrência cabe ao gestor.' : undefined} />
          <SelectField label="Prioridade" value={v.priority} disabled={!canManage} onChange={(e) => setV({ ...v, priority: e.target.value as Enums<'priority_level'> })} options={options(PRIORITY)} />
          <SelectField label="Responsável" value={v.responsible_user_id} disabled={!canManage} onChange={(e) => setV({ ...v, responsible_user_id: e.target.value })} placeholder="Sem responsável" options={team} />
          <TextField label="Prazo" type="date" value={v.due_date} disabled={!canManage} onChange={(e) => setV({ ...v, due_date: e.target.value })} />
        </div>
        <TextAreaField label="Providências tomadas" value={v.actions_taken} onChange={(e) => setV({ ...v, actions_taken: e.target.value })} />
        <TextAreaField label="Decisões" value={v.decision} onChange={(e) => setV({ ...v, decision: e.target.value })} />
        <TextAreaField label="Descrição da resolução" value={v.resolution_description} onChange={(e) => setV({ ...v, resolution_description: e.target.value })}
          error={needsResolution ? 'Descreva como foi resolvida antes de marcar como resolvida ou encerrada.' : undefined} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}
