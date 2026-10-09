// Geração dos relatórios em PDF a partir dos dados reais (sempre com as permissões do usuário: RLS).
import { supabase, BUCKET, type Enums } from '@/lib/supabase'
import { AppError, unwrap, unwrapOne } from '@/lib/errors'
import { formatDate, formatDateTime, formatDocument, formatNumber, formatPercent, formatTime, todayISO } from '@/lib/format'
import { ACTIVITY_STATUS, APPROVAL_DECISION, ATTENDANCE, EXECUTION_STATUS, OCCURRENCE_STATUS, PRIORITY, PROJECT_STATUS, REPORT_STATUS, WEATHER, WORK_CONDITION } from '@/lib/labels'
import { getFullReport, type FullReport } from '../diary/api'
import { listPhotos, type Photo } from '../photos/photos'
import { listActivities, listLateActivities, listStages } from '../activities/api'
import { PdfBuilder, toJpeg, toPng } from './pdf'

export type ReportKind = 'diario' | 'consolidado' | 'obra' | 'fotografico' | 'atividades' | 'ocorrencias' | 'mao_de_obra' | 'atrasadas' | 'evolucao'

export const REPORT_KINDS: Record<ReportKind, { label: string; description: string; needsProject: boolean; needsPeriod: boolean }> = {
  diario: { label: 'Diário individual', description: 'Um diário completo de uma data.', needsProject: true, needsPeriod: false },
  consolidado: { label: 'Diário consolidado do período', description: 'Todos os diários da obra no período, dia a dia.', needsProject: true, needsPeriod: true },
  obra: { label: 'Relatório completo da obra', description: 'Dados da obra, avanço, cronograma, ocorrências, resumo dos diários e fotos selecionadas.', needsProject: true, needsPeriod: true },
  fotografico: { label: 'Relatório fotográfico', description: 'Fotos marcadas para relatório, por dia, com legendas.', needsProject: true, needsPeriod: true },
  atividades: { label: 'Atividades executadas', description: 'Serviços lançados nos diários do período.', needsProject: true, needsPeriod: true },
  ocorrencias: { label: 'Ocorrências e pendências', description: 'Ocorrências do período com situação, responsável e prazo.', needsProject: false, needsPeriod: true },
  mao_de_obra: { label: 'Mão de obra', description: 'Efetivo por dia, função e empresa, com faltas e horas.', needsProject: true, needsPeriod: true },
  atrasadas: { label: 'Atividades atrasadas', description: 'Atividades com prazo vencido e não concluídas, na data de hoje.', needsProject: false, needsPeriod: false },
  evolucao: { label: 'Evolução da obra', description: 'Avanço por etapa e progressão das conclusões ao longo do tempo.', needsProject: true, needsPeriod: false },
}

export type ReportParams = {
  kind: ReportKind
  orgId: string
  userName: string
  projectId?: string
  reportId?: string
  date?: string
  from?: string
  to?: string
  authorId?: string
  onlyApproved?: boolean
  includePhotos: boolean
  includeSignatures: boolean
  observations?: string
  maxPhotos?: number
  onProgress?: (msg: string) => void
}

// ---------------------------------------------------------------- dados comuns
async function loadOrg(orgId: string) {
  const org = unwrapOne(await supabase.from('organizations').select('*').eq('id', orgId).single())
  let logo: Uint8Array | null = null
  if (org.logo_storage_key) {
    const { data } = await supabase.storage.from(BUCKET).download(org.logo_storage_key)
    if (data) logo = await toPng(data)
  }
  const c = (org.contact_information ?? {}) as { phone?: string; email?: string; address?: string }
  return { org, logo, contact: [c.address, c.phone, c.email].filter(Boolean).join(' - ') }
}

async function loadProject(projectId: string) {
  const p = unwrap(await supabase.from('projects').select('*').eq('id', projectId).maybeSingle())
  if (!p) throw new AppError('Obra não encontrada ou sem acesso.', 'nao_encontrado')
  return p
}

function projectLines(p: Awaited<ReturnType<typeof loadProject>>) {
  return [
    `${p.code} - ${p.name}`,
    `Cliente: ${p.client_name}${p.client_document ? ` (${formatDocument(p.client_document)})` : ''}`,
    [p.address, p.city && `${p.city}${p.state ? `/${p.state}` : ''}`].filter(Boolean).join(' - ') + (p.technical_responsible ? ` - Resp. técnico: ${p.technical_responsible}` : ''),
  ]
}

