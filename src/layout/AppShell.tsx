import { useEffect, useState, type ReactNode } from 'react'
import { Link, useRouter } from '@/app/router'
import { useAuth, useOrg } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@/lib/useQuery'
import { Avatar } from '@/ui/components'
import { Icon, type IconName } from '@/ui/Icon'

type NavItem = { to: string; label: string; icon: IconName; match: (p: string) => boolean; adminOnly?: boolean; count?: number }

export function useUnreadCount() {
  const { session } = useAuth()
  const q = useQuery(session ? `notifications:unread:${session.user.id}` : null, async () => {
    const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
    if (error) throw error
    return count ?? 0
  })
  // Atualiza periodicamente enquanto a aba estiver aberta.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void q.refetch() }, 60_000)
    return () => clearInterval(t)
  }, [q.refetch]) // eslint-disable-line react-hooks/exhaustive-deps
  return q.data ?? 0
}

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { path } = useRouter()
  const { memberships, setOrg, profile, signOut, isAdmin } = useAuth()
  const org = useOrg()
  const unread = useUnreadCount()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [path])

  const main: NavItem[] = [
    { to: '/', label: 'Início', icon: 'home', match: (p) => p === '/' },
    { to: '/obras', label: 'Obras', icon: 'obra', match: (p) => p.startsWith('/obras') },
    { to: '/diarios', label: 'Diários', icon: 'diario', match: (p) => p.startsWith('/diarios') },
    { to: '/aprovacoes', label: 'Aprovações', icon: 'aprovar', match: (p) => p.startsWith('/aprovacoes') },
    { to: '/ocorrencias', label: 'Ocorrências', icon: 'alerta', match: (p) => p.startsWith('/ocorrencias') },
    { to: '/fotos', label: 'Fotos', icon: 'foto', match: (p) => p.startsWith('/fotos') },
    { to: '/relatorios', label: 'Relatórios', icon: 'relatorio', match: (p) => p.startsWith('/relatorios') },
    { to: '/notificacoes', label: 'Notificações', icon: 'sino', match: (p) => p.startsWith('/notificacoes'), count: unread },
  ]
  const field: NavItem[] = [
    { to: '/equipe', label: 'Equipe e mão de obra', icon: 'equipe', match: (p) => p.startsWith('/equipe') },
    { to: '/materiais', label: 'Materiais e equipamentos', icon: 'config', match: (p) => p.startsWith('/materiais') },
  ]
  const admin: NavItem[] = [
    { to: '/config/usuarios', label: 'Usuários e permissões', icon: 'equipe', match: (p) => p.startsWith('/config/usuarios'), adminOnly: true },
    { to: '/config/empresa', label: 'Empresa', icon: 'empresa', match: (p) => p.startsWith('/config/empresa'), adminOnly: true },
    { to: '/config/auditoria', label: 'Histórico de auditoria', icon: 'historico', match: (p) => p.startsWith('/config/auditoria'), adminOnly: true },
  ]
  const navLink = (item: NavItem) => (
    <Link key={item.to} to={item.to} aria-current={item.match(path) ? 'page' : undefined}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {!!item.count && <span className="nav-count">{item.count > 99 ? '99+' : item.count}</span>}
    </Link>
  )

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
        <span className="topbar-title">{title ?? org.organization.name}</span>
        <Link to="/notificacoes" className="icon-btn" aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}>
          <Icon name="sino" />{unread > 0 && <span className="icon-badge">{unread > 9 ? '9+' : unread}</span>}
        </Link>
      </header>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Menu principal">
        <div className="sidebar-brand">
          <Link to="/" className="brand-mark"><Icon name="diario" size={24} /> Diário de Obra</Link>
          {memberships.length > 1 ? (
            <div className="org-switch">
              <label className="sr-only" htmlFor="org-select">Empresa</label>
              <select id="org-select" value={org.organization_id} onChange={(e) => { setOrg(e.target.value); window.location.assign('/') }}>
                {memberships.map((m) => <option key={m.organization_id} value={m.organization_id}>{m.organization.name}</option>)}
              </select>
            </div>
          ) : <p className="org-name">{org.organization.name}</p>}
        </div>
        <nav className="nav">
          {main.map(navLink)}
          <p className="nav-group">Cadastros de campo</p>
          {field.map(navLink)}
          {isAdmin && <p className="nav-group">Administração</p>}
          {isAdmin && admin.map(navLink)}
        </nav>
        <div className="sidebar-user">
          <Avatar name={profile?.name || profile?.email || '?'} />
          <div className="who">
            <strong>{profile?.name || profile?.email}</strong>
            <span>{isAdmin ? 'Administrador' : 'Membro'}</span>
          </div>
          <button className="icon-btn" onClick={() => void signOut()} aria-label="Sair" title="Sair"><Icon name="sair" /></button>
        </div>
      </aside>

      <main className="main" id="conteudo">{children}</main>

      <nav className="bottom-nav" aria-label="Navegação rápida">
        {[main[0], main[2]].map((item) => (
          <Link key={item.to} to={item.to} aria-current={item.match(path) ? 'page' : undefined}>
            <Icon name={item.icon} size={22} />{item.label}
          </Link>
        ))}
        <Link to="/diarios/novo" className="bottom-cta" aria-label="Novo diário de obra"><span className="bottom-cta-btn"><Icon name="mais" size={26} /></span>Novo diário</Link>
        <Link to="/ocorrencias" aria-current={main[4].match(path) ? 'page' : undefined}><Icon name="alerta" size={22} />Ocorrências</Link>
        <a href="#" onClick={(e) => { e.preventDefault(); setMenuOpen(true) }}><Icon name="menu" size={22} />Mais{unread > 0 && <span className="nav-count">{unread > 9 ? '9+' : unread}</span>}</a>
      </nav>
    </div>
  )
}
