// Seções de itens do diário (serviços, mão de obra, materiais, equipamentos, ocorrências).
// Cada item é gravado no servidor ao confirmar; a lista só muda depois da resposta.
import { useMemo, useState } from 'react'
import { useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatNumber } from '@/lib/format'
import { ATTENDANCE, EXECUTION_STATUS, OCCURRENCE_STATUS, PRIORITY, options } from '@/lib/labels'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { percent } from '@/lib/validation'
import { Alert, Badge, Button, Checkbox, EmptyState, ErrorBox, Modal, SelectField, TextAreaField, TextField, useToast } from '@/ui/components'
import { Link } from '@/app/router'
import { EQUIPMENT_USAGE, EquipmentModal, MaterialModal } from '../team/MaterialsPage'
import { listEquipment, listMaterials, listWorkers } from '../team/api'
import { OccurrenceFormModal } from '../occurrences/OccurrenceFormModal'
import {
  addWorkersBulk, deleteItem, insertItem, listProjectActivities, listProjectWorkers, updateItem,
  type FullReport, type ReportActivity, type ReportCrew, type ReportEquipment, type ReportMaterial,
} from './api'

/** Aceita 12,5 / 12.5 / 1.234,5. Ponto só é milhar quando há vírgula. */
const num = (s: string) => {
  const t = s.trim()
  if (t === '') return null
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}
const numStr = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
const badNum = (s: string) => s.trim() !== '' && (Number.isNaN(num(s)) || (num(s) ?? 0) < 0)

function useUnits(orgId: string) {
  return useQuery(`units:${orgId}`, async () => unwrap(await supabase.from('units').select('code, name, active').eq('organization_id', orgId).order('code')) ?? [])
}

