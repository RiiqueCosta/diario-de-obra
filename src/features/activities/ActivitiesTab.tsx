import { useMemo, useState } from 'react'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { addDaysISO, formatDate, formatNumber, formatPercent, todayISO } from '@/lib/format'
import { ACTIVITY_STATUS, PRIORITY, options } from '@/lib/labels'
import { useOrgSettings } from '@/lib/useOrgSettings'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { dateOrder, percent } from '@/lib/validation'
import { Alert, Badge, Button, EmptyState, ErrorBox, Loading, Modal, Panel, ProgressBar, SelectField, Tabs, TextAreaField, TextField, useToast } from '@/ui/components'
import { listProjectMembers } from '../projects/api'
import { executedByActivity, listActivities, listStages, saveActivity, saveStage, setDependencies, type Activity, type Stage } from './api'

const isLate = (a: Activity, today: string) => a.status !== 'concluida' && a.status !== 'cancelada' && !!a.planned_end_date && a.planned_end_date < today
const isDueSoon = (a: Activity, today: string, days: number) => a.status !== 'concluida' && a.status !== 'cancelada' && !!a.planned_end_date && a.planned_end_date >= today && a.planned_end_date <= addDaysISO(today, days)

export function ActivitiesTab({ projectId, canManage, archived }: { projectId: string; canManage: boolean; archived: boolean }) {
  const org = useOrg()
  const { session } = useAuth()
  const settings = useOrgSettings(org.organization_id)
  const stages = useQuery(`stages:${projectId}`, () => listStages(projectId))
  const acts = useQuery(`activities:${projectId}`, () => listActivities(projectId))
  const exec = useQuery(`activities:exec:${projectId}`, () => executedByActivity(projectId))
  const [view, setView] = useState<'lista' | 'cronograma'>('lista')
  const [filter, setFilter] = useState<'todas' | 'atrasadas' | 'vencendo' | 'bloqueadas' | 'abertas'>('abertas')
  const [editing, setEditing] = useState<Activity | 'nova' | null>(null)
  const [stageEdit, setStageEdit] = useState<Stage | 'nova' | null>(null)
  const today = todayISO()
  const due = settings.data?.due_soon_days ?? 3

  const all = acts.data ?? []
  const counts = {
    atrasadas: all.filter((a) => isLate(a, today)).length,
    vencendo: all.filter((a) => isDueSoon(a, today, due)).length,
    bloqueadas: all.filter((a) => a.status === 'bloqueada').length,
  }
  const filtered = all.filter((a) =>
    filter === 'todas' ? true : filter === 'atrasadas' ? isLate(a, today) : filter === 'vencendo' ? isDueSoon(a, today, due)
      : filter === 'bloqueadas' ? a.status === 'bloqueada' : a.status !== 'concluida' && a.status !== 'cancelada')

  const reload = () => { invalidate(`activities:${projectId}`); invalidate(`stages:${projectId}`); invalidate(`project:${projectId}`); invalidate('activities:options') }
  const editableFor = (a: Activity) => canManage || a.responsible_user_id === session?.user.id

  if ((acts.loading && !acts.data) || (stages.loading && !stages.data)) return <Loading />
  return (
    <>
      <ErrorBox error={acts.error ?? stages.error} onRetry={() => { void acts.refetch(); void stages.refetch() }} />
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <button type="button" className={`stat${counts.atrasadas ? ' danger' : ''}`} onClick={() => setFilter('atrasadas')}><div className="stat-value">{counts.atrasadas}</div><div className="stat-label">Atrasadas</div></button>
        <button type="button" className={`stat${counts.vencendo ? ' attention' : ''}`} onClick={() => setFilter('vencendo')}><div className="stat-value">{counts.vencendo}</div><div className="stat-label">Vencem em {due} dias</div></button>
        <button type="button" className={`stat${counts.bloqueadas ? ' danger' : ''}`} onClick={() => setFilter('bloqueadas')}><div className="stat-value">{counts.bloqueadas}</div><div className="stat-label">Bloqueadas</div></button>
        <div className="stat"><div className="stat-value">{all.filter((a) => a.status === 'concluida').length}/{all.filter((a) => a.status !== 'cancelada').length}</div><div className="stat-label">Concluídas</div></div>
      </div>
      <div className="row between mt-16">
        <Tabs tabs={[{ id: 'lista', label: 'Lista' }, { id: 'cronograma', label: 'Cronograma' }]} value={view} onChange={setView} />
        {canManage && !archived && <div className="row"><Button variant="secondary" onClick={() => setStageEdit('nova')}>Nova etapa</Button><Button icon="mais" onClick={() => setEditing('nova')}>Nova atividade</Button></div>}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <SelectField label="Mostrar" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          options={[{ value: 'abertas', label: 'Em aberto' }, { value: 'todas', label: 'Todas' }, { value: 'atrasadas', label: `Atrasadas (${counts.atrasadas})` }, { value: 'vencendo', label: `Vencendo (${counts.vencendo})` }, { value: 'bloqueadas', label: `Bloqueadas (${counts.bloqueadas})` }]} />
      </div>

      {all.length === 0 ? (
        <EmptyState icon="calendario" title="Nenhuma atividade no cronograma" action={canManage && !archived ? <Button icon="mais" onClick={() => setStageEdit('nova')}>Criar a primeira etapa</Button> : undefined}>
          Divida a obra em etapas (fundação, estrutura, alvenaria…) com peso no avanço total, e cada etapa em atividades com prazos e responsáveis.
        </EmptyState>
      ) : view === 'cronograma' ? (
        <Gantt activities={filtered} stages={stages.data ?? []} today={today} onOpen={(a) => setEditing(a)} />
      ) : (
        <div className="stack">
          {[...(stages.data ?? []), { id: '', name: 'Sem etapa', weight: 0 } as Stage].map((s) => {
            const list = filtered.filter((a) => (a.stage_id ?? '') === s.id)
            const stageAll = all.filter((a) => (a.stage_id ?? '') === s.id && a.status !== 'cancelada')
            if (!s.id && list.length === 0) return null
            const sum = stageAll.reduce((x, a) => x + Number(a.weight), 0)
            const prog = sum > 0 ? stageAll.reduce((x, a) => x + Number(a.weight) * Number(a.progress_percentage), 0) / sum : 0
            return (
              <Panel key={s.id || 'none'} padded={false}
                title={<span className="row" style={{ gap: 10 }}>{s.name}{s.id && <span className="muted small">peso {formatNumber(s.weight, 2)} — {formatPercent(prog, 0)}</span>}</span>}
                actions={s.id && canManage && !archived ? <Button size="sm" variant="ghost" onClick={() => setStageEdit(s)}>Editar etapa</Button> : undefined}>
                {s.id && <div style={{ padding: '10px 18px 0' }}><ProgressBar value={prog} label={`Avanço de ${s.name}`} /></div>}
                {list.length === 0 ? <p className="muted" style={{ padding: '12px 18px' }}>Nenhuma atividade {filter !== 'todas' ? 'neste filtro' : 'nesta etapa'}.</p> : (
                  <div className="table-wrap"><table className="data">
                    <thead><tr><th>Atividade</th><th>Responsável</th><th>Prazo</th><th>Avanço</th><th>Realizado</th><th>Situação</th></tr></thead>
                    <tbody>{list.map((a) => {
                      const e = exec.data?.[a.id]
                      return (
                        <tr key={a.id} className={editableFor(a) ? 'clickable' : ''} onClick={() => editableFor(a) && setEditing(a)}>
                          <td><strong>{a.title}</strong>{a.location && <div className="muted small">{a.location}</div>}<div className="row" style={{ gap: 4, marginTop: 2 }}><Badge tone={PRIORITY[a.priority].tone}>{PRIORITY[a.priority].label}</Badge>{a.deps.length > 0 && <Badge tone="neutral">{a.deps.length} {a.deps.length === 1 ? 'dependência' : 'dependências'}</Badge>}</div></td>
                          <td>{a.responsible?.name || a.responsible?.email || <span className="muted">—</span>}</td>
                          <td className="num">{formatDate(a.planned_end_date)}{isLate(a, today) && <div><Badge tone="red">Atrasada</Badge></div>}{isDueSoon(a, today, due) && <div><Badge tone="yellow">Vence logo</Badge></div>}</td>
                          <td style={{ minWidth: 120 }}><ProgressBar value={a.progress_percentage} /><span className="small num">{formatPercent(a.progress_percentage)}</span></td>
                          <td className="small num">{e ? <>{a.planned_quantity ? `${formatNumber(e.quantity, 2)} de ${formatNumber(a.planned_quantity, 2)} ${a.unit ?? ''}` : `${e.reports} ${e.reports === 1 ? 'registro' : 'registros'}`}<div className="muted">último {formatDate(e.last_date)}</div></> : <span className="muted">Sem registros</span>}</td>
                          <td><Badge tone={ACTIVITY_STATUS[a.status].tone}>{ACTIVITY_STATUS[a.status].label}</Badge></td>
                        </tr>
                      )
                    })}</tbody>
                  </table></div>
                )}
              </Panel>
            )
          })}
        </div>
      )}
      <p className="field-hint mt-16">O avanço físico da obra é calculado pelos pesos das etapas e das atividades (não por média simples). "Realizado" soma o que foi lançado nos diários.</p>
      {editing && <ActivityModal projectId={projectId} activity={editing === 'nova' ? null : editing} stages={stages.data ?? []} all={all} canManage={canManage}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      {stageEdit && <StageModal projectId={projectId} stage={stageEdit === 'nova' ? null : stageEdit} next={(stages.data?.length ?? 0) + 1} onClose={() => setStageEdit(null)} onSaved={() => { setStageEdit(null); reload() }} />}
    </>
  )
}

function StageModal({ projectId, stage, next, onClose, onSaved }: { projectId: string; stage: Stage | null; next: number; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: stage?.name ?? '', description: stage?.description ?? '', sequence: String(stage?.sequence ?? next), weight: String(stage?.weight ?? 1).replace('.', ',') })
  const w = Number(v.weight.replace(',', '.'))
  const save = useAction(async (archive?: boolean) => saveStage(stage?.id ?? null, archive ? { archived_at: new Date().toISOString() }
    : { project_id: projectId, name: v.name.trim(), description: v.description.trim() || null, sequence: Number(v.sequence) || 0, weight: w }))
  const invalid = !v.name.trim() || Number.isNaN(w) || w < 0
  return (
    <Modal open title={stage ? 'Editar etapa' : 'Nova etapa'} onClose={onClose}
      footer={<>
        {stage && <Button variant="danger" onClick={async () => { if (await save.run(true)) onSaved() }}>Arquivar etapa</Button>}
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button disabled={invalid} loading={save.pending} onClick={async () => { if (await save.run()) onSaved() }}>Salvar</Button>
      </>}>
      <div className="form">
        <TextField label="Nome da etapa" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: Estrutura" required />
        <div className="grid-2">
          <TextField label="Ordem" type="number" value={v.sequence} onChange={(e) => setV({ ...v, sequence: e.target.value })} />
          <TextField label="Peso no avanço da obra" inputMode="decimal" value={v.weight} onChange={(e) => setV({ ...v, weight: e.target.value })}
            hint="Ex.: % do orçamento ou do esforço. Os pesos são relativos entre as etapas." error={Number.isNaN(w) || w < 0 ? 'Peso inválido.' : undefined} />
        </div>
        <TextAreaField label="Descrição" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        {stage && <p className="field-hint">Arquivar tira a etapa do cálculo de avanço. As atividades continuam registradas.</p>}
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

function ActivityModal({ projectId, activity, stages, all, canManage, onClose, onSaved }: {
  projectId: string; activity: Activity | null; stages: Stage[]; all: Activity[]; canManage: boolean; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const org = useOrg()
  const team = useQuery(`project_members:${projectId}`, () => listProjectMembers(projectId))
  const units = useQuery(`units:ativas:${org.organization_id}`, async () => unwrap(await supabase.from('units').select('code, name').eq('organization_id', org.organization_id).eq('active', true).order('code')) ?? [])
  const a = activity
  const [v, setV] = useState({
    title: a?.title ?? '', description: a?.description ?? '', stage_id: a?.stage_id ?? stages[0]?.id ?? '', location: a?.location ?? '',
    responsible_user_id: a?.responsible_user_id ?? '', planned_start_date: a?.planned_start_date ?? '', planned_end_date: a?.planned_end_date ?? '',
    actual_start_date: a?.actual_start_date ?? '', progress: String(a?.progress_percentage ?? 0).replace('.', ','), weight: String(a?.weight ?? 1).replace('.', ','),
    planned_quantity: a?.planned_quantity === null || a?.planned_quantity === undefined ? '' : String(a.planned_quantity).replace('.', ','), unit: a?.unit ?? '',
    priority: a?.priority ?? 'media' as Enums<'priority_level'>, status: a?.status ?? 'nao_iniciada' as Enums<'activity_status'>, notes: a?.notes ?? '',
  })
  const current = a?.deps.map((d) => d.depends_on_id) ?? []
  const [deps, setDeps] = useState<string[]>(current)
  const [submitted, setSubmitted] = useState(false)
  const pct = Number(v.progress.replace(',', '.'))
  const weight = Number(v.weight.replace(',', '.'))
  const pq = v.planned_quantity.trim() ? Number(v.planned_quantity.replace(',', '.')) : null
  const errors = {
    title: !v.title.trim() ? 'Informe o nome da atividade.' : undefined,
    dates: dateOrder(v.planned_start_date, v.planned_end_date, 'O prazo deve ser depois do início previsto.'),
    progress: Number.isNaN(pct) ? 'Número inválido.' : percent(pct),
    weight: Number.isNaN(weight) || weight < 0 ? 'Peso inválido.' : undefined,
    pq: pq !== null && (Number.isNaN(pq) || pq < 0) ? 'Quantidade inválida.' : undefined,
  }
  const blockedByDeps = deps.map((d) => all.find((x) => x.id === d)).filter((d) => d && d.status !== 'concluida' && d.status !== 'cancelada')
  const save = useAction(async () => {
    const values = canManage ? {
      project_id: projectId, title: v.title.trim(), description: v.description.trim() || null, stage_id: v.stage_id || null,
      location: v.location.trim() || null, responsible_user_id: v.responsible_user_id || null, planned_start_date: v.planned_start_date || null,
      planned_end_date: v.planned_end_date || null, actual_start_date: v.actual_start_date || null, progress_percentage: v.status === 'concluida' ? 100 : pct,
      weight, planned_quantity: pq, unit: v.unit || null, priority: v.priority, status: v.status, notes: v.notes.trim() || null,
    } : { progress_percentage: v.status === 'concluida' ? 100 : pct, status: v.status, notes: v.notes.trim() || null, actual_start_date: v.actual_start_date || null }
    const saved = await saveActivity(a?.id ?? null, a?.row_version ?? null, values)
    if (canManage) await setDependencies(saved.id, current, deps)
    return saved
  })
  return (
    <Modal open wide title={a ? a.title : 'Nova atividade'} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} onClick={async () => { setSubmitted(true); if (Object.values(errors).some(Boolean)) return; if (await save.run()) { toast('ok', 'Atividade salva.'); onSaved() } }}>Salvar</Button>
      </>}>
      <div className="form">
        {!canManage && <Alert tone="info">Como responsável, você atualiza o andamento. Os demais dados são definidos pelo gestor.</Alert>}
        <div className="grid-2">
          <TextField label="Atividade" value={v.title} disabled={!canManage} onChange={(e) => setV({ ...v, title: e.target.value })} error={submitted ? errors.title : undefined} required className="span-2" />
          <SelectField label="Etapa" value={v.stage_id} disabled={!canManage} onChange={(e) => setV({ ...v, stage_id: e.target.value })} placeholder="Sem etapa" options={stages.map((s) => ({ value: s.id, label: s.name }))} />
          <TextField label="Local" value={v.location} disabled={!canManage} onChange={(e) => setV({ ...v, location: e.target.value })} />
          <SelectField label="Responsável" value={v.responsible_user_id} disabled={!canManage} onChange={(e) => setV({ ...v, responsible_user_id: e.target.value })} placeholder="Não definido"
            options={(team.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || '' }))} />
          <SelectField label="Prioridade" value={v.priority} disabled={!canManage} onChange={(e) => setV({ ...v, priority: e.target.value as Enums<'priority_level'> })} options={options(PRIORITY)} />
          <TextField label="Início previsto" type="date" value={v.planned_start_date} disabled={!canManage} onChange={(e) => setV({ ...v, planned_start_date: e.target.value })} />
          <TextField label="Prazo previsto" type="date" value={v.planned_end_date} disabled={!canManage} onChange={(e) => setV({ ...v, planned_end_date: e.target.value })} error={errors.dates} />
          <SelectField label="Situação" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Enums<'activity_status'> })} options={options(ACTIVITY_STATUS)} />
          <TextField label="Percentual concluído" inputMode="decimal" value={v.status === 'concluida' ? '100' : v.progress} disabled={v.status === 'concluida'} onChange={(e) => setV({ ...v, progress: e.target.value })} error={errors.progress} />
          <TextField label="Início real" type="date" value={v.actual_start_date} max={todayISO()} onChange={(e) => setV({ ...v, actual_start_date: e.target.value })} hint="Preenchido automaticamente ao iniciar." />
          <TextField label="Conclusão real" value={a?.actual_end_date ? formatDate(a.actual_end_date) : 'Registrada ao concluir'} disabled readOnly />
          <TextField label="Peso dentro da etapa" inputMode="decimal" value={v.weight} disabled={!canManage} onChange={(e) => setV({ ...v, weight: e.target.value })} error={errors.weight} />
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <TextField label="Quantidade prevista" inputMode="decimal" value={v.planned_quantity} disabled={!canManage} onChange={(e) => setV({ ...v, planned_quantity: e.target.value })} error={errors.pq} />
            <SelectField label="Unidade" value={v.unit} disabled={!canManage} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="—" options={(units.data ?? []).map((u) => ({ value: u.code, label: u.code }))} style={{ width: 100 }} />
          </div>
        </div>
        <TextAreaField label="Descrição" value={v.description} disabled={!canManage} onChange={(e) => setV({ ...v, description: e.target.value })} />
        {canManage && (
          <SelectField label="Depende de (concluir antes)" value="" placeholder="Adicionar dependência"
            onChange={(e) => { if (e.target.value) setDeps((d) => [...d, e.target.value]) }}
            options={all.filter((x) => x.id !== a?.id && !deps.includes(x.id)).map((x) => ({ value: x.id, label: x.title }))} />
        )}
        {deps.length > 0 && (
          <ul className="list">{deps.map((d) => { const x = all.find((y) => y.id === d); return (
            <li key={d} className="row between" style={{ padding: '6px 0' }}>
              <span>{x?.title} {x && <Badge tone={ACTIVITY_STATUS[x.status].tone}>{ACTIVITY_STATUS[x.status].label}</Badge>}</span>
              {canManage && <Button size="sm" variant="ghost" onClick={() => setDeps((s) => s.filter((y) => y !== d))}>Remover</Button>}
            </li>) })}</ul>
        )}
        {blockedByDeps.length > 0 && v.status === 'em_andamento' && <Alert tone="warn">Atenção: há dependências ainda não concluídas.</Alert>}
        <TextAreaField label="Observações" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- cronograma (Gantt simples)
