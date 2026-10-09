// Roteador mínimo baseado na History API (sem dependência externa).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'

type RouterState = { path: string; search: URLSearchParams; navigate: (to: string, opts?: { replace?: boolean; force?: boolean }) => void }
const RouterContext = createContext<RouterState | null>(null)

let blockers: Array<() => boolean> = []
/** Registra um bloqueio de navegação (ex.: formulário com alterações não salvas). */
export function useNavigationBlocker(shouldBlock: boolean, message = 'Há alterações não salvas. Deseja sair mesmo assim?') {
  useEffect(() => {
    if (!shouldBlock) return
    const fn = () => !window.confirm(message)
    blockers.push(fn)
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      blockers = blockers.filter((b) => b !== fn)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [shouldBlock, message])
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }))

  useEffect(() => {
    const onPop = () => setLoc({ path: window.location.pathname, search: window.location.search })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean; force?: boolean }) => {
    if (!opts?.force && blockers.some((b) => b())) return
    const url = new URL(to, window.location.origin)
    if (url.pathname + url.search === window.location.pathname + window.location.search) return
    if (opts?.replace) window.history.replaceState(null, '', url.pathname + url.search)
    else window.history.pushState(null, '', url.pathname + url.search)
    setLoc({ path: url.pathname, search: url.search })
    window.scrollTo({ top: 0 })
  }, [])

  const value = useMemo(() => ({ path: loc.path, search: new URLSearchParams(loc.search), navigate }), [loc, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterState {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter fora do RouterProvider')
  return ctx
}

export function useNavigate() { return useRouter().navigate }
export function useSearchParams() { return useRouter().search }

/** Compara um caminho com um padrão como "/obras/:id/editar". */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.replace(/\/+$/, '').split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export type RouteDef = { path: string; render: (params: Record<string, string>) => ReactNode }

export function Routes({ routes, fallback }: { routes: RouteDef[]; fallback: ReactNode }) {
  const { path } = useRouter()
  for (const r of routes) {
    const params = matchPath(r.path, path)
    if (params) return <>{r.render(params)}</>
  }
  return <>{fallback}</>
}

export function Link({ to, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter()
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest}>{children}</a>
}
