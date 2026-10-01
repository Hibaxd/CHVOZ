import { useMemo, useState } from 'react'
import { ProductCard } from '../components/ProductCard'
import { useContent } from '../store/ContentContext'
import type { ProductCategory } from '../types/shop'
import { useLanguage } from '../store/LanguageContext'

type Filter = 'vše' | ProductCategory
const filters: Filter[] = ['vše', 'oděv', 'objekt', 'doplněk']

export function ShopPage() {
  const { allProducts: products, loading, error } = useContent()
  const { t } = useLanguage()
  const filterLabels: Record<Filter, string> = { 'vše': t('all'), 'oděv': t('apparel'), 'objekt': t('object'), 'doplněk': t('accessory') }
  const [filter, setFilter] = useState<Filter>('vše')
  const visibleProducts = useMemo(
    () => products.filter((product) => filter === 'vše' || product.category === filter),
    [filter, products],
  )

  return (
    <div className="page-view shop-page">
      <div className="page-shell">
        {/* Hlavička katalogu obsahuje filtry i počet právě zobrazených kusů. */}
        <header className="page-heading page-heading--split">
          <div>
            <span className="eyebrow">CHANNEL_01 / {t('available')}</span>
            <h1>{t('shop')}</h1>
          </div>
        </header>

        <div className="shop-toolbar">
          <div className="filter-list" role="group" aria-label="Filtrovat produkty">
            {filters.map((item) => (
              <button
                key={item}
                className={filter === item ? 'is-active' : undefined}
                onClick={() => setFilter(item)}
              >
                {filterLabels[item]}
              </button>
            ))}
          </div>
          <span>{String(visibleProducts.length).padStart(2, '0')} {t('objects')}</span>
        </div>

        {loading && <p className="form-message">[ LOADING_OBJECTS ]</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="product-grid">
          {visibleProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