function Gantt({ activities, stages, today, onOpen }: { activities: Activity[]; stages: Stage[]; today: string; onOpen: (a: Activity) => void }) {
  const withDates = activities.filter((a) => a.planned_start_date && a.planned_end_date)
  const range = useMemo(() => {
    const dates = withDates.flatMap((a) => [a.planned_start_date!, a.planned_end_date!, a.actual_start_date, a.actual_end_date].filter(Boolean) as string[]).concat(today)
    const min = dates.reduce((a, b) => (a < b ? a : b))
    const max = dates.reduce((a, b) => (a > b ? a : b))
    return { min: addDaysISO(min, -3), max: addDaysISO(max, 3) }
  }, [withDates, today])
  if (withDates.length === 0) return <EmptyState icon="calendario" title="Sem datas para o cronograma">Informe início e prazo previstos nas atividades para vê-las no cronograma.</EmptyState>
  const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000
  const total = day(range.max) - day(range.min) + 1
  const pos = (iso: string) => ((day(iso) - day(range.min)) / total) * 100
  const months: Array<{ label: string; left: number }> = []
  for (let d = range.min.slice(0, 8) + '01'; d <= range.max; ) {
    if (d >= range.min) months.push({ label: new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }), left: pos(d) })
    const [y, m] = d.split('-').map(Number)
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  }
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name
  const sorted = [...withDates].sort((a, b) => a.planned_start_date!.localeCompare(b.planned_start_date!))
  return (
    <div className="panel">
      <div className="gantt">
        <div className="gantt-axis"><div className="gantt-label" />
          <div className="gantt-track">{months.map((m) => <span key={m.label + m.left} className="gantt-month" style={{ left: `${m.left}%` }}>{m.label}</span>)}</div>
        </div>
        {sorted.map((a) => {
          const late = a.status !== 'concluida' && a.status !== 'cancelada' && a.planned_end_date! < today
          const actualEnd = a.actual_end_date ?? (a.actual_start_date ? today : null)
          return (
            <button key={a.id} type="button" className="gantt-row" onClick={() => onOpen(a)}>
              <div className="gantt-label"><strong>{a.title}</strong><span className="muted small">{stageName(a.stage_id) ?? ''}</span></div>
              <div className="gantt-track">
                <span className={`gantt-plan${late ? ' late' : ''}`} style={{ left: `${pos(a.planned_start_date!)}%`, width: `${Math.max(0.6, pos(addDaysISO(a.planned_end_date!, 1)) - pos(a.planned_start_date!))}%` }}
                  title={`Previsto: ${formatDate(a.planned_start_date)} a ${formatDate(a.planned_end_date)}`}>
                  <span className="gantt-progress" style={{ width: `${a.progress_percentage}%` }} />
                </span>
                {a.actual_start_date && actualEnd && (
                  <span className="gantt-actual" style={{ left: `${pos(a.actual_start_date)}%`, width: `${Math.max(0.6, pos(addDaysISO(actualEnd, 1)) - pos(a.actual_start_date))}%` }}
                    title={`Realizado: ${formatDate(a.actual_start_date)} a ${a.actual_end_date ? formatDate(a.actual_end_date) : 'em andamento'}`} />
                )}
                <span className="gantt-today" style={{ left: `${pos(today)}%` }} />
              </div>
            </button>
          )
        })}
      </div>
      <div className="row small" style={{ padding: '10px 18px' }}>
        <span className="row" style={{ gap: 6 }}><span className="gantt-key plan" />Previsto (preenchido = % concluído)</span>
        <span className="row" style={{ gap: 6 }}><span className="gantt-key actual" />Realizado</span>
        <span className="row" style={{ gap: 6 }}><span className="gantt-key late" />Atrasada</span>
        <span className="row" style={{ gap: 6 }}><span className="gantt-key today" />Hoje</span>
      </div>
    </div>
  )
}
