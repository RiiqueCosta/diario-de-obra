// Montador de PDF (pdf-lib) com cabeçalho/rodapé em todas as páginas, quebra automática,
// tabelas com cabeçalho repetido, fotos com legenda e campos de assinatura.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'

const A4 = { w: 595.28, h: 841.89 }
const M = 40
const HEADER_H = 78
const FOOTER_H = 28
const INK = rgb(0.12, 0.16, 0.18)
const MUTED = rgb(0.34, 0.39, 0.42)
const LINE = rgb(0.77, 0.8, 0.79)
const BLUE = rgb(0.11, 0.31, 0.53)
const FILL = rgb(0.94, 0.95, 0.95)

export type PdfContext = {
  orgName: string
  orgDocument?: string | null
  orgContact?: string | null
  logo?: Uint8Array | null
  title: string
  projectLines: string[]
  period?: string | null
  generatedAt: string
  generatedBy: string
}

export type Column = { label: string; width: number; align?: 'left' | 'right' }

export class PdfBuilder {
  doc!: PDFDocument
  font!: PDFFont
  bold!: PDFFont
  page!: PDFPage
  y = 0
  ctx!: PdfContext
  private logo: PDFImage | null = null
  private encodable = new Map<string, boolean>()

  static async create(ctx: PdfContext) {
    const b = new PdfBuilder()
    b.ctx = ctx
    b.doc = await PDFDocument.create()
    b.doc.setTitle(ctx.title)
    b.doc.setCreator('Diário de Obra')
    b.doc.setProducer('Diário de Obra')
    b.doc.setLanguage('pt-BR')
    b.font = await b.doc.embedFont(StandardFonts.Helvetica)
    b.bold = await b.doc.embedFont(StandardFonts.HelveticaBold)
    if (ctx.logo) { try { b.logo = await b.doc.embedPng(ctx.logo) } catch { b.logo = null } }
    b.newPage()
    return b
  }

  get contentWidth() { return A4.w - 2 * M }

