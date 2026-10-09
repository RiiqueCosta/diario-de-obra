import { useRef, useState } from 'react'
import { useOrg } from '@/auth/AuthProvider'
import { supabase, BUCKET, type Tables } from '@/lib/supabase'
import { AppError, requireUpdated, toAppError, unwrap, unwrapOne } from '@/lib/errors'
import { useAction, useQuery } from '@/lib/useQuery'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { useOrgSettings } from '@/lib/useOrgSettings'
import { Badge, Button, EmptyState, ErrorBox, Loading, Modal, SelectField, TextField, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { listCategories } from '../occurrences/api'
import { downloadUrl } from '../photos/photoUpload'

type Doc = Tables<'project_documents'> & { uploader: Pick<Tables<'profiles'>, 'name' | 'email'> | null }

const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  dwg: 'image/vnd.dwg', txt: 'text/plain', csv: 'text/csv',
}

/** Confere a assinatura do arquivo contra a extensão (bloqueia executável renomeado). */
async function checkSignature(file: File, ext: string) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const starts = (...sig: number[]) => sig.every((x, i) => b[i] === x)
  const ok =
    ext === 'pdf' ? starts(0x25, 0x50, 0x44, 0x46) :
    ['docx', 'xlsx'].includes(ext) ? starts(0x50, 0x4b, 0x03, 0x04) :
    ['doc', 'xls'].includes(ext) ? starts(0xd0, 0xcf, 0x11, 0xe0) :
    ['jpg', 'jpeg'].includes(ext) ? starts(0xff, 0xd8, 0xff) :
    ext === 'png' ? starts(0x89, 0x50, 0x4e, 0x47) :
    ext === 'webp' ? starts(0x52, 0x49, 0x46, 0x46) :
    ext === 'dwg' ? starts(0x41, 0x43, 0x31, 0x30) :
    ['txt', 'csv'].includes(ext) ? !b.slice(0, 8).some((x) => x === 0) : false
  if (!ok) throw new AppError(`O conteúdo de "${file.name}" não corresponde a um arquivo .${ext} válido.`, 'validacao')
}

export function ProjectDocuments({ projectId, canUpload, canManage }: { projectId: string; canUpload: boolean; canManage: boolean }) {
  const org = useOrg()
  const toast = useToast()
  const settings = useOrgSettings(org.organization_id)
  const cats = useQuery(`categories:documento:${org.organization_id}`, () => listCategories(org.organization_id, 'documento'))
  const q = useQuery(`documents:${projectId}`, async () => (unwrap(await supabase.from('project_documents')
    .select('*, uploader:profiles!project_documents_uploaded_by_fkey(name, email)').eq('project_id', projectId).is('deleted_at', null).order('created_at', { ascending: false })) ?? []) as unknown as Doc[])
  const input = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [removing, setRemoving] = useState<Doc | null>(null)
  const upload = useAction(async (file: File) => {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const mime = ALLOWED[ext]
    if (!mime) throw new AppError('Tipo de arquivo não permitido. Use PDF, Word, Excel, DWG, imagem, TXT ou CSV.', 'validacao')
    const max = settings.data?.max_document_mb ?? 30
    if (file.size > max * 1024 * 1024) throw new AppError(`O arquivo passa de ${max} MB.`, 'validacao')
    await checkSignature(file, ext)
    const key = `${org.organization_id}/${projectId}/docs/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from(BUCKET).upload(key, file, { contentType: mime, upsert: false })
    if (up.error) throw toAppError(up.error)
    try {
      return unwrapOne(await supabase.from('project_documents').insert({
        project_id: projectId, uploaded_by: (await supabase.auth.getUser()).data.user!.id, file_name: file.name.slice(0, 200),
        storage_key: key, mime_type: mime, file_size: file.size, category: category || null, description: description.trim() || null,
      }).select().single())
    } catch (e) {
      await supabase.storage.from(BUCKET).remove([key]).catch(() => {})
      throw e
    }
  })
  const remove = useAction(async (d: Doc) => requireUpdated(unwrap(await supabase.from('project_documents').update({ deleted_at: new Date().toISOString() }).eq('id', d.id).select())))

  return (
    <>
      {canUpload && (
        <div className="panel panel-body">
          <div className="grid-3">
            <SelectField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Sem categoria" options={(cats.data ?? []).map((c) => ({ value: c, label: c }))} />
            <TextField label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Projeto estrutural rev. 03" />
            <div className="field"><label>&nbsp;</label>
              <Button icon="arquivo" loading={upload.pending} onClick={() => input.current?.click()}>Enviar documento</Button>
            </div>
          </div>
          <input ref={input} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.jpg,.jpeg,.png,.webp,.txt,.csv"
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && await upload.run(f)) { setDescription(''); toast('ok', 'Documento enviado.'); void q.refetch() } }} />
          <p className="field-hint mt-8">Até {settings.data?.max_document_mb ?? 30} MB. O arquivo fica em armazenamento privado e só pode ser aberto por quem acessa esta obra.</p>
          <ErrorBox error={upload.error} />
        </div>
      )}
      <div className="panel mt-16">
        <ErrorBox error={q.error} onRetry={q.refetch} />
        {q.loading && !q.data ? <Loading /> : !q.data?.length ? <EmptyState icon="arquivo" title="Nenhum documento">Projetos, contratos, ART/RRT, licenças e outros arquivos da obra.</EmptyState> : (
          <ul className="list">
            {q.data.map((d) => (
              <li key={d.id} className="row-link" style={{ cursor: 'default' }}>
                <Icon name="arquivo" />
                <div className="row-main">
                  <strong>{d.description || d.file_name}</strong>
                  <span>{d.file_name} — {formatFileSize(d.file_size)} — enviado por {d.uploader?.name || d.uploader?.email} em {formatDateTime(d.created_at)}</span>
                </div>
                {d.category && <Badge tone="blue">{d.category}</Badge>}
                <Button size="sm" variant="secondary" onClick={async () => { try { window.open(await downloadUrl(d.storage_key, d.file_name), '_blank', 'noopener') } catch (e) { toast('danger', toAppError(e).message) } }}>Baixar</Button>
                {canManage && <Button size="sm" variant="ghost" onClick={() => setRemoving(d)}>Remover</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={!!removing} title="Remover documento" onClose={() => setRemoving(null)}
        footer={<><Button variant="secondary" onClick={() => setRemoving(null)}>Cancelar</Button>
          <Button variant="danger" loading={remove.pending} onClick={async () => { if (removing && await remove.run(removing)) { setRemoving(null); toast('ok', 'Documento removido da lista.'); void q.refetch() } }}>Remover</Button></>}>
        <p>"{removing?.description || removing?.file_name}" sai da lista da obra. O arquivo original é preservado e a remoção fica na auditoria.</p>
        <ErrorBox error={remove.error} />
      </Modal>
    </>
  )
}
