import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { CartDrawer } from './CartDrawer'
import { Footer } from './Footer'
import { Header } from './Header'

export function Layout() {
  const location = useLocation()

  // Každá nová route začíná nahoře, stejně jako samostatná HTML stránka.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="app-frame">
      {/* Pevná scéna a CRT vrstvy jsou společné pro všechny stránky. */}
      <div className="scene" aria-hidden="true" />
      <div className="crt-overlay" aria-hidden="true" />
      <a className="skip-link" href="#main-content">Přejít na obsah</a>
      <Header />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </div>
  )
}
