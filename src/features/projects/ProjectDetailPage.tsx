import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatDate, formatDocument, formatPercent } from '@/lib/format'
import { PERMISSIONS, PROGRESS_METHOD, PROJECT_ROLE, PROJECT_STATUS } from '@/lib/labels'
import type { Enums } from '@/lib/supabase'
import { Alert, Avatar, Badge, Button, EmptyState, ErrorBox, Loading, Modal, PageHeader, Panel, ProgressBar, SelectField, Tabs, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { addProjectMember, getMyPermissions, getProject, listProjectMembers, removeProjectMember, setArchived, signedUrl, updateProjectMember, type Project, type ProjectMember } from './api'
import { listOrgMembers } from '../users/api'
import { AuditList } from '../audit/AuditPage'
import { DiaryCalendar } from '../diary/DiaryCalendar'
import { ActivitiesTab } from '../activities/ActivitiesTab'
import { PhotoGallery } from '../photos/photos'
import { ProjectDocuments } from '../documents/ProjectDocuments'

type Tab = 'resumo' | 'diario' | 'atividades' | 'equipe' | 'fotos' | 'documentos' | 'historico'
const TABS: Tab[] = ['resumo', 'diario', 'atividades', 'equipe', 'fotos', 'documentos', 'historico']

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const params = useSearchParams()
  const initial = params.get('aba') as Tab | null
  const [tab, setTabState] = useState<Tab>(initial && TABS.includes(initial) ? initial : 'resumo')
  const setTab = (t: Tab) => { setTabState(t); window.history.replaceState(null, '', `/obras/${projectId}${t === 'resumo' ? '' : `?aba=${t}`}`) }
  const project = useQuery(`project:${projectId}`, () => getProject(projectId))
  const perms = useQuery(`perms:${projectId}`, () => getMyPermissions(projectId))
  const members = useQuery(`project_members:${projectId}`, () => listProjectMembers(projectId))
  const cover = useQuery(project.data?.cover_storage_key ? `signed:${project.data.cover_storage_key}` : null, () => signedUrl(project.data!.cover_storage_key))
  const [confirmArchive, setConfirmArchive] = useState(false)
  const archive = useAction(async (p: Project) => setArchived(p.id, !p.archived_at))

  if (project.loading && !project.data) return <Loading />
  if (project.error) return <><Link to="/obras" className="back-link"><Icon name="voltar" size={16} /> Obras</Link><ErrorBox error={project.error} onRetry={project.refetch} /></>
  const p = project.data!
  const st = PROJECT_STATUS[p.status]
  const canEdit = !!perms.data?.['obra.editar']

  const can = (k: string) => !!perms.data?.[k]
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'diario', label: 'Diário' },
    { id: 'atividades', label: 'Atividades' },
    { id: 'equipe', label: 'Equipe', count: members.data?.length },
    { id: 'fotos', label: 'Fotos' },
    { id: 'documentos', label: 'Documentos' },
  ]
  if (isAdmin) tabs.push({ id: 'historico', label: 'Histórico' })

  async function doArchive() {
    const r = await archive.run(p)
    if (r) {
      setConfirmArchive(false)
      invalidate('projects:'); invalidate(`project:${p.id}`)
      toast('ok', r.archived_at ? 'Obra arquivada. O histórico continua disponível.' : 'Obra restaurada.')
    }
  }

  return (
    <>
      <PageHeader
        back={<Link to="/obras" className="back-link"><Icon name="voltar" size={16} /> Obras</Link>}
        title={p.name}
        subtitle={<span className="row"><span className="mono-code">{p.code}</span><Badge tone={st.tone}>{st.label}</Badge>{p.archived_at && <Badge tone="grey">Arquivada em {formatDate(p.archived_at)}</Badge>}</span>}
        actions={<>
          {canEdit && !p.archived_at && <Button variant="secondary" icon="editar" onClick={() => navigate(`/obras/${p.id}/editar`)}>Editar</Button>}
          {isAdmin && <Button variant={p.archived_at ? 'secondary' : 'danger'} icon="arquivar" onClick={() => setConfirmArchive(true)}>{p.archived_at ? 'Restaurar' : 'Arquivar'}</Button>}
        </>}
      />
      {p.archived_at && <Alert tone="info">Obra arquivada: os registros podem ser consultados, mas não recebem novos lançamentos.</Alert>}
      <div className="mt-16" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'resumo' && (
        <div className="grid-2">
          <Panel title="Dados da obra">
            <dl className="dl">
              <dt>Cliente</dt><dd>{p.client_name}{p.client_document && <span className="muted"> — {formatDocument(p.client_document)}</span>}</dd>
              <dt>Endereço</dt><dd>{[p.address, p.city && `${p.city}${p.state ? `/${p.state}` : ''}`].filter(Boolean).join(' — ') || '—'}</dd>
              <dt>Responsável técnico</dt><dd>{p.technical_responsible || '—'}{p.technical_registration && <span className="muted"> ({p.technical_registration})</span>}</dd>
              <dt>Início</dt><dd className="num">{formatDate(p.start_date)}</dd>
              <dt>Previsão de conclusão</dt><dd className="num">{formatDate(p.expected_end_date)}</dd>
              <dt>Conclusão real</dt><dd className="num">{formatDate(p.actual_end_date)}</dd>
              <dt>Descrição</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{p.description || '—'}</dd>
              <dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{p.general_notes || '—'}</dd>
            </dl>
          </Panel>
          <div className="stack">
            {cover.data && <img src={cover.data} alt={`Foto de capa de ${p.name}`} style={{ borderRadius: 8, width: '100%', aspectRatio: '16/9', objectFit: 'cover', border: '1px solid var(--linha)' }} />}
            <Panel title="Avanço físico">
              <div className="row" style={{ alignItems: 'baseline' }}>
                <span className="stat-value num">{formatPercent(p.progress_percentage, 1)}</span>
              </div>
              <div className="mt-8"><ProgressBar value={p.progress_percentage} /></div>
              <p className="field-hint mt-8">{PROGRESS_METHOD[p.progress_method].label}. {PROGRESS_METHOD[p.progress_method].description}</p>
            </Panel>
            <Panel title="Equipe responsável">
              {members.data && members.data.length > 0 ? (
                <ul className="list">
                  {members.data.filter((m) => m.role !== 'colaborador').map((m) => (
                    <li key={m.id} className="row" style={{ padding: '8px 0' }}>
                      <Avatar name={m.profile?.name || m.profile?.email || '?'} />
                      <div className="row-main"><strong>{m.profile?.name || m.profile?.email}</strong><span>{PROJECT_ROLE[m.role].label}</span></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">Nenhum responsável definido.</p>}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'diario' && (
        <>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="row">
              <Link to={`/diarios?obra=${p.id}`} className="btn btn-secondary btn-md">Lista de diários</Link>
              <Link to={`/ocorrencias?obra=${p.id}`} className="btn btn-secondary btn-md">Ocorrências</Link>
              <Link to={`/relatorios?obra=${p.id}`} className="btn btn-secondary btn-md">Relatórios</Link>
            </div>
            {can('diario.criar') && !p.archived_at && <Button icon="mais" size="lg" onClick={() => navigate(`/diarios/novo?obra=${p.id}`)}>Diário de hoje</Button>}
          </div>
          <DiaryCalendar projectId={p.id} canCreate={can('diario.criar') && !p.archived_at} startDate={p.start_date} />
        </>
      )}
      {tab === 'atividades' && <ActivitiesTab projectId={p.id} canManage={can('atividade.gerenciar')} archived={!!p.archived_at} />}
      {tab === 'fotos' && <PhotoGallery projectId={p.id} canUpload={can('foto.enviar') && !p.archived_at} canEdit={can('obra.editar')} />}
      {tab === 'documentos' && <ProjectDocuments projectId={p.id} canUpload={can('documento.enviar') && !p.archived_at} canManage={can('obra.editar')} />}
      {tab === 'equipe' && <TeamTab project={p} members={members.data ?? []} loading={members.loading} onChange={() => { void members.refetch() }} />}
      {tab === 'historico' && isAdmin && <Panel padded={false}><AuditList projectId={p.id} /></Panel>}

      <Modal open={confirmArchive} title={p.archived_at ? 'Restaurar obra' : 'Arquivar obra'} onClose={() => setConfirmArchive(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmArchive(false)}>Cancelar</Button>
          <Button variant={p.archived_at ? 'primary' : 'danger'} loading={archive.pending} onClick={() => void doArchive()}>{p.archived_at ? 'Restaurar obra' : 'Arquivar obra'}</Button>
        </>}>
        {p.archived_at
          ? <p>A obra volta para a lista de obras ativas e pode receber novos diários e ocorrências.</p>
          : <p>A obra sai da lista de ativas e deixa de receber novos diários, fotos e ocorrências. Nada é apagado: diários, fotos, relatórios e histórico continuam consultáveis.</p>}
        <ErrorBox error={archive.error} />
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- equipe
function TeamTab({ project, members, loading, onChange }: { project: Project; members: ProjectMember[]; loading: boolean; onChange: () => void }) {
  const { isAdmin } = useAuth()
  const org = useOrg()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProjectMember | null>(null)
  const [removing, setRemoving] = useState<ProjectMember | null>(null)
  const remove = useAction(async (m: ProjectMember) => removeProjectMember(m.id))

  if (loading && members.length === 0) return <Loading />
  return (
    <Panel padded={false} title="Equipe com acesso à obra" actions={isAdmin && !project.archived_at && <Button size="sm" icon="mais" onClick={() => setAdding(true)}>Adicionar</Button>}>
      {members.length === 0 ? (
        <EmptyState icon="equipe" title="Ninguém na equipe ainda" action={isAdmin && <Button icon="mais" onClick={() => setAdding(true)}>Adicionar pessoa</Button>}>
          Somente pessoas da equipe (e administradores) acessam esta obra.
        </EmptyState>
      ) : (
        <ul className="list">
          {members.map((m) => {
            const overrides = Object.keys(m.permissions ?? {}).length
            return (
              <li key={m.id} className="row-link" style={{ cursor: 'default' }}>
                <Avatar name={m.profile?.name || m.profile?.email || '?'} size={36} />
                <div className="row-main">
                  <strong>{m.profile?.name || m.profile?.email}</strong>
                  <span>{PROJECT_ROLE[m.role].label}{overrides > 0 && ` — ${overrides} ${overrides === 1 ? 'ajuste' : 'ajustes'} de permissão`}</span>
                </div>
                {isAdmin && (
                  <div className="row">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>Papel e permissões</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(m)} aria-label={`Remover ${m.profile?.name} da obra`}>Remover</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {adding && <AddMemberModal projectId={project.id} orgId={org.organization_id} existing={members.map((m) => m.user_id)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChange(); toast('ok', 'Pessoa adicionada à equipe.') }} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChange(); toast('ok', 'Permissões salvas.') }} />}
      <Modal open={!!removing} title="Remover da equipe" onClose={() => setRemoving(null)}
        footer={<>
          <Button variant="secondary" onClick={() => setRemoving(null)}>Cancelar</Button>
          <Button variant="danger" loading={remove.pending} onClick={async () => { if (removing && await remove.run(removing)) { setRemoving(null); onChange(); toast('ok', 'Acesso à obra removido.') } }}>Remover acesso</Button>
        </>}>
        <p><strong>{removing?.profile?.name}</strong> deixa de acessar esta obra. Diários, fotos e registros feitos por essa pessoa continuam preservados.</p>
        <ErrorBox error={remove.error} />
      </Modal>
    </Panel>
  )
}

const ROLE_OPTIONS = Object.entries(PROJECT_ROLE).map(([value, r]) => ({ value, label: r.label }))

function AddMemberModal({ projectId, orgId, existing, onClose, onDone }: { projectId: string; orgId: string; existing: string[]; onClose: () => void; onDone: () => void }) {
  const people = useQuery(`org_members:${orgId}:ativos`, () => listOrgMembers(orgId, false))
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<Enums<'project_role'>>('encarregado')
  const add = useAction(async () => addProjectMember({ project_id: projectId, user_id: userId, role }))
  const options = (people.data ?? []).filter((m) => !existing.includes(m.user_id) && m.role !== 'admin')
    .map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || 'Sem nome' }))
  return (
    <Modal open title="Adicionar à equipe da obra" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={!userId} loading={add.pending} onClick={async () => { if (await add.run()) onDone() }}>Adicionar</Button>
      </>}>
      <div className="form">
        {people.loading ? <Loading /> : options.length === 0 ? (
          <Alert tone="info">Todos os usuários ativos já estão na equipe. Para incluir alguém novo, convide em Usuários e permissões. Administradores já têm acesso a todas as obras.</Alert>
        ) : (
          <>
            <SelectField label="Pessoa" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Selecione" options={options} />
            <SelectField label="Papel nesta obra" value={role} onChange={(e) => setRole(e.target.value as Enums<'project_role'>)} options={ROLE_OPTIONS} hint={PROJECT_ROLE[role].description} />
          </>
        )}
        <ErrorBox error={add.error} />
      </div>
    </Modal>
  )
}

function EditMemberModal({ member, onClose, onDone }: { member: ProjectMember; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState<Enums<'project_role'>>(member.role)
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => ({ ...(member.permissions as Record<string, boolean>) }))
  const save = useAction(async () => updateProjectMember(member.id, { role, permissions: overrides }))
  const defaults = useMemo(() => DEFAULTS[role], [role])

  return (
    <Modal open wide title={`Papel e permissões — ${member.profile?.name || member.profile?.email}`} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} onClick={async () => { if (await save.run()) onDone() }}>Salvar permissões</Button>
      </>}>
      <div className="form">
        <SelectField label="Papel nesta obra" value={role} onChange={(e) => setRole(e.target.value as Enums<'project_role'>)} options={ROLE_OPTIONS} hint={PROJECT_ROLE[role].description} />
        <p className="form-section-title">Ajustes de permissão</p>
        <p className="field-hint">"Padrão do papel" segue o papel escolhido. Use "Permitir" ou "Bloquear" só para exceções desta pessoa nesta obra.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Ação</th><th>Padrão do papel</th><th>Nesta obra</th></tr></thead>
            <tbody>
              {PERMISSIONS.map((perm) => {
                const val = overrides[perm.key]
                return (
                  <tr key={perm.key}>
                    <td>{perm.label}</td>
                    <td>{defaults[perm.key] ? <Badge tone="green">Permitido</Badge> : <Badge tone="grey">Não permitido</Badge>}</td>
                    <td>
                      <select aria-label={`${perm.label}: nesta obra`} value={val === undefined ? '' : val ? 'sim' : 'nao'} style={{ minWidth: 170 }}
                        onChange={(e) => setOverrides((o) => {
                          const next = { ...o }
                          if (e.target.value === '') delete next[perm.key]
                          else next[perm.key] = e.target.value === 'sim'
                          return next
                        })}>
                        <option value="">Padrão do papel</option>
                        <option value="sim">Permitir</option>
                        <option value="nao">Bloquear</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

// Espelha private.default_permissions (o banco é quem decide; isto só informa a tela).
const DEFAULTS: Record<Enums<'project_role'>, Record<string, boolean>> = {
  gestor: { 'obra.editar': true, 'equipe.gerenciar': true, 'diario.criar': true, 'diario.aprovar': true, 'diario.corrigir': true, 'atividade.gerenciar': true, 'ocorrencia.criar': true, 'ocorrencia.gerenciar': true, 'foto.enviar': true, 'documento.enviar': true, 'relatorio.gerar': true, 'diario.ver_todos': true },
  engenheiro: { 'obra.editar': false, 'equipe.gerenciar': false, 'diario.criar': true, 'diario.aprovar': true, 'diario.corrigir': false, 'atividade.gerenciar': true, 'ocorrencia.criar': true, 'ocorrencia.gerenciar': true, 'foto.enviar': true, 'documento.enviar': true, 'relatorio.gerar': true, 'diario.ver_todos': true },
  encarregado: { 'obra.editar': false, 'equipe.gerenciar': false, 'diario.criar': true, 'diario.aprovar': false, 'diario.corrigir': false, 'atividade.gerenciar': false, 'ocorrencia.criar': true, 'ocorrencia.gerenciar': false, 'foto.enviar': true, 'documento.enviar': false, 'relatorio.gerar': false, 'diario.ver_todos': true },
  colaborador: {},
}
