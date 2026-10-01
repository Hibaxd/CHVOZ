import { useContent } from '../store/ContentContext'
import { useLanguage } from '../store/LanguageContext'

export function GalleryPage() {
  const { gallery, loading, error } = useContent()
  const { t } = useLanguage()
  return (
    <div className="page-view gallery-page">
      <div className="page-shell">
        <header className="page-heading page-heading--split">
          <div>
            <span className="eyebrow">CHANNEL 03 / VISUAL_LOG</span>
            <h1>{t('gallery')}</h1>
          </div>
        </header>

        {/* Nepravidelná mřížka působí jako rozložený kontaktní list z filmu. */}
        {loading && <p className="form-message">[ LOADING_SIGNAL ]</p>}
        {error && <p className="form-message">{error}</p>}
        <div className="gallery-grid">
          {gallery.map((item, index) => (
            <figure className={`gallery-item ${index % 5 === 0 ? 'gallery-item--wide' : index % 5 === 2 ? 'gallery-item--tall' : ''}`} key={item.id}>
              <img src={item.image} alt={item.title.replaceAll('_', ' ')} loading="lazy" />
              <figcaption>
                <span>{String(index + 1).padStart(2, '0')} / {item.title}</span>
                <span>{item.year}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
