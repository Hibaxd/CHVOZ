import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../lib/api'
import { useAuth, type Role } from '../store/AuthContext'
import { AdminShell } from './InventoryPage'

interface AdminUser {
  id: string
  username: string
  email: string
  role: Role
  createdAt?: string
  lastLoginAt?: string | null
}

const roles: Role[] = ['admin', 'manager', 'customer']
const roleLabels: Record<Role, string> = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  customer: 'CUSTOMER',
}

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : 'Uživatelský účet se nepodařilo upravit.'

export function UsersAdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<{ users: AdminUser[] }>('/api/admin/users')
      setUsers(response.users)
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') void loadUsers()
    else setLoading(false)
  }, [loadUsers, user?.role])

  // Vytváření managera probíhá výhradně přes admin API; heslo se v prohlížeči neukládá.
  const createManager = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    setMessage('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await apiRequest<{ user: AdminUser }>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: String(form.get('username')).trim(),
          email: String(form.get('email')).trim(),
          password: String(form.get('password')),
          role: 'manager',
        }),
      })
      formElement.reset()
      setMessage('MANAGER BYL VYTVOŘEN A ULOŽEN DO DATABÁZE.')
      await loadUsers()
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setCreating(false)
    }
  }

  const changeRole = async (target: AdminUser, role: Role) => {
    setError('')
    setMessage('')
    if (target.id === user?.id && role !== 'admin') {
      setError('Vlastnímu administrátorskému účtu nelze odebrat roli ADMIN.')
      return
    }

    setSavingId(target.id)
    try {
      const response = await apiRequest<{ user: AdminUser }>(
        `/api/admin/users/${encodeURIComponent(target.id)}`,
        { method: 'PATCH', body: JSON.stringify({ role }) },
      )
      setUsers((current) => current.map((item) => item.id === target.id ? { ...item, role: response.user.role } : item))
      setMessage(`ROLE UŽIVATELE ${target.username.toUpperCase()} BYLA ZMĚNĚNA.`)
    } catch (requestError) {
      // Zobrazí se i serverová ochrana posledního administrátora nebo vlastní role.
      setError(messageFrom(requestError))
    } finally {
      setSavingId(null)
    }
  }

  if (user?.role !== 'admin') {
    return <AdminShell eyebrow="ADMIN_CHANNEL / USERS" title="UŽIVATELÉ">
      <div className="admin-form"><p className="form-error">TATO SEKCE JE DOSTUPNÁ POUZE ADMINISTRÁTOROVI.</p></div>
    </AdminShell>
  }

  return <AdminShell eyebrow="ADMIN_CHANNEL / USERS" title="UŽIVATELÉ">
    <form className="admin-form" onSubmit={createManager}>
      <span className="eyebrow">CREATE_MANAGER / NEW ACCOUNT</span>
      <div className="admin-form__grid">
        <label>UŽIVATELSKÉ JMÉNO<input name="username" required minLength={3} autoComplete="off" /></label>
        <label>E-MAIL<input name="email" required type="email" autoComplete="off" /></label>
        <label className="admin-form__wide">DOČASNÉ HESLO<input name="password" required type="password" minLength={8} autoComplete="new-password" /></label>
      </div>
      <button className="button button--acid" type="submit" disabled={creating}>{creating ? 'VYTVÁŘÍM…' : 'VYTVOŘIT MANAGERA'}</button>
    </form>

    <section className="admin-form" aria-busy={loading}>
      <span className="eyebrow">DATABASE_USERS / {String(users.length).padStart(2, '0')}</span>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-message" role="status">{message}</p>}
      {loading && <p className="form-message">NAČÍTÁM UŽIVATELE…</p>}

      {users.map((account) => <article className="account-card" key={account.id}>
        <strong>{account.username}</strong>
        <span>{account.email}</span>
        {account.createdAt && <span>VYTVOŘENO / {new Date(account.createdAt).toLocaleDateString('cs-CZ')}</span>}
        <label>ROLE
          <select
            value={account.role}
            disabled={savingId === account.id || account.id === user.id}
            onChange={(event) => void changeRole(account, event.target.value as Role)}
          >
            {roles.map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}
          </select>
        </label>
        {account.id === user.id && <span className="form-message">CURRENT_ADMIN / ROLE LOCKED</span>}
        {savingId === account.id && <span className="form-message">UKLÁDÁM ZMĚNU…</span>}
      </article>)}
    </section>
  </AdminShell>
}
