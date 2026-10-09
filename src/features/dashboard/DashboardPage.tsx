import { useState } from 'react'
import { Link } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { useQuery } from '@/lib/useQuery'
import { addDaysISO, dateStamp, formatDateTime, todayISO } from '@/lib/format'
import { PROJECT_STATUS } from '@/lib/labels'
import { Button, EmptyState, ErrorBox, FilterPanel, Loading, Panel, SelectField, TextField } from '@/ui/components'
import { listProjects } from '../projects/api'
import { listOrgMembers } from '../users/api'
import { ProjectCard } from '../projects/ProjectsListPage'

type Summary = {
  total_obras: number; obras_em_andamento: number; obras_concluidas: number; obras_paralisadas: number; obras_com_atraso: number
  diarios_hoje: number; diarios_no_periodo: number; diarios_pendentes: number; diarios_devolvidos: number
  ocorrencias_abertas: number; ocorrencias_sem_responsavel: number; atividades_atrasadas: number; atividades_bloqueadas: number
  pendencias_vencendo: number; gerado_em: string
}

export function DateStamp({ iso, small }: { iso: string; small?: boolean }) {
  const s = dateStamp(iso)
  return (
    <div>
      <div className={`stamp${small ? ' small' : ''}`} aria-label={`${s.day} de ${s.month} de ${s.year}`}>
        <span className="stamp-day">{s.day}</span>
        <span className="stamp-month">{s.month}</span>
        <span className="stamp-year">{s.year}</span>
      </div>
      {!small && <span className="stamp-week">{s.weekday}</span>}
    </div>
  )
}

function Stat({ value, label, to, tone }: { value: number | undefined; label: string; to?: string; tone?: 'attention' | 'danger' }) {
  const cls = `stat${tone && value ? ` ${tone}` : ''}`
  const inner = <><div className="stat-value">{value ?? '—'}</div><div className="stat-label">{label}</div></>
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

export function DashboardPage() {
  const org = useOrg()
  const { profile, isAdmin } = useAuth()
  const today = todayISO()
  const [from, setFrom] = useState(addDaysISO(today, -29))
  const [to, setTo] = useState(today)
  const [project, setProject] = useState('')
  const [responsible, setResponsible] = useState('')
  const [status, setStatus] = useState('')

  const projects = useQuery(`projects:list:${org.organization_id}:dash`, () => listProjects(org.organization_id, { pageSize: 200 }))
  const people = useQuery(isAdmin ? `org_members:${org.organization_id}:ativos` : null, () => listOrgMembers(org.organization_id, false))
  const key = `dashboard:${org.organization_id}:${from}:${to}:${project}:${responsible}:${status}`
  const summary = useQuery(key, async () => unwrap(await supabase.rpc('dashboard_summary', {
    p_org: org.organization_id, p_from: from || undefined, p_to: to || undefined,
    p_project: project || undefined, p_responsible: responsible || undefined,
    p_status: (status || undefined) as Enums<'project_status'> | undefined,
  })) as unknown as Summary)

  const s = summary.data
  const firstName = profile?.name?.split(' ')[0]
  const recent = (projects.data?.rows ?? []).filter((p) => p.status === 'em_andamento' || p.status === 'paralisada').slice(0, 6)

  return (
    <>
      <div className="dash-head">
        <DateStamp iso={today} />
        <div className="dash-head-text">
          <h1>{firstName ? `Olá, ${firstName}` : 'Início'}</h1>
          <p className="page-subtitle">{org.organization.name.replace(/\.$/, '')} — indicadores das obras que você acessa, calculados a partir dos registros.</p>
        </div>
      </div>

      <FilterPanel active={[project, responsible, status].filter(Boolean).length + (from !== addDaysISO(today, -29) || to !== today ? 1 : 0)}>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <TextField label="De" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="Até" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Todas"
            options={(projects.data?.rows ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
          {isAdmin && <SelectField label="Responsável" value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Todos"
            options={(people.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || '' }))} />}
          <SelectField label="Situação da obra" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todas"
            options={Object.entries(PROJECT_STATUS).map(([value, st]) => ({ value, label: st.label }))} />
        </div>
      </FilterPanel>

      <ErrorBox error={summary.error} onRetry={summary.refetch} />
      {summary.loading && !s ? <Loading /> : (
        <div className="stack mt-16">
          <section aria-label="Obras">
            <h2 className="form-section-title" style={{ marginBottom: 10 }}>Obras</h2>
            <div className="stats">
              <Stat value={s?.total_obras} label="Obras cadastradas" to="/obras" />
              <Stat value={s?.obras_em_andamento} label="Em andamento" to="/obras?status=em_andamento" />
              <Stat value={s?.obras_paralisadas} label="Paralisadas" to="/obras?status=paralisada" tone="attention" />
              <Stat value={s?.obras_concluidas} label="Concluídas" to="/obras?status=concluida" />
              <Stat value={s?.obras_com_atraso} label="Com atividades atrasadas" tone="danger" />
            </div>
          </section>
          <section aria-label="Diários e pendências">
            <h2 className="form-section-title" style={{ marginBottom: 10 }}>Diários e pendências</h2>
            <div className="stats">
              <Stat value={s?.diarios_hoje} label="Diários registrados hoje" />
              <Stat value={s?.diarios_no_periodo} label="Diários no período" />
              <Stat value={s?.diarios_pendentes} label="Aguardando aprovação" tone="attention" />
              <Stat value={s?.diarios_devolvidos} label="Devolvidos para correção" tone="attention" />
              <Stat value={s?.ocorrencias_abertas} label="Ocorrências abertas" tone="attention" />
              <Stat value={s?.ocorrencias_sem_responsavel} label="Ocorrências sem responsável" tone="danger" />
              <Stat value={s?.atividades_atrasadas} label="Atividades atrasadas" tone="danger" />
              <Stat value={s?.pendencias_vencendo} label="Prazos próximos do vencimento" tone="attention" />
            </div>
          </section>
          {s && <p className="field-hint">Atualizado em {formatDateTime(s.gerado_em)}.</p>}
        </div>
      )}

      <div className="mt-24" />
      <Panel title="Obras em andamento" actions={<Link to="/obras" className="btn btn-ghost btn-sm">Ver todas</Link>}>
        {projects.loading && !projects.data ? <Loading /> : recent.length === 0 ? (
          <EmptyState icon="obra" title="Nenhuma obra em andamento"
            action={isAdmin ? <Link to="/obras/nova" className="btn btn-primary btn-md">Cadastrar obra</Link> : undefined}>
            {isAdmin ? 'Cadastre uma obra e mude a situação para "Em andamento" quando os trabalhos começarem.' : 'Quando você for incluído na equipe de uma obra, ela aparece aqui.'}
          </EmptyState>
        ) : <div className="project-cards">{recent.map((p) => <ProjectCard key={p.id} p={p} />)}</div>}
      </Panel>
      {!summary.loading && s?.total_obras === 0 && isAdmin && (
        <div className="mt-16"><Button variant="secondary" onClick={() => window.location.assign('/config/usuarios')}>Convidar a equipe</Button></div>
      )}
    </>
  )
}
