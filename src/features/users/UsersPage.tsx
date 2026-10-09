import { useMemo, useState } from 'react'
import { Link } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { isEmail } from '@/lib/validation'
import { MEMBER_STATUS, ORG_ROLE, PROJECT_ROLE } from '@/lib/labels'
import { formatDate } from '@/lib/format'
import type { Enums } from '@/lib/supabase'
import { Alert, Avatar, Badge, Button, EmptyState, ErrorBox, Loading, Modal, PageHeader, Panel, SelectField, TextField, useToast } from '@/ui/components'
import { listProjects } from '../projects/api'
import { inviteUser, listMemberProjects, listOrgMembers, updateOrgMember, type InviteResult, type OrgMember } from './api'

export function UsersPage() {
  const org = useOrg()
  const { session } = useAuth()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [inviting, setInviting] = useState(false)
  const [selected, setSelected] = useState<OrgMember | null>(null)
  const q = useQuery(`org_members:${org.organization_id}:todos`, () => listOrgMembers(org.organization_id, true))

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (q.data ?? []).filter((m) => !s || (m.profile?.name ?? '').toLowerCase().includes(s) || (m.profile?.email ?? '').toLowerCase().includes(s))
  }, [q.data, search])

  return (
    <>
      <PageHeader title="Usuários e permissões" subtitle="Quem acessa o sistema e em quais obras. Funcionários que não usam o sistema não precisam de login."
        actions={<Button icon="mais" onClick={() => setInviting(true)}>Convidar usuário</Button>} />
      <div className="toolbar"><TextField className="search" label="Buscar" type="search" placeholder="Nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <ErrorBox error={q.error} onRetry={q.refetch} />
      <Panel padded={false}>
        {q.loading && !q.data ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon="equipe" title="Nenhum usuário encontrado" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Usuário</th><th>Perfil na empresa</th><th>Situação</th><th>Desde</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => setSelected(m)}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <Avatar name={m.profile?.name || m.profile?.email || '?'} />
                        <div className="row-main"><strong>{m.profile?.name || '(sem nome)'}{m.user_id === session?.user.id && ' (você)'}</strong><span>{m.profile?.email}</span></div>
                      </div>
                    </td>
                    <td>{ORG_ROLE[m.role]}</td>
                    <td><Badge tone={MEMBER_STATUS[m.status].tone}>{MEMBER_STATUS[m.status].label}</Badge></td>
                    <td className="num">{formatDate(m.created_at)}</td>
                    <td><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelected(m) }}>Gerenciar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {inviting && <InviteModal onClose={() => setInviting(false)} onDone={() => { invalidate(`org_members:${org.organization_id}`); toast('ok', 'Usuário incluído na empresa.') }} />}
      {selected && <MemberModal member={selected} isSelf={selected.user_id === session?.user.id} onClose={() => setSelected(null)}
        onChanged={() => { invalidate(`org_members:${org.organization_id}`); setSelected(null) }} />}
    </>
  )
}

