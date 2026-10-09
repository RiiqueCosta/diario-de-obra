import { useEffect, type ReactNode } from 'react'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { LoginPage, NewPasswordPage, OnboardingPage, RecoverPasswordPage, SignUpPage } from '@/auth/AuthPages'
import { AppShell } from '@/layout/AppShell'
import { Alert, Button, EmptyState, ErrorBox, Loading, ToastProvider } from '@/ui/components'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProjectsListPage } from '@/features/projects/ProjectsListPage'
import { ProjectFormPage } from '@/features/projects/ProjectFormPage'
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage'
import { UsersPage } from '@/features/users/UsersPage'
import { CompanySettingsPage } from '@/features/settings/CompanySettingsPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { Link, RouterProvider, Routes, useNavigate, useRouter, type RouteDef } from './router'

const PUBLIC = ['/entrar', '/cadastro', '/recuperar-senha', '/redefinir-senha']

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Alert tone="warn">Esta área é exclusiva de administradores da empresa.</Alert>
  return <>{children}</>
}

const routes: RouteDef[] = [
  { path: '/', render: () => <DashboardPage /> },
  { path: '/obras', render: () => <ProjectsListPage /> },
  { path: '/obras/nova', render: () => <ProjectFormPage /> },
  { path: '/obras/:id', render: (p) => <ProjectDetailPage key={p.id} projectId={p.id} /> },
  { path: '/obras/:id/editar', render: (p) => <ProjectFormPage key={p.id} projectId={p.id} /> },
  { path: '/notificacoes', render: () => <NotificationsPage /> },
  { path: '/config/usuarios', render: () => <AdminOnly><UsersPage /></AdminOnly> },
  { path: '/config/empresa', render: () => <AdminOnly><CompanySettingsPage /></AdminOnly> },
  { path: '/config/auditoria', render: () => <AdminOnly><AuditPage /></AdminOnly> },
]

function NotFound() {
  return (
    <EmptyState icon="info" title="Página não encontrada" action={<Link to="/" className="btn btn-primary btn-md">Ir para o início</Link>}>
      O endereço não existe ou ainda não está disponível nesta versão.
    </EmptyState>
  )
}

function Gate() {
  const { ready, session, profile, memberships, loadError, reload, signOut } = useAuth()
  const { path } = useRouter()
  const navigate = useNavigate()
  const isPublic = PUBLIC.includes(path)

  useEffect(() => {
    if (!ready) return
    if (!session && !isPublic) navigate('/entrar', { replace: true, force: true })
    if (session && (path === '/entrar' || path === '/cadastro')) navigate('/', { replace: true, force: true })
  }, [ready, session, isPublic, path, navigate])

  if (path === '/redefinir-senha') return <NewPasswordPage mode="recuperacao" />
  if (!ready) return <Loading label="Abrindo o Diário de Obra…" />
  if (!session) {
    if (path === '/cadastro') return <SignUpPage />
    if (path === '/recuperar-senha') return <RecoverPasswordPage />
    return <LoginPage />
  }
  if (loadError) {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: 16 }}>
        <ErrorBox error={loadError} onRetry={() => void reload()} />
        <Button variant="ghost" onClick={() => void signOut()}>Sair</Button>
      </div>
    )
  }
  if (profile?.must_change_password) return <NewPasswordPage mode="provisoria" />
  if (memberships.length === 0) return <OnboardingPage />
  return (
    <AppShell>
      <Routes routes={routes} fallback={<NotFound />} />
    </AppShell>
  )
}

export function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>
  )
}
