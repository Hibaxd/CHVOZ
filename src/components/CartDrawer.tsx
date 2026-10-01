import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../data/products'
import { useCart } from '../store/CartContext'
import { CloseIcon, MinusIcon, PlusIcon } from './Icons'
import { useLanguage } from '../store/LanguageContext'

export function CartDrawer() {
  const { t } = useLanguage()
  const {
    items,
    itemCount,
    subtotal,
    isCartOpen,
    closeCart,
    removeItem,
    updateQuantity,
    loading,
    error,
  } = useCart()

  // Escape zavře panel a během otevření se nepohybuje obsah pod ním.
  useEffect(() => {
    if (!isCartOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCart()
    }
    document.body.classList.add('cart-is-open')
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.classList.remove('cart-is-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeCart, isCartOpen])

  return (
    <>
      <button
        className={`cart-backdrop ${isCartOpen ? 'is-visible' : ''}`}
        onClick={closeCart}
        aria-label="Zavřít košík"
        tabIndex={isCartOpen ? 0 : -1}
      />

      <aside
        className={`cart-drawer ${isCartOpen ? 'is-open' : ''}`}
        aria-hidden={!isCartOpen}
        aria-label="Nákupní košík"
      >
        <div className="cart-drawer__head">
          <span>{t('cart')} / {String(itemCount).padStart(2, '0')}</span>
          <button className="icon-button" onClick={closeCart} aria-label="Zavřít košík">
            <CloseIcon />
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {loading && <span className="micro-label">[ SYNCING_CART ]</span>}

        {/* Prázdný stav má vlastní výzvu, aby cesta uživatele nekončila slepě. */}
        {items.length === 0 ? (
          <div className="empty-cart">
            <span className="empty-cart__signal">[ NO SIGNAL ]</span>
            <p>{t('emptyCart')}</p>
            <Link to="/obchod" onClick={closeCart} className="button button--light">
              {t('browse')}
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {items.map((item) => {
                const product = item.product

                return (
                  <article className="cart-item" key={item.id}>
                    <img src={product.image} alt={product.name} />
                    <div className="cart-item__info">
                      <div>
                        <span className="micro-label">{product.code}</span>
                        <h3>{product.name}</h3>
                        {item.size && <span className="cart-item__size">VELIKOST / {item.size}</span>}
                      </div>

                      <div className="cart-item__controls">
                        <div className="quantity-control" aria-label="Počet kusů">
                          <button
                            onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)}
                            aria-label="Odebrat jeden kus"
                          >
                            <MinusIcon />
                          </button>
                          <span>{String(item.quantity).padStart(2, '0')}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)}
                            aria-label="Přidat jeden kus"
                          >
                            <PlusIcon />
                          </button>
                        </div>
                        <strong>{formatPrice(product.price * item.quantity)}</strong>
                      </div>

                      <button
                        className="text-button"
                        onClick={() => removeItem(item.productId, item.size)}
                      >
                        {t('remove')}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="cart-summary">
              <div><span>{t('subtotal')}</span><strong>{formatPrice(subtotal)}</strong></div>
              <p>{t('shippingNext')}</p>
              <Link to="/pokladna" onClick={closeCart} className="button button--acid button--full">
                {t('toCheckout')}
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
