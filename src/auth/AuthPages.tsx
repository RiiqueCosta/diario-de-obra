import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { toAppError, type AppError } from '@/lib/errors'
import { isEmail, passwordProblems, validateDocument } from '@/lib/validation'
import { maskDocument } from '@/lib/format'
import { Link, useNavigate } from '@/app/router'
import { Alert, Button, ErrorBox, TextField } from '@/ui/components'
import { Icon } from '@/ui/Icon'
import { useAuth } from './AuthProvider'

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="brand-mark"><Icon name="diario" size={26} /> Diário de Obra</div>
        <div>
          <h1>O registro de cada dia de obra, do canteiro ao relatório.</h1>
          <p>Serviços executados, equipe presente, clima, fotos e ocorrências, revisados e aprovados por quem responde pela obra.</p>
        </div>
        <p className="auth-side-foot small">Acesso restrito a usuários autorizados pela empresa.</p>
      </aside>
      <main className="auth-main"><div className="auth-card">{children}</div></main>
    </div>
  )
}

// Limite de tentativas no navegador (o Supabase Auth também limita no servidor).
const attempts: number[] = []
function tooManyAttempts(): boolean {
  const now = Date.now()
  while (attempts.length && now - attempts[0] > 5 * 60_000) attempts.shift()
  attempts.push(now)
  return attempts.length > 6
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<AppError | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEmail(email)) { setError(toAppError({ code: 'P0001', message: 'Informe um e-mail válido.' })); return }
    if (!password) { setError(toAppError({ code: 'P0001', message: 'Informe a senha.' })); return }
    if (tooManyAttempts()) { setError(toAppError({ code: 'P0001', message: 'Muitas tentativas seguidas. Aguarde alguns minutos.' })); return }
    setPending(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setPending(false)
    if (err) { setError(toAppError(err)); return }
    window.location.assign('/')
  }

  return (
    <AuthLayout>
      <h2>Entrar</h2>
      <p className="page-subtitle">Use o e-mail cadastrado pela sua empresa.</p>
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="E-mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <ErrorBox error={error} />
        <Button type="submit" size="lg" block loading={pending}>Entrar</Button>
      </form>
      <p className="auth-foot"><Link to="/recuperar-senha">Esqueci minha senha</Link></p>
      <p className="auth-foot muted small">Primeiro acesso de uma empresa nova? <Link to="/cadastro">Criar conta</Link></p>
    </AuthLayout>
  )
}

