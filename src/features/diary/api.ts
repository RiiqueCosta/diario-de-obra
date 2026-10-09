import { supabase, type Tables, type Inserts, type Updates, type Enums } from '@/lib/supabase'
import { AppError, requireUpdated, unwrap, unwrapOne } from '@/lib/errors'

export type Report = Tables<'daily_reports'>
export type ReportRow = Report & {
  project: Pick<Tables<'projects'>, 'id' | 'name' | 'code'> | null
  author: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null
}
export type ReportActivity = Tables<'daily_report_activities'> & { activity: Pick<Tables<'activities'>, 'id' | 'title'> | null }
export type ReportWorker = Tables<'daily_report_workers'> & { worker: Pick<Tables<'workers'>, 'id' | 'name' | 'job_title' | 'company_name'> | null }
export type ReportCrew = Tables<'daily_report_crews'>
export type ReportMaterial = Tables<'daily_report_materials'> & { material: Pick<Tables<'materials'>, 'id' | 'name' | 'unit'> | null }
export type ReportEquipment = Tables<'daily_report_equipment'> & { equipment: Pick<Tables<'equipment'>, 'id' | 'name' | 'identification_code'> | null }
export type Approval = Tables<'daily_report_approvals'> & { reviewer: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null }

export type FullReport = ReportRow & {
  activities: ReportActivity[]
  workers: ReportWorker[]
  crews: ReportCrew[]
  materials: ReportMaterial[]
  equipment: ReportEquipment[]
  occurrences: Array<Pick<Tables<'occurrences'>, 'id' | 'code' | 'title' | 'status' | 'priority' | 'category' | 'description'>>
  approvals: Approval[]
  versions: Array<Pick<Tables<'daily_report_versions'>, 'id' | 'version' | 'reason' | 'created_at' | 'created_by'>>
}

export type ReportFilters = {
  orgId: string
  projectId?: string
  status?: string
  authorId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

const LIST_SELECT = '*, project:projects!inner(id, name, code, organization_id), author:profiles!daily_reports_author_user_id_fkey(id, name, email)'

export async function listReports(f: ReportFilters) {
  const pageSize = f.pageSize ?? 30
  const page = f.page ?? 0
  let q = supabase.from('daily_reports').select(LIST_SELECT, { count: 'exact' }).eq('project.organization_id', f.orgId)
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.status) q = q.eq('status', f.status as Enums<'report_status'>)
  if (f.authorId) q = q.eq('author_user_id', f.authorId)
  if (f.from) q = q.gte('report_date', f.from)
  if (f.to) q = q.lte('report_date', f.to)
  const res = await q.order('report_date', { ascending: false }).order('kind').range(page * pageSize, page * pageSize + pageSize - 1)
  return { rows: (unwrap(res) ?? []) as unknown as ReportRow[], total: res.count ?? 0, page, pageSize }
}

/** Diários de uma obra num intervalo (calendário). */
export async function listReportsInRange(projectId: string, from: string, to: string) {
  const res = await supabase.from('daily_reports').select('id, report_date, kind, status, author_user_id')
    .eq('project_id', projectId).gte('report_date', from).lte('report_date', to)
  return unwrap(res) ?? []
}

export async function getFullReport(id: string): Promise<FullReport> {
  const res = await supabase.from('daily_reports').select(`${LIST_SELECT},
    activities:daily_report_activities(*, activity:activities(id, title)),
    workers:daily_report_workers(*, worker:workers(id, name, job_title, company_name)),
    crews:daily_report_crews(*),
    materials:daily_report_materials(*, material:materials(id, name, unit)),
    equipment:daily_report_equipment(*, equipment:equipment(id, name, identification_code)),
    occurrences(id, code, title, status, priority, category, description),
    approvals:daily_report_approvals(*, reviewer:profiles(id, name, email)),
    versions:daily_report_versions(id, version, reason, created_at, created_by)`).eq('id', id).maybeSingle()
  const row = unwrap(res) as unknown as FullReport | null
  if (!row) throw new AppError('Diário não encontrado ou você não tem acesso a ele.', 'nao_encontrado')
  row.activities.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  row.approvals.sort((a, b) => a.decided_at.localeCompare(b.decided_at))
  row.versions.sort((a, b) => a.version - b.version)
  row.workers.sort((a, b) => (a.worker?.name ?? '').localeCompare(b.worker?.name ?? '', 'pt-BR'))
  return row
}

