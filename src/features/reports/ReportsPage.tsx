import { useEffect, useState } from 'react'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { useQuery } from '@/lib/useQuery'
import { addDaysISO, formatDate, todayISO } from '@/lib/format'
import { toAppError, type AppError } from '@/lib/errors'
import { REPORT_STATUS } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { useSearchParams } from '@/app/router'
import { Alert, Button, Checkbox, ErrorBox, Modal, PageHeader, Panel, SelectField, TextAreaField, TextField } from '@/ui/components'
import { useProjectOptions, useProjectPerms } from '../projects/hooks'
import { listOrgMembers } from '../users/api'
import { generateReport, REPORT_KINDS, type ReportKind, type ReportParams } from './generate'

/** Pré-visualização do PDF gerado, com abrir e baixar (funciona no celular). */
export function PdfPreview({ result, onClose }: { result: { bytes: Uint8Array; fileName: string }; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [result])
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  return (
    <Modal open wide title="Pré-visualização do relatório" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        {url && <a className="btn btn-secondary btn-md" href={url} target="_blank" rel="noopener">Abrir em nova aba</a>}
        {url && <a className="btn btn-primary btn-md" href={url} download={result.fileName}>Baixar PDF</a>}
      </>}>
      <p className="field-hint">{result.fileName} — {(result.bytes.byteLength / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</p>
      {url && !narrow && <iframe title="Pré-visualização do PDF" src={url} className="pdf-frame" />}
      {narrow && <Alert tone="info">No celular, use "Abrir em nova aba" para ver o PDF ou "Baixar PDF" para salvar.</Alert>}
    </Modal>
  )
}

export function useReportGenerator() {
  const { profile } = useAuth()
  const org = useOrg()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [result, setResult] = useState<{ bytes: Uint8Array; fileName: string } | null>(null)
  async function run(p: Omit<ReportParams, 'orgId' | 'userName' | 'onProgress'>) {
    setError(null); setBusy('Iniciando…')
    try {
      setResult(await generateReport({ ...p, orgId: org.organization_id, userName: profile?.name || profile?.email || 'usuário', onProgress: setBusy }))
    } catch (e) {
      setError(toAppError(e))
    } finally { setBusy(null) }
  }
  return { run, busy, error, result, clear: () => setResult(null) }
}

export function ReportsPage() {
  const org = useOrg()
  const { isAdmin } = useAuth()
  const projects = useProjectOptions(org.organization_id, true)
  const people = useQuery(isAdmin ? `org_members:${org.organization_id}:ativos` : null, () => listOrgMembers(org.organization_id, false))
  const [kind, setKind] = useState<ReportKind>('consolidado')
  const params = useSearchParams()
  const [project, setProject] = useState(params.get('obra') ?? '')
  const [from, setFrom] = useState(addDaysISO(todayISO(), -6))
  const [to, setTo] = useState(todayISO())
  const [reportId, setReportId] = useState('')
  const [author, setAuthor] = useState('')
  const [onlyApproved, setOnlyApproved] = useState(false)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [includeSignatures, setIncludeSignatures] = useState(true)
  const [maxPhotos, setMaxPhotos] = useState('40')
  const [observations, setObservations] = useState('')
  const perms = useProjectPerms(project || null)
  const gen = useReportGenerator()
  const def = REPORT_KINDS[kind]
  const reports = useQuery(kind === 'diario' && project ? `reports:pick:${project}` : null, async () =>
    unwrap(await supabase.from('daily_reports').select('id, report_date, kind, status').eq('project_id', project).order('report_date', { ascending: false }).limit(120)) ?? [])

  const noPerm = project && perms.data && !perms.can('relatorio.gerar') && !perms.can('diario.ver_todos')
  const missing = (def.needsProject && !project) || (def.needsPeriod && (!from || !to || to < from)) || (kind === 'diario' && !reportId)

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Documentos em PDF gerados a partir dos registros. Só entram obras e diários que você tem permissão para ver." />
      <div className="grid-2">
        <Panel title="O que gerar">
          <div className="form">
            <SelectField label="Tipo de relatório" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)} hint={def.description}
              options={Object.entries(REPORT_KINDS).map(([value, k]) => ({ value, label: k.label }))} />
            <SelectField label={def.needsProject ? 'Obra' : 'Obra (opcional)'} value={project} onChange={(e) => { setProject(e.target.value); setReportId('') }}
              placeholder={def.needsProject ? 'Selecione' : 'Todas as obras'} options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}${p.archived_at ? ' (arquivada)' : ''}` }))} />
            {kind === 'diario' && (
              <SelectField label="Diário" value={reportId} onChange={(e) => setReportId(e.target.value)} placeholder={project ? 'Selecione a data' : 'Escolha a obra primeiro'}
                options={(reports.data ?? []).map((r) => ({ value: r.id, label: `${formatDate(r.report_date)}${r.kind === 'complementar' ? ' (complementar)' : ''} — ${REPORT_STATUS[r.status].label}` }))} />
            )}
            {def.needsPeriod && (
              <div className="grid-2">
                <TextField label="De" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                <TextField label="Até" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} error={to < from ? 'O fim deve ser depois do início.' : undefined} />
              </div>
            )}
            {isAdmin && ['consolidado', 'atividades', 'ocorrencias', 'atrasadas'].includes(kind) && (
              <SelectField label={kind === 'ocorrencias' || kind === 'atrasadas' ? 'Responsável' : 'Autor dos diários'} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Todos"
                options={(people.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || '' }))} />
            )}
            {['consolidado', 'atividades', 'mao_de_obra'].includes(kind) && <Checkbox label="Somente diários aprovados" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} />}
          </div>
        </Panel>
        <Panel title="Conteúdo">
          <div className="form">
            {['diario', 'consolidado', 'obra', 'fotografico'].includes(kind) && (
              <>
                {kind !== 'fotografico' && <Checkbox label="Incluir fotografias" hint="Somente as fotos marcadas para relatório." checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />}
                <TextField label="Limite de fotos" type="number" min={1} max={300} value={maxPhotos} onChange={(e) => setMaxPhotos(e.target.value)} hint="Relatórios com muitas fotos demoram mais e ficam maiores." />
              </>
            )}
            <Checkbox label="Incluir campos de assinatura" checked={includeSignatures} onChange={(e) => setIncludeSignatures(e.target.checked)} />
            <TextAreaField label="Observações do relatório" value={observations} onChange={(e) => setObservations(e.target.value)} rows={4} hint="Vazio: o PDF traz um espaço em branco para anotações." />
          </div>
        </Panel>
      </div>
      {noPerm && <Alert tone="warn">Você não tem permissão para gerar relatórios desta obra.</Alert>}
      <ErrorBox error={gen.error} />
      <div className="form-actions mt-16">
        {gen.busy && <span className="row muted"><span className="spinner" aria-hidden /> {gen.busy}</span>}
        <Button size="lg" icon="relatorio" disabled={!!missing || !!noPerm} loading={!!gen.busy}
          onClick={() => void gen.run({ kind, projectId: project || undefined, reportId: reportId || undefined, from: def.needsPeriod ? from : undefined, to: def.needsPeriod ? to : undefined, authorId: author || undefined, onlyApproved, includePhotos: kind === 'fotografico' ? true : includePhotos, includeSignatures, observations, maxPhotos: Math.max(1, Math.min(300, Number(maxPhotos) || 40)) })}>
          Gerar e visualizar
        </Button>
      </div>
      {gen.result && <PdfPreview result={gen.result} onClose={gen.clear} />}
    </>
  )
}
