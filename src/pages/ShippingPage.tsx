import { useLanguage } from '../store/LanguageContext'

export function ShippingPage() {
  const { language, t } = useLanguage()
  const blocks = [
    { number: '01', title: t('shipping'), text: t('shipping1') },
    { number: '02', title: t('payment'), text: t('shipping2') },
    { number: '03', title: t('dispatch'), text: t('shipping3') },
    { number: '04', title: t('returns'), text: t('shipping4') },
  ]
  return <div className="page-view info-page"><div className="page-shell">
    <header className="page-heading page-heading--split"><div><span className="eyebrow">SYSTEM INFO / {language.toUpperCase()}</span><h1>{t('shippingTitle').split('\n').map((line) => <span key={line}>{line}<br /></span>)}</h1></div><p>{t('shippingIntro')}</p></header>
    <div className="info-grid">{blocks.map((block) => <article key={block.number}><span>{block.number}</span><h2>{block.title}</h2><p>{block.text}</p></article>)}</div>
  </div></div>
}
