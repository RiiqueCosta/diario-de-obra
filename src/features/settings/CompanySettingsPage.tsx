import { useEffect, useState, type FormEvent } from 'react'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { supabase, BUCKET, type Tables } from '@/lib/supabase'
import { AppError, toAppError, unwrap, type AppError as AppErrorT } from '@/lib/errors'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { maskDocument, onlyDigits } from '@/lib/format'
import { isEmail, validateDocument } from '@/lib/validation'
import { useOrgSettings } from '@/lib/useOrgSettings'
import { Badge, Button, Checkbox, ErrorBox, Loading, PageHeader, Panel, SelectField, Tabs, TextField, useToast } from '@/ui/components'
import { assertImageSignature, signedUrl } from '../projects/api'

type Contact = { phone?: string; email?: string; address?: string; website?: string }

export function CompanySettingsPage() {
  const [tab, setTab] = useState<'dados' | 'regras' | 'listas'>('dados')
  return (
    <>
      <PageHeader title="Configurações da empresa" subtitle="Dados que aparecem nos relatórios, regras de funcionamento e listas usadas nos formulários." />
      <Tabs tabs={[{ id: 'dados', label: 'Dados e logotipo' }, { id: 'regras', label: 'Regras' }, { id: 'listas', label: 'Unidades e categorias' }]} value={tab} onChange={setTab} />
      {tab === 'dados' && <CompanyData />}
      {tab === 'regras' && <Rules />}
      {tab === 'listas' && <Lists />}
    </>
  )
}

function CompanyData() {
  const org = useOrg()
  const { reload } = useAuth()
  const toast = useToast()
  const q = useQuery(`organization:${org.organization_id}`, async () => unwrap(await supabase.from('organizations').select('*').eq('id', org.organization_id).single()))
  const logo = useQuery(q.data?.logo_storage_key ? `signed:${q.data.logo_storage_key}` : null, () => signedUrl(q.data!.logo_storage_key))
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [contact, setContact] = useState<Contact>({})
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<AppErrorT | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!q.data) return
    setName(q.data.name)
    setDoc(q.data.document_number ? maskDocument(q.data.document_number) : '')
    setContact((q.data.contact_information ?? {}) as Contact)
  }, [q.data])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = name.trim().length < 2 ? 'Informe o nome da empresa.' : validateDocument(doc)
      ?? (contact.email && !isEmail(contact.email) ? 'E-mail de contato inválido.' : undefined)
    if (problem) { setError(new AppError(problem, 'validacao')); return }
    setSaving(true)
    let key: string | null = null
    try {
      if (file) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new AppError('O logotipo deve ser PNG, JPG ou WEBP.', 'validacao')
        if (file.size > 2 * 1024 * 1024) throw new AppError('O logotipo deve ter até 2 MB.', 'validacao')
        await assertImageSignature(file)
        key = `${org.organization_id}/_empresa/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`
        const up = await supabase.storage.from(BUCKET).upload(key, file, { contentType: file.type, upsert: false })
        if (up.error) throw up.error
      }
      const res = await supabase.from('organizations').update({
        name: name.trim(), document_number: onlyDigits(doc) || null, contact_information: contact,
        ...(key ? { logo_storage_key: key } : {}),
      }).eq('id', org.organization_id).select()
      if (!unwrap(res)?.length) throw new AppError('Somente administradores alteram os dados da empresa.', 'permissao')
      setFile(null)
      invalidate(`organization:${org.organization_id}`)
      await reload()
      toast('ok', 'Dados da empresa salvos.')
    } catch (e) {
      if (key) await supabase.storage.from(BUCKET).remove([key]).catch(() => {})
      setError(toAppError(e))
    } finally {
      setSaving(false)
    }
  }

  if (q.loading && !q.data) return <Loading />
  return (
    <form onSubmit={submit} noValidate className="stack">
      <ErrorBox error={q.error} onRetry={q.refetch} />
      <Panel title="Identificação">
        <div className="grid-2">
          <TextField label="Nome da empresa" value={name} onChange={(e) => setName(e.target.value)} required />
          <TextField label="CNPJ" inputMode="numeric" value={doc} onChange={(e) => setDoc(maskDocument(e.target.value))} error={doc ? validateDocument(doc) : undefined} />
          <TextField label="Telefone" type="tel" value={contact.phone ?? ''} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
          <TextField label="E-mail de contato" type="email" value={contact.email ?? ''} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
          <TextField label="Endereço" value={contact.address ?? ''} onChange={(e) => setContact((c) => ({ ...c, address: e.target.value }))} className="span-2" />
          <TextField label="Site" value={contact.website ?? ''} onChange={(e) => setContact((c) => ({ ...c, website: e.target.value }))} />
        </div>
      </Panel>
      <Panel title="Logotipo">
        <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
          {logo.data ? <img src={logo.data} alt="Logotipo atual" className="logo-preview" /> : <div className="logo-preview" style={{ display: 'grid', placeItems: 'center' }}><span className="muted small">Sem logotipo</span></div>}
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <label htmlFor="logo">Enviar novo logotipo</label>
            <input id="logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="field-hint">PNG com fundo transparente fica melhor nos relatórios. Até 2 MB.</p>
          </div>
        </div>
      </Panel>
      <ErrorBox error={error} />
      <div className="form-actions"><Button type="submit" loading={saving}>Salvar dados da empresa</Button></div>
    </form>
  )
}

