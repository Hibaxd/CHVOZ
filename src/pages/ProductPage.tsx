import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowIcon, CloseIcon } from '../components/Icons'
import { formatPrice } from '../data/products'
import { useContent } from '../store/ContentContext'
import { useLanguage } from '../store/LanguageContext'
import { useCart } from '../store/CartContext'

export function ProductPage() {
  const { allProducts: products, loading, error } = useContent()
  const { t } = useLanguage()
  const { slug } = useParams()
  const product = products.find((item) => item.slug === slug)
  const [size, setSize] = useState(product?.sizes?.[0])
  const [activeImage, setActiveImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const { addItem } = useCart()
  const images = product ? (product.images?.length ? product.images : [product.image]) : []

  // Při navigaci mezi produkty se obnoví velikost i první fotografie.
  useEffect(() => {
    setSize(product?.sizes?.[0])
    setActiveImage(0)
    setLightboxOpen(false)
  }, [product])

  // Lightbox lze zavřít klávesou Escape a šipkami přepínat více fotografií.
  useEffect(() => {
    if (!lightboxOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxOpen(false)
      if (event.key === 'ArrowLeft') setActiveImage((current) => (current - 1 + images.length) % images.length)
      if (event.key === 'ArrowRight') setActiveImage((current) => (current + 1) % images.length)
    }
    document.body.classList.add('lightbox-is-open')
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('lightbox-is-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [images.length, lightboxOpen])

  if (loading) {
    return <div className="page-view page-shell simple-message"><span>[ LOADING_OBJECT ]</span></div>
  }

  if (error) {
    return <div className="page-view page-shell simple-message"><span>[ API_OFFLINE ]</span><p>{error}</p></div>
  }

  if (!product) {
    return <div className="page-view page-shell simple-message"><span>[ ERROR 404 ]</span><h1>OBJEKT NENALEZEN</h1><Link to="/obchod" className="button button--light">Zpět do obchodu</Link></div>
  }

  const previousImage = () => setActiveImage((current) => (current - 1 + images.length) % images.length)
  const nextImage = () => setActiveImage((current) => (current + 1) % images.length)

  return <div className="page-view product-detail-page">
    <div className="page-shell">
      <Link to="/obchod" className="back-link">← {t('backShop')}</Link>
      <article className="product-detail">
        <div className="product-detail__visual">
          {/* Hlavní fotografie funguje jako přístupné tlačítko pro otevření lightboxu. */}
          <button className="product-detail__image-button" type="button" onClick={() => setLightboxOpen(true)} aria-label={t('openImage')}>
            <img src={images[activeImage]} alt={product.name} />
            <span className="product-detail__zoom">{t('openImage')} / {String(activeImage + 1).padStart(2, '0')}</span>
          </button>
          <span className="corner corner--tl">{product.code}</span>
          <span className="corner corner--br">{product.edition}</span>
          {images.length > 1 && <div className="product-thumbnails" aria-label="Product images">
            {images.map((image, index) => <button type="button" className={index === activeImage ? 'is-active' : ''} onClick={() => setActiveImage(index)} key={`${index}-${image.slice(0, 30)}`} aria-label={`${t('openImage')} ${index + 1}`}><img src={image} alt="" /></button>)}
          </div>}
        </div>

        <div className="product-detail__content">
          <span className="eyebrow">{product.category} / {product.edition}</span>
          <h1>{product.name}</h1>
          <strong className="product-detail__price">{formatPrice(product.price)}</strong>
          <p className="product-detail__description">{product.description}</p>
          <ul className="detail-list">{product.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          {product.sizes && <fieldset className="size-options"><legend>{t('chooseSize')}</legend><div>{product.sizes.map((productSize) => <button type="button" key={productSize} className={size === productSize ? 'is-active' : undefined} onClick={() => setSize(productSize)}>{productSize}</button>)}</div></fieldset>}
          <button className="button button--acid button--full product-detail__add" onClick={() => addItem(product.id, size)}>{t('addToCart')} <ArrowIcon /></button>
          <div className="availability"><span className="availability__dot" />{t('inStock')} / 2—3 DAYS / {product.stock} KS</div>
        </div>
      </article>
    </div>

    {lightboxOpen && <div className="product-lightbox" role="dialog" aria-modal="true" aria-label={product.name}>
      <button className="product-lightbox__backdrop" type="button" onClick={() => setLightboxOpen(false)} aria-label={t('closeImage')} />
      <div className="product-lightbox__stage"><img src={images[activeImage]} alt={`${product.name} — ${activeImage + 1}`} /><span className="product-lightbox__counter">{String(activeImage + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span></div>
      <button className="product-lightbox__close" type="button" onClick={() => setLightboxOpen(false)} aria-label={t('closeImage')}><CloseIcon /></button>
      {images.length > 1 && <><button className="product-lightbox__arrow product-lightbox__arrow--prev" type="button" onClick={previousImage} aria-label={t('previousImage')}>←</button><button className="product-lightbox__arrow product-lightbox__arrow--next" type="button" onClick={nextImage} aria-label={t('nextImage')}>→</button></>}
    </div>}
  </div>
}