function ItemList<T extends { id: string }>({ items, render, onEdit, onRemove, editable, empty }: {
  items: T[]; render: (item: T) => React.ReactNode; onEdit: (item: T) => void; onRemove: (item: T) => void; editable: boolean; empty: string
}) {
  if (!items.length) return <p className="muted" style={{ padding: '6px 0' }}>{empty}</p>
  return (
    <ul className="list item-list">
      {items.map((it) => (
        <li key={it.id} className="item-row">
          <div className="row-main">{render(it)}</div>
          {editable && (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Button size="sm" variant="secondary" onClick={() => onEdit(it)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => onRemove(it)} aria-label="Remover item">Remover</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ConfirmRemove({ label, onCancel, onConfirm, pending }: { label: string; onCancel: () => void; onConfirm: () => void; pending: boolean }) {
  return (
    <Modal open title="Remover item" onClose={onCancel}
      footer={<><Button variant="secondary" onClick={onCancel}>Cancelar</Button><Button variant="danger" loading={pending} onClick={onConfirm}>Remover</Button></>}>
      <p>Remover <strong>{label}</strong> deste diário?</p>
    </Modal>
  )
}

// ================================================================ serviços executados
export function ServicesSection({ report, editable, onChange }: { report: FullReport; editable: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState<ReportActivity | 'novo' | null>(null)
  const [removing, setRemoving] = useState<ReportActivity | null>(null)
  const remove = useAction(async (id: string) => deleteItem('daily_report_activities', id))
  return (
    <>
      <ItemList items={report.activities} editable={editable} empty="Nenhum serviço registrado ainda."
        onEdit={setEditing} onRemove={setRemoving}
        render={(a) => (<>
          <strong style={{ whiteSpace: 'normal' }}>{a.description}</strong>
          <span>
            {[a.activity?.title ?? a.stage_name, a.location, a.quantity !== null ? `${formatNumber(a.quantity, 3)} ${a.unit ?? ''}` : null,
              a.progress_percentage !== null ? `${formatNumber(a.progress_percentage, 1)}% de avanço` : null, a.team_description].filter(Boolean).join(' — ')}
          </span>
          <span><Badge tone={EXECUTION_STATUS[a.execution_status].tone}>{EXECUTION_STATUS[a.execution_status].label}</Badge></span>
          {a.observations && <span className="small">Obs.: {a.observations}</span>}
        </>)} />
      {editable && <Button className="mt-8" variant="secondary" icon="mais" size="lg" block onClick={() => setEditing('novo')}>Adicionar serviço</Button>}
      {editing && <ServiceModal report={report} item={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange() }} />}
      {removing && <ConfirmRemove label={removing.description} pending={remove.pending} onCancel={() => setRemoving(null)}
        onConfirm={async () => { if (await remove.run(removing.id)) { setRemoving(null); onChange() } }} />}
      <ErrorBox error={remove.error} />
    </>
  )
}

function ServiceModal({ report, item, onClose, onSaved }: { report: FullReport; item: ReportActivity | null; onClose: () => void; onSaved: () => void }) {
  const org = useOrg()
  const units = useUnits(org.organization_id)
  const acts = useQuery(`activities:options:${report.project_id}`, () => listProjectActivities(report.project_id))
  const [v, setV] = useState({
    activity_id: item?.activity_id ?? '', description: item?.description ?? '', location: item?.location ?? '',
    quantity: numStr(item?.quantity), unit: item?.unit ?? '', team_description: item?.team_description ?? '',
    progress_percentage: numStr(item?.progress_percentage), execution_status: item?.execution_status ?? 'em_andamento' as Enums<'execution_status'>,
    observations: item?.observations ?? '',
  })
  const [submitted, setSubmitted] = useState(false)
  const pct = num(v.progress_percentage)
  const errors = {
    description: !v.description.trim() ? 'Descreva o serviço.' : undefined,
    quantity: badNum(v.quantity) ? 'Quantidade inválida.' : undefined,
    progress: badNum(v.progress_percentage) ? 'Percentual inválido.' : percent(pct),
  }
  const act = acts.data?.find((a) => a.id === v.activity_id)
  const save = useAction(async () => {
    const values = {
      activity_id: v.activity_id || null, stage_name: act?.stage?.name ?? null, description: v.description.trim(),
      location: v.location.trim() || null, quantity: num(v.quantity), unit: v.unit || null, team_description: v.team_description.trim() || null,
      progress_percentage: pct, execution_status: v.execution_status, observations: v.observations.trim() || null,
    }
    return item ? updateItem('daily_report_activities', item.id, values)
      : insertItem('daily_report_activities', { ...values, daily_report_id: report.id, sort_order: report.activities.length })
  })
  return (
    <Modal open wide title={item ? 'Editar serviço' : 'Serviço executado'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} onClick={async () => { setSubmitted(true); if (Object.values(errors).some(Boolean)) return; if (await save.run()) onSaved() }}>Salvar serviço</Button></>}>
      <div className="form">
        <SelectField label="Atividade do cronograma" value={v.activity_id} onChange={(e) => setV({ ...v, activity_id: e.target.value, description: v.description || (acts.data?.find((a) => a.id === e.target.value)?.title ?? '') })}
          placeholder="Nenhuma (serviço avulso)" hint="Ligar à atividade permite comparar o planejado com o realizado."
          options={(acts.data ?? []).map((a) => ({ value: a.id, label: a.stage ? `${a.stage.name} — ${a.title}` : a.title }))} />
        <TextAreaField label="Descrição do serviço" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} error={submitted ? errors.description : undefined} required rows={3} />
        <div className="grid-2">
          <TextField label="Local ou ambiente" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Ex.: Bloco B, 3º pavimento" />
          <TextField label="Equipe responsável" value={v.team_description} onChange={(e) => setV({ ...v, team_description: e.target.value })} placeholder="Ex.: Equipe do Marcos" />
          <TextField label="Quantidade executada" inputMode="decimal" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} error={errors.quantity} />
          <SelectField label="Unidade" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="—"
            options={(units.data ?? []).filter((u) => u.active || u.code === v.unit).map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))} />
          <SelectField label="Situação" value={v.execution_status} onChange={(e) => setV({ ...v, execution_status: e.target.value as Enums<'execution_status'> })} options={options(EXECUTION_STATUS)} />
          <TextField label="Avanço do serviço (%)" inputMode="decimal" value={v.progress_percentage} onChange={(e) => setV({ ...v, progress_percentage: e.target.value })} error={errors.progress} hint="Opcional, de 0 a 100." />
        </div>
        <TextAreaField label="Observações técnicas" value={v.observations} onChange={(e) => setV({ ...v, observations: e.target.value })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

// ================================================================ mão de obra
export function LaborSection({ report, editable, onChange }: { report: FullReport; editable: boolean; onChange: () => void }) {
  const org = useOrg()
  const toast = useToast()
  const projectWorkers = useQuery(`project_workers:${report.project_id}`, () => listProjectWorkers(report.project_id))
  const [extra, setExtra] = useState(false)
  const [crew, setCrew] = useState<ReportCrew | 'novo' | null>(null)
  const [removingCrew, setRemovingCrew] = useState<ReportCrew | null>(null)
  const action = useAction(async (fn: () => Promise<unknown>) => fn())
  const registered = new Map(report.workers.map((w) => [w.worker_id, w]))
  const notInList = report.workers.filter((w) => !(projectWorkers.data ?? []).some((p) => p.id === w.worker_id))
  const present = report.workers.filter((w) => w.attendance_status === 'presente').length
  const crewTotal = report.crews.reduce((s, c) => s + c.quantity - c.absent_quantity, 0)

  async function run(fn: () => Promise<unknown>) { if (await action.run(fn) !== undefined) onChange() }

  return (
    <>
      <p className="small muted">Presentes: <strong className="num">{present + crewTotal}</strong> ({present} {present === 1 ? 'pessoa nominal' : 'pessoas nominais'} e {crewTotal} em equipes contadas por quantidade).</p>
      <h3 className="form-section-title mt-16">Funcionários da obra</h3>
      {projectWorkers.loading && !projectWorkers.data ? <p className="muted">Carregando…</p> : (projectWorkers.data ?? []).length === 0 && notInList.length === 0 ? (
        <Alert tone="info">Nenhuma pessoa vinculada a esta obra. Cadastre em <Link to="/equipe">Equipe</Link> e marque esta obra, ou use "Equipes por quantidade" abaixo.</Alert>
      ) : (
        <>
          {editable && (projectWorkers.data ?? []).some((w) => !registered.has(w.id)) && (
            <Button variant="secondary" size="sm" loading={action.pending} onClick={() => run(async () => {
              const missing = (projectWorkers.data ?? []).filter((w) => !registered.has(w.id))
              await addWorkersBulk(report.id, missing)
              toast('ok', `${missing.length} ${missing.length === 1 ? 'pessoa marcada' : 'pessoas marcadas'} como presentes.`)
            })}>Marcar todos como presentes</Button>
          )}
          <ul className="list item-list mt-8">
            {[...(projectWorkers.data ?? []), ...notInList.map((w) => ({ id: w.worker_id, name: w.worker?.name ?? '', job_title: w.job_title ?? '', company_name: w.company_name, status: 'ativo' as const }))].map((w) => {
              const reg = registered.get(w.id)
              return (
                <li key={w.id} className="item-row">
                  <div className="row-main"><strong>{w.name}</strong><span>{w.job_title}{w.company_name ? ` — ${w.company_name}` : ''}</span></div>
                  {reg ? (
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <select aria-label={`Presença de ${w.name}`} value={reg.attendance_status} disabled={!editable || action.pending} style={{ minWidth: 150 }}
                        onChange={(e) => run(() => updateItem('daily_report_workers', reg.id, { attendance_status: e.target.value as Enums<'attendance_status'> }))}>
                        {options(ATTENDANCE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input aria-label={`Horas de ${w.name}`} inputMode="decimal" placeholder="h" defaultValue={numStr(reg.hours_worked)} disabled={!editable} style={{ width: 64 }}
                        onBlur={(e) => { const h = num(e.target.value); if (h !== reg.hours_worked && !(h !== null && (Number.isNaN(h) || h < 0 || h > 24))) void run(() => updateItem('daily_report_workers', reg.id, { hours_worked: h })) }} />
                      {editable && <Button size="sm" variant="ghost" aria-label={`Tirar ${w.name} do diário`} onClick={() => run(() => deleteItem('daily_report_workers', reg.id))}>Tirar</Button>}
                    </div>
                  ) : editable ? (
                    <Button size="sm" variant="secondary" disabled={action.pending} onClick={() => run(() => insertItem('daily_report_workers', { daily_report_id: report.id, worker_id: w.id, job_title: w.job_title, company_name: w.company_name, attendance_status: 'presente' }))}>Presente</Button>
                  ) : <span className="muted small">Não registrado</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {editable && <Button className="mt-8" variant="ghost" size="sm" onClick={() => setExtra(true)}>Incluir pessoa de outra obra</Button>}

      <h3 className="form-section-title mt-24">Equipes por quantidade</h3>
      <p className="field-hint">Para terceirizadas ou equipes sem cadastro nominal: informe empresa, função e quantas pessoas.</p>
      <ItemList items={report.crews} editable={editable} empty="Nenhuma equipe registrada." onEdit={setCrew} onRemove={setRemovingCrew}
        render={(c) => (<>
          <strong>{c.quantity} × {c.job_title}{c.company_name ? ` — ${c.company_name}` : ''}</strong>
          <span>{c.absent_quantity > 0 ? `${c.absent_quantity} ${c.absent_quantity === 1 ? 'falta' : 'faltas'}` : 'Sem faltas'}{c.observations ? ` — ${c.observations}` : ''}</span>
        </>)} />
      {editable && <Button className="mt-8" variant="secondary" icon="mais" block onClick={() => setCrew('novo')}>Adicionar equipe</Button>}
      <ErrorBox error={action.error} />
      {crew && <CrewModal report={report} item={crew === 'novo' ? null : crew} onClose={() => setCrew(null)} onSaved={() => { setCrew(null); onChange() }} />}
      {removingCrew && <ConfirmRemove label={`${removingCrew.quantity} × ${removingCrew.job_title}`} pending={action.pending} onCancel={() => setRemovingCrew(null)}
        onConfirm={async () => { await run(() => deleteItem('daily_report_crews', removingCrew.id)); setRemovingCrew(null) }} />}
      {extra && <ExtraWorkerModal orgId={org.organization_id} exclude={[...registered.keys()]} onClose={() => setExtra(false)}
        onPick={async (w) => { setExtra(false); await run(() => insertItem('daily_report_workers', { daily_report_id: report.id, worker_id: w.id, job_title: w.job_title, company_name: w.company_name, attendance_status: 'presente' })) }} />}
    </>
  )
}

function ExtraWorkerModal({ orgId, exclude, onClose, onPick }: { orgId: string; exclude: string[]; onClose: () => void; onPick: (w: { id: string; job_title: string; company_name: string | null }) => void }) {
  const all = useQuery(`workers:${orgId}`, () => listWorkers(orgId))
  const [id, setId] = useState('')
  const list = (all.data ?? []).filter((w) => w.status === 'ativo' && !exclude.includes(w.id))
  return (
    <Modal open title="Incluir pessoa" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!id} onClick={() => { const w = list.find((x) => x.id === id); if (w) onPick(w) }}>Incluir como presente</Button></>}>
      <SelectField label="Pessoa" value={id} onChange={(e) => setId(e.target.value)} placeholder="Selecione"
        options={list.map((w) => ({ value: w.id, label: `${w.name} — ${w.job_title}` }))} hint="Pessoas cadastradas na empresa e ainda não incluídas neste diário." />
    </Modal>
  )
}

function CrewModal({ report, item, onClose, onSaved }: { report: FullReport; item: ReportCrew | null; onClose: () => void; onSaved: () => void }) {
  const acts = useQuery(`activities:options:${report.project_id}`, () => listProjectActivities(report.project_id))
  const [v, setV] = useState({ company_name: item?.company_name ?? '', job_title: item?.job_title ?? '', quantity: String(item?.quantity ?? ''), absent: String(item?.absent_quantity ?? 0), activity_id: item?.activity_id ?? '', observations: item?.observations ?? '' })
  const q = Number(v.quantity), a = Number(v.absent || 0)
  const invalid = !v.job_title.trim() || !Number.isInteger(q) || q < 0 || !Number.isInteger(a) || a < 0 || a > q
  const save = useAction(async () => {
    const values = { company_name: v.company_name.trim() || null, job_title: v.job_title.trim(), quantity: q, absent_quantity: a, activity_id: v.activity_id || null, observations: v.observations.trim() || null }
    return item ? updateItem('daily_report_crews', item.id, values) : insertItem('daily_report_crews', { ...values, daily_report_id: report.id })
  })
  return (
    <Modal open title={item ? 'Editar equipe' : 'Equipe por quantidade'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={invalid} loading={save.pending} onClick={async () => { if (await save.run()) onSaved() }}>Salvar</Button></>}>
      <div className="form">
        <TextField label="Empresa" value={v.company_name} onChange={(e) => setV({ ...v, company_name: e.target.value })} hint="Deixe em branco para equipe própria." />
        <TextField label="Função" value={v.job_title} onChange={(e) => setV({ ...v, job_title: e.target.value })} placeholder="Servente, armador, carpinteiro…" required />
        <div className="grid-2">
          <TextField label="Quantidade prevista" type="number" min={0} inputMode="numeric" value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} />
          <TextField label="Faltas" type="number" min={0} inputMode="numeric" value={v.absent} onChange={(e) => setV({ ...v, absent: e.target.value })} error={a > q ? 'Faltas maior que a quantidade.' : undefined} />
        </div>
        <SelectField label="Atividade" value={v.activity_id} onChange={(e) => setV({ ...v, activity_id: e.target.value })} placeholder="Nenhuma" options={(acts.data ?? []).map((x) => ({ value: x.id, label: x.title }))} />
        <TextAreaField label="Observações" value={v.observations} onChange={(e) => setV({ ...v, observations: e.target.value })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

// ================================================================ materiais e equipamentos
export function MaterialsSection({ report, editable, onChange }: { report: FullReport; editable: boolean; onChange: () => void }) {
  const [mat, setMat] = useState<ReportMaterial | 'novo' | null>(null)
  const [eq, setEq] = useState<ReportEquipment | 'novo' | null>(null)
  const [removing, setRemoving] = useState<{ table: 'daily_report_materials' | 'daily_report_equipment'; id: string; label: string } | null>(null)
  const remove = useAction(async () => removing && deleteItem(removing.table, removing.id))
  return (
    <>
      <h3 className="form-section-title">Materiais</h3>
      <ItemList items={report.materials} editable={editable} empty="Nenhum material registrado." onEdit={setMat}
        onRemove={(m) => setRemoving({ table: 'daily_report_materials', id: m.id, label: m.material?.name ?? 'material' })}
        render={(m) => (<>
          <strong>{m.material?.name}{m.shortage && <> <Badge tone="yellow">Falta</Badge></>}</strong>
          <span>Recebido: {formatNumber(m.quantity_received, 3)} {m.material?.unit} — Utilizado: {formatNumber(m.quantity_used, 3)} {m.material?.unit}{m.supplier_name ? ` — ${m.supplier_name}` : ''}{m.invoice_number ? ` (NF ${m.invoice_number})` : ''}</span>
          {m.observations && <span className="small">Obs.: {m.observations}</span>}
        </>)} />
      {editable && <Button className="mt-8" variant="secondary" icon="mais" block onClick={() => setMat('novo')}>Adicionar material</Button>}

      <h3 className="form-section-title mt-24">Equipamentos</h3>
      <ItemList items={report.equipment} editable={editable} empty="Nenhum equipamento registrado." onEdit={setEq}
        onRemove={(e) => setRemoving({ table: 'daily_report_equipment', id: e.id, label: e.equipment?.name ?? 'equipamento' })}
        render={(e) => (<>
          <strong>{e.equipment?.name}{e.equipment?.identification_code && <span className="muted"> ({e.equipment.identification_code})</span>}</strong>
          <span><Badge tone={EQUIPMENT_USAGE[e.usage_status].tone}>{EQUIPMENT_USAGE[e.usage_status].label}</Badge>{e.hours_used !== null && ` ${formatNumber(e.hours_used, 1)} h`}</span>
          {e.observations && <span className="small">Obs.: {e.observations}</span>}
        </>)} />
      {editable && <Button className="mt-8" variant="secondary" icon="mais" block onClick={() => setEq('novo')}>Adicionar equipamento</Button>}
      <ErrorBox error={remove.error} />
      {mat && <MaterialItemModal report={report} item={mat === 'novo' ? null : mat} onClose={() => setMat(null)} onSaved={() => { setMat(null); onChange() }} />}
      {eq && <EquipmentItemModal report={report} item={eq === 'novo' ? null : eq} onClose={() => setEq(null)} onSaved={() => { setEq(null); onChange() }} />}
      {removing && <ConfirmRemove label={removing.label} pending={remove.pending} onCancel={() => setRemoving(null)}
        onConfirm={async () => { if (await remove.run()) { setRemoving(null); onChange() } }} />}
    </>
  )
}

function MaterialItemModal({ report, item, onClose, onSaved }: { report: FullReport; item: ReportMaterial | null; onClose: () => void; onSaved: () => void }) {
  const org = useOrg()
  const cat = useQuery(`materials:${org.organization_id}`, () => listMaterials(org.organization_id))
  const [creating, setCreating] = useState(false)
  const [v, setV] = useState({ material_id: item?.material_id ?? '', received: numStr(item?.quantity_received ?? 0), used: numStr(item?.quantity_used ?? 0), supplier: item?.supplier_name ?? '', invoice: item?.invoice_number ?? '', shortage: item?.shortage ?? false, observations: item?.observations ?? '' })
  const unit = cat.data?.find((m) => m.id === v.material_id)?.unit
  const invalid = !v.material_id || badNum(v.received) || badNum(v.used)
  const save = useAction(async () => {
    const values = { material_id: v.material_id, quantity_received: num(v.received) ?? 0, quantity_used: num(v.used) ?? 0, supplier_name: v.supplier.trim() || null, invoice_number: v.invoice.trim() || null, shortage: v.shortage, observations: v.observations.trim() || null }
    return item ? updateItem('daily_report_materials', item.id, values) : insertItem('daily_report_materials', { ...values, daily_report_id: report.id })
  })
  if (creating) return <MaterialModal material={null} onClose={() => setCreating(false)} onSaved={(m) => { invalidate('materials:'); setV((x) => ({ ...x, material_id: m.id })); setCreating(false) }} />
  return (
    <Modal open title={item ? 'Editar material' : 'Material'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={invalid} loading={save.pending} onClick={async () => { if (await save.run()) onSaved() }}>Salvar</Button></>}>
      <div className="form">
        <SelectField label="Material" value={v.material_id} onChange={(e) => setV({ ...v, material_id: e.target.value })} placeholder="Selecione"
          options={(cat.data ?? []).filter((m) => m.status === 'ativo' || m.id === v.material_id).map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }))} />
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>Cadastrar material novo</Button>
        <div className="grid-2">
          <TextField label={`Quantidade recebida${unit ? ` (${unit})` : ''}`} inputMode="decimal" value={v.received} onChange={(e) => setV({ ...v, received: e.target.value })} error={badNum(v.received) ? 'Valor inválido.' : undefined} />
          <TextField label={`Quantidade utilizada${unit ? ` (${unit})` : ''}`} inputMode="decimal" value={v.used} onChange={(e) => setV({ ...v, used: e.target.value })} error={badNum(v.used) ? 'Valor inválido.' : undefined} />
          <TextField label="Fornecedor" value={v.supplier} onChange={(e) => setV({ ...v, supplier: e.target.value })} />
          <TextField label="Nota fiscal" value={v.invoice} onChange={(e) => setV({ ...v, invoice: e.target.value })} />
        </div>
        <Checkbox label="Houve falta deste material" checked={v.shortage} onChange={(e) => setV({ ...v, shortage: e.target.checked })} />
        <TextAreaField label="Observações sobre a entrega ou a falta" value={v.observations} onChange={(e) => setV({ ...v, observations: e.target.value })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

function EquipmentItemModal({ report, item, onClose, onSaved }: { report: FullReport; item: ReportEquipment | null; onClose: () => void; onSaved: () => void }) {
  const org = useOrg()
  const cat = useQuery(`equipment:${org.organization_id}`, () => listEquipment(org.organization_id))
  const [creating, setCreating] = useState(false)
  const [v, setV] = useState({ equipment_id: item?.equipment_id ?? '', usage: item?.usage_status ?? 'operando' as Enums<'equipment_usage'>, hours: numStr(item?.hours_used), observations: item?.observations ?? '' })
  const h = num(v.hours)
  const badHours = v.hours.trim() !== '' && (h === null || Number.isNaN(h) || h < 0 || h > 24)
  const save = useAction(async () => {
    const values = { equipment_id: v.equipment_id, usage_status: v.usage, hours_used: h, observations: v.observations.trim() || null }
    return item ? updateItem('daily_report_equipment', item.id, values) : insertItem('daily_report_equipment', { ...values, daily_report_id: report.id })
  })
  if (creating) return <EquipmentModal equipment={null} onClose={() => setCreating(false)} onSaved={(e) => { invalidate('equipment:'); setV((x) => ({ ...x, equipment_id: e.id })); setCreating(false) }} />
  return (
    <Modal open title={item ? 'Editar equipamento' : 'Equipamento'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button disabled={!v.equipment_id || badHours} loading={save.pending} onClick={async () => { if (await save.run()) onSaved() }}>Salvar</Button></>}>
      <div className="form">
        <SelectField label="Equipamento" value={v.equipment_id} onChange={(e) => setV({ ...v, equipment_id: e.target.value })} placeholder="Selecione"
          options={(cat.data ?? []).filter((x) => x.status === 'ativo' || x.id === v.equipment_id).map((x) => ({ value: x.id, label: x.identification_code ? `${x.name} (${x.identification_code})` : x.name }))} />
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>Cadastrar equipamento novo</Button>
        <div className="grid-2">
          <SelectField label="Situação no dia" value={v.usage} onChange={(e) => setV({ ...v, usage: e.target.value as Enums<'equipment_usage'> })} options={options(EQUIPMENT_USAGE)} />
          <TextField label="Horas de uso" inputMode="decimal" value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} error={badHours ? 'Entre 0 e 24.' : undefined} />
        </div>
        <TextAreaField label="Observações (defeito, indisponibilidade…)" value={v.observations} onChange={(e) => setV({ ...v, observations: e.target.value })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

// ================================================================ ocorrências do dia
export function OccurrencesSection({ report, canCreate, canAssign, onChange }: { report: FullReport; canCreate: boolean; canAssign: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const sorted = useMemo(() => [...report.occurrences].sort((a, b) => a.code.localeCompare(b.code)), [report.occurrences])
  return (
    <>
      <p className="field-hint">Imprevistos, acidentes, interferências, faltas, atrasos, paralisações, visitas técnicas e decisões do dia. Cada ocorrência é acompanhada até a resolução.</p>
      {sorted.length === 0 ? <EmptyState icon="alerta" title="Nenhuma ocorrência neste dia" /> : (
        <ul className="list item-list mt-8">
          {sorted.map((o) => (
            <li key={o.id} className="item-row">
              <div className="row-main">
                <Link to={`/ocorrencias/${o.id}`}><strong>{o.code} — {o.title}</strong></Link>
                <span>{o.category}</span>
                <span className="row" style={{ gap: 6 }}><Badge tone={PRIORITY[o.priority].tone}>{PRIORITY[o.priority].label}</Badge><Badge tone={OCCURRENCE_STATUS[o.status].tone}>{OCCURRENCE_STATUS[o.status].label}</Badge></span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canCreate && <Button className="mt-8" variant="secondary" icon="mais" size="lg" block onClick={() => setOpen(true)}>Registrar ocorrência</Button>}
      {open && <OccurrenceFormModal projectId={report.project_id} dailyReportId={report.id} defaultDate={report.report_date} canAssign={canAssign}
        onClose={() => setOpen(false)} onCreated={() => { setOpen(false); invalidate('occurrences:'); onChange() }} />}
    </>
  )
}
