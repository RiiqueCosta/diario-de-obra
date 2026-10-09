import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { useQuery } from '@/lib/useQuery'
import { getMyPermissions } from './api'

export type ProjectOption = { id: string; name: string; code: string; status: string; archived_at: string | null }

/** Obras que o usuário enxerga (o RLS filtra), para seletores. */
export function useProjectOptions(orgId: string, includeArchived = false) {
  return useQuery<ProjectOption[]>(`projects:options:${orgId}:${includeArchived}`, async () => {
    let q = supabase.from('projects').select('id, name, code, status, archived_at').eq('organization_id', orgId)
    if (!includeArchived) q = q.is('archived_at', null)
    return (unwrap(await q.order('name')) ?? []) as ProjectOption[]
  })
}

export type Perms = Record<string, boolean | string | null>

/** Permissões efetivas do usuário na obra (a tela usa para mostrar ações; o banco revalida). */
export function useProjectPerms(projectId: string | null | undefined) {
  const q = useQuery<Perms>(projectId ? `perms:${projectId}` : null, () => getMyPermissions(projectId!))
  const can = (perm: string) => !!q.data?.[perm]
  return { ...q, can }
}
