import { useMemo, useState } from 'react'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import type { Enums } from '@/lib/supabase'
import { Badge, Button, Checkbox, EmptyState, ErrorBox, Loading, Modal, PageHeader, Panel, SelectField, TextField, useToast } from '@/ui/components'
import { useProjectOptions } from '../projects/hooks'
import { listWorkers, saveWorker, setWorkerProjects, type Worker } from './api'

export function TeamPage() {
  const org = useOrg()
  const { isAdmin, memberships } = useAuth()
  const workers = useQuery(`workers:${org.organization_id}`, () => listWorkers(org.organization_id))
  const projects = useProjectOptions(org.organization_id)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ativo')
  const [project, setProject] = useState('')
  const [editing, setEditing] = useState<Worker | 'novo' | null>(null)
  // Cadastrar pessoas: administrador ou gestor em alguma obra (o banco confere).
  const canManage = isAdmin || memberships.length > 0

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (workers.data ?? []).filter((w) =>
      (!status || w.status === status) &&
      (!project || w.projects.some((p) => p.project_id === project)) &&
      (!s || w.name.toLowerCase().includes(s) || w.job_title.toLowerCase().includes(s) || (w.company_name ?? '').toLowerCase().includes(s)))
  }, [workers.data, search, status, project])

  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name

  return (
    <>
      <PageHeader title="Equipe e mão de obra" subtitle="Funcionários, encarregados e prestadores que trabalham nas obras. Não precisam ter acesso ao sistema."
        actions={canManage && <Button icon="mais" onClick={() => setEditing('novo')}>Cadastrar pessoa</Button>} />
      <div className="toolbar">
        <TextField className="search" label="Buscar" type="search" placeholder="Nome, função ou empresa" value={search} onChange={(e) => setSearch(e.target.value)} />
        <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Todas" options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todas" options={[{ value: 'ativo', label: 'Ativos' }, { value: 'inativo', label: 'Inativos' }]} />
      </div>
      <ErrorBox error={workers.error} onRetry={workers.refetch} />
      <Panel padded={false}>
        {workers.loading && !workers.data ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon="equipe" title={workers.data?.length ? 'Ninguém encontrado com esses filtros' : 'Nenhuma pessoa cadastrada'}
            action={canManage && !workers.data?.length ? <Button icon="mais" onClick={() => setEditing('novo')}>Cadastrar pessoa</Button> : undefined}>
            {!workers.data?.length && 'Cadastre quem trabalha nas obras para marcar presença no diário em poucos toques.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Nome</th><th>Função</th><th>Empresa</th><th>Obras</th><th>Situação</th></tr></thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className={canManage ? 'clickable' : ''} onClick={() => canManage && setEditing(w)}>
                    <td><strong>{w.name}</strong>{w.contact_information && <div className="muted small">{w.contact_information}</div>}</td>
                    <td>{w.job_title}</td>
                    <td>{w.company_name || <span className="muted">Própria</span>}</td>
                    <td className="small">{w.projects.length === 0 ? <span className="muted">Nenhuma</span> : w.projects.map((p) => projectName(p.project_id)).filter(Boolean).join(', ')}</td>
                    <td><Badge tone={w.status === 'ativo' ? 'green' : 'grey'}>{w.status === 'ativo' ? 'Ativo' : 'Inativo'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editing && <WorkerModal worker={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function WorkerModal({ worker, onClose }: { worker: Worker | null; onClose: () => void }) {
  const org = useOrg()
  const toast = useToast()
  const projects = useProjectOptions(org.organization_id)
  const [name, setName] = useState(worker?.name ?? '')
  const [job, setJob] = useState(worker?.job_title ?? '')
  const [company, setCompany] = useState(worker?.company_name ?? '')
  const [contact, setContact] = useState(worker?.contact_information ?? '')
  const [status, setStatus] = useState<Enums<'record_status'>>(worker?.status ?? 'ativo')
  const current = worker?.projects.map((p) => p.project_id) ?? []
  const [selected, setSelected] = useState<string[]>(current)
  const [submitted, setSubmitted] = useState(false)
  const save = useAction(async () => {
    const saved = await saveWorker(worker?.id ?? null, {
      organization_id: org.organization_id, name: name.trim(), job_title: job.trim(),
      company_name: company.trim() || null, contact_information: contact.trim() || null, status,
    })
    await setWorkerProjects(saved.id, current, selected)
    return saved
  })
  const errors = { name: name.trim().length < 2 ? 'Informe o nome.' : undefined, job: !job.trim() ? 'Informe a função.' : undefined }

  return (
    <Modal open wide title={worker ? 'Editar pessoa' : 'Cadastrar pessoa'} onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} onClick={async () => {
          setSubmitted(true)
          if (errors.name || errors.job) return
          if (await save.run()) { invalidate('workers:'); invalidate('project_workers:'); toast('ok', 'Cadastro salvo.'); onClose() }
        }}>Salvar</Button>
      </>}>
      <div className="form">
        <div className="grid-2">
          <TextField label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} error={submitted ? errors.name : undefined} required />
          <TextField label="Função" value={job} onChange={(e) => setJob(e.target.value)} error={submitted ? errors.job : undefined} placeholder="Pedreiro, servente, eletricista…" required />
          <TextField label="Empresa terceirizada" value={company} onChange={(e) => setCompany(e.target.value)} hint="Deixe em branco se for funcionário próprio." />
          <TextField label="Contato profissional" value={contact} onChange={(e) => setContact(e.target.value)} hint="Telefone ou e-mail de trabalho, se necessário." />
          <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value as Enums<'record_status'>)} options={[{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Inativo (não aparece no diário)' }]} />
        </div>
        <p className="form-section-title">Obras em que trabalha</p>
        <p className="field-hint">Aparece na lista de presença do diário dessas obras.</p>
        {(projects.data ?? []).length === 0 ? <p className="muted">Nenhuma obra disponível.</p> : (
          <div className="grid-2">
            {(projects.data ?? []).map((p) => (
              <Checkbox key={p.id} label={p.name} hint={p.code} checked={selected.includes(p.id)}
                onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))} />
            ))}
          </div>
        )}
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}