  /** Remove caracteres que a fonte padrão do PDF não representa (evita falha na geração). */
  safe(s: string | null | undefined): string {
    if (!s) return ''
    let out = ''
    for (const ch of s.replace(/\r/g, '').replace(/\t/g, '    ')) {
      if (ch === '\n') { out += ch; continue }
      let ok = this.encodable.get(ch)
      if (ok === undefined) {
        try { this.font.encodeText(ch); ok = true } catch { ok = false }
        this.encodable.set(ch, ok)
      }
      out += ok ? ch : (ch === '→' ? '->' : ch === '≤' ? '<=' : ch === '≥' ? '>=' : '?')
    }
    return out
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h])
    this.y = A4.h - M - HEADER_H
  }

  ensure(h: number) {
    if (this.y - h < M + FOOTER_H) this.newPage()
  }

  wrap(text: string, size: number, width: number, font = this.font): string[] {
    const lines: string[] = []
    for (const para of this.safe(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean)
      if (!words.length) { lines.push(''); continue }
      let line = ''
      for (const w of words) {
        const test = line ? `${line} ${w}` : w
        if (font.widthOfTextAtSize(test, size) <= width) { line = test; continue }
        if (line) lines.push(line)
        // palavra maior que a linha: quebra por caractere
        let piece = w
        while (font.widthOfTextAtSize(piece, size) > width) {
          let cut = piece.length - 1
          while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut--
          lines.push(piece.slice(0, cut)); piece = piece.slice(cut)
        }
        line = piece
      }
      lines.push(line)
    }
    return lines
  }

  text(str: string | null | undefined, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 9.5
    const font = opts.bold ? this.bold : this.font
    const indent = opts.indent ?? 0
    const lh = size * 1.35
    for (const line of this.wrap(str || '—', size, this.contentWidth - indent, font)) {
      this.ensure(lh)
      this.page.drawText(line, { x: M + indent, y: this.y - size, size, font, color: opts.color ?? INK })
      this.y -= lh
    }
    this.y -= opts.gap ?? 2
  }

  heading(str: string, level: 1 | 2 = 1) {
    const size = level === 1 ? 13 : 11
    this.ensure(size * 2 + 30)
    this.y -= level === 1 ? 10 : 6
    this.page.drawText(this.safe(str), { x: M, y: this.y - size, size, font: this.bold, color: level === 1 ? BLUE : INK })
    this.y -= size + 4
    if (level === 1) {
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.8, color: LINE })
      this.y -= 6
    }
  }

  /** Pares rótulo/valor em duas colunas. */
  kv(rows: Array<[string, string | null | undefined]>, labelWidth = 130) {
    const size = 9.5
    for (const [label, value] of rows) {
      const lines = this.wrap(value || '—', size, this.contentWidth - labelWidth)
      const h = lines.length * size * 1.35 + 2
      this.ensure(h)
      this.page.drawText(this.safe(label), { x: M, y: this.y - size, size, font: this.bold, color: MUTED })
      lines.forEach((l, i) => this.page.drawText(l, { x: M + labelWidth, y: this.y - size - i * size * 1.35, size, font: this.font, color: INK }))
      this.y -= h
    }
    this.y -= 4
  }

  table(cols: Column[], rows: string[][], opts: { size?: number; empty?: string } = {}) {
    const size = opts.size ?? 8.5
    const lh = size * 1.3
    const pad = 4
    const totalW = cols.reduce((s, c) => s + c.width, 0)
    const widths = cols.map((c) => (c.width / totalW) * this.contentWidth)
    const drawHeader = () => {
      const hLines = cols.map((c, i) => this.wrap(c.label, size, widths[i] - 2 * pad, this.bold))
      const h = Math.max(...hLines.map((l) => l.length)) * lh + 2 * pad
      this.ensure(h + lh * 2)
      this.page.drawRectangle({ x: M, y: this.y - h, width: this.contentWidth, height: h, color: FILL })
      let x = M
      hLines.forEach((lines, i) => {
        lines.forEach((l, j) => this.page.drawText(l, { x: x + pad, y: this.y - pad - size - j * lh, size, font: this.bold, color: INK }))
        x += widths[i]
      })
      this.y -= h
    }
    if (!rows.length) { this.text(opts.empty ?? 'Nenhum registro.', { color: MUTED }); return }
    drawHeader()
    for (const row of rows) {
      const cells = row.map((c, i) => this.wrap(c ?? '', size, widths[i] - 2 * pad))
      const h = Math.max(1, ...cells.map((c) => c.length)) * lh + 2 * pad
      if (this.y - h < M + FOOTER_H) { this.newPage(); drawHeader() }
      let x = M
      cells.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const w = this.font.widthOfTextAtSize(l, size)
          const tx = cols[i].align === 'right' ? x + widths[i] - pad - w : x + pad
          this.page.drawText(l, { x: tx, y: this.y - pad - size - j * lh, size, font: this.font, color: INK })
        })
        x += widths[i]
      })
      this.y -= h
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.4, color: LINE })
    }
    this.y -= 8
  }

  /** Fotos em duas colunas, com legenda e metadados abaixo. */
  async photos(items: Array<{ bytes: Uint8Array; caption: string; meta: string }>) {
    const gap = 14
    const colW = (this.contentWidth - gap) / 2
    const maxH = 210
    for (let i = 0; i < items.length; i += 2) {
      const pair = await Promise.all(items.slice(i, i + 2).map(async (it) => {
        const img = await this.doc.embedJpg(it.bytes)
        const scale = Math.min(colW / img.width, maxH / img.height)
        const capLines = this.wrap(it.caption, 8.5, colW, this.bold).slice(0, 3)
        const metaLines = this.wrap(it.meta, 7.5, colW).slice(0, 2)
        return { img, w: img.width * scale, h: img.height * scale, capLines, metaLines }
      }))
      const blockH = Math.max(...pair.map((p) => p.h + 6 + p.capLines.length * 11 + p.metaLines.length * 10)) + 12
      this.ensure(blockH)
      pair.forEach((p, j) => {
        const x = M + j * (colW + gap)
        const top = this.y
        this.page.drawRectangle({ x, y: top - maxH, width: colW, height: maxH, color: FILL })
        this.page.drawImage(p.img, { x: x + (colW - p.w) / 2, y: top - (maxH + p.h) / 2, width: p.w, height: p.h })
        let ty = top - maxH - 6
        p.capLines.forEach((l) => { this.page.drawText(l, { x, y: ty - 8.5, size: 8.5, font: this.bold, color: INK }); ty -= 11 })
        p.metaLines.forEach((l) => { this.page.drawText(l, { x, y: ty - 7.5, size: 7.5, font: this.font, color: MUTED }); ty -= 10 })
      })
      this.y -= Math.max(blockH, maxH + 40)
    }
  }

  signatures(labels: string[]) {
    const per = 2
    const colW = (this.contentWidth - 30) / per
    this.ensure(90)
    this.y -= 46
    labels.forEach((label, i) => {
      if (i > 0 && i % per === 0) { this.ensure(80); this.y -= 70 }
      const x = M + (i % per) * (colW + 30)
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + colW, y: this.y }, thickness: 0.7, color: INK })
      this.wrap(label, 8.5, colW).slice(0, 2).forEach((l, k) => this.page.drawText(l, { x, y: this.y - 12 - k * 11, size: 8.5, font: this.font, color: MUTED }))
    })
    this.y -= 34
  }

  space(h = 8) { this.y -= h }

  /** Desenha cabeçalho e rodapé em todas as páginas e devolve os bytes. */
  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages()
    const c = this.ctx
    pages.forEach((p, i) => {
      const top = A4.h - M
      let x = M
      if (this.logo) {
        const s = Math.min(110 / this.logo.width, 44 / this.logo.height)
        p.drawImage(this.logo, { x: M, y: top - 44, width: this.logo.width * s, height: this.logo.height * s })
        x = M + this.logo.width * s + 12
      }
      p.drawText(this.safe(c.orgName), { x, y: top - 12, size: 11, font: this.bold, color: INK })
      const sub = [c.orgDocument, c.orgContact].filter(Boolean).join(' - ')
      if (sub) p.drawText(this.safe(sub).slice(0, 110), { x, y: top - 25, size: 7.5, font: this.font, color: MUTED })
      p.drawText(this.safe(c.title), { x, y: top - 42, size: 12, font: this.bold, color: BLUE })
      const right = [...c.projectLines.slice(0, 3), c.period ?? ''].filter(Boolean)
      right.forEach((l, k) => {
        const t = this.safe(l).slice(0, 70)
        const w = this.font.widthOfTextAtSize(t, 7.5)
        p.drawText(t, { x: A4.w - M - w, y: top - 10 - k * 10, size: 7.5, font: k === 0 ? this.bold : this.font, color: k === 0 ? INK : MUTED })
      })
      p.drawLine({ start: { x: M, y: top - HEADER_H + 14 }, end: { x: A4.w - M, y: top - HEADER_H + 14 }, thickness: 1.2, color: BLUE })
      const foot = this.safe(`Gerado em ${c.generatedAt} por ${c.generatedBy} - Diário de Obra`)
      p.drawLine({ start: { x: M, y: M + 14 }, end: { x: A4.w - M, y: M + 14 }, thickness: 0.5, color: LINE })
      p.drawText(foot, { x: M, y: M + 2, size: 7, font: this.font, color: MUTED })
      const pg = `Página ${i + 1} de ${pages.length}`
      p.drawText(this.safe(pg), { x: A4.w - M - this.font.widthOfTextAtSize(this.safe(pg), 7.5), y: M + 2, size: 7.5, font: this.bold, color: INK })
    })
    return this.doc.save()
  }
}

/** Converte qualquer imagem decodificável pelo navegador em JPEG reduzido (para PDF leve). */
export async function toJpeg(blob: Blob, max = 1200, quality = 0.82): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality))
    return out ? new Uint8Array(await out.arrayBuffer()) : null
  } catch { return null }
}

export async function toPng(blob: Blob, max = 600): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(blob)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    return out ? new Uint8Array(await out.arrayBuffer()) : null
  } catch { return null }
}
