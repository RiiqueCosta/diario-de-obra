import { useEffect, useMemo, useRef, useState } from 'react'
import { useOrg } from '@/auth/AuthProvider'
import { supabase, type Tables } from '@/lib/supabase'
import { requireUpdated, toAppError, unwrap, type AppError } from '@/lib/errors'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format'
import { useOrgSettings } from '@/lib/useOrgSettings'
import { Badge, Button, Checkbox, EmptyState, ErrorBox, Loading, Modal, SelectField, TextAreaField, TextField, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { listCategories } from '../occurrences/api'
import { downloadUrl, signedUrls, uploadPhoto, type PhotoMeta } from './photoUpload'

export type Photo = Tables<'attachments'> & {
  uploader: Pick<Tables<'profiles'>, 'id' | 'name' | 'email'> | null
  report: Pick<Tables<'daily_reports'>, 'id' | 'report_date' | 'status'> | null
  occurrence: Pick<Tables<'occurrences'>, 'id' | 'code' | 'title'> | null
  activity: Pick<Tables<'activities'>, 'id' | 'title'> | null
}

export type PhotoFilters = { projectId?: string; dailyReportId?: string; occurrenceId?: string; from?: string; to?: string; category?: string; location?: string; onlyReports?: boolean; limit?: number }

const PHOTO_SELECT = '*, uploader:profiles!attachments_uploaded_by_fkey(id, name, email), report:daily_reports(id, report_date, status), occurrence:occurrences(id, code, title), activity:activities(id, title)'

export async function listPhotos(orgId: string, f: PhotoFilters): Promise<Photo[]> {
  let q = supabase.from('attachments').select(PHOTO_SELECT).eq('organization_id', orgId).eq('kind', 'foto').is('deleted_at', null)
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.dailyReportId) q = q.eq('daily_report_id', f.dailyReportId)
  if (f.occurrenceId) q = q.eq('occurrence_id', f.occurrenceId)
  if (f.from) q = q.gte('uploaded_at', `${f.from}T00:00:00-03:00`)
  if (f.to) q = q.lte('uploaded_at', `${f.to}T23:59:59-03:00`)
  if (f.category) q = q.eq('category', f.category)
  if (f.location?.trim()) q = q.ilike('location_description', `%${f.location.trim().replace(/[%_]/g, ' ')}%`)
  if (f.onlyReports) q = q.eq('include_in_reports', true)
  const rows = (unwrap(await q.order('uploaded_at', { ascending: false }).limit(f.limit ?? 300)) ?? []) as unknown as Photo[]
  // Ordem cronológica pelo momento da foto (EXIF) quando houver; senão pelo envio.
  return rows.sort((a, b) => (b.captured_at ?? b.uploaded_at).localeCompare(a.captured_at ?? a.uploaded_at))
}

export function usePhotoUrls(photos: Photo[] | undefined, which: 'thumb' | 'original' = 'thumb') {
  const keys = (photos ?? []).map((p) => (which === 'thumb' ? p.thumbnail_key ?? p.storage_key : p.storage_key))
  return useQuery(keys.length ? `signed:batch:${which}:${keys.join('|').length}:${keys[0]}:${keys.length}` : null, () => signedUrls(keys))
}

const photoDate = (p: Photo) => p.captured_at ?? p.uploaded_at

// ---------------------------------------------------------------- envio
type QueueItem = { file: File; status: 'fila' | 'enviando' | 'ok' | 'erro'; error?: AppError }

