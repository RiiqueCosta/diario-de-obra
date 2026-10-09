import { supabase, BUCKET, type Tables, type Inserts, type Updates } from '@/lib/supabase'
import { AppError, requireUpdated, unwrap, unwrapOne } from '@/lib/errors'

export type Project = Tables<'projects'>
export type ProjectMember = Tables<'project_members'> & { profile: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null }

export type ProjectFilters = { search?: string; status?: string; archived?: boolean; page?: number; pageSize?: number }

export async function listProjects(orgId: string, f: ProjectFilters = {}) {
  const pageSize = f.pageSize ?? 24
  const page = f.page ?? 0
  let q = supabase.from('projects').select('*', { count: 'exact' }).eq('organization_id', orgId)
  q = f.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
  if (f.status) q = q.eq('status', f.status as Project['status'])
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,()]/g, ' ')
    q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%,client_name.ilike.%${s}%,city.ilike.%${s}%`)
  }
  const res = await q.order('name').range(page * pageSize, page * pageSize + pageSize - 1)
  return { rows: unwrap(res) ?? [], total: res.count ?? 0, page, pageSize }
}

export async function getProject(id: string): Promise<Project> {
  const res = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
  const row = unwrap(res)
  if (!row) throw new AppError('Obra não encontrada ou você não tem acesso a ela.', 'nao_encontrado')
  return row
}

export async function getMyPermissions(projectId: string): Promise<Record<string, boolean | string | null>> {
  const res = await supabase.rpc('my_project_permissions', { p_project: projectId })
  return (unwrap(res) as Record<string, boolean | string | null>) ?? {}
}

export async function createProject(values: Inserts<'projects'>): Promise<Project> {
  return unwrapOne(await supabase.from('projects').insert(values).select().single())
}

/** Atualização com controle de concorrência: falha se outra pessoa salvou antes. */
export async function updateProject(id: string, rowVersion: number, values: Updates<'projects'>): Promise<Project> {
  const res = await supabase.from('projects').update(values).eq('id', id).eq('row_version', rowVersion).select()
  return requireUpdated(unwrap(res))
}

export async function setArchived(id: string, archived: boolean): Promise<Project> {
  const res = await supabase.from('projects').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).select()
  return requireUpdated(unwrap(res))
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const res = await supabase.from('project_members').select('*, profile:profiles(id, name, email)').eq('project_id', projectId).order('role')
  return (unwrap(res) ?? []) as unknown as ProjectMember[]
}

export async function addProjectMember(values: Inserts<'project_members'>) {
  return unwrap(await supabase.from('project_members').insert(values).select().single())
}

export async function updateProjectMember(id: string, values: Updates<'project_members'>) {
  const res = await supabase.from('project_members').update(values).eq('id', id).select()
  return requireUpdated(unwrap(res))
}

export async function removeProjectMember(id: string) {
  const res = await supabase.from('project_members').delete().eq('id', id).select()
  return requireUpdated(unwrap(res))
}

// ---------------------------------------------------------------- arquivos
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Envia imagem para o Storage privado no caminho exigido pelas políticas. */
export async function uploadProjectImage(orgId: string, projectId: string, folder: 'capa', file: File, maxMb: number): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new AppError('Envie uma imagem JPG, PNG ou WEBP.', 'validacao')
  if (file.size > maxMb * 1024 * 1024) throw new AppError(`A imagem passa de ${maxMb} MB.`, 'validacao')
  await assertImageSignature(file)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const key = `${orgId}/${projectId}/${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(key, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
  if (error) throw error
  return key
}

/** Confere a assinatura binária do arquivo (impede arquivo renomeado com extensão de imagem). */
export async function assertImageSignature(file: File) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  if (!(jpg || png || webp)) throw new AppError('O arquivo não é uma imagem válida.', 'validacao')
}

/** URL temporária (1 hora) para exibir um arquivo privado. */
export async function signedUrl(key: string | null | undefined, seconds = 3600): Promise<string | null> {
  if (!key) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, seconds)
  if (error) return null
  return data.signedUrl
}

export async function removeUnlinkedObject(key: string) {
  await supabase.storage.from(BUCKET).remove([key])
}