// ---------------------------------------------------------------- convite
function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const org = useOrg()
  const projects = useQuery(`projects:list:${org.organization_id}:convite`, () => listProjects(org.organization_id, { pageSize: 500 }))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Enums<'org_role'>>('membro')
  const [mode, setMode] = useState<'senha_provisoria' | 'convite_email'>('senha_provisoria')
  const [access, setAccess] = useState<Array<{ project_id: string; role: Enums<'project_role'> }>>([])
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<InviteResult | null>(null)
  const action = useAction(inviteUser)

  const errors = {
    name: !name.trim() ? 'Informe o nome.' : undefined,
    email: !isEmail(email) ? 'Informe um e-mail válido.' : undefined,
  }

  async function submit() {
    setSubmitted(true)
    if (errors.name || errors.email) return
    const r = await action.run({ organization_id: org.organization_id, email: email.trim().toLowerCase(), name: name.trim(), role, mode, projects: role === 'admin' ? [] : access })
    if (r) { setResult(r); onDone() }
  }

  if (result) {
    return (
      <Modal open title="Usuário incluído" onClose={onClose} footer={<Button onClick={onClose}>Concluir</Button>}>
        <div className="form">
          {result.temporary_password ? (
            <>
              <Alert tone="warn"><p>Anote ou envie agora esta senha provisória para <strong>{email}</strong>. Ela não será mostrada de novo. No primeiro acesso, o sistema pede uma senha pessoal.</p></Alert>
              <p className="secret">{result.temporary_password}</p>
              <p className="field-hint">Endereço de acesso: {window.location.origin}</p>
            </>
          ) : result.created ? (
            <Alert tone="ok"><p>Convite enviado para <strong>{email}</strong>. O acesso é liberado quando a pessoa abrir o link e definir a senha.</p></Alert>
          ) : (
            <Alert tone="ok"><p><strong>{email}</strong> já tinha conta no sistema e agora também acessa esta empresa.</p></Alert>
          )}
        </div>
      </Modal>
    )
  }

  const projectOptions = (projects.data?.rows ?? []).filter((p) => !access.some((a) => a.project_id === p.id))
  return (
    <Modal open wide title="Convidar usuário" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={action.pending} onClick={() => void submit()}>Incluir usuário</Button>
      </>}>
      <div className="form">
        <div className="grid-2">
          <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} error={submitted ? errors.name : undefined} required />
          <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={submitted ? errors.email : undefined} required />
          <SelectField label="Perfil na empresa" value={role} onChange={(e) => setRole(e.target.value as Enums<'org_role'>)}
            options={[{ value: 'membro', label: 'Membro (acesso só às obras liberadas)' }, { value: 'admin', label: 'Administrador (acesso total)' }]} />
          <SelectField label="Como entregar o acesso" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}
            hint={mode === 'senha_provisoria' ? 'Você recebe uma senha provisória para repassar. Funciona sem e-mail configurado.' : 'A pessoa recebe um link por e-mail para criar a senha.'}
            options={[{ value: 'senha_provisoria', label: 'Gerar senha provisória' }, { value: 'convite_email', label: 'Enviar convite por e-mail' }]} />
        </div>
        {role === 'membro' && (
          <>
            <p className="form-section-title">Obras liberadas</p>
            {access.length === 0 && <p className="field-hint">Sem obras, a pessoa entra mas não vê nada até ser incluída em uma equipe.</p>}
            {access.map((a, i) => {
              const p = projects.data?.rows.find((x) => x.id === a.project_id)
              return (
                <div key={a.project_id} className="row" style={{ alignItems: 'flex-end' }}>
                  <div style={{ flex: 2, minWidth: 200 }}><strong>{p?.name}</strong> <span className="muted small">{p?.code}</span></div>
                  <SelectField label="Papel" value={a.role} style={{ minWidth: 220 }}
                    onChange={(e) => setAccess((list) => list.map((x, j) => j === i ? { ...x, role: e.target.value as Enums<'project_role'> } : x))}
                    options={Object.entries(PROJECT_ROLE).map(([value, r]) => ({ value, label: r.label }))} />
                  <Button variant="ghost" size="sm" onClick={() => setAccess((list) => list.filter((_, j) => j !== i))}>Remover</Button>
                </div>
              )
            })}
            {projectOptions.length > 0 && (
              <SelectField label="Adicionar obra" value="" placeholder="Selecione uma obra"
                onChange={(e) => { if (e.target.value) setAccess((list) => [...list, { project_id: e.target.value, role: 'encarregado' }]) }}
                options={projectOptions.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
            )}
          </>
        )}
        <ErrorBox error={action.error} />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- gerenciar membro
function MemberModal({ member, isSelf, onClose, onChanged }: { member: OrgMember; isSelf: boolean; onClose: () => void; onChanged: () => void }) {
  const org = useOrg()
  const toast = useToast()
  const projects = useQuery(`member_projects:${member.user_id}:${org.organization_id}`, () => listMemberProjects(member.user_id, org.organization_id))
  const update = useAction(async (values: { role?: Enums<'org_role'>; status?: Enums<'member_status'> }) => updateOrgMember(member.id, values))
  const [confirm, setConfirm] = useState<null | 'desativar' | 'reativar' | 'admin' | 'membro'>(null)

  async function apply() {
    const values = confirm === 'desativar' ? { status: 'inativo' as const } : confirm === 'reativar' ? { status: 'ativo' as const }
      : confirm === 'admin' ? { role: 'admin' as const } : { role: 'membro' as const }
    if (await update.run(values)) {
      toast('ok', confirm === 'desativar' ? 'Usuário desativado. Os registros dele foram preservados.' : 'Alteração salva.')
      onChanged()
    }
  }

  return (
    <Modal open wide title={member.profile?.name || member.profile?.email || 'Usuário'} onClose={onClose}
      footer={confirm ? <>
        <Button variant="secondary" onClick={() => setConfirm(null)}>Voltar</Button>
        <Button variant={confirm === 'desativar' ? 'danger' : 'primary'} loading={update.pending} onClick={() => void apply()}>Confirmar</Button>
      </> : <Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      {confirm ? (
        <div className="form">
          {confirm === 'desativar' && <p>A pessoa perde o acesso a todas as obras desta empresa imediatamente. Diários, fotos, ocorrências e o histórico feitos por ela continuam preservados e consultáveis.</p>}
          {confirm === 'reativar' && <p>A pessoa volta a acessar as obras em que está na equipe.</p>}
          {confirm === 'admin' && <p>Administradores veem e editam todas as obras, usuários, configurações e a auditoria da empresa.</p>}
          {confirm === 'membro' && <p>A pessoa passa a ver apenas as obras em que está na equipe.</p>}
          <ErrorBox error={update.error} />
        </div>
      ) : (
        <div className="form">
          <dl className="dl">
            <dt>E-mail</dt><dd>{member.profile?.email}</dd>
            <dt>Perfil na empresa</dt><dd>{ORG_ROLE[member.role]}</dd>
            <dt>Situação</dt><dd><Badge tone={MEMBER_STATUS[member.status].tone}>{MEMBER_STATUS[member.status].label}</Badge></dd>
          </dl>
          {isSelf ? <Alert tone="info">Para mudar o seu próprio perfil, peça a outro administrador.</Alert> : (
            <div className="row">
              {member.role === 'membro'
                ? <Button variant="secondary" onClick={() => setConfirm('admin')}>Tornar administrador</Button>
                : <Button variant="secondary" onClick={() => setConfirm('membro')}>Tornar membro</Button>}
              {member.status === 'inativo'
                ? <Button variant="secondary" onClick={() => setConfirm('reativar')}>Reativar acesso</Button>
                : <Button variant="danger" onClick={() => setConfirm('desativar')}>Desativar acesso</Button>}
            </div>
          )}
          <p className="form-section-title">Obras com acesso</p>
          {member.role === 'admin' && <p className="field-hint">Administradores acessam todas as obras.</p>}
          {projects.loading ? <Loading /> : !projects.data?.length ? <p className="muted">Nenhuma obra atribuída.</p> : (
            <ul className="list">
              {projects.data.map((pm) => (
                <li key={pm.id} className="row" style={{ padding: '8px 0' }}>
                  <div className="row-main"><Link to={`/obras/${pm.project.id}`}><strong>{pm.project.name}</strong></Link><span>{pm.project.code}{pm.project.archived_at && ' — arquivada'}</span></div>
                  <Badge tone="blue">{PROJECT_ROLE[pm.role].label}</Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="field-hint">Papéis e permissões por obra são ajustados na aba Equipe de cada obra.</p>
        </div>
      )}
    </Modal>
  )
}
