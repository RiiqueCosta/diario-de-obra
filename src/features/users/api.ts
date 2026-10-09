import { supabase, type Tables, type Enums } from '@/lib/supabase'
import { AppError, requireUpdated, toAppError, unwrap } from '@/lib/errors'

export type OrgMember = Tables<'organization_members'> & { profile: Pick<Tables<'profiles'>, 'id' | 'name' | 'email' | 'status'> | null }

export async function listOrgMembers(orgId: string, includeInactive = true): Promise<OrgMember[]> {
  let q = supabase.from('organization_members').select('*, profile:profiles(id, name, email, status)').eq('organization_id', orgId)
  if (!includeInactive) q = q.eq('status', 'ativo')
  const rows = (unwrap(await q) ?? []) as unknown as OrgMember[]
  return rows.sort((a, b) => (a.profile?.name || a.profile?.email || '').localeCompare(b.profile?.name || b.profile?.email || '', 'pt-BR'))
}

export async function updateOrgMember(id: string, values: { role?: Enums<'org_role'>; status?: Enums<'member_status'> }) {
  const res = await supabase.from('organization_members').update(values).eq('id', id).select()
  return requireUpdated(unwrap(res))
}

export async function listMemberProjects(userId: string, orgId: string) {
  const res = await supabase.from('project_members')
    .select('id, role, permissions, project:projects!inner(id, name, code, organization_id, archived_at)')
    .eq('user_id', userId).eq('project.organization_id', orgId)
  return (unwrap(res) ?? []) as unknown as Array<{ id: string; role: Enums<'project_role'>; permissions: Record<string, boolean>; project: { id: string; name: string; code: string; archived_at: string | null } }>
}

export type InviteInput = {
  organization_id: string
  email: string
  name: string
  role: Enums<'org_role'>
  mode: 'senha_provisoria' | 'convite_email'
  projects: Array<{ project_id: string; role: Enums<'project_role'> }>
}
export type InviteResult = { user_id: string; created: boolean; temporary_password?: string; status: Enums<'member_status'> }

/** Convite feito pela Edge Function (precisa da chave de serviço, que fica só no servidor). */
export async function inviteUser(input: InviteInput): Promise<InviteResult> {
  const { data, error } = await supabase.functions.invoke('convidar-usuario', { body: { ...input, redirect_to: `${window.location.origin}/` } })
  if (error) {
    // A função devolve { error: "mensagem" } com status 4xx
    let message: string | undefined
    try { message = (await (error as { context?: Response }).context?.json())?.error } catch { /* corpo não JSON */ }
    if (message) throw new AppError(message, 'validacao', error)
    throw toAppError(error)
  }
  return data as InviteResult
}