export function PhotoUploader({ meta, onUploaded, compact }: { meta: Omit<PhotoMeta, 'orgId'>; onUploaded: () => void; compact?: boolean }) {
  const org = useOrg()
  const settings = useOrgSettings(org.organization_id)
  const cats = useQuery(`categories:foto:${org.organization_id}`, () => listCategories(org.organization_id, 'foto'))
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [category, setCategory] = useState(meta.category ?? '')
  const [location, setLocation] = useState('')
  const [caption, setCaption] = useState('')
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const busy = queue.some((q) => q.status === 'enviando' || q.status === 'fila')

  async function process(items: QueueItem[]) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'ok') continue
      setQueue((q) => q.map((x) => (x.file === items[i].file ? { ...x, status: 'enviando', error: undefined } : x)))
      try {
        await uploadPhoto(items[i].file, { ...meta, orgId: org.organization_id, category: category || meta.category, location, caption }, settings.data?.max_image_mb ?? 15)
        setQueue((q) => q.map((x) => (x.file === items[i].file ? { ...x, status: 'ok' } : x)))
        onUploaded()
      } catch (e) {
        setQueue((q) => q.map((x) => (x.file === items[i].file ? { ...x, status: 'erro', error: toAppError(e) } : x)))
      }
    }
    invalidate('photos:')
  }

  function add(files: FileList | null) {
    if (!files?.length) return
    const items: QueueItem[] = [...files].map((file) => ({ file, status: 'fila' }))
    setQueue((q) => [...q.filter((x) => x.status !== 'ok'), ...items])
    void process(items)
  }

  const failed = queue.filter((q) => q.status === 'erro')
  return (
    <div className="uploader">
      {!compact && (
        <div className="grid-3">
          <SelectField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Sem categoria" options={(cats.data ?? []).map((c) => ({ value: c, label: c }))} />
          <TextField label="Local ou ambiente" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Bloco B, fachada norte" />
          <TextField label="Legenda" value={caption} onChange={(e) => setCaption(e.target.value)} hint="Vale para as fotos enviadas agora; dá para editar depois." />
        </div>
      )}
      <div className="row mt-8">
        <Button size="lg" icon="foto" onClick={() => camRef.current?.click()} disabled={busy}>Tirar foto</Button>
        <Button size="lg" variant="secondary" icon="arquivo" onClick={() => galRef.current?.click()} disabled={busy}>Escolher fotos</Button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      </div>
      {queue.length > 0 && (
        <ul className="upload-queue">
          {queue.map((q, i) => (
            <li key={i} className={`uq-${q.status}`}>
              <span className="uq-name">{q.file.name}</span>
              <span className="muted small">{formatFileSize(q.file.size)}</span>
              <span className="uq-status">
                {q.status === 'fila' && 'Na fila'}
                {q.status === 'enviando' && <><span className="spinner" aria-hidden /> Enviando</>}
                {q.status === 'ok' && <><Icon name="ok" size={16} /> Enviada</>}
                {q.status === 'erro' && 'Falhou'}
              </span>
              {q.error && <span className="field-error" style={{ flexBasis: '100%' }}>{q.error.message}</span>}
            </li>
          ))}
        </ul>
      )}
      {failed.length > 0 && !busy && (
        <Button className="mt-8" variant="secondary" size="sm" onClick={() => { const retry = failed.map((f) => ({ ...f, status: 'fila' as const })); setQueue((q) => q.map((x) => (x.status === 'erro' ? { ...x, status: 'fila' } : x))); void process(retry) }}>
          Tentar enviar de novo ({failed.length})
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- grade
export function PhotoGrid({ photos, selectable, selected, onToggle, onOpen }: {
  photos: Photo[]; selectable?: boolean; selected?: string[]; onToggle?: (id: string) => void; onOpen: (p: Photo) => void
}) {
  const urls = usePhotoUrls(photos)
  // Agrupa por dia (cronologia da obra)
  const groups = useMemo(() => {
    const m = new Map<string, Photo[]>()
    for (const p of photos) {
      const d = new Date(photoDate(p)).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      m.set(d, [...(m.get(d) ?? []), p])
    }
    return [...m.entries()]
  }, [photos])
  return (
    <div className="photo-groups">
      {groups.map(([day, list]) => (
        <section key={day}>
          <h3 className="photo-day">{formatDate(day)} <span className="muted small">({list.length})</span></h3>
          <div className="photo-grid">
            {list.map((p) => {
              const url = urls.data?.[p.thumbnail_key ?? p.storage_key]
              const isSel = selected?.includes(p.id)
              return (
                <figure key={p.id} className={`photo${isSel ? ' selected' : ''}`}>
                  <button type="button" className="photo-btn" onClick={() => (selectable && onToggle ? onToggle(p.id) : onOpen(p))} aria-label={p.caption || p.title || p.file_name}>
                    {url ? <img src={url} alt={p.caption || p.title || 'Foto da obra'} loading="lazy" /> : <span className="photo-ph"><Icon name="foto" size={26} /></span>}
                    {selectable && <span className={`photo-check${isSel ? ' on' : ''}`} aria-hidden>{isSel && <Icon name="ok" size={16} />}</span>}
                    {!p.include_in_reports && <span className="photo-flag">Fora dos relatórios</span>}
                  </button>
                  <figcaption>{p.caption || p.title || <span className="muted">Sem legenda</span>}</figcaption>
                </figure>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- visualização ampliada + edição
export function PhotoViewer({ photo, canEdit, onClose, onChanged }: { photo: Photo; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const org = useOrg()
  const toast = useToast()
  const url = useQuery(`signed:${photo.storage_key}`, async () => (await signedUrls([photo.storage_key]))[photo.storage_key] ?? null)
  const cats = useQuery(`categories:foto:${org.organization_id}`, () => listCategories(org.organization_id, 'foto'))
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState({ title: photo.title ?? '', caption: photo.caption ?? '', category: photo.category ?? '', location: photo.location_description ?? '', include: photo.include_in_reports })
  const locked = photo.report && (photo.report.status === 'enviado' || photo.report.status === 'aprovado')
  const save = useAction(async () => requireUpdated(unwrap(await supabase.from('attachments').update(
    locked ? { include_in_reports: v.include } : { title: v.title.trim() || null, caption: v.caption.trim() || null, category: v.category || null, location_description: v.location.trim() || null, include_in_reports: v.include },
  ).eq('id', photo.id).select())))
  const remove = useAction(async () => requireUpdated(unwrap(await supabase.from('attachments').update({ deleted_at: new Date().toISOString() }).eq('id', photo.id).select())))
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <Modal open wide title={photo.title || photo.caption || 'Foto'} onClose={onClose}
      footer={editing ? <>
        <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
        <Button loading={save.pending} onClick={async () => { if (await save.run()) { toast('ok', 'Foto atualizada.'); setEditing(false); onChanged() } }}>Salvar</Button>
      </> : <>
        {canEdit && !locked && <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remover</Button>}
        <Button variant="secondary" icon="arquivo" onClick={async () => { window.open(await downloadUrl(photo.storage_key, photo.file_name), '_blank', 'noopener') }}>Baixar original</Button>
        <Button variant="secondary" icon="editar" onClick={() => setEditing(true)}>Editar</Button>
      </>}>
      {confirmRemove ? (
        <div className="form">
          <p>A foto sai da galeria e dos relatórios. O arquivo original é preservado no armazenamento e a remoção fica registrada na auditoria.</p>
          <ErrorBox error={remove.error} />
          <div className="row"><Button variant="secondary" onClick={() => setConfirmRemove(false)}>Voltar</Button>
            <Button variant="danger" loading={remove.pending} onClick={async () => { if (await remove.run()) { toast('ok', 'Foto removida da galeria.'); onChanged(); onClose() } }}>Confirmar remoção</Button></div>
        </div>
      ) : editing ? (
        <div className="form">
          {locked && <p className="field-hint">A foto pertence a um diário enviado ou aprovado: só a seleção para relatórios pode mudar.</p>}
          <TextField label="Título" value={v.title} disabled={!!locked} onChange={(e) => setV({ ...v, title: e.target.value })} />
          <TextAreaField label="Legenda" value={v.caption} disabled={!!locked} onChange={(e) => setV({ ...v, caption: e.target.value })} />
          <div className="grid-2">
            <SelectField label="Categoria" value={v.category} disabled={!!locked} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="Sem categoria" options={(cats.data ?? []).map((c) => ({ value: c, label: c }))} />
            <TextField label="Local ou ambiente" value={v.location} disabled={!!locked} onChange={(e) => setV({ ...v, location: e.target.value })} />
          </div>
          <Checkbox label="Incluir esta foto nos relatórios" checked={v.include} onChange={(e) => setV({ ...v, include: e.target.checked })} />
          <ErrorBox error={save.error} />
        </div>
      ) : (
        <div className="viewer">
          <div className="viewer-img">{url.data ? <img src={url.data} alt={photo.caption || photo.title || 'Foto da obra'} /> : <Loading label="Carregando imagem…" />}</div>
          <dl className="dl mt-16">
            <dt>Legenda</dt><dd>{photo.caption || '—'}</dd>
            <dt>Local</dt><dd>{photo.location_description || '—'}</dd>
            <dt>Categoria</dt><dd>{photo.category || '—'}</dd>
            <dt>Data da foto</dt><dd>{photo.captured_at ? `${formatDateTime(photo.captured_at)} (registrada pela câmera)` : 'Não informada no arquivo'}</dd>
            <dt>Enviada</dt><dd>{formatDateTime(photo.uploaded_at)} por {photo.uploader?.name || photo.uploader?.email}</dd>
            {photo.report && <><dt>Diário</dt><dd>{formatDate(photo.report.report_date)}</dd></>}
            {photo.occurrence && <><dt>Ocorrência</dt><dd>{photo.occurrence.code} — {photo.occurrence.title}</dd></>}
            {photo.activity && <><dt>Atividade</dt><dd>{photo.activity.title}</dd></>}
            <dt>Arquivo</dt><dd className="small">{photo.file_name} — {formatFileSize(photo.file_size)}{photo.width ? ` — ${photo.width}×${photo.height}` : ''}</dd>
            <dt>Relatórios</dt><dd>{photo.include_in_reports ? <Badge tone="green">Incluída</Badge> : <Badge tone="grey">Não incluída</Badge>}</dd>
          </dl>
        </div>
      )}
    </Modal>
  )
}

export function CompareModal({ photos, onClose }: { photos: Photo[]; onClose: () => void }) {
  const urls = usePhotoUrls(photos, 'original')
  return (
    <Modal open wide title="Comparar fotos" onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="compare">
        {photos.map((p) => (
          <figure key={p.id}>
            {urls.data?.[p.storage_key] ? <img src={urls.data[p.storage_key]} alt={p.caption || 'Foto'} /> : <Loading />}
            <figcaption><strong className="num">{formatDateTime(photoDate(p))}</strong><br />{p.caption || p.title || 'Sem legenda'}{p.location_description && <span className="muted"> — {p.location_description}</span>}</figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- galeria completa (página/aba)
export function PhotoGallery({ projectId, canUpload, canEdit }: { projectId: string; canUpload: boolean; canEdit: boolean }) {
  const org = useOrg()
  const cats = useQuery(`categories:foto:${org.organization_id}`, () => listCategories(org.organization_id, 'foto'))
  const [f, setF] = useState<PhotoFilters>({ projectId })
  const [location, setLocation] = useState('')
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, location })), 300); return () => clearTimeout(t) }, [location])
  const key = `photos:${projectId}:${JSON.stringify(f)}`
  const q = useQuery(key, () => listPhotos(org.organization_id, f))
  const [open, setOpen] = useState<Photo | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [compare, setCompare] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  return (
    <>
      <div className="row between">
        <div className="row">
          {canUpload && <Button icon="foto" onClick={() => setShowUpload((s) => !s)}>{showUpload ? 'Fechar envio' : 'Enviar fotos'}</Button>}
          <Button variant="secondary" onClick={() => { setSelecting((s) => !s); setSelected([]) }}>{selecting ? 'Cancelar seleção' : 'Selecionar para comparar'}</Button>
          {selecting && <Button disabled={selected.length < 2 || selected.length > 4} onClick={() => setCompare(true)}>Comparar ({selected.length})</Button>}
        </div>
        {q.data && <span className="muted small">{q.data.length} {q.data.length === 1 ? 'foto' : 'fotos'}</span>}
      </div>
      {selecting && <p className="field-hint mt-8">Toque em 2 a 4 fotos de etapas diferentes para ver lado a lado.</p>}
      {showUpload && <div className="panel panel-body mt-16"><PhotoUploader meta={{ projectId }} onUploaded={() => void q.refetch()} /></div>}
      <div className="toolbar mt-16">
        <TextField label="De" type="date" value={f.from ?? ''} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} />
        <TextField label="Até" type="date" value={f.to ?? ''} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} />
        <SelectField label="Categoria" value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value || undefined })} placeholder="Todas" options={(cats.data ?? []).map((c) => ({ value: c, label: c }))} />
        <TextField label="Ambiente" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: fachada" />
        <div style={{ alignSelf: 'center', paddingTop: 22 }}><Checkbox label="Só as dos relatórios" checked={!!f.onlyReports} onChange={(e) => setF({ ...f, onlyReports: e.target.checked || undefined })} /></div>
      </div>
      <ErrorBox error={q.error} onRetry={q.refetch} />
      {q.loading && !q.data ? <Loading /> : !q.data?.length ? (
        <EmptyState icon="foto" title="Nenhuma foto encontrada">{canUpload ? 'Envie fotos pela galeria ou pelo diário do dia.' : 'As fotos aparecem aqui quando a equipe enviar.'}</EmptyState>
      ) : (
        <PhotoGrid photos={q.data} selectable={selecting} selected={selected} onOpen={setOpen}
          onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]))} />
      )}
      {open && <PhotoViewer photo={open} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void q.refetch() }} />}
      {compare && <CompareModal photos={(q.data ?? []).filter((p) => selected.includes(p.id))} onClose={() => setCompare(false)} />}
    </>
  )
}
