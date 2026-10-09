import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useNavigationBlocker } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { useQuery, invalidate } from '@/lib/useQuery'
import { toAppError, type AppError } from '@/lib/errors'
import { maskDocument, onlyDigits, todayISO } from '@/lib/format'
import { PROGRESS_METHOD, PROJECT_ROLE, PROJECT_STATUS } from '@/lib/labels'
import { dateOrder, hasErrors, maxLength, percent, required, UF, validateDocument, type Errors } from '@/lib/validation'
import { useOrgSettings } from '@/lib/useOrgSettings'
import type { Enums } from '@/lib/supabase'
import { Alert, Button, ErrorBox, Loading, PageHeader, Panel, SelectField, TextAreaField, TextField, useToast } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { addProjectMember, createProject, getProject, removeUnlinkedObject, signedUrl, updateProject, uploadProjectImage, type Project } from './api'
import { listOrgMembers } from '../users/api'

type FormValues = {
  name: string; code: string; client_name: string; client_document: string
  address: string; city: string; state: string; description: string
  technical_responsible: string; technical_registration: string
  start_date: string; expected_end_date: string; actual_end_date: string
  status: Enums<'project_status'>; progress_method: Enums<'progress_method'>; progress_percentage: string
  general_notes: string
}

const EMPTY: FormValues = {
  name: '', code: '', client_name: '', client_document: '', address: '', city: '', state: '', description: '',
  technical_responsible: '', technical_registration: '', start_date: '', expected_end_date: '', actual_end_date: '',
  status: 'planejamento', progress_method: 'peso_etapa', progress_percentage: '0', general_notes: '',
}

function fromProject(p: Project): FormValues {
  return {
    name: p.name, code: p.code, client_name: p.client_name, client_document: p.client_document ? maskDocument(p.client_document) : '',
    address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', description: p.description ?? '',
    technical_responsible: p.technical_responsible ?? '', technical_registration: p.technical_registration ?? '',
    start_date: p.start_date ?? '', expected_end_date: p.expected_end_date ?? '', actual_end_date: p.actual_end_date ?? '',
    status: p.status, progress_method: p.progress_method, progress_percentage: String(p.progress_percentage ?? 0),
    general_notes: p.general_notes ?? '',
  }
}

function validate(v: FormValues): Errors<FormValues> {
  const pct = Number(v.progress_percentage.replace(',', '.'))
  return {
    name: required(v.name, 'o nome da obra') ?? maxLength(v.name, 200, 'O nome'),
    code: required(v.code, 'o código da obra') ?? maxLength(v.code, 50, 'O código'),
    client_name: required(v.client_name, 'o cliente ou contratante'),
    client_document: validateDocument(v.client_document),
    expected_end_date: dateOrder(v.start_date, v.expected_end_date, 'A previsão de conclusão deve ser depois do início.'),
    actual_end_date: v.status === 'concluida'
      ? (required(v.actual_end_date, 'a data real de conclusão') ?? dateOrder(v.start_date, v.actual_end_date, 'A conclusão real deve ser depois do início.')
        ?? (v.actual_end_date > todayISO() ? 'A data real de conclusão não pode ser futura.' : undefined))
      : undefined,
    progress_percentage: v.progress_method === 'manual' ? (Number.isNaN(pct) ? 'Informe um número.' : percent(pct)) : undefined,
  }
}