async function photoBytes(p: Photo): Promise<Uint8Array | null> {
  const original = await supabase.storage.from(BUCKET).download(p.storage_key)
  if (original.data) { const j = await toJpeg(original.data); if (j) return j }
  if (p.thumbnail_key) {
    const t = await supabase.storage.from(BUCKET).download(p.thumbnail_key)
    if (t.data) return toJpeg(t.data)
  }
  return null
}

async function drawPhotos(b: PdfBuilder, photos: Photo[], max: number, onProgress?: (m: string) => void) {
  const list = photos.slice(0, max)
  const items: Array<{ bytes: Uint8Array; caption: string; meta: string }> = []
  for (let i = 0; i < list.length; i++) {
    onProgress?.(`Preparando foto ${i + 1} de ${list.length}…`)
    const bytes = await photoBytes(list[i])
    if (!bytes) continue
    const p = list[i]
    items.push({
      bytes,
      caption: p.caption || p.title || 'Sem legenda',
      meta: [p.captured_at ? `Foto: ${formatDateTime(p.captured_at)}` : `Enviada: ${formatDateTime(p.uploaded_at)}`, p.location_description, p.category, p.uploader?.name && `por ${p.uploader.name}`].filter(Boolean).join(' - '),
    })
  }
  if (!items.length) { b.text('Nenhuma foto disponível.', { color: undefined }); return }
  await b.photos(items)
  if (photos.length > max) b.text(`Exibidas ${max} de ${photos.length} fotos. Ajuste o limite para incluir mais.`, { size: 8 })
}

function periodLabel(from?: string, to?: string) {
  if (from && to) return `Período: ${formatDate(from)} a ${formatDate(to)}`
  if (from) return `A partir de ${formatDate(from)}`
  if (to) return `Até ${formatDate(to)}`
  return null
}

const presentCount = (r: FullReport) => r.workers.filter((w) => w.attendance_status === 'presente').length + r.crews.reduce((s, c) => s + c.quantity - c.absent_quantity, 0)

