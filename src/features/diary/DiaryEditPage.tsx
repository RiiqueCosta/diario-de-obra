import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useNavigationBlocker } from '@/app/router'
import { useAuth } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { toAppError, type AppError } from '@/lib/errors'
import { formatTime, todayISO } from '@/lib/format'
import { REPORT_STATUS, WEATHER, WORK_CONDITION, options } from '@/lib/labels'
import type { Enums } from '@/lib/supabase'
import { Alert, Badge, Button, ErrorBox, Loading, Modal, PageHeader, Panel, SelectField, TextAreaField, TextField, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { useProjectPerms } from '../projects/hooks'
import { DateStamp } from '../dashboard/DashboardPage'
import { LaborSection, MaterialsSection, OccurrencesSection, ServicesSection } from './DiarySections'
import { DiaryPhotosSection } from './DiaryPhotos'
import { discardDraft, getFullReport, submitReport, updateReport, type FullReport } from './api'

type Header = {
  report_date: string; start_time: string; end_time: string
  weather: string; weather_afternoon: string; temperature_c: string; weather_notes: string; weather_impact: string; work_conditions: string
  general_summary: string; no_execution_reason: string; next_day_plan: string; pending_items: string; final_notes: string; technical_notes: string
}

function toHeader(r: FullReport): Header {
  return {
    report_date: r.report_date, start_time: formatTime(r.start_time) === '—' ? '' : formatTime(r.start_time), end_time: formatTime(r.end_time) === '—' ? '' : formatTime(r.end_time),
    weather: r.weather ?? '', weather_afternoon: r.weather_afternoon ?? '', temperature_c: r.temperature_c === null ? '' : String(r.temperature_c).replace('.', ','),
    weather_notes: r.weather_notes ?? '', weather_impact: r.weather_impact ?? '', work_conditions: r.work_conditions ?? '',
    general_summary: r.general_summary ?? '', no_execution_reason: r.no_execution_reason ?? '', next_day_plan: r.next_day_plan ?? '',
    pending_items: r.pending_items ?? '', final_notes: r.final_notes ?? '', technical_notes: r.technical_notes ?? '',
  }
}

function headerPayload(h: Header) {
  const t = h.temperature_c.trim() ? Number(h.temperature_c.replace(',', '.')) : null
  return {
    report_date: h.report_date, start_time: h.start_time || null, end_time: h.end_time || null,
    weather: (h.weather || null) as Enums<'weather_condition'> | null, weather_afternoon: (h.weather_afternoon || null) as Enums<'weather_condition'> | null,
    temperature_c: t !== null && Number.isNaN(t) ? null : t, weather_notes: h.weather_notes.trim() || null, weather_impact: h.weather_impact.trim() || null,
    work_conditions: (h.work_conditions || null) as Enums<'work_condition'> | null, general_summary: h.general_summary.trim() || null,
    no_execution_reason: h.no_execution_reason.trim() || null, next_day_plan: h.next_day_plan.trim() || null, pending_items: h.pending_items.trim() || null,
    final_notes: h.final_notes.trim() || null, technical_notes: h.technical_notes.trim() || null,
  }
}

const SECTIONS = [
  { id: 'identificacao', label: 'Identificação' },
  { id: 'clima', label: 'Clima' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'equipe', label: 'Mão de obra' },
  { id: 'materiais', label: 'Materiais e equipamentos' },
  { id: 'ocorrencias', label: 'Ocorrências' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'encerramento', label: 'Encerramento' },
] as const
type SectionId = typeof SECTIONS[number]['id']

const backupKey = (id: string) => `diario.rascunho.${id}`
function readBackup(id: string): { base: number; values: Header } | null {
  try { const raw = localStorage.getItem(backupKey(id)); return raw ? JSON.parse(raw) : null } catch { return null }
}
function writeBackup(id: string, base: number, values: Header) {
  try { localStorage.setItem(backupKey(id), JSON.stringify({ base, values })) } catch { /* sem armazenamento local */ }
}
function clearBackup(id: string) { try { localStorage.removeItem(backupKey(id)) } catch { /* idem */ } }

export function DiaryEditPage({ reportId }: { reportId: string }) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const q = useQuery(`report:${reportId}`, () => getFullReport(reportId))
  const perms = useProjectPerms(q.data?.project_id)
  const [section, setSection] = useState<SectionId>('identificacao')
  const [header, setHeader] = useState<Header | null>(null)
  const [rowVersion, setRowVersion] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<AppError | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [recovery, setRecovery] = useState<Header | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const headerRef = useRef<Header | null>(null)
  headerRef.current = header

  // Carrega cabeçalho do servidor uma vez (ou após conflito resolvido).
  useEffect(() => {
    if (!q.data || header) return
    const h = toHeader(q.data)
    setHeader(h)
    setRowVersion(q.data.row_version)
    const b = readBackup(reportId)
    if (b && b.base === q.data.row_version && JSON.stringify(b.values) !== JSON.stringify(h)) setRecovery(b.values)
    else if (b) clearBackup(reportId)
  }, [q.data, header, reportId])

  // Itens filhos mudaram no servidor: recarrega e acompanha a versão do registro.
  useEffect(() => { if (q.data && rowVersion !== null && q.data.row_version > rowVersion && !dirty) setRowVersion(q.data.row_version) }, [q.data, rowVersion, dirty])

  useNavigationBlocker(dirty, 'O cabeçalho do diário tem alterações não salvas. Sair mesmo assim? (Uma cópia fica guardada neste aparelho.)')

  const set = (k: keyof Header, v: string) => {
    setHeader((h) => {
      const next = { ...(h as Header), [k]: v }
      if (rowVersion !== null) writeBackup(reportId, rowVersion, next)
      return next
    })
    setDirty(true)
  }

  const saveHeader = useCallback(async (): Promise<number | null> => {
    const h = headerRef.current
    if (!h || rowVersion === null) return rowVersion
    if (!dirty) return rowVersion
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await updateReport(reportId, rowVersion, headerPayload(h))
      setRowVersion(saved.row_version)
      setDirty(false)
      setSavedAt(new Date())
      clearBackup(reportId)
      invalidate('reports:')
      return saved.row_version
    } catch (e) {
      setSaveError(toAppError(e))
      return null
    } finally {
      setSaving(false)
    }
  }, [dirty, reportId, rowVersion])

  const refreshItems = useCallback(async () => {
    await q.refetch()
  }, [q])

  const submit = useAction(async () => {
    const v = await saveHeader()
    if (v === null) throw new Error(saveError?.message ?? 'Não foi possível salvar antes de enviar.')
    return submitReport(reportId, v)
  })
  const discard = useAction(async () => discardDraft(reportId))

  if (q.loading && !q.data) return <Loading />
  if (q.error) return <><Link to="/diarios" className="back-link"><Icon name="voltar" size={16} /> Diários</Link><ErrorBox error={q.error} onRetry={q.refetch} /></>
  const r = q.data!
  const isAuthor = r.author_user_id === session?.user.id
  const editable = (r.status === 'rascunho' || r.status === 'devolvido') && ((isAuthor && perms.can('diario.criar')) || (r.status === 'devolvido' && perms.can('diario.corrigir')))
  if (perms.data && !editable) {
    return (
      <>
        <Alert tone="info">{r.status === 'rascunho' || r.status === 'devolvido'
          ? 'Você não tem permissão para editar este diário. Só o autor (ou quem pode corrigir diários devolvidos) edita.'
          : `Este diário está "${REPORT_STATUS[r.status].label}" e não pode ser editado ${r.status === 'aprovado' ? 'diretamente. Correções passam por reabertura autorizada.' : 'enquanto aguarda a revisão.'}`}</Alert>
        <div className="mt-16"><Link to={`/diarios/${r.id}`} className="btn btn-primary btn-md">Ver o diário</Link></div>
      </>
    )
  }
  if (!header) return <Loading />

  const idx = SECTIONS.findIndex((s) => s.id === section)
  const go = async (to: SectionId) => {
    if (dirty) await saveHeader()
    setSection(to)
    window.scrollTo({ top: 0 })
  }
  const missing = [
    !header.weather && 'condição climática',
    !header.work_conditions && 'condição de trabalho',
    !header.general_summary.trim() && 'resumo geral do dia',
    r.activities.length === 0 && !header.no_execution_reason.trim() && 'serviços executados (ou motivo de não haver execução)',
  ].filter(Boolean) as string[]
  const timeError = header.start_time && header.end_time && header.end_time <= header.start_time ? 'O encerramento deve ser depois do início.' : undefined
  const tempNum = header.temperature_c.trim() ? Number(header.temperature_c.replace(',', '.')) : null
  const tempError = tempNum !== null && (Number.isNaN(tempNum) || tempNum < -20 || tempNum > 60) ? 'Temperatura entre -20 e 60 °C.' : undefined
  const counts: Partial<Record<SectionId, number>> = {
    servicos: r.activities.length, equipe: r.workers.length + r.crews.length, materiais: r.materials.length + r.equipment.length, ocorrencias: r.occurrences.length,
  }

  let body: ReactNode
  switch (section) {
    case 'identificacao':
      body = (
        <div className="form">
          <div className="grid-2">
            <TextField label="Data de referência" type="date" value={header.report_date} max={todayISO()} onChange={(e) => set('report_date', e.target.value)}
              disabled={r.status !== 'rascunho'} hint={r.status !== 'rascunho' ? 'A data não muda depois do primeiro envio.' : 'Dia de trabalho registrado.'} />
            <TextField label="Responsável pelo preenchimento" value={r.author?.name || r.author?.email || ''} disabled readOnly />
            <TextField label="Início das atividades" type="time" value={header.start_time} onChange={(e) => set('start_time', e.target.value)} />
            <TextField label="Encerramento das atividades" type="time" value={header.end_time} onChange={(e) => set('end_time', e.target.value)} error={timeError} />
          </div>
        </div>
      )
      break
    case 'clima':
      body = (
        <div className="form">
          <fieldset className="choice-group">
            <legend>Clima <span className="req">*</span></legend>
            <div className="choices">
              {options(WEATHER).map((o) => (
                <label key={o.value} className={`choice${header.weather === o.value ? ' selected' : ''}`}>
                  <input type="radio" name="weather" value={o.value} checked={header.weather === o.value} onChange={() => set('weather', o.value)} />{o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="choice-group">
            <legend>Condição de trabalho <span className="req">*</span></legend>
            <div className="choices">
              {options(WORK_CONDITION).map((o) => (
                <label key={o.value} className={`choice${header.work_conditions === o.value ? ' selected' : ''}`}>
                  <input type="radio" name="work" value={o.value} checked={header.work_conditions === o.value} onChange={() => set('work_conditions', o.value)} />{o.label}
                </label>
              ))}
            </div>
            {header.work_conditions && <p className="field-hint">{WORK_CONDITION[header.work_conditions as Enums<'work_condition'>].description}</p>}
          </fieldset>
          <div className="grid-2">
            <SelectField label="Clima à tarde (se mudou)" value={header.weather_afternoon} onChange={(e) => set('weather_afternoon', e.target.value)} placeholder="Igual à manhã" options={options(WEATHER)} />
            <TextField label="Temperatura (°C)" inputMode="decimal" value={header.temperature_c} onChange={(e) => set('temperature_c', e.target.value)} error={tempError} hint="Opcional." />
          </div>
          <TextAreaField label="Impacto do clima nas atividades" value={header.weather_impact} onChange={(e) => set('weather_impact', e.target.value)} placeholder="Ex.: concretagem adiada por chuva das 14h às 16h" />
          <TextAreaField label="Observações sobre o clima" value={header.weather_notes} onChange={(e) => set('weather_notes', e.target.value)} />
        </div>
      )
      break
    case 'servicos':
      body = <ServicesSection report={r} editable onChange={refreshItems} />
      break
    case 'equipe':
      body = <LaborSection report={r} editable onChange={refreshItems} />
      break
    case 'materiais':
      body = <MaterialsSection report={r} editable onChange={refreshItems} />
      break
    case 'ocorrencias':
      body = <OccurrencesSection report={r} canCreate={perms.can('ocorrencia.criar')} canAssign={perms.can('ocorrencia.gerenciar')} onChange={refreshItems} />
      break
    case 'fotos':
      body = <DiaryPhotosSection report={r} editable onChange={refreshItems} />
      break
    case 'encerramento':
      body = (
        <div className="form">
          <TextAreaField label="Resumo geral do dia" value={header.general_summary} onChange={(e) => set('general_summary', e.target.value)} required rows={5}
            placeholder="Principais serviços, andamento e fatos relevantes do dia." />
          {r.activities.length === 0 && (
            <TextAreaField label="Motivo de não haver serviços executados" value={header.no_execution_reason} onChange={(e) => set('no_execution_reason', e.target.value)}
              hint="Obrigatório para enviar um diário sem serviços (ex.: chuva o dia todo, feriado com plantão)." />
          )}
          <TextAreaField label="Serviços que continuam no próximo dia" value={header.next_day_plan} onChange={(e) => set('next_day_plan', e.target.value)} />
          <TextAreaField label="Pendências" value={header.pending_items} onChange={(e) => set('pending_items', e.target.value)} />
          <TextAreaField label="Observações técnicas" value={header.technical_notes} onChange={(e) => set('technical_notes', e.target.value)} hint="Orientações do engenheiro ou do responsável técnico." />
          <TextAreaField label="Observações finais" value={header.final_notes} onChange={(e) => set('final_notes', e.target.value)} />
          {missing.length > 0
            ? <Alert tone="warn"><p>Para enviar para aprovação, falta: {missing.join(', ')}.</p></Alert>
            : <Alert tone="ok"><p>Tudo pronto para enviar para aprovação.</p></Alert>}
        </div>
      )
      break
  }

  return (
    <>
      <PageHeader
        back={<Link to={`/diarios/${r.id}`} className="back-link"><Icon name="voltar" size={16} /> Ver diário</Link>}
        title={<span className="row" style={{ gap: 14 }}><DateStamp iso={header.report_date} small /><span>{r.project?.name}</span></span>}
        subtitle={<span className="row"><Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge>{r.kind === 'complementar' && <Badge tone="neutral">Complementar</Badge>}{r.version > 1 && <Badge tone="neutral">Versão {r.version}</Badge>}<SaveState saving={saving} dirty={dirty} savedAt={savedAt} error={!!saveError} /></span>}
        actions={<>
          {r.status === 'rascunho' && !r.submitted_at && isAuthor && <Button variant="ghost" onClick={() => setConfirmDiscard(true)}>Descartar rascunho</Button>}
          <Button variant="secondary" disabled={!dirty} loading={saving} onClick={() => void saveHeader()}>Salvar rascunho</Button>
          <Button icon="aprovar" onClick={async () => { await saveHeader(); setConfirmSubmit(true) }}>Enviar para aprovação</Button>
        </>}
      />
      {r.status === 'devolvido' && r.returned_reason && <Alert tone="warn"><p><strong>Devolvido para correção:</strong> {r.returned_reason}</p></Alert>}
      {recovery && (
        <Alert tone="info">
          <p>Há alterações deste aparelho que não chegaram ao servidor.</p>
          <div className="row mt-8">
            <Button size="sm" onClick={() => { setHeader(recovery); setDirty(true); setRecovery(null) }}>Recuperar alterações</Button>
            <Button size="sm" variant="secondary" onClick={() => { clearBackup(reportId); setRecovery(null) }}>Descartar</Button>
          </div>
        </Alert>
      )}
      <ErrorBox error={saveError} onRetry={saveError?.kind === 'conflito' ? () => { setHeader(null); setDirty(false); clearBackup(reportId); void q.refetch() } : () => void saveHeader()} />
      {saveError?.kind === 'conflito' && <p className="field-hint">"Tentar novamente" recarrega a versão atual do servidor. A cópia das suas alterações foi descartada.</p>}

      <div className="diary-layout mt-16">
        <nav className="section-nav" aria-label="Seções do diário">
          {SECTIONS.map((s, i) => (
            <button key={s.id} type="button" className={`section-link${s.id === section ? ' active' : ''}`} aria-current={s.id === section ? 'step' : undefined} onClick={() => void go(s.id)}>
              <span className="section-num">{i + 1}</span><span>{s.label}</span>
              {!!counts[s.id] && <span className="tab-count">{counts[s.id]}</span>}
            </button>
          ))}
        </nav>
        <div>
          <Panel title={SECTIONS[idx].label}>{body}</Panel>
          <div className="section-steps">
            <Button variant="secondary" disabled={idx === 0} onClick={() => void go(SECTIONS[idx - 1].id)} icon="voltar">Anterior</Button>
            {idx < SECTIONS.length - 1
              ? <Button onClick={() => void go(SECTIONS[idx + 1].id)}>Próximo: {SECTIONS[idx + 1].label}</Button>
              : <Button icon="aprovar" onClick={async () => { await saveHeader(); setConfirmSubmit(true) }}>Enviar para aprovação</Button>}
          </div>
        </div>
      </div>

      <Modal open={confirmSubmit} title="Enviar para aprovação" onClose={() => setConfirmSubmit(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>Continuar editando</Button>
          <Button loading={submit.pending} disabled={missing.length > 0} onClick={async () => {
            const res = await submit.run()
            if (res) { invalidate('reports:'); invalidate(`report:${reportId}`); invalidate('dashboard:'); toast('ok', 'Diário enviado para aprovação.'); navigate(`/diarios/${reportId}`, { force: true }) }
          }}>Enviar</Button>
        </>}>
        {missing.length > 0
          ? <Alert tone="warn"><p>Antes de enviar, preencha: {missing.join(', ')}.</p></Alert>
          : <p>Depois de enviado, o diário fica bloqueado para edição até ser aprovado ou devolvido para correção.</p>}
        <ErrorBox error={submit.error} />
      </Modal>
      <Modal open={confirmDiscard} title="Descartar rascunho" onClose={() => setConfirmDiscard(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Manter rascunho</Button>
          <Button variant="danger" loading={discard.pending} onClick={async () => { if (await discard.run()) { clearBackup(reportId); invalidate('reports:'); toast('ok', 'Rascunho descartado.'); navigate('/diarios', { force: true }) } }}>Descartar</Button>
        </>}>
        <p>O rascunho nunca foi enviado e será apagado com tudo o que foi lançado nele. Fotos enviadas continuam na galeria da obra.</p>
        <ErrorBox error={discard.error} />
      </Modal>
    </>
  )
}

function SaveState({ saving, dirty, savedAt, error }: { saving: boolean; dirty: boolean; savedAt: Date | null; error: boolean }) {
  const text = useMemo(() => {
    if (saving) return 'Salvando…'
    if (error) return 'Não salvo'
    if (dirty) return 'Alterações não salvas'
    if (savedAt) return `Salvo às ${savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    return 'Tudo salvo'
  }, [saving, dirty, savedAt, error])
  return <span className={`save-state${error ? ' err' : dirty ? ' dirty' : ''}`} role="status">{text}</span>
}
