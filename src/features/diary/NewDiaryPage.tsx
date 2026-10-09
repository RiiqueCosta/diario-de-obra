import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatDate, todayISO } from '@/lib/format'
import { useOrgSettings } from '@/lib/useOrgSettings'
import type { Enums } from '@/lib/supabase'
import { Alert, Button, ErrorBox, PageHeader, Panel, SelectField, TextField } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { useProjectOptions, useProjectPerms } from '../projects/hooks'
import { createReport, findReportFor } from './api'

export function NewDiaryPage() {
  const org = useOrg()
  const { session } = useAuth()
  const navigate = useNavigate()
  const params = useSearchParams()
  const projects = useProjectOptions(org.organization_id)
  const settings = useOrgSettings(org.organization_id)
  const [project, setProject] = useState(params.get('obra') ?? '')
  const [date, setDate] = useState(params.get('data') ?? todayISO())
  const [kind, setKind] = useState<Enums<'report_kind'>>('principal')
  const perms = useProjectPerms(project || null)
  const existing = useQuery(project && date ? `report:exists:${project}:${date}` : null, () => findReportFor(project, date, 'principal'))
  const create = useAction(async () => createReport({ project_id: project, report_date: date, kind, author_user_id: session!.user.id }))

  useEffect(() => {
    if (!project && projects.data?.length === 1) setProject(projects.data[0].id)
  }, [projects.data, project])
  useEffect(() => { if (existing.data && settings.data?.allow_complementary_reports === false) setKind('principal') }, [existing.data, settings.data])

  const future = date > todayISO()
  const blockedMain = kind === 'principal' && !!existing.data
  const noPerm = !!project && perms.data && !perms.can('diario.criar')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!project || future || blockedMain || noPerm) return
    const r = await create.run()
    if (r) {
      invalidate('reports:')
      navigate(`/diarios/${r.id}/editar`, { replace: true, force: true })
    }
  }

  return (
    <>
      <PageHeader back={<Link to="/diarios" className="back-link"><Icon name="voltar" size={16} /> Diários</Link>} title="Novo diário de obra"
        subtitle="Escolha a obra e o dia de referência. Você pode preencher aos poucos: o rascunho fica salvo." />
      <form onSubmit={submit} className="stack" style={{ maxWidth: 640 }}>
        <Panel>
          <div className="form">
            <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Selecione a obra" required
              options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))} />
            <TextField label="Data de referência" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
              hint="O dia de trabalho registrado. Pode ser diferente do dia em que você está preenchendo."
              error={future ? 'A data do diário não pode ser futura.' : undefined} required />
            {settings.data?.allow_complementary_reports !== false && (
              <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as Enums<'report_kind'>)}
                options={[{ value: 'principal', label: 'Diário principal do dia' }, { value: 'complementar', label: 'Registro complementar (ex.: turno da noite)' }]} />
            )}
            {noPerm && <Alert tone="warn">Você não tem permissão para registrar diários nesta obra. Fale com o gestor da obra.</Alert>}
            {blockedMain && existing.data && (
              <Alert tone="info">
                <p>Já existe o diário principal desta obra em {formatDate(date)}.</p>
                <p><Link to={`/diarios/${existing.data.id}`}>Abrir o diário existente</Link>{settings.data?.allow_complementary_reports !== false && ' ou escolha "Registro complementar".'}</p>
              </Alert>
            )}
            <ErrorBox error={create.error} />
          </div>
        </Panel>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => navigate('/diarios')}>Cancelar</Button>
          <Button type="submit" size="lg" loading={create.pending} disabled={!project || future || blockedMain || !!noPerm}>Começar o diário</Button>
        </div>
      </form>
    </>
  )
}