// ---------------------------------------------------------------- bloco de um diário
function drawReport(b: PdfBuilder, r: FullReport, compact: boolean) {
  b.kv([
    ['Data', `${formatDate(r.report_date)}${r.kind === 'complementar' ? ' (registro complementar)' : ''}`],
    ['Situação', `${REPORT_STATUS[r.status].label}${r.version > 1 ? ` - versão ${r.version}` : ''}${r.status === 'aprovado' ? ` em ${formatDateTime(r.approved_at)}` : ''}`],
    ['Preenchido por', r.author?.name || r.author?.email || '—'],
    ['Horário', r.start_time ? `${formatTime(r.start_time)} às ${formatTime(r.end_time)}` : '—'],
    ['Clima', `${r.weather ? WEATHER[r.weather] : '—'}${r.weather_afternoon ? ` / tarde: ${WEATHER[r.weather_afternoon]}` : ''}${r.temperature_c != null ? ` - ${formatNumber(r.temperature_c, 1)} °C` : ''}`],
    ['Condição de trabalho', r.work_conditions ? WORK_CONDITION[r.work_conditions].label : '—'],
    ...(r.weather_impact ? [['Impacto do clima', r.weather_impact] as [string, string]] : []),
    ['Efetivo presente', String(presentCount(r))],
  ])
  b.heading('Serviços executados', 2)
  b.table(
    [{ label: 'Serviço', width: 38 }, { label: 'Local', width: 16 }, { label: 'Quantidade', width: 14, align: 'right' }, { label: 'Avanço', width: 10, align: 'right' }, { label: 'Situação', width: 14 }],
    r.activities.map((a) => [
      [a.description, a.activity?.title && `Atividade: ${a.activity.title}`, a.team_description && `Equipe: ${a.team_description}`, a.observations && `Obs.: ${a.observations}`].filter(Boolean).join('\n'),
      a.location ?? '', a.quantity !== null ? `${formatNumber(a.quantity, 3)} ${a.unit ?? ''}` : '', a.progress_percentage !== null ? formatPercent(a.progress_percentage, 1) : '',
      EXECUTION_STATUS[a.execution_status].label,
    ]),
    { empty: r.no_execution_reason ? `Sem serviços executados: ${r.no_execution_reason}` : 'Nenhum serviço registrado.' },
  )
  b.heading('Mão de obra', 2)
  b.table(
    [{ label: 'Nome / equipe', width: 32 }, { label: 'Função', width: 22 }, { label: 'Empresa', width: 22 }, { label: 'Presença', width: 16 }, { label: 'Horas', width: 8, align: 'right' }],
    [
      ...r.workers.map((w) => [w.worker?.name ?? '', w.job_title ?? '', w.company_name || 'Própria', ATTENDANCE[w.attendance_status].label, w.hours_worked !== null ? formatNumber(w.hours_worked, 1) : '']),
      ...r.crews.map((c) => [`Equipe (${c.quantity})`, c.job_title, c.company_name || 'Própria', c.absent_quantity ? `${c.absent_quantity} falta(s)` : 'Completa', '']),
    ],
  )
  if (!compact || r.materials.length || r.equipment.length) {
    b.heading('Materiais e equipamentos', 2)
    b.table(
      [{ label: 'Material', width: 34 }, { label: 'Recebido', width: 14, align: 'right' }, { label: 'Utilizado', width: 14, align: 'right' }, { label: 'Fornecedor / NF', width: 22 }, { label: 'Obs.', width: 16 }],
      r.materials.map((m) => [`${m.material?.name ?? ''}${m.shortage ? ' (FALTA)' : ''}`, `${formatNumber(m.quantity_received, 3)} ${m.material?.unit ?? ''}`, `${formatNumber(m.quantity_used, 3)} ${m.material?.unit ?? ''}`, [m.supplier_name, m.invoice_number && `NF ${m.invoice_number}`].filter(Boolean).join(' - '), m.observations ?? '']),
      { empty: 'Nenhum material registrado.' },
    )
    b.table(
      [{ label: 'Equipamento', width: 40 }, { label: 'Situação', width: 20 }, { label: 'Horas', width: 10, align: 'right' }, { label: 'Observações', width: 30 }],
      r.equipment.map((e) => [`${e.equipment?.name ?? ''}${e.equipment?.identification_code ? ` (${e.equipment.identification_code})` : ''}`, e.usage_status.replace('_', ' '), e.hours_used !== null ? formatNumber(e.hours_used, 1) : '', e.observations ?? '']),
      { empty: 'Nenhum equipamento registrado.' },
    )
  }
  if (!compact || r.occurrences.length) {
    b.heading('Ocorrências', 2)
    b.table(
      [{ label: 'Código', width: 10 }, { label: 'Ocorrência', width: 46 }, { label: 'Categoria', width: 18 }, { label: 'Prioridade', width: 12 }, { label: 'Situação', width: 14 }],
      r.occurrences.map((o) => [o.code, `${o.title}\n${o.description ?? ''}`, o.category, PRIORITY[o.priority].label, OCCURRENCE_STATUS[o.status].label]),
      { empty: 'Nenhuma ocorrência.' },
    )
  }
  b.heading('Encerramento', 2)
  b.kv([
    ['Resumo do dia', r.general_summary],
    ...(r.next_day_plan ? [['Próximo dia', r.next_day_plan] as [string, string]] : []),
    ...(r.pending_items ? [['Pendências', r.pending_items] as [string, string]] : []),
    ...(r.technical_notes ? [['Observações técnicas', r.technical_notes] as [string, string]] : []),
    ...(r.final_notes ? [['Observações finais', r.final_notes] as [string, string]] : []),
  ])
}