function Rules() {
  const org = useOrg()
  const toast = useToast()
  const q = useOrgSettings(org.organization_id)
  const [v, setV] = useState<Tables<'org_settings'> | null>(null)
  useEffect(() => { if (q.data) setV(q.data) }, [q.data])
  const save = useAction(async () => {
    if (!v) return null
    const res = await supabase.from('org_settings').update({
      stale_project_days: v.stale_project_days, due_soon_days: v.due_soon_days, max_image_mb: v.max_image_mb,
      max_document_mb: v.max_document_mb, engineer_can_approve: v.engineer_can_approve, allow_complementary_reports: v.allow_complementary_reports,
    }).eq('organization_id', org.organization_id).select()
    const rows = unwrap(res)
    if (!rows?.length) throw new AppError('Somente administradores alteram as regras.', 'permissao')
    return rows[0]
  })
  if (!v) return q.error ? <ErrorBox error={q.error} onRetry={q.refetch} /> : <Loading />
  const num = (k: keyof Tables<'org_settings'>, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Math.max(min, Math.min(max, Number(e.target.value) || min))
    setV({ ...v, [k]: n })
  }
  return (
    <div className="stack">
      <Panel title="Diário de obra">
        <div className="form">
          <Checkbox label="Engenheiros podem aprovar diários" hint="Se desmarcado, só gestores e administradores aprovam (salvo ajuste individual por obra)." checked={v.engineer_can_approve} onChange={(e) => setV({ ...v, engineer_can_approve: e.target.checked })} />
          <Checkbox label="Permitir diários complementares" hint="Além do diário principal de cada data, permite registros adicionais (ex.: turno da noite)." checked={v.allow_complementary_reports} onChange={(e) => setV({ ...v, allow_complementary_reports: e.target.checked })} />
        </div>
      </Panel>
      <Panel title="Alertas e prazos">
        <div className="grid-2">
          <TextField label="Avisar obra sem diário após (dias)" type="number" min={1} max={60} value={v.stale_project_days} onChange={num('stale_project_days', 1, 60)} />
          <TextField label="Prazo considerado próximo (dias)" type="number" min={1} max={60} value={v.due_soon_days} onChange={num('due_soon_days', 1, 60)} />
        </div>
      </Panel>
      <Panel title="Limites de arquivos">
        <div className="grid-2">
          <TextField label="Tamanho máximo de foto (MB)" type="number" min={1} max={50} value={v.max_image_mb} onChange={num('max_image_mb', 1, 50)} />
          <TextField label="Tamanho máximo de documento (MB)" type="number" min={1} max={50} value={v.max_document_mb} onChange={num('max_document_mb', 1, 50)} />
        </div>
      </Panel>
      <ErrorBox error={save.error} />
      <div className="form-actions"><Button loading={save.pending} onClick={async () => { if (await save.run()) { invalidate(`org_settings:${org.organization_id}`); toast('ok', 'Regras salvas.') } }}>Salvar regras</Button></div>
    </div>
  )
}

