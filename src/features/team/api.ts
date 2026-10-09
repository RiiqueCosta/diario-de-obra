import { supabase, type Tables, type Inserts, type Updates } from '@/lib/supabase'
import { requireUpdated, unwrap, unwrapOne } from '@/lib/errors'

export type Worker = Tables<'workers'> & { projects: Array<{ project_id: string }> }
export type Material = Tables<'materials'>
export type Equipment = Tables<'equipment'>
export type Allocation = Tables<'equipment_allocations'> & {
  equipment: Pick<Tables<'equipment'>, 'id' | 'name' | 'identification_code'> | null
  project: Pick<Tables<'projects'>, 'id' | 'name' | 'code'> | null
}

export async function listWorkers(orgId: string) {
  const res = await supabase.from('workers').select('*, projects:worker_projects(project_id)').eq('organization_id', orgId).order('name')
  return (unwrap(res) ?? []) as unknown as Worker[]
}
export async function saveWorker(id: string | null, values: Inserts<'workers'> | Updates<'workers'>) {
  if (id) return requireUpdated(unwrap(await supabase.from('workers').update(values).eq('id', id).select()))
  return unwrapOne(await supabase.from('workers').insert(values as Inserts<'workers'>).select().single())
}
/** Ajusta em quais obras a pessoa trabalha (adiciona e remove vínculos). */
export async function setWorkerProjects(workerId: string, current: string[], next: string[]) {
  const add = next.filter((p) => !current.includes(p))
  const remove = current.filter((p) => !next.includes(p))
  if (add.length) unwrap(await supabase.from('worker_projects').insert(add.map((project_id) => ({ worker_id: workerId, project_id }))))
  for (const project_id of remove) unwrap(await supabase.from('worker_projects').delete().eq('worker_id', workerId).eq('project_id', project_id))
}

export async function listMaterials(orgId: string) {
  return unwrap(await supabase.from('materials').select('*').eq('organization_id', orgId).order('name')) ?? []
}
export async function saveMaterial(id: string | null, values: Inserts<'materials'> | Updates<'materials'>) {
  if (id) return requireUpdated(unwrap(await supabase.from('materials').update(values).eq('id', id).select()))
  return unwrapOne(await supabase.from('materials').insert(values as Inserts<'materials'>).select().single())
}

export async function listEquipment(orgId: string) {
  return unwrap(await supabase.from('equipment').select('*').eq('organization_id', orgId).order('name')) ?? []
}
export async function saveEquipment(id: string | null, values: Inserts<'equipment'> | Updates<'equipment'>) {
  if (id) return requireUpdated(unwrap(await supabase.from('equipment').update(values).eq('id', id).select()))
  return unwrapOne(await supabase.from('equipment').insert(values as Inserts<'equipment'>).select().single())
}

export async function listAllocations(orgId: string, projectId?: string) {
  let q = supabase.from('equipment_allocations')
    .select('*, equipment:equipment(id, name, identification_code), project:projects!inner(id, name, code, organization_id)')
    .eq('project.organization_id', orgId)
  if (projectId) q = q.eq('project_id', projectId)
  return (unwrap(await q.order('start_date', { ascending: false })) ?? []) as unknown as Allocation[]
}
export async function saveAllocation(id: string | null, values: Inserts<'equipment_allocations'> | Updates<'equipment_allocations'>) {
  if (id) return requireUpdated(unwrap(await supabase.from('equipment_allocations').update(values).eq('id', id).select()))
  return unwrapOne(await supabase.from('equipment_allocations').insert(values as Inserts<'equipment_allocations'>).select().single())
}

/** Uso de materiais por obra no período (a partir dos diários), para consulta e relatório. */
export async function materialUsage(orgId: string, projectId?: string, from?: string, to?: string) {
  let q = supabase.from('daily_report_materials')
    .select('quantity_received, quantity_used, supplier_name, invoice_number, shortage, observations, material:materials(id, name, unit), report:daily_reports!inner(id, report_date, project_id, project:projects!inner(id, name, code, organization_id))')
    .eq('report.project.organization_id', orgId)
  if (projectId) q = q.eq('report.project_id', projectId)
  if (from) q = q.gte('report.report_date', from)
  if (to) q = q.lte('report.report_date', to)
  return (unwrap(await q) ?? []) as unknown as Array<{
    quantity_received: number; quantity_used: number; supplier_name: string | null; invoice_number: string | null; shortage: boolean; observations: string | null
    material: { id: string; name: string; unit: string } | null
    report: { id: string; report_date: string; project_id: string; project: { id: string; name: string; code: string } }
  }>
}
