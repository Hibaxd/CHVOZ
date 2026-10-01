import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../store/AuthContext'
import { useCart } from '../store/CartContext'
import { useLanguage, type Language } from '../store/LanguageContext'
import { BagIcon, UserIcon } from './Icons'

const tickerMessages = ['TURN.CHAOS.INTO.CHVOZ', 'PROMĚŇ.CHAOS.V.CHVOZ', 'VERWANDLE.CHAOS.IN.CHVOZ', 'ZAMIEŃ.CHAOS.W.CHVOZ', 'CONVIERTE.CAOS.EN.CHVOZ']

export function Header() {
  const { itemCount, openCart } = useCart()
  const { user, isStaff } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  return <header className="site-header">
    {/* Dvě stejné skupiny vytvářejí plynulý ticker bez prázdného konce. */}
    <div className="ticker" aria-label="CHVOZ signal"><div className="ticker__track">
      {[false, true].map((copy) => <div className="ticker__group" aria-hidden={copy || undefined} key={String(copy)}>{tickerMessages.map((message) => <span key={`${copy}-${message}`}>{message}</span>)}</div>)}
    </div></div>

    <div className="nav-shell page-shell">
      <Link to="/" className="brand" aria-label="CHVOZ — domů">
        <img src="/assets/chvoz-logo-header.png" alt="CHVOZ" />
      </Link>

      {/* Zaměstnanecká navigace se vykreslí pouze adminovi a managerovi. */}
      {isStaff && <nav className="staff-nav" aria-label="Správa obsahu">
        <NavLink to="/sprava/naskladneni">{t('inventory')}</NavLink><NavLink to="/sprava/galerie">{t('gallery')}</NavLink><NavLink to="/sprava/archiv">{t('archive')}</NavLink><NavLink to="/sprava/objednavky">OBJEDNÁVKY</NavLink>{user?.role === 'admin' && <NavLink to="/sprava/uzivatele">UŽIVATELÉ</NavLink>}
      </nav>}

      <div className="nav-actions">
        <div className="language-switch" aria-label="Language">{(['cs', 'en', 'de'] as Language[]).map((item) => <button className={language === item ? 'is-active' : ''} onClick={() => setLanguage(item)} key={item}>{item.toUpperCase()}</button>)}</div>
        <Link className="account-link" to={user ? '/ucet' : '/prihlaseni'} aria-label={user ? `${t('account')} / ${user.username}` : t('login')}>
          <UserIcon className="account-link__icon" />
          <span className="account-link__text">{user ? `${t('account')} / ${user.username}` : t('login')}</span>
        </Link>
        <button className="icon-button cart-button" onClick={openCart} aria-label="Otevřít košík"><BagIcon /><span className="cart-button__count">{String(itemCount).padStart(2, '0')}</span></button>
      </div>
    </div>
  </header>
}
