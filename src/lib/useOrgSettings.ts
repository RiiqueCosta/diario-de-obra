import { supabase, type Tables } from './supabase'
import { unwrap } from './errors'
import { useQuery } from './useQuery'

export function useOrgSettings(orgId: string) {
  return useQuery<Tables<'org_settings'> | null>(`org_settings:${orgId}`, async () =>
    unwrap(await supabase.from('org_settings').select('*').eq('organization_id', orgId).maybeSingle()))
}
