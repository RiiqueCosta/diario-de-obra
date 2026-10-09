import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatDate, formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { APPROVAL_DECISION, ATTENDANCE, EXECUTION_STATUS, OCCURRENCE_STATUS, PRIORITY, REPORT_STATUS, WEATHER, WORK_CONDITION } from '@/lib/labels'
import { Alert, Badge, Button, EmptyState, ErrorBox, Loading, Modal, PageHeader, Panel, TextAreaField, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { useProjectPerms } from '../projects/hooks'
import { DateStamp } from '../dashboard/DashboardPage'
import { EQUIPMENT_USAGE } from '../team/MaterialsPage'
import { listPhotos, PhotoGrid, PhotoViewer, type Photo } from '../photos/photos'
import { approveReport, getFullReport, getVersionSnapshot, reopenReport, returnReport, submitReport, type FullReport } from './api'
import { ReportPdfButton } from '../reports/ReportPdfButton'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Panel title={title}>{children}</Panel>
}

function Text({ value }: { value: string | null | undefined }) {
  return value ? <p style={{ whiteSpace: 'pre-wrap' }}>{value}</p> : <p className="muted">—</p>
}

export function DiaryViewPage({ reportId }: { reportId: string }) {
  const { session } = useAuth()
  const org = useOrg()
  const navigate = useNavigate()
  const toast = useToast()
  const q = useQuery(`report:${reportId}`, () => getFullReport(reportId))
  const perms = useProjectPerms(q.data?.project_id)
  const photos = useQuery(q.data ? `photos:report:${reportId}` : null, () => listPhotos(org.organization_id, { dailyReportId: reportId }))
  const [openPhoto, setOpenPhoto] = useState<Photo | null>(null)
  const [dialog, setDialog] = useState<null | 'aprovar' | 'devolver' | 'reabrir' | 'enviar'>(null)
  const [text, setText] = useState('')
  const [version, setVersion] = useState<string | null>(null)
  const act = useAction(async (kind: 'aprovar' | 'devolver' | 'reabrir' | 'enviar') => {
    const r = q.data!
    if (kind === 'aprovar') return approveReport(r.id, text.trim() || undefined, r.row_version)
    if (kind === 'devolver') return returnReport(r.id, text, r.row_version)
    if (kind === 'enviar') return submitReport(r.id, r.row_version)
    return reopenReport(r.id, text, r.row_version)
  })

  if (q.loading && !q.data) return <Loading />
  if (q.error) return <><Link to="/diarios" className="back-link"><Icon name="voltar" size={16} /> Diários</Link><ErrorBox error={q.error} onRetry={q.refetch} /></>
  const r = q.data!
  const st = REPORT_STATUS[r.status]
  const isAuthor = r.author_user_id === session?.user.id
  const canEdit = (r.status === 'rascunho' || r.status === 'devolvido') && ((isAuthor && perms.can('diario.criar')) || (r.status === 'devolvido' && perms.can('diario.corrigir')))
  const canReview = r.status === 'enviado' && perms.can('diario.aprovar') && !isAuthor
  const canReopen = r.status === 'aprovado' && perms.can('diario.corrigir')
  const present = r.workers.filter((w) => w.attendance_status === 'presente').length + r.crews.reduce((s, c) => s + c.quantity - c.absent_quantity, 0)

  async function doAction() {
    if (!dialog) return
    const res = await act.run(dialog)
    if (res) {
      const msg = { aprovar: 'Diário aprovado.', devolver: 'Diário devolvido para correção.', reabrir: 'Diário reaberto para correção. A versão aprovada foi guardada.', enviar: 'Diário enviado para aprovação.' }[dialog]
      setDialog(null); setText('')
      invalidate(`report:${reportId}`); invalidate('reports:'); invalidate('dashboard:'); invalidate('notifications:'); invalidate('approvals:')
      toast('ok', msg)
      if (dialog === 'reabrir') navigate(`/diarios/${reportId}/editar`)
    }
  }

  return (
    <>
      <PageHeader
        back={<Link to={`/diarios?obra=${r.project_id}`} className="back-link"><Icon name="voltar" size={16} /> Diários</Link>}
        title={<span className="row" style={{ gap: 16 }}><DateStamp iso={r.report_date} small /><span><Link to={`/obras/${r.project_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.project?.name}</Link></span></span>}
        subtitle={<span className="row">
          <Badge tone={st.tone}>{st.label}</Badge>
          {r.kind === 'complementar' && <Badge tone="neutral">Complementar</Badge>}
          {r.version > 1 && <Badge tone="neutral">Versão {r.version}</Badge>}
          <span>Preenchido por {r.author?.name || r.author?.email}</span>
        </span>}
        actions={<>
          <ReportPdfButton kind="diario" reportId={r.id} />
          {canEdit && <Button variant="secondary" icon="editar" onClick={() => navigate(`/diarios/${r.id}/editar`)}>Editar</Button>}
          {canEdit && <Button icon="aprovar" onClick={() => setDialog('enviar')}>Enviar para aprovação</Button>}
          {canReview && <Button variant="danger" onClick={() => setDialog('devolver')}>Devolver</Button>}
          {canReview && <Button icon="ok" onClick={() => setDialog('aprovar')}>Aprovar</Button>}
          {canReopen && <Button variant="secondary" onClick={() => setDialog('reabrir')}>Reabrir para correção</Button>}
        </>}
      />
      {r.status === 'devolvido' && r.returned_reason && <Alert tone="warn"><p><strong>Devolvido para correção:</strong> {r.returned_reason}</p></Alert>}
      {r.status === 'aprovado' && <Alert tone="ok"><p>Aprovado por {r.approvals.filter((a) => a.decision === 'aprovado').at(-1)?.reviewer?.name ?? '—'} em {formatDateTime(r.approved_at)}. Registro bloqueado para edição.</p></Alert>}
      {r.status === 'enviado' && isAuthor && <Alert tone="info"><p>Enviado em {formatDateTime(r.submitted_at)}. Aguardando revisão de um gestor ou engenheiro.</p></Alert>}

      <div className="grid-2 mt-16">
        <Section title="Identificação e clima">
          <dl className="dl">
            <dt>Data</dt><dd className="num">{formatDate(r.report_date)}</dd>
            <dt>Horário</dt><dd className="num">{r.start_time ? `${formatTime(r.start_time)} às ${formatTime(r.end_time)}` : '—'}</dd>
            <dt>Clima</dt><dd>{r.weather ? WEATHER[r.weather] : '—'}{r.weather_afternoon && ` (tarde: ${WEATHER[r.weather_afternoon]})`}{r.temperature_c != null && ` — ${formatNumber(r.temperature_c, 1)} °C`}</dd>
            <dt>Condição de trabalho</dt><dd>{r.work_conditions ? WORK_CONDITION[r.work_conditions].label : '—'}</dd>
            <dt>Impacto do clima</dt><dd>{r.weather_impact || '—'}</dd>
            {r.weather_notes && <><dt>Observações</dt><dd>{r.weather_notes}</dd></>}
          </dl>
        </Section>
        <Section title="Resumo do dia">
          <Text value={r.general_summary} />
          {r.no_execution_reason && <p className="mt-8"><strong>Sem execução:</strong> {r.no_execution_reason}</p>}
          <p className="small muted mt-8">{r.activities.length} {r.activities.length === 1 ? 'serviço' : 'serviços'}, {present} {present === 1 ? 'pessoa presente' : 'pessoas presentes'}, {r.occurrences.length} {r.occurrences.length === 1 ? 'ocorrência' : 'ocorrências'}.</p>
        </Section>
      </div>

      <div className="stack mt-16">
        <Section title="Serviços executados">
          {r.activities.length === 0 ? <p className="muted">Nenhum serviço registrado.</p> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Serviço</th><th>Local</th><th>Quantidade</th><th>Avanço</th><th>Situação</th></tr></thead>
              <tbody>{r.activities.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.description}</strong>{(a.activity?.title || a.stage_name) && <div className="muted small">{[a.stage_name, a.activity?.title].filter(Boolean).join(' — ')}</div>}{a.team_description && <div className="small">Equipe: {a.team_description}</div>}{a.observations && <div className="small">Obs.: {a.observations}</div>}</td>
                  <td>{a.location || '—'}</td>
                  <td className="num">{a.quantity !== null ? `${formatNumber(a.quantity, 3)} ${a.unit ?? ''}` : '—'}</td>
                  <td className="num">{a.progress_percentage !== null ? `${formatNumber(a.progress_percentage, 1)}%` : '—'}</td>
                  <td><Badge tone={EXECUTION_STATUS[a.execution_status].tone}>{EXECUTION_STATUS[a.execution_status].label}</Badge></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Section>

        <Section title={`Mão de obra (${present} presentes)`}>
          {r.workers.length === 0 && r.crews.length === 0 ? <p className="muted">Nenhum registro de mão de obra.</p> : (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Nome / equipe</th><th>Função</th><th>Empresa</th><th>Presença</th><th>Horas</th></tr></thead>
              <tbody>
                {r.workers.map((w) => (
                  <tr key={w.id}><td>{w.worker?.name}</td><td>{w.job_title}</td><td>{w.company_name || 'Própria'}</td>
                    <td><Badge tone={ATTENDANCE[w.attendance_status].tone}>{ATTENDANCE[w.attendance_status].label}</Badge></td>
                    <td className="num">{w.hours_worked !== null ? formatNumber(w.hours_worked, 1) : '—'}</td></tr>
                ))}
                {r.crews.map((c) => (
                  <tr key={c.id}><td>Equipe ({c.quantity} {c.quantity === 1 ? 'pessoa' : 'pessoas'})</td><td>{c.job_title}</td><td>{c.company_name || 'Própria'}</td>
                    <td>{c.absent_quantity > 0 ? <Badge tone="yellow">{c.absent_quantity} {c.absent_quantity === 1 ? 'falta' : 'faltas'}</Badge> : <Badge tone="green">Completa</Badge>}</td><td>—</td></tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Section>

        <div className="grid-2">
          <Section title="Materiais">
            {r.materials.length === 0 ? <p className="muted">Nenhum material registrado.</p> : (
              <ul className="list">{r.materials.map((m) => (
                <li key={m.id} style={{ padding: '8px 0' }}>
                  <strong>{m.material?.name}</strong>{m.shortage && <> <Badge tone="yellow">Falta</Badge></>}
                  <div className="small">Recebido {formatNumber(m.quantity_received, 3)} {m.material?.unit} — utilizado {formatNumber(m.quantity_used, 3)} {m.material?.unit}{m.supplier_name && ` — ${m.supplier_name}`}{m.invoice_number && ` (NF ${m.invoice_number})`}</div>
                  {m.observations && <div className="small muted">{m.observations}</div>}
                </li>))}</ul>
            )}
          </Section>
          <Section title="Equipamentos">
            {r.equipment.length === 0 ? <p className="muted">Nenhum equipamento registrado.</p> : (
              <ul className="list">{r.equipment.map((e) => (
                <li key={e.id} style={{ padding: '8px 0' }}>
                  <strong>{e.equipment?.name}</strong> <Badge tone={EQUIPMENT_USAGE[e.usage_status].tone}>{EQUIPMENT_USAGE[e.usage_status].label}</Badge>
                  <div className="small">{e.hours_used !== null ? `${formatNumber(e.hours_used, 1)} h de uso` : ''}{e.observations && ` ${e.observations}`}</div>
                </li>))}</ul>
            )}
          </Section>
        </div>

        <Section title="Ocorrências">
          {r.occurrences.length === 0 ? <p className="muted">Nenhuma ocorrência neste dia.</p> : (
            <ul className="list">{r.occurrences.map((o) => (
              <li key={o.id} style={{ padding: '8px 0' }}>
                <Link to={`/ocorrencias/${o.id}`}><strong>{o.code} — {o.title}</strong></Link>{' '}
                <Badge tone={PRIORITY[o.priority].tone}>{PRIORITY[o.priority].label}</Badge> <Badge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</Badge>
                <div className="small muted">{o.category}</div>
              </li>))}</ul>
          )}
        </Section>

        <Section title={`Fotografias${photos.data ? ` (${photos.data.length})` : ''}`}>
          {photos.loading && !photos.data ? <Loading /> : !photos.data?.length ? <p className="muted">Nenhuma foto anexada.</p> : <PhotoGrid photos={photos.data} onOpen={setOpenPhoto} />}
        </Section>

        <div className="grid-2">
          <Section title="Próximo dia e pendências">
            <p className="form-section-title">Continua no próximo dia</p><Text value={r.next_day_plan} />
            <p className="form-section-title mt-16">Pendências</p><Text value={r.pending_items} />
          </Section>
          <Section title="Observações">
            <p className="form-section-title">Observações técnicas</p><Text value={r.technical_notes} />
            <p className="form-section-title mt-16">Observações finais</p><Text value={r.final_notes} />
          </Section>
        </div>

        <Section title="Histórico de aprovação">
          {r.approvals.length === 0 ? <EmptyState icon="historico" title="Ainda não enviado para aprovação" /> : (
            <ol className="timeline">
              {r.approvals.map((a) => (
                <li key={a.id}>
                  <strong>{APPROVAL_DECISION[a.decision]}</strong> <span className="muted small">versão {a.version}</span>
                  <div className="small">{a.reviewer?.name || a.reviewer?.email} — {formatDateTime(a.decided_at)}</div>
                  {a.comments && <div className="small" style={{ whiteSpace: 'pre-wrap' }}>"{a.comments}"</div>}
                </li>
              ))}
            </ol>
          )}
          {r.versions.length > 0 && (
            <>
              <p className="form-section-title mt-16">Versões aprovadas guardadas</p>
              <ul className="list">{r.versions.map((v) => (
                <li key={v.id} className="row between" style={{ padding: '8px 0' }}>
                  <span>Versão {v.version} — {v.reason} em {formatDateTime(v.created_at)}</span>
                  <Button size="sm" variant="secondary" onClick={() => setVersion(v.id)}>Ver versão</Button>
                </li>))}</ul>
            </>
          )}
          <p className="field-hint mt-16">A aprovação no sistema registra quem aprovou e quando. Não é assinatura digital certificada.</p>
        </Section>
      </div>

      {openPhoto && <PhotoViewer photo={openPhoto} canEdit={canEdit} onClose={() => setOpenPhoto(null)} onChanged={() => { setOpenPhoto(null); void photos.refetch() }} />}
      {version && <VersionModal id={version} onClose={() => setVersion(null)} />}
      <Modal open={!!dialog} onClose={() => { setDialog(null); setText('') }}
        title={dialog === 'aprovar' ? 'Aprovar diário' : dialog === 'devolver' ? 'Devolver para correção' : dialog === 'enviar' ? 'Enviar para aprovação' : 'Reabrir diário aprovado'}
        footer={<>
          <Button variant="secondary" onClick={() => { setDialog(null); setText('') }}>Cancelar</Button>
          <Button variant={dialog === 'devolver' ? 'danger' : 'primary'} loading={act.pending}
            disabled={(dialog === 'devolver' && text.trim().length < 5) || (dialog === 'reabrir' && text.trim().length < 10)}
            onClick={() => void doAction()}>
            {dialog === 'aprovar' ? 'Aprovar' : dialog === 'devolver' ? 'Devolver' : dialog === 'enviar' ? 'Enviar' : 'Reabrir para correção'}
          </Button>
        </>}>
        <div className="form">
          {dialog === 'aprovar' && <p>O diário fica bloqueado para edição e esta versão é guardada no histórico.</p>}
          {dialog === 'enviar' && <p>Depois de enviado, o diário fica bloqueado até ser aprovado ou devolvido.</p>}
          {dialog === 'reabrir' && <p>A versão aprovada atual é preservada. O diário volta para edição como versão {r.version + 1} e precisa ser aprovado de novo.</p>}
          {dialog !== 'enviar' && (
            <TextAreaField label={dialog === 'aprovar' ? 'Comentário (opcional)' : dialog === 'devolver' ? 'O que precisa ser corrigido' : 'Justificativa da correção'}
              value={text} onChange={(e) => setText(e.target.value)} required={dialog !== 'aprovar'} rows={4}
              hint={dialog === 'devolver' ? 'Mínimo de 5 caracteres. O autor recebe este texto.' : dialog === 'reabrir' ? 'Mínimo de 10 caracteres. Fica registrado no histórico.' : undefined} />
          )}
          <ErrorBox error={act.error} />
        </div>
      </Modal>
    </>
  )
}

function VersionModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery(`report_version:${id}`, () => getVersionSnapshot(id))
  const s = q.data?.snapshot as unknown as FullReport & { author_name?: string } | undefined
  return (
    <Modal open wide title={q.data ? `Versão ${q.data.version} guardada` : 'Versão'} onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      {q.loading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : s && (
        <div className="form">
          <p className="field-hint">Cópia exata do diário no momento em que foi guardada ({formatDateTime(q.data!.created_at)}). Não pode ser alterada.</p>
          <dl className="dl">
            <dt>Data</dt><dd>{formatDate(s.report_date)}</dd>
            <dt>Autor</dt><dd>{s.author_name ?? '—'}</dd>
            <dt>Clima</dt><dd>{s.weather ? WEATHER[s.weather] : '—'}</dd>
            <dt>Condição</dt><dd>{s.work_conditions ? WORK_CONDITION[s.work_conditions].label : '—'}</dd>
            <dt>Resumo</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{s.general_summary || '—'}</dd>
          </dl>
          <p className="form-section-title">Serviços ({s.activities?.length ?? 0})</p>
          <ul className="small">{(s.activities ?? []).map((a) => <li key={a.id}>{a.description}{a.quantity !== null && ` — ${formatNumber(a.quantity, 3)} ${a.unit ?? ''}`} ({EXECUTION_STATUS[a.execution_status]?.label})</li>)}</ul>
          <p className="form-section-title">Mão de obra</p>
          <ul className="small">
            {(s.workers ?? []).map((w) => <li key={w.id}>{(w as unknown as { worker_name: string }).worker_name} — {ATTENDANCE[w.attendance_status]?.label}</li>)}
            {(s.crews ?? []).map((c) => <li key={c.id}>{c.quantity} × {c.job_title}{c.company_name ? ` (${c.company_name})` : ''}</li>)}
          </ul>
          <p className="form-section-title">Materiais e equipamentos</p>
          <ul className="small">
            {(s.materials ?? []).map((m) => <li key={m.id}>{(m as unknown as { material_name: string; unit: string }).material_name}: recebido {formatNumber(m.quantity_received, 3)}, usado {formatNumber(m.quantity_used, 3)}</li>)}
            {(s.equipment ?? []).map((e) => <li key={e.id}>{(e as unknown as { equipment_name: string }).equipment_name}: {EQUIPMENT_USAGE[e.usage_status]?.label}</li>)}
          </ul>
          <p className="form-section-title">Encerramento</p>
          <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{[s.next_day_plan && `Próximo dia: ${s.next_day_plan}`, s.pending_items && `Pendências: ${s.pending_items}`, s.final_notes && `Observações: ${s.final_notes}`].filter(Boolean).join('\n') || '—'}</p>
        </div>
      )}
    </Modal>
  )
}
