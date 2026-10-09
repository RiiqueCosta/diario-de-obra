import { useCallback, useEffect, useRef, useState } from 'react'
import { toAppError, type AppError } from './errors'

type QueryState<T> = { data: T | undefined; error: AppError | null; loading: boolean; refetch: () => Promise<void> }

// Pequeno cache em memória para evitar "piscar" ao voltar a uma tela.
const cache = new Map<string, unknown>()
const stamps = new Map<string, number>()
const listeners = new Map<string, Set<() => void>>()
// URLs assinadas do Storage valem 1 hora: o cache delas expira antes.
const TTL_SIGNED = 50 * 60 * 1000
function fresh(key: string): boolean {
  if (!cache.has(key)) return false
  if (key.startsWith('signed:') && Date.now() - (stamps.get(key) ?? 0) > TTL_SIGNED) { cache.delete(key); return false }
  return true
}

/** Invalida consultas cujo nome começa com o prefixo (ex.: 'projects'). */
export function invalidate(prefix: string) {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
  for (const [key, set] of listeners) if (key.startsWith(prefix)) set.forEach((fn) => fn())
}

/**
 * Carrega dados com estado de carregamento/erro. `key` identifica a consulta;
 * `null` desativa a consulta (ex.: aguardando um parâmetro).
 */
export function useQuery<T>(key: string | null, fn: () => Promise<T>): QueryState<T> {
  const [data, setData] = useState<T | undefined>(() => (key && fresh(key) ? (cache.get(key) as T | undefined) : undefined))
  const [error, setError] = useState<AppError | null>(null)
  const [loading, setLoading] = useState<boolean>(!!key && !fresh(key))
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const run = useCallback(async () => {
    if (!key) return
    const id = ++seq.current
    setLoading(!fresh(key))
    setError(null)
    try {
      const result = await fnRef.current()
      if (id !== seq.current) return
      cache.set(key, result)
      stamps.set(key, Date.now())
      setData(result)
    } catch (e) {
      if (id !== seq.current) return
      setError(toAppError(e))
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    if (!key) { setData(undefined); setLoading(false); return }
    setData(fresh(key) ? (cache.get(key) as T | undefined) : undefined)
    void run()
    const set = listeners.get(key) ?? new Set()
    const listener = () => { void run() }
    set.add(listener)
    listeners.set(key, set)
    return () => { set.delete(listener) }
  }, [key, run])

  return { data, error, loading, refetch: run }
}

/** Executa uma ação (salvar, enviar...) controlando "salvando" e erro. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPending(true)
    setError(null)
    try {
      return await fnRef.current(...args)
    } catch (e) {
      const err = toAppError(e)
      setError(err)
      return undefined
    } finally {
      setPending(false)
    }
  }, [])
  return { run, pending, error, setError }
}
