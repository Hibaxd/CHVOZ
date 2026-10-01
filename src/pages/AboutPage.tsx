import { Link } from 'react-router-dom'
import { useLanguage } from '../store/LanguageContext'

export function AboutPage() {
  const { t } = useLanguage()
  return <div className="page-view text-page"><div className="page-shell text-page__grid">
    <div><span className="eyebrow">ABOUT / MANIFEST</span><h1>{t('aboutTitle').split('\n').map((line) => <span key={line}>{line}<br /></span>)}</h1></div>
    <div className="prose-card"><p className="lead">{t('aboutLead')}</p><p>{t('aboutP1')}</p><p>{t('aboutP2')}</p><blockquote>TURN CHAOS INTO CHVOZ.</blockquote><Link to="/obchod" className="button button--acid">{t('currentDrop')}</Link></div>
  </div></div>
}
