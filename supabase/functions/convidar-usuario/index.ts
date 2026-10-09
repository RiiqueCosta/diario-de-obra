// Edge Function: convidar/incluir usuário na empresa.
// Roda no Supabase com a chave de serviço (SUPABASE_SERVICE_ROLE_KEY), que nunca vai ao navegador.
// Regras: somente administrador ativo da empresa; obras precisam ser da mesma empresa.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ORIGIN_ALLOW = '*'
const cors = {
  'Access-Control-Allow-Origin': ORIGIN_ALLOW,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

type Body = {
  organization_id?: string
  email?: string
  name?: string
  role?: 'admin' | 'membro'
  mode?: 'senha_provisoria' | 'convite_email'
  projects?: Array<{ project_id: string; role: 'gestor' | 'engenheiro' | 'encarregado' | 'colaborador' }>
  redirect_to?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PROJECT_ROLES = ['gestor', 'engenheiro', 'encarregado', 'colaborador']

function temporaryPassword(): string {
  // 14 caracteres sem ambíguos (0/O, 1/l), com letras e números.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(14)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return /\d/.test(out) ? out : out.slice(0, 13) + '7'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Autenticação necessária.' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // Valida o token de quem chamou junto ao Supabase Auth.
  const { data: me, error: meErr } = await admin.auth.getUser(authHeader.slice(7))
  if (meErr || !me.user) return json(401, { error: 'Sessão inválida. Entre novamente.' })

  let body: Body
  try { body = await req.json() } catch { return json(400, { error: 'Requisição inválida.' }) }

  const orgId = body.organization_id ?? ''
  const email = (body.email ?? '').trim().toLowerCase()
  const name = (body.name ?? '').trim().slice(0, 200)
  const role = body.role === 'admin' ? 'admin' : 'membro'
  const mode = body.mode === 'convite_email' ? 'convite_email' : 'senha_provisoria'
  const projects = Array.isArray(body.projects) ? body.projects : []

  if (!UUID.test(orgId)) return json(400, { error: 'Empresa inválida.' })
  if (!EMAIL.test(email)) return json(400, { error: 'E-mail inválido.' })
  if (name.length < 2) return json(400, { error: 'Informe o nome.' })
  if (projects.length > 200 || projects.some((p) => !UUID.test(p.project_id) || !PROJECT_ROLES.includes(p.role))) {
    return json(400, { error: 'Lista de obras inválida.' })
  }

  // Somente administrador ativo da empresa pode convidar.
  const { data: callerMember } = await admin.from('organization_members')
    .select('role, status').eq('organization_id', orgId).eq('user_id', me.user.id).maybeSingle()
  const { data: callerProfile } = await admin.from('profiles').select('status').eq('id', me.user.id).maybeSingle()
  if (!callerMember || callerMember.role !== 'admin' || callerMember.status !== 'ativo' || callerProfile?.status !== 'ativo') {
    return json(403, { error: 'Somente administradores da empresa podem convidar usuários.' })
  }

  // Todas as obras precisam pertencer a esta empresa.
  if (projects.length) {
    const ids = [...new Set(projects.map((p) => p.project_id))]
    const { data: found } = await admin.from('projects').select('id').eq('organization_id', orgId).in('id', ids)
    if ((found ?? []).length !== ids.length) return json(400, { error: 'Alguma obra selecionada não pertence a esta empresa.' })
  }

  // Usuário já existe?
  const { data: existingProfile } = await admin.from('profiles').select('id, status').ilike('email', email).maybeSingle()
  let userId = existingProfile?.id as string | undefined
  let created = false
  let temporary: string | undefined

  if (existingProfile && existingProfile.status !== 'ativo') {
    return json(409, { error: 'Esta conta está bloqueada no sistema. Fale com o suporte.' })
  }

  if (!userId) {
    if (mode === 'senha_provisoria') {
      temporary = temporaryPassword()
      const { data, error } = await admin.auth.admin.createUser({ email, password: temporary, email_confirm: true, user_metadata: { name } })
      if (error || !data.user) return json(400, { error: `Não foi possível criar o acesso: ${error?.message ?? 'erro desconhecido'}` })
      userId = data.user.id
      await admin.from('profiles').update({ must_change_password: true, name }).eq('id', userId)
    } else {
      const redirectTo = typeof body.redirect_to === 'string' && /^https?:\/\//.test(body.redirect_to) ? body.redirect_to : undefined
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo })
      if (error || !data.user) {
        return json(400, { error: `Não foi possível enviar o convite por e-mail (${error?.message ?? 'erro'}). Verifique a configuração de e-mail do projeto ou use a opção de senha provisória.` })
      }
      userId = data.user.id
    }
    created = true
  }

  // Vínculo com a empresa (reativa se estava desativado).
  const status = created && mode === 'convite_email' ? 'convidado' : 'ativo'
  const { data: existingMember } = await admin.from('organization_members').select('id, status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle()
  if (existingMember && existingMember.status === 'ativo') {
    return json(409, { error: 'Esta pessoa já faz parte da empresa. Ajuste o acesso dela na lista de usuários.' })
  }
  if (existingMember) {
    const { error } = await admin.from('organization_members').update({ status, role }).eq('id', existingMember.id)
    if (error) return json(400, { error: 'Não foi possível reativar o vínculo.' })
  } else {
    const { error } = await admin.from('organization_members').insert({ organization_id: orgId, user_id: userId, role, status, created_by: me.user.id })
    if (error) return json(400, { error: 'Não foi possível vincular o usuário à empresa.' })
  }

  // Equipes das obras.
  if (role === 'membro' && projects.length) {
    const rows = projects.map((p) => ({ project_id: p.project_id, user_id: userId!, role: p.role, created_by: me.user.id }))
    const { error } = await admin.from('project_members').upsert(rows, { onConflict: 'project_id,user_id' })
    if (error) return json(400, { error: 'Usuário incluído na empresa, mas houve erro ao liberar as obras. Ajuste na aba Equipe de cada obra.' })
  }

  // Registro de auditoria com o autor real (a chave de serviço não carrega o usuário).
  await admin.from('audit_logs').insert({
    organization_id: orgId, user_id: me.user.id, entity_type: 'organization_members', entity_id: userId,
    action: 'convite', new_values: { email, name, role, mode, projects },
  })

  return json(200, { user_id: userId, created, status, ...(temporary ? { temporary_password: temporary } : {}) })
})
