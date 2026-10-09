import { useState } from 'react'
import { Link } from '@/app/router'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/errors'
import { invalidate, useAction, useQuery } from '@/lib/useQuery'
import { formatDateTime } from '@/lib/format'
import { Button, EmptyState, ErrorBox, Loading, PageHeader, Panel, Tabs } from '@/ui/components'
import { Icon, type IconName } from '@/ui/Icon'

const ICON: Record<string, IconName> = {
  diario_pendente: 'aprovar', diario_aprovado: 'ok', diario_devolvido: 'alerta', diario_reaberto: 'editar',
  ocorrencia_prioritaria: 'alerta', ocorrencia_atribuida: 'usuario', atividade_atrasada: 'calendario', prazo_proximo: 'calendario',
  obra_sem_registro: 'diario', ocorrencia_sem_responsavel: 'usuario',
}

export function NotificationsPage() {
  const { session } = useAuth()
  const [view, setView] = useState<'nao_lidas' | 'todas'>('nao_lidas')
  const key = `notifications:list:${session?.user.id}:${view}`
  const q = useQuery(key, async () => {
    let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
    if (view === 'nao_lidas') query = query.is('read_at', null)
    return unwrap(await query) ?? []
  })
  const markAll = useAction(async () => unwrap(await supabase.rpc('mark_all_notifications_read')))
  const markOne = useAction(async (id: string) => unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)))

  const refresh = () => { invalidate('notifications:') }

  return (
    <>
      <PageHeader title="Notificações" subtitle="Avisos sobre diários, ocorrências e prazos das suas obras."
        actions={<Button variant="secondary" icon="ok" loading={markAll.pending} onClick={async () => { await markAll.run(); refresh() }}>Marcar todas como lidas</Button>} />
      <Tabs tabs={[{ id: 'nao_lidas', label: 'Não lidas' }, { id: 'todas', label: 'Todas' }]} value={view} onChange={setView} />
      <ErrorBox error={q.error ?? markAll.error ?? markOne.error} onRetry={q.refetch} />
      <Panel padded={false}>
        {q.loading && !q.data ? <Loading /> : !q.data?.length ? (
          <EmptyState icon="sino" title={view === 'nao_lidas' ? 'Nada pendente' : 'Nenhuma notificação'}>
            {view === 'nao_lidas' ? 'Você leu todos os avisos.' : 'Os avisos aparecem aqui quando houver diários para aprovar, devoluções ou ocorrências importantes.'}
          </EmptyState>
        ) : (
          <ul className="list">
            {q.data.map((n) => (
              <li key={n.id}>
                <div className="row-link" style={{ opacity: n.read_at ? 0.7 : 1 }}>
                  <Icon name={ICON[n.type] ?? 'info'} />
                  <div className="row-main">
                    {n.link ? <Link to={n.link} onClick={() => { if (!n.read_at) void markOne.run(n.id).then(refresh) }}><strong>{n.title}</strong></Link> : <strong>{n.title}</strong>}
                    <span>{n.message}</span>
                    <span className="small num" style={{ display: 'block' }}>{formatDateTime(n.created_at)}</span>
                  </div>
                  {!n.read_at && <Button size="sm" variant="ghost" onClick={async () => { await markOne.run(n.id); refresh() }}>Marcar como lida</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
