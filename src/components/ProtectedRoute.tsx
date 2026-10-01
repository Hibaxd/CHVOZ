import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../store/AuthContext'

// Zaměstnanecké obrazovky se bez role admin/manager přesměrují na přihlášení.
export function ProtectedRoute() {
  const { isStaff, loading, error, refetch } = useAuth()
  const location = useLocation()

  // Router počká na ověření HttpOnly relace, aby přihlášeného uživatele neposlal omylem pryč.
  if (loading) {
    return <div className="page-view page-shell simple-message"><span>[ AUTH_CHANNEL / VERIFYING ]</span></div>
  }

  if (error) {
    return <div className="page-view page-shell simple-message">
      <span>[ AUTH_CHANNEL / OFFLINE ]</span>
      <p>{error}</p>
      <button className="button button--light" type="button" onClick={() => void refetch()}>ZKUSIT ZNOVU</button>
    </div>
  }

  return isStaff ? <Outlet /> : <Navigate to="/prihlaseni" replace state={{ from: location.pathname }} />
}
