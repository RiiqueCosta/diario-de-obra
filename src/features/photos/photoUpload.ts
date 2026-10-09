// Envio de fotos: valida, lê a data de captura do EXIF (quando existir), gera miniatura,
// envia original + miniatura ao Storage privado e só então registra no banco.
// Se qualquer passo falhar, remove o que já tinha subido (nada fica órfão).
import { supabase, BUCKET, type Tables } from '@/lib/supabase'
import { AppError, toAppError, unwrapOne } from '@/lib/errors'

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export type PhotoMeta = {
  orgId: string
  projectId: string
  dailyReportId?: string | null
  occurrenceId?: string | null
  activityId?: string | null
  title?: string | null
  caption?: string | null
  category?: string | null
  location?: string | null
}

async function sniff(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  const ftyp = String.fromCharCode(...b.slice(4, 12))
  if (ftyp.startsWith('ftyp') && /heic|heix|mif1|msf1|heif/.test(ftyp.slice(4))) return 'image/heic'
  return null
}

/** Lê DateTimeOriginal do EXIF de um JPEG. Devolve null se não houver (nunca inventa). */
export async function readExifDate(file: File): Promise<string | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer()
    const v = new DataView(buf)
    if (v.getUint16(0) !== 0xffd8) return null
    let off = 2
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off)
      const len = v.getUint16(off + 2)
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const tiff = off + 10
        const little = v.getUint16(tiff) === 0x4949
        const u16 = (p: number) => v.getUint16(p, little)
        const u32 = (p: number) => v.getUint32(p, little)
        const readStr = (p: number, n: number) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(p + i); if (!c) break; s += String.fromCharCode(c) } return s }
        const findTag = (ifd: number, tag: number): number | null => {
          const n = u16(ifd)
          for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e }
          return null
        }
        const ifd0 = tiff + u32(tiff + 4)
        const exifPtr = findTag(ifd0, 0x8769)
        let entry = exifPtr ? findTag(tiff + u32(exifPtr + 8), 0x9003) : null
        if (!entry) entry = findTag(ifd0, 0x0132)
        if (!entry) return null
        const s = readStr(tiff + u32(entry + 8), 19) // "AAAA:MM:DD HH:MM:SS"
        const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s)
        if (!m || m[1] === '0000') return null
        // EXIF não tem fuso: assume horário de Brasília (onde a obra registra).
        return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`).toISOString()
      }
      if ((marker & 0xff00) !== 0xff00) break
      off += 2 + len
    }
  } catch { /* sem EXIF legível */ }
  return null
}

/** Miniatura WEBP de até 640 px (respeita a orientação do EXIF). Null se o navegador não decodificar (ex.: HEIC fora do Safari). */
export async function makeThumbnail(file: File, max = 640): Promise<{ blob: Blob; width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.8))
    const full = { width: bmp.width, height: bmp.height }
    bmp.close()
    return blob ? { blob, ...full } : null
  } catch {
    return null
  }
}

async function sha256(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function uploadPhoto(file: File, meta: PhotoMeta, maxMb: number): Promise<Tables<'attachments'>> {
  if (file.size > maxMb * 1024 * 1024) throw new AppError(`"${file.name}" passa de ${maxMb} MB.`, 'validacao')
  const type = await sniff(file)
  if (!type) throw new AppError(`"${file.name}" não é uma foto válida (JPG, PNG, WEBP ou HEIC).`, 'validacao')
  const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'heic'
  const id = crypto.randomUUID()
  const year = new Date().getFullYear()
  const key = `${meta.orgId}/${meta.projectId}/${year}/${id}.${ext}`
  const thumbKey = `${meta.orgId}/${meta.projectId}/thumbs/${id}.webp`
  const [captured, thumb, checksum] = await Promise.all([type === 'image/jpeg' ? readExifDate(file) : Promise.resolve(null), makeThumbnail(file), sha256(file)])

  const uploaded: string[] = []
  try {
    const up = await supabase.storage.from(BUCKET).upload(key, file, { contentType: type, upsert: false, cacheControl: '31536000' })
    if (up.error) throw up.error
    uploaded.push(key)
    if (thumb) {
      const t = await supabase.storage.from(BUCKET).upload(thumbKey, thumb.blob, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
      if (t.error) throw t.error
      uploaded.push(thumbKey)
    }
    return unwrapOne(await supabase.from('attachments').insert({
      organization_id: meta.orgId, project_id: meta.projectId, daily_report_id: meta.dailyReportId ?? null,
      occurrence_id: meta.occurrenceId ?? null, activity_id: meta.activityId ?? null, kind: 'foto',
      uploaded_by: (await supabase.auth.getUser()).data.user!.id, file_name: file.name.slice(0, 200), storage_key: key,
      thumbnail_key: thumb ? thumbKey : null, mime_type: type, file_size: file.size, checksum_sha256: checksum,
      width: thumb?.width ?? null, height: thumb?.height ?? null, title: meta.title?.trim() || null, caption: meta.caption?.trim() || null,
      category: meta.category || null, location_description: meta.location?.trim() || null, captured_at: captured,
    }).select().single())
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => {})
    throw toAppError(e)
  }
}

/** URLs temporárias (1 h) em lote para miniaturas/originais. */
export async function signedUrls(keys: string[], seconds = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, seconds)
  if (error) throw toAppError(error)
  const out: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

export async function downloadUrl(key: string, fileName: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, 300, { download: fileName })
  if (error) throw toAppError(error)
  return data.signedUrl
}