const KINDS = [
  { value: 'foto', label: 'Fotos' }, { value: 'ocorrencia', label: 'Ocorrências' }, { value: 'documento', label: 'Documentos' },
  { value: 'material', label: 'Materiais' }, { value: 'equipamento', label: 'Equipamentos' },
]

function Lists() {
  const org = useOrg()
  const [kind, setKind] = useState('foto')
  const units = useQuery(`units:${org.organization_id}`, async () => unwrap(await supabase.from('units').select('*').eq('organization_id', org.organization_id).order('code')) ?? [])
  const cats = useQuery(`categories:${org.organization_id}`, async () => unwrap(await supabase.from('categories').select('*').eq('organization_id', org.organization_id).order('name')) ?? [])
  const [unit, setUnit] = useState({ code: '', name: '' })
  const [cat, setCat] = useState('')
  const addUnit = useAction(async () => unwrap(await supabase.from('units').insert({ organization_id: org.organization_id, code: unit.code.trim(), name: unit.name.trim() }).select().single()))
  const addCat = useAction(async () => unwrap(await supabase.from('categories').insert({ organization_id: org.organization_id, kind, name: cat.trim() }).select().single()))
  const toggleUnit = useAction(async (u: Tables<'units'>) => unwrap(await supabase.from('units').update({ active: !u.active }).eq('id', u.id).select()))
  const toggleCat = useAction(async (c: Tables<'categories'>) => unwrap(await supabase.from('categories').update({ active: !c.active }).eq('id', c.id).select()))

  return (
    <div className="grid-2">
      <Panel title="Unidades de medida">
        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (!unit.code.trim() || !unit.name.trim()) return; if (await addUnit.run()) { setUnit({ code: '', name: '' }); void units.refetch() } }}>
          <TextField label="Sigla" value={unit.code} onChange={(e) => setUnit((u) => ({ ...u, code: e.target.value }))} style={{ width: 100 }} />
          <TextField label="Nome" value={unit.name} onChange={(e) => setUnit((u) => ({ ...u, name: e.target.value }))} />
          <Button type="submit" variant="secondary" loading={addUnit.pending}>Adicionar</Button>
        </form>
        <ErrorBox error={addUnit.error ?? toggleUnit.error} />
        {units.loading ? <Loading /> : (
          <ul className="list mt-16">
            {(units.data ?? []).map((u) => (
              <li key={u.id} className="row between" style={{ padding: '8px 0' }}>
                <span><strong>{u.code}</strong> <span className="muted">{u.name}</span> {!u.active && <Badge tone="grey">Inativa</Badge>}</span>
                <Button size="sm" variant="ghost" onClick={async () => { await toggleUnit.run(u); void units.refetch() }}>{u.active ? 'Desativar' : 'Reativar'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Categorias">
        <SelectField label="Lista" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS} />
        <form className="row mt-8" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (!cat.trim()) return; if (await addCat.run()) { setCat(''); void cats.refetch() } }}>
          <TextField label="Nova categoria" value={cat} onChange={(e) => setCat(e.target.value)} />
          <Button type="submit" variant="secondary" loading={addCat.pending}>Adicionar</Button>
        </form>
        <ErrorBox error={addCat.error ?? toggleCat.error} />
        {cats.loading ? <Loading /> : (
          <ul className="list mt-16">
            {(cats.data ?? []).filter((c) => c.kind === kind).map((c) => (
              <li key={c.id} className="row between" style={{ padding: '8px 0' }}>
                <span>{c.name} {!c.active && <Badge tone="grey">Inativa</Badge>}</span>
                <Button size="sm" variant="ghost" onClick={async () => { await toggleCat.run(c); void cats.refetch() }}>{c.active ? 'Desativar' : 'Reativar'}</Button>
              </li>
            ))}
            {(cats.data ?? []).filter((c) => c.kind === kind).length === 0 && <li className="muted" style={{ padding: '8px 0' }}>Nenhuma categoria nesta lista.</li>}
          </ul>
        )}
      </Panel>
    </div>
  )
}
