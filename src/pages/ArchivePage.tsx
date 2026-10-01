import { Link } from 'react-router-dom'
import { useContent } from '../store/ContentContext'
import { useLanguage } from '../store/LanguageContext'

export function ArchivePage() {
  const { archive, loading, error } = useContent()
  const { t } = useLanguage()
  return (
    <div className="page-view archive-page">
      <div className="page-shell">
        <header className="page-heading page-heading--split">
          <div>
            <span className="eyebrow">CHANNEL 02 / MEMORY_FILES</span>
            <h1>{t('archive')}</h1>
          </div>
        </header>

        {/* Archiv funguje jako vertikální seznam desek; obraz se odhalí až při najetí. */}
        {loading && <p className="form-message">[ LOADING_MEMORY ]</p>}
        {error && <p className="form-message">{error}</p>}
        <div className="archive-list">
          {archive.map((drop, index) => (
            <article className="archive-row" key={`${drop.year}-${drop.code}`}>
              <span className="archive-row__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="archive-row__year">{drop.year}</span>
              <div className="archive-row__title">
                <span>{drop.code}</span>
                <h2>{drop.title}</h2>
              </div>
              <span className="archive-row__pieces">{drop.pieces}</span>
              <span className="archive-row__status">[ {t('soldOut')} ]</span>
              <img src={drop.image} alt="" aria-hidden="true" />
            </article>
          ))}
        </div>

        <div className="archive-note">
          <span>END_OF_TAPE</span>
          <p>{t('archiveQuestion')}</p>
          <Link to="/obchod" className="button button--light">{t('currentObjects')}</Link>
        </div>
      </div>
    </div>
  )
}