export async function findReportFor(projectId: string, date: string, kind: Enums<'report_kind'> = 'principal') {
  const res = await supabase.from('daily_reports').select('id, status').eq('project_id', projectId).eq('report_date', date).eq('kind', kind).limit(1)
  return (unwrap(res) ?? [])[0] ?? null
}

export async function createReport(values: Pick<Inserts<'daily_reports'>, 'project_id' | 'report_date' | 'kind' | 'author_user_id'>) {
  return unwrapOne(await supabase.from('daily_reports').insert(values).select().single())
}

export async function updateReport(id: string, rowVersion: number, values: Updates<'daily_reports'>) {
  const res = await supabase.from('daily_reports').update(values).eq('id', id).eq('row_version', rowVersion).select()
  return requireUpdated(unwrap(res))
}

export async function discardDraft(id: string) {
  const res = await supabase.from('daily_reports').delete().eq('id', id).select('id')
  return requireUpdated(unwrap(res))
}

// ---------------------------------------------------------------- itens do diário
type ChildTable = 'daily_report_activities' | 'daily_report_workers' | 'daily_report_crews' | 'daily_report_materials' | 'daily_report_equipment'

export async function insertItem<T extends ChildTable>(table: T, values: Inserts<T>) {
  return unwrapOne(await supabase.from(table).insert(values as never).select().single())
}
export async function updateItem<T extends ChildTable>(table: T, id: string, values: Updates<T>) {
  const res = await supabase.from(table as 'daily_report_activities').update(values as never).eq('id', id).select()
  return requireUpdated(unwrap(res) as unknown[] | null)
}
export async function deleteItem(table: ChildTable, id: string) {
  const res = await supabase.from(table as 'daily_report_activities').delete().eq('id', id).select('id')
  return requireUpdated(unwrap(res))
}

/** Registra a presença de vários funcionários de uma vez (ignora os já lançados). */
export async function addWorkersBulk(reportId: string, workers: Array<{ id: string; job_title: string; company_name: string | null }>) {
  if (!workers.length) return []
  const rows = workers.map((w) => ({ daily_report_id: reportId, worker_id: w.id, job_title: w.job_title, company_name: w.company_name, attendance_status: 'presente' as const }))
  return unwrap(await supabase.from('daily_report_workers').upsert(rows, { onConflict: 'daily_report_id,worker_id', ignoreDuplicates: true }).select()) ?? []
}

// ---------------------------------------------------------------- fluxo de aprovação (funções do banco)
export async function submitReport(id: string, rowVersion?: number) {
  return unwrap(await supabase.rpc('submit_daily_report', { p_report: id, p_row_version: rowVersion }))
}
export async function approveReport(id: string, comments?: string, rowVersion?: number) {
  return unwrap(await supabase.rpc('approve_daily_report', { p_report: id, p_comments: comments, p_row_version: rowVersion }))
}
export async function returnReport(id: string, reason: string, rowVersion?: number) {
  return unwrap(await supabase.rpc('return_daily_report', { p_report: id, p_reason: reason, p_row_version: rowVersion }))
}
export async function reopenReport(id: string, reason: string, rowVersion?: number) {
  return unwrap(await supabase.rpc('reopen_daily_report', { p_report: id, p_reason: reason, p_row_version: rowVersion }))
}

export async function getVersionSnapshot(id: string) {
  return unwrapOne(await supabase.from('daily_report_versions').select('*').eq('id', id).single())
}

// ---------------------------------------------------------------- cadastros usados no formulário
export async function listProjectWorkers(projectId: string) {
  const res = await supabase.from('worker_projects').select('worker:workers(id, name, job_title, company_name, status)').eq('project_id', projectId)
  return ((unwrap(res) ?? []).map((r) => r.worker).filter(Boolean) as Array<Pick<Tables<'workers'>, 'id' | 'name' | 'job_title' | 'company_name' | 'status'>>)
    .filter((w) => w.status === 'ativo').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function listProjectActivities(projectId: string) {
  const res = await supabase.from('activities').select('id, title, status, stage:project_stages(name)').eq('project_id', projectId)
    .not('status', 'in', '(cancelada)').order('title')
  return (unwrap(res) ?? []) as unknown as Array<{ id: string; title: string; status: Enums<'activity_status'>; stage: { name: string } | null }>
}