export function SignUpPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<AppError | null>(null)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = !name.trim() ? 'Informe seu nome.' : !isEmail(email) ? 'Informe um e-mail válido.' : passwordProblems(password)
    if (problem) { setError(toAppError({ code: 'P0001', message: problem })); return }
    setPending(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/` },
    })
    setPending(false)
    if (err) { setError(toAppError(err)); return }
    if (data.session) window.location.assign('/')
    else setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout>
        <h2>Confirme seu e-mail</h2>
        <Alert tone="ok"><p>Enviamos um link de confirmação para <strong>{email}</strong>. Abra o link para ativar a conta e depois entre.</p></Alert>
        <p className="auth-foot"><Link to="/entrar">Voltar para entrar</Link></p>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout>
      <h2>Criar conta</h2>
      <p className="page-subtitle">Para quem vai cadastrar a empresa. Funcionários são convidados depois, pelo administrador.</p>
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Seu nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 10 caracteres, com letras e números." required />
        <ErrorBox error={error} />
        <Button type="submit" size="lg" block loading={pending}>Criar conta</Button>
      </form>
      <p className="auth-foot"><Link to="/entrar">Já tenho conta</Link></p>
    </AuthLayout>
  )
}

export function RecoverPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<AppError | null>(null)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEmail(email)) { setError(toAppError({ code: 'P0001', message: 'Informe um e-mail válido.' })); return }
    setPending(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setPending(false)
    if (err && toAppError(err).kind === 'rede') { setError(toAppError(err)); return }
    // Mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados.
    setSent(true)
  }

  return (
    <AuthLayout>
      <h2>Recuperar senha</h2>
      {sent ? (
        <>
          <Alert tone="ok"><p>Se houver uma conta com <strong>{email}</strong>, você receberá um link para criar uma nova senha. O link vale por tempo limitado.</p></Alert>
          <p className="auth-foot"><Link to="/entrar">Voltar para entrar</Link></p>
        </>
      ) : (
        <>
          <p className="page-subtitle">Informe seu e-mail para receber o link de redefinição.</p>
          <form className="form" onSubmit={submit} noValidate>
            <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <ErrorBox error={error} />
            <Button type="submit" size="lg" block loading={pending}>Enviar link</Button>
          </form>
          <p className="auth-foot"><Link to="/entrar">Voltar para entrar</Link></p>
        </>
      )}
    </AuthLayout>
  )
}

/** Nova senha: usada pelo link de recuperação e pela troca obrigatória da senha provisória. */
export function NewPasswordPage({ mode }: { mode: 'recuperacao' | 'provisoria' }) {
  const { session, reload } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<AppError | null>(null)
  const [pending, setPending] = useState(false)
  const [waiting, setWaiting] = useState(mode === 'recuperacao' && !session)

  useEffect(() => {
    if (session) { setWaiting(false); return }
    if (mode !== 'recuperacao') return
    const t = setTimeout(() => setWaiting(false), 4000)
    return () => clearTimeout(t)
  }, [session, mode])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = passwordProblems(password) ?? (password !== confirm ? 'As senhas não conferem.' : undefined)
    if (problem) { setError(toAppError({ code: 'P0001', message: problem })); return }
    setPending(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setPending(false); setError(toAppError(err)); return }
    if (session) await supabase.from('profiles').update({ must_change_password: false }).eq('id', session.user.id)
    setPending(false)
    await reload()
    navigate('/', { replace: true })
  }

  if (waiting) return <AuthLayout><p className="muted">Validando o link…</p></AuthLayout>
  if (!session) {
    return (
      <AuthLayout>
        <h2>Link inválido ou expirado</h2>
        <p className="page-subtitle">Solicite um novo link de recuperação.</p>
        <Link to="/recuperar-senha" className="btn btn-primary btn-lg btn-block">Solicitar novo link</Link>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout>
      <h2>{mode === 'provisoria' ? 'Crie sua senha' : 'Nova senha'}</h2>
      <p className="page-subtitle">
        {mode === 'provisoria' ? 'Você entrou com uma senha provisória. Defina uma senha pessoal para continuar.' : 'Escolha uma nova senha para sua conta.'}
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 10 caracteres, com letras e números." required />
        <TextField label="Repita a nova senha" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <ErrorBox error={error} />
        <Button type="submit" size="lg" block loading={pending}>Salvar senha</Button>
      </form>
    </AuthLayout>
  )
}

/** Primeiro acesso sem empresa: cadastra a empresa e torna o usuário administrador. */
export function OnboardingPage() {
  const { reload, signOut, profile } = useAuth()
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [error, setError] = useState<AppError | null>(null)
  const [pending, setPending] = useState(false)
  const docError = validateDocument(doc)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) { setError(toAppError({ code: 'P0001', message: 'Informe o nome da empresa.' })); return }
    if (docError) { setError(toAppError({ code: 'P0001', message: docError })); return }
    setPending(true)
    const { data, error: err } = await supabase.rpc('create_organization', { p_name: name.trim(), p_document: doc || undefined })
    setPending(false)
    if (err) { setError(toAppError(err)); return }
    try { window.localStorage.setItem('diario.org', String(data)) } catch { /* sem armazenamento local */ }
    await reload()
  }

  return (
    <AuthLayout>
      <h2>Cadastre sua empresa</h2>
      <p className="page-subtitle">
        {profile?.name ? `${profile.name}, você` : 'Você'} ainda não faz parte de nenhuma empresa. Se foi convidado, peça ao administrador para conferir o convite. Para começar uma empresa nova, preencha abaixo: você será o administrador.
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Nome da empresa" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label="CNPJ" inputMode="numeric" value={doc} onChange={(e) => setDoc(maskDocument(e.target.value))} error={doc ? docError : undefined} hint="Opcional. Aparece nos relatórios." />
        <ErrorBox error={error} />
        <Button type="submit" size="lg" block loading={pending}>Cadastrar empresa</Button>
      </form>
      <p className="auth-foot"><button type="button" className="link-btn" onClick={() => void signOut()}>Sair</button></p>
    </AuthLayout>
  )
}
