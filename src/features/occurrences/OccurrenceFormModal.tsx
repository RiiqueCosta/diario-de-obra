import { useState } from 'react'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { useAction, useQuery } from '@/lib/useQuery'
import { PRIORITY, options } from '@/lib/labels'
import type { Enums } from '@/lib/supabase'
import { Button, ErrorBox, Modal, SelectField, TextAreaField, TextField, useToast } from '@/ui/components'
import { listProjectActivities } from '../diary/api'
import { listProjectMembers } from '../projects/api'
import { createOccurrence, listCategories } from './api'

function localNow() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

/** Registro de nova ocorrência (usado na lista de ocorrências e dentro do diário). */
export function OccurrenceFormModal({ projectId, dailyReportId, defaultDate, canAssign, onClose, onCreated }: {
  projectId: string; dailyReportId?: string; defaultDate?: string; canAssign: boolean
  onClose: () => void; onCreated: (id: string) => void
}) {
  const org = useOrg()
  const { session } = useAuth()
  const toast = useToast()
  const cats = useQuery(`categories:ocorrencia:${org.organization_id}`, () => listCategories(org.organization_id, 'ocorrencia'))
  const acts = useQuery(`activities:options:${projectId}`, () => listProjectActivities(projectId))
  const team = useQuery(canAssign ? `project_members:${projectId}` : null, () => listProjectMembers(projectId))
  const [v, setV] = useState({
    category: '', title: '', description: '', priority: 'media' as Enums<'priority_level'>,
    occurred_at: defaultDate ? `${defaultDate}T${localNow().slice(11)}` : localNow(),
    responsible_user_id: '', due_date: '', activity_id: '', actions_taken: '', decision: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const errors = {
    category: !v.category ? 'Escolha a categoria.' : undefined,
    title: v.title.trim().length < 3 ? 'Descreva em poucas palavras (mínimo 3 letras).' : undefined,
    description: !v.description.trim() ? 'Descreva o que aconteceu.' : undefined,
  }
  const save = useAction(async () => createOccurrence({
    project_id: projectId, daily_report_id: dailyReportId ?? null, category: v.category, title: v.title.trim(),
    description: v.description.trim(), priority: v.priority, occurred_at: new Date(v.occurred_at).toISOString(),
    responsible_user_id: v.responsible_user_id || null, due_date: v.due_date || null, activity_id: v.activity_id || null,
    actions_taken: v.actions_taken.trim() || null, decision: v.decision.trim() || null, created_by: session!.user.id,
  }))

  return (
    <Modal open wide title="Registrar ocorrência" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button loading={save.pending} onClick={async () => {
          setSubmitted(true)
          if (errors.category || errors.title || errors.description) return
          const r = await save.run()
          if (r) { toast('ok', `Ocorrência ${r.code} registrada.`); onCreated(r.id) }
        }}>Registrar ocorrência</Button>
      </>}>
      <div className="form">
        <div className="grid-2">
          <SelectField label="Categoria" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="Selecione" required
            options={(cats.data ?? []).map((c) => ({ value: c, label: c }))} error={submitted ? errors.category : undefined} />
          <SelectField label="Prioridade" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value as Enums<'priority_level'> })} options={options(PRIORITY)}
            hint={v.priority === 'alta' || v.priority === 'critica' ? 'Os gestores da obra serão avisados.' : undefined} />
          <TextField label="Título" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={submitted ? errors.title : undefined} required className="span-2" placeholder="Ex.: Falta de cimento para concretagem" />
          <TextAreaField label="O que aconteceu" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} error={submitted ? errors.description : undefined} required className="span-2" rows={4} />
          <TextField label="Data e hora" type="datetime-local" value={v.occurred_at} onChange={(e) => setV({ ...v, occurred_at: e.target.value })} />
          <SelectField label="Atividade relacionada" value={v.activity_id} onChange={(e) => setV({ ...v, activity_id: e.target.value })} placeholder="Nenhuma"
            options={(acts.data ?? []).map((a) => ({ value: a.id, label: a.stage ? `${a.stage.name} — ${a.title}` : a.title }))} />
          {canAssign && <>
            <SelectField label="Responsável pela resolução" value={v.responsible_user_id} onChange={(e) => setV({ ...v, responsible_user_id: e.target.value })} placeholder="Definir depois"
              options={(team.data ?? []).map((m) => ({ value: m.user_id, label: m.profile?.name || m.profile?.email || '' }))} />
            <TextField label="Prazo" type="date" value={v.due_date} onChange={(e) => setV({ ...v, due_date: e.target.value })} />
          </>}
          <TextAreaField label="Providências tomadas" value={v.actions_taken} onChange={(e) => setV({ ...v, actions_taken: e.target.value })} />
          <TextAreaField label="Decisões tomadas" value={v.decision} onChange={(e) => setV({ ...v, decision: e.target.value })} />
        </div>
        <ErrorBox error={save.error} />
      </div>
    </Modal>
  )
}
