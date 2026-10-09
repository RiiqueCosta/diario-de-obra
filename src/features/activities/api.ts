import { supabase, type Tables, type Inserts, type Updates } from '@/lib/supabase'
import { requireUpdated, unwrap, unwrapOne } from '@/lib/errors'

export type Stage = Tables<'project_stages'>
export type Activity = Tables<'activities'> & {
  responsible: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null
  deps: Array<{ depends_on_id: string }>
}
export type Executed = { activity_id: string; quantity: number; last_date: string; reports: number }

export async function listStages(projectId: string) {
  return (unwrap(await supabase.from('project_stages').select('*').eq('project_id', projectId).is('archived_at', null).order('sequence').order('created_at')) ?? []) as Stage[]
}
export async function saveStage(id: string | null, values: Inserts<'project_stages'> | Updates<'project_stages'>) {
  if (id) return requireUpdated(unwrap(await supabase.from('project_stages').update(values).eq('id', id).select()))
  return unwrapOne(await supabase.from('project_stages').insert(values as Inserts<'project_stages'>).select().single())
}

export async function listActivities(projectId: string) {
  const res = await supabase.from('activities')
    .select('*, responsible:profiles!activities_responsible_user_id_fkey(id, name, email), deps:activity_dependencies!activity_dependencies_activity_id_fkey(depends_on_id)')
    .eq('project_id', projectId).order('planned_start_date', { nullsFirst: false }).order('title')
  return (unwrap(res) ?? []) as unknown as Activity[]
}

export async function saveActivity(id: string | null, rowVersion: number | null, values: Inserts<'activities'> | Updates<'activities'>) {
  if (id) return requireUpdated(unwrap(await supabase.from('activities').update(values).eq('id', id).eq('row_version', rowVersion!).select()))
  return unwrapOne(await supabase.from('activities').insert(values as Inserts<'activities'>).select().single())
}

export async function setDependencies(activityId: string, current: string[], next: string[]) {
  for (const d of next.filter((x) => !current.includes(x))) unwrap(await supabase.from('activity_dependencies').insert({ activity_id: activityId, depends_on_id: d }))
  for (const d of current.filter((x) => !next.includes(x))) unwrap(await supabase.from('activity_dependencies').delete().eq('activity_id', activityId).eq('depends_on_id', d))
}

/** Realizado segundo os diários: soma de quantidades e último registro por atividade. */
export async function executedByActivity(projectId: string): Promise<Record<string, Executed>> {
  const res = await supabase.from('daily_report_activities')
    .select('activity_id, quantity, report:daily_reports!inner(report_date, project_id)')
    .eq('report.project_id', projectId).not('activity_id', 'is', null)
  const out: Record<string, Executed> = {}
  for (const r of (unwrap(res) ?? []) as unknown as Array<{ activity_id: string; quantity: number | null; report: { report_date: string } }>) {
    const e = out[r.activity_id] ?? { activity_id: r.activity_id, quantity: 0, last_date: '', reports: 0 }
    e.quantity += Number(r.quantity ?? 0)
    e.reports += 1
    if (r.report.report_date > e.last_date) e.last_date = r.report.report_date
    out[r.activity_id] = e
  }
  return out
}

/** Atividades atrasadas/bloqueadas/vencendo em todas as obras acessíveis (painel e relatórios). */
export async function listLateActivities(orgId: string, projectId?: string) {
  let q = supabase.from('activities')
    .select('*, responsible:profiles!activities_responsible_user_id_fkey(id, name, email), project:projects!inner(id, name, code, organization_id), stage:project_stages(name)')
    .eq('project.organization_id', orgId).not('status', 'in', '(concluida,cancelada)')
  if (projectId) q = q.eq('project_id', projectId)
  return (unwrap(await q.order('planned_end_date', { nullsFirst: false })) ?? []) as unknown as Array<Activity & { project: { id: string; name: string; code: string }; stage: { name: string } | null }>
}
