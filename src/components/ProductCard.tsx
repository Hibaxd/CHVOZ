import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../data/products'
import { useCart } from '../store/CartContext'
import type { Product } from '../types/shop'
import { ArrowIcon } from './Icons'
import { useLanguage } from '../store/LanguageContext'

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const [size, setSize] = useState(product.sizes?.[0])
  const { addItem } = useCart()
  const { t } = useLanguage()

  return (
    <article className={`product-card product-card--delay-${Math.min(index, 7)}`}>
      <Link to={`/obchod/${product.slug}`} className="product-card__image-link">
        <div className="product-card__image-wrap">
          <img src={product.image} alt={product.name} loading="lazy" />
          <span className="product-card__edition">{product.edition}</span>
          <span className="product-card__open">DETAIL <ArrowIcon /></span>
        </div>
      </Link>

      <div className="product-card__body">
        <div className="product-card__headline">
          <div>
            <span className="micro-label">{product.code} / {product.category}</span>
            <h2><Link to={`/obchod/${product.slug}`}>{product.name}</Link></h2>
          </div>
          <strong>{formatPrice(product.price)}</strong>
        </div>

        <p>{product.description}</p>

        <div className="product-card__buy">
          {product.sizes ? (
            <label className="size-select">
              <span>{t('size')}</span>
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                {product.sizes.map((productSize) => (
                  <option key={productSize} value={productSize}>{productSize}</option>
                ))}
              </select>
            </label>
          ) : (
            <span className="stock-label">
              {product.stock <= 5 ? `${t('last')} ${product.stock} KS` : t('inStock')}
            </span>
          )}
          <button className="button button--light" onClick={() => addItem(product.id, size)}>
            {t('addToCart')}
          </button>
        </div>
      </div>
    </article>
  )
}
