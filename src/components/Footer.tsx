import { Link } from 'react-router-dom'
import { useLanguage } from '../store/LanguageContext'

export function Footer() {
  const { t } = useLanguage()
  return (
    <footer className="site-footer">
      <div className="page-shell footer-grid">
        {/* Značkový blok nahrazuje generický popisek z původního e-shopu. */}
        <div className="footer-brand">
          <span className="footer-kicker">CHVOZ / EST. 2023</span>
          <strong>WE MAKE OBJECTS<br />FOR THE IN-BETWEEN.</strong>
        </div>

        <div>
          <span className="footer-label">{t('information')}</span>
          <Link to="/o-nas">{t('about')}</Link>
          <Link to="/doprava-a-platba">{t('shipping')}</Link>
          <a href="mailto:studio@chvoz.cz">studio@chvoz.cz</a>
        </div>

        <div>
          <span className="footer-label">{t('contacts')}</span>
          <a href="https://www.instagram.com/chvo.z.z.zt/" target="_blank" rel="noreferrer">Instagram ↗</a>
          <a href="https://www.youtube.com/@CHVOZTUDIO" target="_blank" rel="noreferrer">YouTube ↗</a>
          <a href="https://www.tiktok.com/@chvozzz" target="_blank" rel="noreferrer">TikTok ↗</a>
        </div>
      </div>

      <div className="page-shell footer-bottom">
        <span>© {new Date().getFullYear()} CHVOZ STUDIO</span>
      </div>
    </footer>
  )
}
