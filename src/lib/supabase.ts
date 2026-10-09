import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
export type { Json } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.')
}

// Somente a chave publicável vai para o navegador. Toda autorização é feita
// pelo banco (RLS) com o token do usuário logado.
export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

export const BUCKET = 'obra-arquivos'
