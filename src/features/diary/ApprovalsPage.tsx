import { useState } from 'react'
import { Link } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { useQuery } from '@/lib/useQuery'
import { formatDateTime } from '@/lib/format'
import { REPORT_STATUS } from '@/lib/labels'
import { Badge, EmptyState, ErrorBox, Loading, PageHeader, Panel, Tabs } from '@/ui/components'
import { DateStamp } from '../dashboard/DashboardPage'
import { getMyPermissions } from '../projects/api'
import { listReports, type ReportRow } from './api'

type Tab = 'aprovar' | 'devolvidos' | 'rascunhos'

export function ApprovalsPage() {
  const org = useOrg()
  const { session } = useAuth()
  const [tab, setTab] = useState<Tab>('aprovar')
  const uid = session!.user.id
  const pending = useQuery(`approvals:pending:${org.organization_id}`, async () => {
    const { rows } = await listReports({ orgId: org.organization_id, status: 'enviado', pageSize: 200 })
    const mine = rows.filter((r) => r.author_user_id !== uid)
    const projectIds = [...new Set(mine.map((r) => r.project_id))]
    const perms = await Promise.all(projectIds.map(async (p) => [p, await getMyPermissions(p)] as const))
    const can = new Map(perms.map(([p, x]) => [p, !!x['diario.aprovar']]))
    return mine.filter((r) => can.get(r.project_id)).sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  })
  const returned = useQuery(`approvals:returned:${org.organization_id}:${uid}`, async () => (await listReports({ orgId: org.organization_id, status: 'devolvido', authorId: uid, pageSize: 200 })).rows)
  const drafts = useQuery(`approvals:drafts:${org.organization_id}:${uid}`, async () => (await listReports({ orgId: org.organization_id, status: 'rascunho', authorId: uid, pageSize: 200 })).rows)
  const current = tab === 'aprovar' ? pending : tab === 'devolvidos' ? returned : drafts

  const row = (r: ReportRow) => (
    <li key={r.id}>
      <Link to={tab === 'aprovar' ? `/diarios/${r.id}` : `/diarios/${r.id}/editar`} className="row-link">
        <DateStamp iso={r.report_date} small />
        <div className="row-main">
          <strong>{r.project?.name}{r.kind === 'complementar' && ' — complementar'}</strong>
          <span>{tab === 'aprovar' ? `Enviado por ${r.author?.name || r.author?.email} em ${formatDateTime(r.submitted_at)}` : `Atualizado em ${formatDateTime(r.updated_at)}`}</span>
          {tab === 'devolvidos' && r.returned_reason && <span className="small">Motivo: {r.returned_reason}</span>}
        </div>
        <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge>
      </Link>
    </li>
  )

  return (
    <>
      <PageHeader title="Aprovações" subtitle="Diários aguardando a sua revisão e os seus diários que precisam de ação." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'aprovar', label: 'Para eu aprovar', count: pending.data?.length },
        { id: 'devolvidos', label: 'Meus devolvidos', count: returned.data?.length },
        { id: 'rascunhos', label: 'Meus rascunhos', count: drafts.data?.length },
      ]} />
      <ErrorBox error={current.error} onRetry={current.refetch} />
      <Panel padded={false}>
        {current.loading && !current.data ? <Loading /> : !current.data?.length ? (
          <EmptyState icon="aprovar" title={tab === 'aprovar' ? 'Nada aguardando a sua aprovação' : tab === 'devolvidos' ? 'Nenhum diário devolvido' : 'Nenhum rascunho em aberto'}>
            {tab === 'aprovar' ? 'Quando alguém enviar um diário de obra em que você aprova, ele aparece aqui.' : undefined}
          </EmptyState>
        ) : <ul className="list">{current.data.map(row)}</ul>}
      </Panel>
    </>
  )
}