// ---------------------------------------------------------------- geração
export async function generateReport(p: ReportParams): Promise<{ bytes: Uint8Array; fileName: string }> {
  const progress = p.onProgress ?? (() => {})
  progress('Carregando dados…')
  const { org, logo, contact } = await loadOrg(p.orgId)
  let project = p.projectId ? await loadProject(p.projectId) : null
  let full: FullReport | null = null
  if (p.kind === 'diario') {
    if (!p.reportId) throw new AppError('Escolha o diário.', 'validacao')
    full = await getFullReport(p.reportId)
    project = await loadProject(full.project_id)
  }
  if (REPORT_KINDS[p.kind].needsProject && !project) throw new AppError('Escolha a obra.', 'validacao')
  if (REPORT_KINDS[p.kind].needsPeriod && (!p.from || !p.to)) throw new AppError('Informe o período.', 'validacao')
  if (p.from && p.to && p.to < p.from) throw new AppError('O fim do período deve ser depois do início.', 'validacao')
  const now = formatDateTime(new Date().toISOString())
  const b = await PdfBuilder.create({
    orgName: org.name, orgDocument: org.document_number ? `CNPJ ${formatDocument(org.document_number)}` : null, orgContact: contact, logo,
    title: REPORT_KINDS[p.kind].label, projectLines: project ? projectLines(project) : ['Todas as obras autorizadas'],
    period: p.kind === 'diario' && full ? `Data: ${formatDate(full.report_date)}` : periodLabel(p.from, p.to), generatedAt: now, generatedBy: p.userName,
  })
  const maxPhotos = p.maxPhotos ?? 40
  const signatures = (extra: string[] = []) => {
    if (!p.includeSignatures) return
    b.heading('Assinaturas', 2)
    b.signatures([`Responsável pelo preenchimento${full?.author?.name ? ` - ${full.author.name}` : ''}`, `Responsável técnico${project?.technical_responsible ? ` - ${project.technical_responsible}` : ''}${project?.technical_registration ? ` (${project.technical_registration})` : ''}`, ...extra, 'Fiscalização / Contratante'])
  }
  const observations = () => {
    b.heading('Observações', 2)
    b.text(p.observations?.trim() || ' ')
    if (!p.observations?.trim()) { b.space(30); b.page.drawLine({ start: { x: 40, y: b.y }, end: { x: 555, y: b.y }, thickness: 0.4 }); b.space(18) }
  }

  switch (p.kind) {
    case 'diario': {
      drawReport(b, full!, false)
      if (p.includePhotos) {
        b.heading('Registro fotográfico', 2)
        await drawPhotos(b, (await listPhotos(p.orgId, { dailyReportId: full!.id, onlyReports: true })), maxPhotos, progress)
      }
      if (full!.approvals.length) {
        b.heading('Histórico de aprovação', 2)
        b.table([{ label: 'Data e hora', width: 22 }, { label: 'Decisão', width: 26 }, { label: 'Responsável', width: 24 }, { label: 'Comentário', width: 28 }],
          full!.approvals.map((a) => [formatDateTime(a.decided_at), `${APPROVAL_DECISION[a.decision]} (v${a.version})`, a.reviewer?.name || a.reviewer?.email || '', a.comments ?? '']))
        b.text('A aprovação no sistema registra quem aprovou e quando; não é assinatura digital certificada.', { size: 7.5 })
      }
      observations()
      signatures()
      break
    }
    case 'consolidado': {
      progress('Carregando diários do período…')
      let q = supabase.from('daily_reports').select('id').eq('project_id', project!.id).gte('report_date', p.from!).lte('report_date', p.to!)
      if (p.onlyApproved) q = q.eq('status', 'aprovado')
      else q = q.neq('status', 'rascunho')
      if (p.authorId) q = q.eq('author_user_id', p.authorId)
      const ids = (unwrap(await q.order('report_date').order('kind')) ?? []).map((x) => x.id)
      if (!ids.length) b.text('Nenhum diário no período com os filtros escolhidos.')
      for (let i = 0; i < ids.length; i++) {
        progress(`Montando diário ${i + 1} de ${ids.length}…`)
        const r = await getFullReport(ids[i])
        if (i > 0) b.newPage()
        b.heading(`Diário de ${formatDate(r.report_date)}${r.kind === 'complementar' ? ' (complementar)' : ''}`)
        drawReport(b, r, true)
        if (p.includePhotos) {
          const ph = await listPhotos(p.orgId, { dailyReportId: r.id, onlyReports: true })
          if (ph.length) { b.heading('Fotos do dia', 2); await drawPhotos(b, ph, Math.min(maxPhotos, 8), progress) }
        }
      }
      observations()
      signatures()
      break
    }
    case 'obra': {
      const pr = project!
      b.heading('Dados da obra')
      b.kv([
        ['Situação', PROJECT_STATUS[pr.status].label], ['Início', formatDate(pr.start_date)], ['Previsão de conclusão', formatDate(pr.expected_end_date)],
        ['Conclusão real', formatDate(pr.actual_end_date)], ['Avanço físico', formatPercent(pr.progress_percentage, 1)], ['Descrição', pr.description],
      ])
      progress('Carregando cronograma…')
      const [stages, acts] = await Promise.all([listStages(pr.id), listActivities(pr.id)])
      b.heading('Etapas e avanço')
      b.table([{ label: 'Etapa', width: 50 }, { label: 'Peso', width: 15, align: 'right' }, { label: 'Atividades', width: 15, align: 'right' }, { label: 'Avanço', width: 20, align: 'right' }],
        stages.map((s) => {
          const list = acts.filter((a) => a.stage_id === s.id && a.status !== 'cancelada')
          const w = list.reduce((x, a) => x + Number(a.weight), 0)
          return [s.name, formatNumber(s.weight, 2), String(list.length), formatPercent(w ? list.reduce((x, a) => x + Number(a.weight) * Number(a.progress_percentage), 0) / w : 0, 1)]
        }), { empty: 'Nenhuma etapa cadastrada.' })
      progress('Carregando diários e ocorrências…')
      const reps = unwrap(await supabase.from('daily_reports').select('id, report_date, status, kind, author:profiles!daily_reports_author_user_id_fkey(name)')
        .eq('project_id', pr.id).gte('report_date', p.from!).lte('report_date', p.to!).order('report_date')) ?? []
      b.heading(`Diários no período (${reps.length})`)
      b.table([{ label: 'Data', width: 20 }, { label: 'Tipo', width: 18 }, { label: 'Situação', width: 30 }, { label: 'Autor', width: 32 }],
        reps.map((r) => [formatDate(r.report_date), r.kind === 'principal' ? 'Principal' : 'Complementar', REPORT_STATUS[r.status as Enums<'report_status'>].label, (r.author as unknown as { name: string } | null)?.name ?? '']))
      const occ = unwrap(await supabase.from('occurrences').select('code, title, category, priority, status, due_date, occurred_at').eq('project_id', pr.id)
        .gte('occurred_at', `${p.from}T00:00:00-03:00`).lte('occurred_at', `${p.to}T23:59:59-03:00`).order('occurred_at')) ?? []
      b.heading(`Ocorrências no período (${occ.length})`)
      b.table([{ label: 'Código', width: 11 }, { label: 'Data', width: 13 }, { label: 'Título', width: 36 }, { label: 'Prioridade', width: 12 }, { label: 'Situação', width: 16 }, { label: 'Prazo', width: 12 }],
        occ.map((o) => [o.code, formatDate(o.occurred_at), `${o.title} (${o.category})`, PRIORITY[o.priority].label, OCCURRENCE_STATUS[o.status].label, formatDate(o.due_date)]))
      const late = acts.filter((a) => a.status !== 'concluida' && a.status !== 'cancelada' && a.planned_end_date && a.planned_end_date < todayISO())
      b.heading(`Atividades atrasadas hoje (${late.length})`)
      b.table([{ label: 'Atividade', width: 46 }, { label: 'Prazo', width: 18 }, { label: 'Avanço', width: 16, align: 'right' }, { label: 'Situação', width: 20 }],
        late.map((a) => [a.title, formatDate(a.planned_end_date), formatPercent(a.progress_percentage), ACTIVITY_STATUS[a.status].label]), { empty: 'Nenhuma atividade atrasada.' })
      if (p.includePhotos) {
        b.heading('Registro fotográfico selecionado')
        await drawPhotos(b, await listPhotos(p.orgId, { projectId: pr.id, from: p.from, to: p.to, onlyReports: true }), maxPhotos, progress)
      }
      observations()
      signatures()
      break
    }
    case 'fotografico': {
      progress('Carregando fotos…')
      const photos = (await listPhotos(p.orgId, { projectId: project!.id, from: p.from, to: p.to, onlyReports: true }))
        .sort((a, b2) => (a.captured_at ?? a.uploaded_at).localeCompare(b2.captured_at ?? b2.uploaded_at))
      if (!photos.length) b.text('Nenhuma foto marcada para relatório no período.')
      const byDay = new Map<string, Photo[]>()
      for (const ph of photos) {
        const d = new Date(ph.captured_at ?? ph.uploaded_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
        byDay.set(d, [...(byDay.get(d) ?? []), ph])
      }
      let left = maxPhotos
      for (const [d, list] of byDay) {
        if (left <= 0) break
        b.heading(formatDate(d), 2)
        await drawPhotos(b, list, left, progress)
        left -= list.length
      }
      if (photos.length > maxPhotos) b.text(`Exibidas ${maxPhotos} de ${photos.length} fotos.`, { size: 8 })
      observations()
      signatures()
      break
    }
    case 'atividades': {
      progress('Carregando serviços…')
      let q = supabase.from('daily_report_activities').select('description, location, quantity, unit, progress_percentage, execution_status, stage_name, activity:activities(title), report:daily_reports!inner(report_date, project_id, status, author_user_id, author:profiles!daily_reports_author_user_id_fkey(name))')
        .eq('report.project_id', project!.id).gte('report.report_date', p.from!).lte('report.report_date', p.to!)
      if (p.onlyApproved) q = q.eq('report.status', 'aprovado')
      if (p.authorId) q = q.eq('report.author_user_id', p.authorId)
      const rows = ((unwrap(await q) ?? []) as unknown as Array<{ description: string; location: string | null; quantity: number | null; unit: string | null; progress_percentage: number | null; execution_status: Enums<'execution_status'>; stage_name: string | null; activity: { title: string } | null; report: { report_date: string; author: { name: string } | null } }>)
        .sort((a, b2) => a.report.report_date.localeCompare(b2.report.report_date))
      b.table([{ label: 'Data', width: 11 }, { label: 'Serviço', width: 36 }, { label: 'Local', width: 15 }, { label: 'Quantidade', width: 13, align: 'right' }, { label: 'Situação', width: 13 }, { label: 'Registrado por', width: 12 }],
        rows.map((r) => [formatDate(r.report.report_date), [r.description, r.activity?.title && `(${r.activity.title})`].filter(Boolean).join(' '), r.location ?? '', r.quantity !== null ? `${formatNumber(r.quantity, 3)} ${r.unit ?? ''}` : '', EXECUTION_STATUS[r.execution_status].label, r.report.author?.name ?? '']),
        { empty: 'Nenhum serviço registrado no período.' })
      const totals = new Map<string, { q: number; unit: string }>()
      for (const r of rows) if (r.quantity !== null && r.activity) {
        const k = `${r.activity.title}|${r.unit ?? ''}`
        totals.set(k, { q: (totals.get(k)?.q ?? 0) + Number(r.quantity), unit: r.unit ?? '' })
      }
      if (totals.size) {
        b.heading('Totais por atividade do cronograma', 2)
        b.table([{ label: 'Atividade', width: 70 }, { label: 'Quantidade executada', width: 30, align: 'right' }], [...totals].map(([k, v]) => [k.split('|')[0], `${formatNumber(v.q, 3)} ${v.unit}`]))
      }
      observations()
      signatures()
      break
    }
    case 'ocorrencias': {
      progress('Carregando ocorrências…')
      let q = supabase.from('occurrences').select('code, title, description, category, priority, status, due_date, occurred_at, actions_taken, resolution_description, project:projects!inner(name, organization_id), responsible:profiles!occurrences_responsible_user_id_fkey(name)')
        .eq('project.organization_id', p.orgId).gte('occurred_at', `${p.from}T00:00:00-03:00`).lte('occurred_at', `${p.to}T23:59:59-03:00`)
      if (project) q = q.eq('project_id', project.id)
      if (p.authorId) q = q.eq('responsible_user_id', p.authorId)
      const rows = (unwrap(await q.order('occurred_at')) ?? []) as unknown as Array<{ code: string; title: string; description: string; category: string; priority: Enums<'priority_level'>; status: Enums<'occurrence_status'>; due_date: string | null; occurred_at: string; actions_taken: string | null; resolution_description: string | null; project: { name: string }; responsible: { name: string } | null }>
      const open = rows.filter((r) => r.status !== 'resolvida' && r.status !== 'encerrada').length
      b.kv([['Total no período', String(rows.length)], ['Em aberto', String(open)], ['Resolvidas ou encerradas', String(rows.length - open)]])
      b.table([{ label: 'Código', width: 9 }, ...(project ? [] : [{ label: 'Obra', width: 14 }]), { label: 'Data', width: 10 }, { label: 'Ocorrência', width: 34 }, { label: 'Prioridade', width: 10 }, { label: 'Situação', width: 12 }, { label: 'Responsável', width: 13 }, { label: 'Prazo', width: 10 }],
        rows.map((r) => [r.code, ...(project ? [] : [r.project.name]), formatDate(r.occurred_at), `${r.title} (${r.category})\n${r.description}${r.actions_taken ? `\nProvidências: ${r.actions_taken}` : ''}${r.resolution_description ? `\nResolução: ${r.resolution_description}` : ''}`, PRIORITY[r.priority].label, OCCURRENCE_STATUS[r.status].label, r.responsible?.name ?? 'Sem responsável', formatDate(r.due_date)]),
        { empty: 'Nenhuma ocorrência no período.' })
      observations()
      signatures()
      break
    }
    case 'mao_de_obra': {
      progress('Carregando efetivo…')
      let q = supabase.from('daily_reports').select('id, report_date, status, workers:daily_report_workers(attendance_status, hours_worked, job_title, company_name, worker:workers(name)), crews:daily_report_crews(job_title, company_name, quantity, absent_quantity)')
        .eq('project_id', project!.id).gte('report_date', p.from!).lte('report_date', p.to!).neq('status', 'rascunho')
      if (p.onlyApproved) q = q.eq('status', 'aprovado')
      const reps = (unwrap(await q.order('report_date')) ?? []) as unknown as Array<{ report_date: string; workers: Array<{ attendance_status: Enums<'attendance_status'>; hours_worked: number | null; job_title: string | null; company_name: string | null; worker: { name: string } | null }>; crews: Array<{ job_title: string; company_name: string | null; quantity: number; absent_quantity: number }> }>
      b.heading('Efetivo por dia')
      b.table([{ label: 'Data', width: 16 }, { label: 'Presentes', width: 14, align: 'right' }, { label: 'Faltas/ausências', width: 18, align: 'right' }, { label: 'Horas registradas', width: 18, align: 'right' }, { label: 'Funções', width: 34 }],
        reps.map((r) => {
          const pres = r.workers.filter((w) => w.attendance_status === 'presente').length + r.crews.reduce((s, c) => s + c.quantity - c.absent_quantity, 0)
          const abs = r.workers.filter((w) => w.attendance_status !== 'presente' && w.attendance_status !== 'folga').length + r.crews.reduce((s, c) => s + c.absent_quantity, 0)
          const hours = r.workers.reduce((s, w) => s + Number(w.hours_worked ?? 0), 0)
          const funcs = new Map<string, number>()
          r.workers.filter((w) => w.attendance_status === 'presente').forEach((w) => funcs.set(w.job_title ?? '—', (funcs.get(w.job_title ?? '—') ?? 0) + 1))
          r.crews.forEach((c) => funcs.set(c.job_title, (funcs.get(c.job_title) ?? 0) + c.quantity - c.absent_quantity))
          return [formatDate(r.report_date), String(pres), String(abs), hours ? formatNumber(hours, 1) : '—', [...funcs].map(([k, v]) => `${k}: ${v}`).join(', ')]
        }), { empty: 'Nenhum diário enviado no período.' })
      const byPerson = new Map<string, { days: number; abs: number; hours: number; job: string; company: string }>()
      for (const r of reps) for (const w of r.workers) {
        const k = w.worker?.name ?? '—'
        const e = byPerson.get(k) ?? { days: 0, abs: 0, hours: 0, job: w.job_title ?? '', company: w.company_name || 'Própria' }
        if (w.attendance_status === 'presente') e.days++; else if (w.attendance_status !== 'folga') e.abs++
        e.hours += Number(w.hours_worked ?? 0)
        byPerson.set(k, e)
      }
      if (byPerson.size) {
        b.heading('Por pessoa', 2)
        b.table([{ label: 'Nome', width: 30 }, { label: 'Função', width: 20 }, { label: 'Empresa', width: 20 }, { label: 'Dias presentes', width: 10, align: 'right' }, { label: 'Faltas', width: 10, align: 'right' }, { label: 'Horas', width: 10, align: 'right' }],
          [...byPerson].sort((a, b2) => a[0].localeCompare(b2[0], 'pt-BR')).map(([n, e]) => [n, e.job, e.company, String(e.days), String(e.abs), e.hours ? formatNumber(e.hours, 1) : '—']))
      }
      observations()
      signatures()
      break
    }
    case 'atrasadas': {
      progress('Carregando atividades…')
      const today = todayISO()
      const list = (await listLateActivities(p.orgId, project?.id)).filter((a) => a.planned_end_date && a.planned_end_date < today && (!p.authorId || a.responsible_user_id === p.authorId))
      const days = (d: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000)
      b.kv([['Data de referência', formatDate(today)], ['Atividades atrasadas', String(list.length)]])
      b.table([...(project ? [] : [{ label: 'Obra', width: 16 }]), { label: 'Etapa', width: 14 }, { label: 'Atividade', width: 28 }, { label: 'Responsável', width: 16 }, { label: 'Prazo', width: 11 }, { label: 'Dias de atraso', width: 10, align: 'right' as const }, { label: 'Avanço', width: 9, align: 'right' as const }],
        list.map((a) => [...(project ? [] : [a.project.name]), a.stage?.name ?? '—', `${a.title}${a.status === 'bloqueada' ? ' (BLOQUEADA)' : ''}`, a.responsible?.name ?? '—', formatDate(a.planned_end_date), String(days(a.planned_end_date!)), formatPercent(a.progress_percentage)]),
        { empty: 'Nenhuma atividade atrasada.' })
      observations()
      signatures()
      break
    }
    case 'evolucao': {
      const pr = project!
      const [stages, acts] = await Promise.all([listStages(pr.id), listActivities(pr.id)])
      const valid = acts.filter((a) => a.status !== 'cancelada')
      b.kv([['Avanço físico atual', formatPercent(pr.progress_percentage, 1)], ['Método', pr.progress_method === 'manual' ? 'Informado manualmente' : pr.progress_method === 'peso_atividade' ? 'Ponderado por atividades' : 'Ponderado por etapas'],
        ['Atividades', `${valid.filter((a) => a.status === 'concluida').length} concluídas de ${valid.length}`], ['Início', formatDate(pr.start_date)], ['Previsão de conclusão', formatDate(pr.expected_end_date)]])
      b.heading('Avanço por etapa')
      const totalW = stages.reduce((s, x) => s + Number(x.weight), 0)
      b.table([{ label: 'Etapa', width: 40 }, { label: 'Peso relativo', width: 20, align: 'right' }, { label: 'Avanço da etapa', width: 20, align: 'right' }, { label: 'Contribuição', width: 20, align: 'right' }],
        stages.map((s) => {
          const list = valid.filter((a) => a.stage_id === s.id)
          const w = list.reduce((x, a) => x + Number(a.weight), 0)
          const prog = w ? list.reduce((x, a) => x + Number(a.weight) * Number(a.progress_percentage), 0) / w : 0
          const rel = totalW ? (Number(s.weight) / totalW) * 100 : 0
          return [s.name, formatPercent(rel, 1), formatPercent(prog, 1), formatPercent((rel * prog) / 100, 1)]
        }), { empty: 'Nenhuma etapa cadastrada.' })
      b.heading('Conclusões ao longo do tempo')
      b.text('Avanço acumulado estimado apenas pelas atividades concluídas, conforme a data real de conclusão de cada uma (não inclui avanço parcial).', { size: 8 })
      const weightOf = (a: typeof valid[number]) => {
        if (pr.progress_method === 'peso_atividade' || !stages.length) { const t = valid.reduce((x, y) => x + Number(y.weight), 0); return t ? Number(a.weight) / t : 0 }
        const st = stages.find((s) => s.id === a.stage_id)
        if (!st || !totalW) return 0
        const inStage = valid.filter((x) => x.stage_id === st.id).reduce((x, y) => x + Number(y.weight), 0)
        return inStage ? (Number(st.weight) / totalW) * (Number(a.weight) / inStage) : 0
      }
      const byMonth = new Map<string, number>()
      for (const a of valid.filter((x) => x.status === 'concluida' && x.actual_end_date)) byMonth.set(a.actual_end_date!.slice(0, 7), (byMonth.get(a.actual_end_date!.slice(0, 7)) ?? 0) + weightOf(a))
      let acc = 0
      b.table([{ label: 'Mês', width: 30 }, { label: 'Atividades concluídas', width: 25, align: 'right' }, { label: 'Avanço no mês', width: 22, align: 'right' }, { label: 'Acumulado', width: 23, align: 'right' }],
        [...byMonth].sort().map(([m, w]) => { acc += w; return [new Date(`${m}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }), String(valid.filter((a) => a.actual_end_date?.startsWith(m)).length), formatPercent(w * 100, 1), formatPercent(acc * 100, 1)] }),
        { empty: 'Nenhuma atividade concluída ainda.' })
      observations()
      signatures()
      break
    }
  }
  progress('Finalizando o PDF…')
  const bytes = await b.finish()
  const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  const fileName = `${slug(REPORT_KINDS[p.kind].label)}${project ? `-${slug(project.code)}` : ''}-${(full?.report_date ?? p.to ?? todayISO())}.pdf`
  return { bytes, fileName }
}
