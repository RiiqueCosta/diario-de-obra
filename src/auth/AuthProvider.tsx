import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Tables, type Enums } from '@/lib/supabase'
import { toAppError, unwrap, type AppError } from '@/lib/errors'

export type Membership = {
  id: string
  organization_id: string
  role: Enums<'org_role'>
  status: Enums<'member_status'>
  organization: Pick<Tables<'organizations'>, 'id' | 'name' | 'document_number' | 'logo_storage_key'>
}

type AuthState = {
  ready: boolean
  session: Session | null
  profile: Tables<'profiles'> | null
  memberships: Membership[]
  org: Membership | null
  isAdmin: boolean
  loadError: AppError | null
  setOrg: (orgId: string) => void
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const ORG_KEY = 'diario.org'

function readStoredOrg(): string | null {
  try { return window.localStorage.getItem(ORG_KEY) } catch { return null }
}
function storeOrg(id: string) {
  try { window.localStorage.setItem(ORG_KEY, id) } catch { /* armazenamento indisponível: segue sem lembrar */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [orgId, setOrgId] = useState<string | null>(readStoredOrg)
  const [dataReady, setDataReady] = useState(false)
  const [loadError, setLoadError] = useState<AppError | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null); setMemberships([]); setDataReady(true); return
    }
    setDataReady(false)
    setLoadError(null)
    try {
      // Ativa vínculos de convite pendentes do próprio usuário (1º acesso).
      await supabase.rpc('accept_pending_invites')
      const [p, m] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('organization_members')
          .select('id, organization_id, role, status, organization:organizations(id, name, document_number, logo_storage_key)')
          .eq('user_id', userId).eq('status', 'ativo'),
      ])
      setProfile(unwrap(p))
      const list = (unwrap(m) ?? []).filter((x) => x.organization) as unknown as Membership[]
      list.sort((a, b) => a.organization.name.localeCompare(b.organization.name, 'pt-BR'))
      setMemberships(list)
    } catch (e) {
      setLoadError(toAppError(e))
    } finally {
      setDataReady(true)
    }
  }, [userId])

  useEffect(() => { if (sessionReady) void load() }, [sessionReady, load])

  const org = useMemo(() => memberships.find((m) => m.organization_id === orgId) ?? memberships[0] ?? null, [memberships, orgId])

  const setOrg = useCallback((id: string) => { setOrgId(id); storeOrg(id) }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null); setMemberships([])
    window.location.assign('/entrar')
  }, [])

  const value: AuthState = {
    ready: sessionReady && dataReady,
    session, profile, memberships, org,
    isAdmin: org?.role === 'admin',
    loadError, setOrg, reload: load, signOut,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}

/** Empresa ativa (garantida nas telas internas). */
export function useOrg() {
  const { org } = useAuth()
  if (!org) throw new Error('Nenhuma empresa ativa')
  return org
}
