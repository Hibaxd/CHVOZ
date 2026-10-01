import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiRequest } from '../lib/api'

export type Role = 'admin' | 'manager' | 'customer'
export interface SessionUser { id: string; username: string; email?: string; role: Role }

interface AuthResponse { user: SessionUser | null }
interface AuthValue {
  user: SessionUser | null
  login: (identifier: string, password: string) => Promise<boolean>
  register: (username: string, email: string, password: string, botToken?: string, website?: string) => Promise<string | null>
  logout: () => Promise<void>
  isStaff: boolean
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)
const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Požadavek se nepodařilo dokončit.'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Relace je uložena v HttpOnly cookie, proto se aktuální uživatel načte ze serveru.
  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiRequest<AuthResponse>('/api/auth/me')
      setUser(response.user)
    } catch (requestError) {
      setUser(null)
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const login = useCallback(async (identifier: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      })
      setUser(response.user)
      return Boolean(response.user)
    } catch (requestError) {
      setError(errorMessage(requestError))
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const register = useCallback(async (username: string, email: string, password: string, botToken?: string, website?: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiRequest<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, botToken, website }),
      })
      setUser(response.user)
      return null
    } catch (requestError) {
      const message = errorMessage(requestError)
      setError(message)
      return message
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await apiRequest<{ ok: true }>('/api/auth/logout', { method: 'POST' })
      setUser(null)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  const value = useMemo<AuthValue>(() => ({
    user,
    login,
    register,
    logout,
    isStaff: user?.role === 'admin' || user?.role === 'manager',
    loading,
    error,
    refetch,
  }), [error, loading, login, logout, refetch, register, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth musí být uvnitř AuthProvider')
  return context
}
