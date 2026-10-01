import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { formatPrice } from '../data/products'
import { useAuth } from '../store/AuthContext'
import { useLanguage } from '../store/LanguageContext'
import { BotChallenge } from '../components/BotChallenge'

interface OrderSummary {
  id: string
  number: string
  total: number
  status: string
  paymentStatus: string
  createdAt: string | number
}

export function LoginPage() {
  const { user, login, loading, error: authError } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  if (user) return <Navigate to="/ucet" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const ok = await login(String(form.get('identifier')), String(form.get('password')))
    if (!ok) return setError(authError || 'Neplatné přihlašovací údaje.')
    navigate((location.state as { from?: string } | null)?.from || '/ucet')
  }

  return <AuthShell title={t('login')}>
    <form className="auth-form" onSubmit={submit}>
      <label>{t('username')} / {t('email')}<input name="identifier" required autoComplete="username" /></label>
      <label>{t('password')}<input name="password" required type="password" autoComplete="current-password" /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="button button--acid button--full" disabled={loading}>{loading ? 'OVĚŘUJI…' : t('signIn')}</button>
    </form>
    <p>{t('noAccount')} <Link to="/registrace">{t('register')}</Link></p>
  </AuthShell>
}

export function RegisterPage() {
  const { user, register, loading } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [botToken, setBotToken] = useState<string | null>(null)
  const [botRequired, setBotRequired] = useState(true)
  const [challengeGeneration, setChallengeGeneration] = useState(0)
  if (user) return <Navigate to="/ucet" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password.length < 10) return setError('Heslo musí mít alespoň 10 znaků.')
    const result = await register(String(form.get('username')), String(form.get('email')), password, botToken || undefined, String(form.get('website') || ''))
    if (result) {
      setBotToken(null)
      setChallengeGeneration((value) => value + 1)
      return setError(result)
    }
    navigate('/ucet')
  }

  return <AuthShell title={t('createAccount')}>
    <form className="auth-form" onSubmit={submit}>
      <label>{t('username')}<input name="username" required minLength={3} maxLength={40} autoComplete="username" /></label>
      <label>{t('email')}<input name="email" required type="email" autoComplete="email" /></label>
      <label>{t('password')}<input name="password" required type="password" minLength={10} maxLength={200} autoComplete="new-password" /></label>
      <label className="bot-field" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <BotChallenge key={challengeGeneration} action="register" onChange={(token, required) => { setBotToken(token); setBotRequired(required) }} />
      {error && <p className="form-error">{error}</p>}
      <button className="button button--acid button--full" disabled={loading || (botRequired && !botToken)}>{loading ? 'UKLÁDÁM…' : t('createAccount')}</button>
    </form>
    <p>{t('hasAccount')} <Link to="/prihlaseni">{t('signIn')}</Link></p>
  </AuthShell>
}

export function AccountPage() {
  const { user, logout, isStaff, loading } = useAuth()
  const { t } = useLanguage()
  if (loading) return <div className="page-view page-shell simple-message"><span>[ AUTH_CHANNEL / VERIFYING ]</span></div>
  if (!user) return <Navigate to="/prihlaseni" replace />

  return <AuthShell title={t('welcome')}>
    <div className="account-card"><strong>{user.username}</strong><span>{user.email}</span><span>{t('role')} / {user.role.toUpperCase()}</span></div>
    {isStaff && <div className="account-actions">
      <Link className="button button--light button--full" to="/sprava/naskladneni">{t('inventory')}</Link>
      <Link className="button button--light button--full" to="/sprava/objednavky">OBJEDNÁVKY</Link>
      {user.role === 'admin' && <Link className="button button--light button--full" to="/sprava/uzivatele">UŽIVATELÉ</Link>}
    </div>}
    <OrdersList />
    <button className="text-button account-logout" onClick={() => void logout()}>{t('logout')}</button>
  </AuthShell>
}

function OrdersList() {
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest<{ orders: OrderSummary[] }>('/api/orders/mine')
      .then((response) => { if (active) setOrders(response.orders) })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Objednávky se nepodařilo načíst.') })
    return () => { active = false }
  }, [])

  return <section className="account-orders">
    <span className="eyebrow">ORDER_MEMORY / {String(orders.length).padStart(2, '0')}</span>
    <h2>MOJE OBJEDNÁVKY</h2>
    {error && <p className="form-error">{error}</p>}
    {!error && orders.length === 0 && <p>Zatím tu není žádná objednávka.</p>}
    {orders.map((order) => <article className="account-order" key={order.id}>
      <strong>{order.number}</strong>
      <span>{new Date(order.createdAt).toLocaleDateString('cs-CZ')}</span>
      <span>{order.status.toUpperCase()} / {order.paymentStatus.toUpperCase()}</span>
      <strong>{formatPrice(order.total)}</strong>
    </article>)}
  </section>
}

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="page-view auth-page"><div className="page-shell auth-shell"><span className="eyebrow">SECURE_CHANNEL / ACCOUNT</span><h1>{title}</h1>{children}<p className="security-note">Přihlášení používá serverovou relaci v zabezpečené HttpOnly cookie. Heslo se do prohlížeče neukládá.</p></div></div>
}
