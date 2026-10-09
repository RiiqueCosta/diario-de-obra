import { supabase, type Tables, type Inserts, type Updates, type Enums } from '@/lib/supabase'
import { AppError, requireUpdated, unwrap, unwrapOne } from '@/lib/errors'

export type Occurrence = Tables<'occurrences'> & {
  project: Pick<Tables<'projects'>, 'id' | 'name' | 'code'> | null
  responsible: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null
  author: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null
  activity: Pick<Tables<'activities'>, 'id' | 'title'> | null
  report: Pick<Tables<'daily_reports'>, 'id' | 'report_date'> | null
}
export type OccurrenceHistory = Tables<'occurrence_history'> & { user: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null }
export type OccurrenceComment = Tables<'occurrence_comments'> & { user: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null }

const SELECT = `*, project:projects!inner(id, name, code, organization_id),
  responsible:profiles!occurrences_responsible_user_id_fkey(id, name, email),
  author:profiles!occurrences_created_by_fkey(id, name, email),
  activity:activities(id, title), report:daily_reports(id, report_date)`

export type OccurrenceFilters = { orgId: string; projectId?: string; status?: string; open?: boolean; priority?: string; responsible?: string; overdue?: boolean; search?: string; page?: number; pageSize?: number }

export async function listOccurrences(f: OccurrenceFilters) {
  const pageSize = f.pageSize ?? 30
  const page = f.page ?? 0
  let q = supabase.from('occurrences').select(SELECT, { count: 'exact' }).eq('project.organization_id', f.orgId)
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.status) q = q.eq('status', f.status as Enums<'occurrence_status'>)
  if (f.open) q = q.not('status', 'in', '(resolvida,encerrada)')
  if (f.priority) q = q.eq('priority', f.priority as Enums<'priority_level'>)
  if (f.responsible === 'sem') q = q.is('responsible_user_id', null)
  else if (f.responsible) q = q.eq('responsible_user_id', f.responsible)
  if (f.overdue) q = q.lt('due_date', new Date().toISOString().slice(0, 10)).not('status', 'in', '(resolvida,encerrada)')
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,()]/g, ' ')
    q = q.or(`title.ilike.%${s}%,code.ilike.%${s}%,description.ilike.%${s}%`)
  }
  const res = await q.order('occurred_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
  return { rows: (unwrap(res) ?? []) as unknown as Occurrence[], total: res.count ?? 0, page, pageSize }
}

export async function getOccurrence(id: string) {
  const row = unwrap(await supabase.from('occurrences').select(SELECT).eq('id', id).maybeSingle()) as unknown as Occurrence | null
  if (!row) throw new AppError('Ocorrência não encontrada ou sem acesso.', 'nao_encontrado')
  return row
}

export async function getHistory(id: string) {
  const [h, c] = await Promise.all([
    supabase.from('occurrence_history').select('*, user:profiles(id, name, email)').eq('occurrence_id', id).order('created_at'),
    supabase.from('occurrence_comments').select('*, user:profiles(id, name, email)').eq('occurrence_id', id).order('created_at'),
  ])
  return { history: (unwrap(h) ?? []) as unknown as OccurrenceHistory[], comments: (unwrap(c) ?? []) as unknown as OccurrenceComment[] }
}

export async function createOccurrence(values: Omit<Inserts<'occurrences'>, 'code'>) {
  return unwrapOne(await supabase.from('occurrences').insert({ ...values, code: 'gerado' }).select().single())
}

export async function updateOccurrence(id: string, rowVersion: number, values: Updates<'occurrences'>) {
  const res = await supabase.from('occurrences').update(values).eq('id', id).eq('row_version', rowVersion).select()
  return requireUpdated(unwrap(res))
}

export async function addComment(occurrenceId: string, userId: string, body: string) {
  return unwrapOne(await supabase.from('occurrence_comments').insert({ occurrence_id: occurrenceId, user_id: userId, body }).select().single())
}

export async function listCategories(orgId: string, kind: 'foto' | 'ocorrencia' | 'documento' | 'material' | 'equipamento') {
  const res = await supabase.from('categories').select('name').eq('organization_id', orgId).eq('kind', kind).eq('active', true).order('name')
  return (unwrap(res) ?? []).map((c) => c.name)
}
