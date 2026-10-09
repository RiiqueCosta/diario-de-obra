import { useMemo, useState } from 'react'
import { useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { addDaysISO, formatDate, formatNumber, todayISO } from '@/lib/format'
import { supabase, type Enums } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { Badge, Button, EmptyState, ErrorBox, Loading, Modal, PageHeader, Panel, SelectField, Tabs, TextAreaField, TextField, useToast } from '@/ui/components'
import { useProjectOptions } from '../projects/hooks'
import { listAllocations, listEquipment, listMaterials, materialUsage, saveAllocation, saveEquipment, saveMaterial, type Allocation, type Equipment, type Material } from './api'
import { listOrgMembers } from '../users/api'

export const EQUIPMENT_USAGE: Record<Enums<'equipment_usage'>, { label: string; tone: 'green' | 'grey' | 'yellow' | 'red' }> = {
  operando: { label: 'Operando', tone: 'green' },
  parado: { label: 'Parado', tone: 'grey' },
  indisponivel: { label: 'Indisponível', tone: 'yellow' },
  com_defeito: { label: 'Com defeito', tone: 'red' },
}

type Tab = 'consumo' | 'materiais' | 'equipamentos' | 'alocacao'

export function MaterialsPage() {
  const [tab, setTab] = useState<Tab>('consumo')
  return (
    <>
      <PageHeader title="Materiais e equipamentos" subtitle="Registro de campo: o que chegou, o que foi usado e quais equipamentos estão em cada obra. Não é controle de estoque nem financeiro." />
      <Tabs tabs={[{ id: 'consumo', label: 'Movimento nos diários' }, { id: 'alocacao', label: 'Equipamentos nas obras' }, { id: 'materiais', label: 'Cadastro de materiais' }, { id: 'equipamentos', label: 'Cadastro de equipamentos' }]} value={tab} onChange={setTab} />
      {tab === 'consumo' && <UsageTab />}
      {tab === 'materiais' && <MaterialsTab />}
      {tab === 'equipamentos' && <EquipmentTab />}
      {tab === 'alocacao' && <AllocationTab />}
    </>
  )
}

function UsageTab() {
  const org = useOrg()
  const projects = useProjectOptions(org.organization_id)
  const [project, setProject] = useState('')
  const [from, setFrom] = useState(addDaysISO(todayISO(), -30))
  const [to, setTo] = useState(todayISO())
  const q = useQuery(`material_usage:${org.organization_id}:${project}:${from}:${to}`, () => materialUsage(org.organization_id, project || undefined, from, to))
  const totals = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; received: number; used: number; shortages: number }>()
    for (const r of q.data ?? []) {
      if (!r.material) continue
      const k = r.material.id
      const t = m.get(k) ?? { name: r.material.name, unit: r.material.unit, received: 0, used: 0, shortages: 0 }
      t.received += Number(r.quantity_received); t.used += Number(r.quantity_used); if (r.shortage) t.shortages++
      m.set(k, t)
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [q.data])

  return (
    <>
      <div className="toolbar">
        <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Todas" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        <TextField label="De" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="Até" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>
      <ErrorBox error={q.error} onRetry={q.refetch} />
      <Panel padded={false} title="Totais no período">
        {q.loading && !q.data ? <Loading /> : totals.length === 0 ? (
          <EmptyState icon="relatorio" title="Nenhum material registrado no período">Os materiais recebidos e usados são lançados em cada diário de obra.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Material</th><th>Recebido</th><th>Utilizado</th><th>Registros de falta</th></tr></thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.name + t.unit}>
                    <td><strong>{t.name}</strong></td>
                    <td className="num">{formatNumber(t.received, 3)} {t.unit}</td>
                    <td className="num">{formatNumber(t.used, 3)} {t.unit}</td>
                    <td>{t.shortages > 0 ? <Badge tone="yellow">{t.shortages}</Badge> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {(q.data?.length ?? 0) > 0 && (
        <Panel padded={false} title="Lançamentos">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Data</th><th>Obra</th><th>Material</th><th>Recebido</th><th>Utilizado</th><th>Fornecedor</th><th>Observações</th></tr></thead>
              <tbody>
                {[...(q.data ?? [])].sort((a, b) => b.report.report_date.localeCompare(a.report.report_date)).map((r, i) => (
                  <tr key={i}>
                    <td className="num">{formatDate(r.report.report_date)}</td>
                    <td>{r.report.project.name}</td>
                    <td>{r.material?.name}{r.shortage && <> <Badge tone="yellow">Falta</Badge></>}</td>
                    <td className="num">{formatNumber(r.quantity_received, 3)} {r.material?.unit}</td>
                    <td className="num">{formatNumber(r.quantity_used, 3)} {r.material?.unit}</td>
                    <td>{r.supplier_name || '—'}{r.invoice_number && <div className="muted small">NF {r.invoice_number}</div>}</td>
                    <td className="small">{r.observations || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  )
}

function useUnits(orgId: string) {
  return useQuery(`units:${orgId}`, async () => unwrap(await supabase.from('units').select('*').eq('organization_id', orgId).order('code')) ?? [])
}

function MaterialsTab() {
  const org = useOrg()
  const q = useQuery(`materials:${org.organization_id}`, () => listMaterials(org.organization_id))
  const [editing, setEditing] = useState<Material | 'novo' | null>(null)
  return (
    <Panel padded={false} title="Materiais" actions={<Button size="sm" icon="mais" onClick={() => setEditing('novo')}>Cadastrar</Button>}>
      <ErrorBox error={q.error} onRetry={q.refetch} />
      {q.loading && !q.data ? <Loading /> : !q.data?.length ? (
        <EmptyState icon="relatorio" title="Nenhum material cadastrado">Materiais também podem ser cadastrados na hora, ao preencher o diário.</EmptyState>
      ) : (
        <ul className="list">
          {q.data.map((m) => (
            <li key={m.id}><button type="button" className="row-link" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', font: 'inherit', cursor: 'pointer' }} onClick={() => setEditing(m)}>
              <div className="row-main"><strong>{m.name}</strong><span>Unidade: {m.unit}</span></div>
              {m.status !== 'ativo' && <Badge tone="grey">Inativo</Badge>}
            </button></li>
          ))}
        </ul>
      )}
      {editing && <MaterialModal material={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { invalidate('materials:') }} />}
    </Panel>
  )
}

export function MaterialModal({ material, onClose, onSaved, initialName }: { material: Material | null; onClose: () => void; onSaved: (m: Material) => void; initialName?: string }) {
  const org = useOrg()
  const toast = useToast()
  const units = useUnits(org.organization_id)
  const [name, setName] = useState(material?.name ?? initialName ?? '')
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [status, setStatus] = useState<Enums<'record_status'>>(material?.status ?? 'ativo')
  const save = useAction(async () => saveMaterial(material?.id ?? null, { organization_id: org.organization_id, name: name.trim(), unit: unit.trim(), status }))
  return (
    <Modal open title={material ? 'Editar material' : 'Cadastrar material'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} disabled={!name.trim() || !unit.trim()} onClick={async () => { const m = await save.run(); if (m) { toast('ok', 'Material salvo.'); onSaved(m as Material); onClose() } }}>Salvar</Button></>}>
      <div className="form">
        <TextField label="Descrição" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Cimento CP II 50 kg" required />
        <SelectField label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Selecione"
          options={(units.data ?? []).filter((u) => u.active || u.code === unit).map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))} />
        {material && <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value as Enums<'record_status'>)} options={[{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }]} />}
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

function EquipmentTab() {
  const org = useOrg()
  const q = useQuery(`equipment:${org.organization_id}`, () => listEquipment(org.organization_id))
  const [editing, setEditing] = useState<Equipment | 'novo' | null>(null)
  return (
    <Panel padded={false} title="Equipamentos" actions={<Button size="sm" icon="mais" onClick={() => setEditing('novo')}>Cadastrar</Button>}>
      <ErrorBox error={q.error} onRetry={q.refetch} />
      {q.loading && !q.data ? <Loading /> : !q.data?.length ? (
        <EmptyState icon="config" title="Nenhum equipamento cadastrado">Betoneiras, andaimes, gruas, geradores… Cadastre para registrar o uso no diário.</EmptyState>
      ) : (
        <ul className="list">
          {q.data.map((m) => (
            <li key={m.id}><button type="button" className="row-link" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', font: 'inherit', cursor: 'pointer' }} onClick={() => setEditing(m)}>
              <div className="row-main"><strong>{m.name}</strong><span>{m.identification_code ? `Identificação: ${m.identification_code}` : 'Sem código de identificação'}</span></div>
              {m.status !== 'ativo' && <Badge tone="grey">Inativo</Badge>}
            </button></li>
          ))}
        </ul>
      )}
      {editing && <EquipmentModal equipment={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} onSaved={() => invalidate('equipment:')} />}
    </Panel>
  )
}

export function EquipmentModal({ equipment, onClose, onSaved, initialName }: { equipment: Equipment | null; onClose: () => void; onSaved: (e: Equipment) => void; initialName?: string }) {
  const org = useOrg()
  const toast = useToast()
  const [name, setName] = useState(equipment?.name ?? initialName ?? '')
  const [code, setCode] = useState(equipment?.identification_code ?? '')
  const [status, setStatus] = useState<Enums<'record_status'>>(equipment?.status ?? 'ativo')
  const save = useAction(async () => saveEquipment(equipment?.id ?? null, { organization_id: org.organization_id, name: name.trim(), identification_code: code.trim() || null, status }))
  return (
    <Modal open title={equipment ? 'Editar equipamento' : 'Cadastrar equipamento'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} disabled={!name.trim()} onClick={async () => { const r = await save.run(); if (r) { toast('ok', 'Equipamento salvo.'); onSaved(r as Equipment); onClose() } }}>Salvar</Button></>}>
      <div className="form">
        <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Betoneira 400 L" required />
        <TextField label="Código de identificação" value={code} onChange={(e) => setCode(e.target.value)} hint="Patrimônio, placa ou número de série. Opcional." />
        {equipment && <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value as Enums<'record_status'>)} options={[{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo' }]} />}
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}

function AllocationTab() {
  const org = useOrg()
  const projects = useProjectOptions(org.organization_id)
  const [project, setProject] = useState('')
  const q = useQuery(`allocations:${org.organization_id}:${project}`, () => listAllocations(org.organization_id, project || undefined))
  const [editing, setEditing] = useState<Allocation | 'novo' | null>(null)
  return (
    <>
      <div className="toolbar">
        <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Todas" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      </div>
      <Panel padded={false} title="Equipamentos alocados" actions={<Button size="sm" icon="mais" onClick={() => setEditing('novo')}>Alocar equipamento</Button>}>
        <ErrorBox error={q.error} onRetry={q.refetch} />
        {q.loading && !q.data ? <Loading /> : !q.data?.length ? (
          <EmptyState icon="config" title="Nenhum equipamento alocado">Registre em qual obra cada equipamento está, por quanto tempo e em que condição.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Equipamento</th><th>Obra</th><th>Período</th><th>Condição</th><th>Observações</th></tr></thead>
              <tbody>
                {q.data.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => setEditing(a)}>
                    <td><strong>{a.equipment?.name}</strong>{a.equipment?.identification_code && <div className="muted small">{a.equipment.identification_code}</div>}</td>
                    <td>{a.project?.name}</td>
                    <td className="num">{formatDate(a.start_date)} até {a.end_date ? formatDate(a.end_date) : 'hoje'}</td>
                    <td><Badge tone={EQUIPMENT_USAGE[a.condition].tone}>{EQUIPMENT_USAGE[a.condition].label}</Badge></td>
                    <td className="small">{a.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && <AllocationModal allocation={editing === 'novo' ? null : editing} defaultProject={project} onClose={() => setEditing(null)} />}
    </>
  )
}

function AllocationModal({ allocation, defaultProject, onClose }: { allocation: Allocation | null; defaultProject: string; onClose: () => void }) {
  const org = useOrg()
  const toast = useToast()
  const projects = useProjectOptions(org.organization_id)
  const equipment = useQuery(`equipment:${org.organization_id}`, () => listEquipment(org.organization_id))
  const people = useQuery(`org_members:${org.organization_id}:ativos`, () => listOrgMembers(org.organization_id, false))
  const [v, setV] = useState({
    project_id: allocation?.project_id ?? defaultProject, equipment_id: allocation?.equipment_id ?? '',
    responsible_user_id: allocation?.responsible_user_id ?? '', start_date: allocation?.start_date ?? todayISO(),
    end_date: allocation?.end_date ?? '', condition: allocation?.condition ?? 'operando' as Enums<'equipment_usage'>, notes: allocation?.notes ?? '',
  })
  const save = useAction(async () => saveAllocation(allocation?.id ?? null, {
    project_id: v.project_id, equipment_id: v.equipment_id, responsible_user_id: v.responsible_user_id || null,
    start_date: v.start_date, end_date: v.end_date || null, condition: v.condition, notes: v.notes.trim() || null,
  }))
  const invalid = !v.project_id || !v.equipment_id || !v.start_date || (!!v.end_date && v.end_date < v.start_date)
  return (
    <Modal open title={allocation ? 'Editar alocação' : 'Alocar equipamento'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} disabled={invalid} onClick={async () => { if (await save.run()) { invalidate('allocations:'); toast('ok', 'Alocação salva.'); onClose() } }}>Salvar</Button></>}>
      <div className="form">
        <SelectField label="Obra" value={v.project_id} disabled={!!allocation} onChange={(e) => setV({ ...v, project_id: e.target.value })} placeholder="Selecione" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        <SelectField label="Equipamento" value={v.equipment_id} disabled={!!allocation} onChange={(e) => setV({ ...v, equipment_id: e.target.value })} placeholder="Selecione"
          options={(equipment.data ?? []).filter((e) => e.status === 'ativo' || e.id === v.equipment_id).map((e) => ({ value: e.id, label: e.identification_code ? `${e.name} (${e.identification_code})` : e.name }))} />
        <SelectField label="Responsável" value={v.responsible_user_id} onChange={(e) => setV({ ...v, responsible_user_id: e.target.value })} placeholder="Não definido"
          options={(people.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || '' }))} />
        <div className="grid-2">
          <TextField label="Início do uso" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} />
          <TextField label="Fim do uso" type="date" value={v.end_date} min={v.start_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} hint="Vazio enquanto estiver na obra." error={v.end_date && v.end_date < v.start_date ? 'O fim deve ser depois do início.' : undefined} />
        </div>
        <SelectField label="Condição" value={v.condition} onChange={(e) => setV({ ...v, condition: e.target.value as Enums<'equipment_usage'> })} options={Object.entries(EQUIPMENT_USAGE).map(([value, x]) => ({ value, label: x.label }))} />
        <TextAreaField label="Observações e indisponibilidades" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}