export function ProjectFormPage({ projectId }: { projectId?: string }) {
  const org = useOrg()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const editing = !!projectId
  const existing = useQuery(projectId ? `project:${projectId}` : null, () => getProject(projectId!))
  const members = useQuery(isAdmin && !editing ? `org_members:${org.organization_id}:ativos` : null, () => listOrgMembers(org.organization_id, false))
  const settings = useOrgSettings(org.organization_id)

  const [values, setValues] = useState<FormValues>(EMPTY)
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [team, setTeam] = useState<Record<'gestor' | 'engenheiro' | 'encarregado', string>>({ gestor: '', engenheiro: '', encarregado: '' })

  useEffect(() => {
    if (existing.data && loadedVersion === null) {
      setValues(fromProject(existing.data))
      setLoadedVersion(existing.data.row_version)
    }
  }, [existing.data, loadedVersion])

  useEffect(() => {
    if (!cover) { setCoverPreview(null); return }
    const url = URL.createObjectURL(cover)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [cover])
  const currentCover = useQuery(existing.data?.cover_storage_key ? `signed:${existing.data.cover_storage_key}` : null, () => signedUrl(existing.data!.cover_storage_key))

  useNavigationBlocker(touched && !saving)

  const errors = useMemo(() => validate(values), [values])
  const show = (k: keyof FormValues) => (submitted ? errors[k] : undefined)
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => { setValues((v) => ({ ...v, [k]: val })); setTouched(true) }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (hasErrors(errors)) { setError(toAppError({ code: 'P0001', message: 'Corrija os campos destacados antes de salvar.' })); return }
    setSaving(true)
    let uploadedKey: string | null = null
    try {
      const payload = {
        name: values.name.trim(), code: values.code.trim(), client_name: values.client_name.trim(),
        client_document: onlyDigits(values.client_document) || null,
        address: values.address.trim() || null, city: values.city.trim() || null, state: values.state || null,
        description: values.description.trim() || null,
        technical_responsible: values.technical_responsible.trim() || null,
        technical_registration: values.technical_registration.trim() || null,
        start_date: values.start_date || null, expected_end_date: values.expected_end_date || null,
        actual_end_date: values.status === 'concluida' ? values.actual_end_date || null : null,
        status: values.status, progress_method: values.progress_method,
        ...(values.progress_method === 'manual' ? { progress_percentage: Number(values.progress_percentage.replace(',', '.')) } : {}),
        general_notes: values.general_notes.trim() || null,
      }
      let saved: Project
      if (editing && existing.data) {
        if (cover) uploadedKey = await uploadProjectImage(org.organization_id, existing.data.id, 'capa', cover, settings.data?.max_image_mb ?? 15)
        saved = await updateProject(existing.data.id, loadedVersion ?? existing.data.row_version, { ...payload, ...(uploadedKey ? { cover_storage_key: uploadedKey } : {}) })
      } else {
        saved = await createProject({ ...payload, organization_id: org.organization_id })
        if (cover) {
          uploadedKey = await uploadProjectImage(org.organization_id, saved.id, 'capa', cover, settings.data?.max_image_mb ?? 15)
          saved = await updateProject(saved.id, saved.row_version, { cover_storage_key: uploadedKey })
        }
        for (const role of ['gestor', 'engenheiro', 'encarregado'] as const) {
          if (team[role]) await addProjectMember({ project_id: saved.id, user_id: team[role], role })
        }
      }
      setTouched(false)
      invalidate('projects:')
      invalidate(`project:${saved.id}`)
      toast('ok', editing ? 'Obra salva.' : 'Obra cadastrada.')
      navigate(`/obras/${saved.id}`, { replace: true, force: true })
    } catch (e) {
      // Se a foto subiu mas o registro falhou, remove o arquivo órfão.
      if (uploadedKey) await removeUnlinkedObject(uploadedKey).catch(() => {})
      setError(toAppError(e))
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin && !editing) return <Alert tone="warn">Somente administradores cadastram obras.</Alert>
  if (editing && existing.loading && !existing.data) return <Loading />
  if (editing && existing.error) return <ErrorBox error={existing.error} onRetry={existing.refetch} />

  const memberOptions = (members.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || 'Sem nome' }))

  return (
    <>
      <PageHeader
        back={<Link to={editing ? `/obras/${projectId}` : '/obras'} className="back-link"><Icon name="voltar" size={16} /> {editing ? 'Voltar para a obra' : 'Obras'}</Link>}
        title={editing ? `Editar ${existing.data?.name ?? 'obra'}` : 'Nova obra'}
      />
      <form className="stack" onSubmit={submit} noValidate>
        <Panel title="Identificação">
          <div className="grid-2">
            <TextField label="Nome da obra" value={values.name} onChange={(e) => set('name', e.target.value)} error={show('name')} required className="span-2" />
            <TextField label="Código interno" value={values.code} onChange={(e) => set('code', e.target.value)} error={show('code')} hint="Único na empresa. Ex.: OB-2026-014" required />
            <SelectField label="Situação" value={values.status} onChange={(e) => set('status', e.target.value as FormValues['status'])}
              options={Object.entries(PROJECT_STATUS).map(([value, s]) => ({ value, label: s.label }))} />
            <TextField label="Cliente ou contratante" value={values.client_name} onChange={(e) => set('client_name', e.target.value)} error={show('client_name')} required />
            <TextField label="CPF ou CNPJ do contratante" inputMode="numeric" value={values.client_document} onChange={(e) => set('client_document', maskDocument(e.target.value))} error={values.client_document ? errors.client_document : undefined} hint="Opcional." />
            <TextAreaField label="Descrição do projeto" value={values.description} onChange={(e) => set('description', e.target.value)} className="span-2" />
          </div>
        </Panel>

        <Panel title="Endereço">
          <div className="grid-3">
            <TextField label="Endereço completo" value={values.address} onChange={(e) => set('address', e.target.value)} className="span-2" autoComplete="street-address" />
            <TextField label="Cidade" value={values.city} onChange={(e) => set('city', e.target.value)} />
            <SelectField label="UF" value={values.state} onChange={(e) => set('state', e.target.value)} placeholder="Selecione" options={UF.map((u) => ({ value: u, label: u }))} />
          </div>
        </Panel>

        <Panel title="Responsável técnico e prazos">
          <div className="grid-2">
            <TextField label="Responsável técnico" value={values.technical_responsible} onChange={(e) => set('technical_responsible', e.target.value)} hint="Nome que aparece nos relatórios." />
            <TextField label="Registro profissional (CREA/CAU)" value={values.technical_registration} onChange={(e) => set('technical_registration', e.target.value)} hint="Opcional." />
            <TextField label="Data de início" type="date" value={values.start_date} onChange={(e) => set('start_date', e.target.value)} />
            <TextField label="Previsão de conclusão" type="date" value={values.expected_end_date} onChange={(e) => set('expected_end_date', e.target.value)} error={show('expected_end_date') ?? (values.expected_end_date ? errors.expected_end_date : undefined)} />
            {values.status === 'concluida' && (
              <TextField label="Data real de conclusão" type="date" value={values.actual_end_date} max={todayISO()} onChange={(e) => set('actual_end_date', e.target.value)} error={show('actual_end_date')} required />
            )}
          </div>
          {values.status !== 'concluida' && <p className="field-hint mt-8">A data real de conclusão fica disponível quando a situação for "Concluída".</p>}
        </Panel>

        <Panel title="Avanço físico">
          <div className="grid-2">
            <SelectField label="Como calcular o avanço" value={values.progress_method} onChange={(e) => set('progress_method', e.target.value as FormValues['progress_method'])}
              hint={PROGRESS_METHOD[values.progress_method].description}
              options={Object.entries(PROGRESS_METHOD).map(([value, m]) => ({ value, label: m.label }))} />
            {values.progress_method === 'manual' ? (
              <TextField label="Avanço físico (%)" inputMode="decimal" value={values.progress_percentage} onChange={(e) => set('progress_percentage', e.target.value)} error={show('progress_percentage') ?? errors.progress_percentage} />
            ) : <p className="field-hint" style={{ alignSelf: 'center' }}>Calculado automaticamente a partir das etapas e atividades do cronograma.</p>}
          </div>
        </Panel>

        {!editing && isAdmin && (
          <Panel title="Equipe responsável">
            {memberOptions.length === 0 ? (
              <p className="muted">Ainda não há outros usuários na empresa. Você poderá montar a equipe depois, em Usuários e permissões.</p>
            ) : (
              <div className="grid-3">
                {(['gestor', 'engenheiro', 'encarregado'] as const).map((r) => (
                  <SelectField key={r} label={PROJECT_ROLE[r].label} value={team[r]} placeholder="Definir depois"
                    onChange={(e) => { setTeam((t) => ({ ...t, [r]: e.target.value })); setTouched(true) }} options={memberOptions} />
                ))}
              </div>
            )}
          </Panel>
        )}

        <Panel title="Foto de capa e observações">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="cover">Foto de capa</label>
              <input id="cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setCover(e.target.files?.[0] ?? null); setTouched(true) }} />
              <p className="field-hint">JPG, PNG ou WEBP, até {settings.data?.max_image_mb ?? 15} MB.</p>
              {(coverPreview || currentCover.data) && <img src={coverPreview ?? currentCover.data ?? ''} alt="Foto de capa da obra" style={{ marginTop: 8, borderRadius: 8, maxHeight: 180, objectFit: 'cover' }} />}
            </div>
            <TextAreaField label="Observações gerais" value={values.general_notes} onChange={(e) => set('general_notes', e.target.value)} rows={5} />
          </div>
        </Panel>

        <ErrorBox error={error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => navigate(editing ? `/obras/${projectId}` : '/obras')}>Cancelar</Button>
          <Button type="submit" loading={saving}>{editing ? 'Salvar alterações' : 'Cadastrar obra'}</Button>
        </div>
      </form>
    </>
  )
}
