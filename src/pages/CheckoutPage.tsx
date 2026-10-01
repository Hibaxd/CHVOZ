import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { formatPrice } from '../data/products'
import { useLanguage } from '../store/LanguageContext'
import { useCart } from '../store/CartContext'
import { BotChallenge } from '../components/BotChallenge'

type ShippingMethod = 'packeta' | 'ppl'
type PaymentMethod = 'bank_transfer' | 'cash_on_delivery'

interface OrderResult {
  order: {
    id: string
    number: string
    total: number
    status: string
    paymentStatus: string
    paymentMethod: PaymentMethod
    bankTransfer?: { accountNumber: string; variableSymbol: string }
  }
}

export function CheckoutPage() {
  const { t } = useLanguage()
  const { items, subtotal, loading: cartLoading, refetch } = useCart()
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('packeta')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery')
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false)
  const [order, setOrder] = useState<OrderResult['order'] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [botToken, setBotToken] = useState<string | null>(null)
  const [botRequired, setBotRequired] = useState(true)
  const [challengeGeneration, setChallengeGeneration] = useState(0)
  const idempotencyKey = useRef(crypto.randomUUID())
  const shippingPrice = useMemo(() => subtotal >= 2500 ? 0 : shippingMethod === 'packeta' ? 89 : 129, [shippingMethod, subtotal])

  useEffect(() => {
    apiRequest<{ payments: { bankTransfer: boolean } }>('/api/config')
      .then((config) => setBankTransferEnabled(config.payments.bankTransfer))
      .catch(() => setBankTransferEnabled(false))
  }, [])

  // Backend znovu načte ceny a sklad z databáze a objednávku vytvoří v jediné
  // transakci. Košík se na klientu obnoví až po potvrzeném uložení objednávky.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)

    try {
      const result = await apiRequest<OrderResult>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          email: String(form.get('email')),
          phone: String(form.get('phone')),
          firstName: String(form.get('firstName')),
          lastName: String(form.get('lastName')),
          address: String(form.get('address')),
          city: String(form.get('city')),
          zip: String(form.get('zip')),
          country: 'CZ',
          shippingMethod,
          paymentMethod,
          botToken,
          website: String(form.get('website') || ''),
        }),
        headers: { 'Idempotency-Key': idempotencyKey.current },
      })
      setOrder(result.order)
      await refetch()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Objednávku se nepodařilo uložit.')
      setBotToken(null)
      setChallengeGeneration((value) => value + 1)
    } finally {
      setSubmitting(false)
    }
  }

  if (order) {
    return (
      <div className="page-view page-shell checkout-success">
        <span className="record-dot">ORDER RECORDED / {order.number}</span>
        <h1>DÍKY.<br />SIGNÁL PŘIJAT.</h1>
        <p>Objednávka <strong>{order.number}</strong> byla bezpečně uložena. Celkem: <strong>{formatPrice(order.total)}</strong>.</p>
        {order.paymentMethod === 'bank_transfer' && order.bankTransfer && <p>
          Bankovní převod: <strong>{order.bankTransfer.accountNumber}</strong><br />
          Variabilní symbol: <strong>{order.bankTransfer.variableSymbol}</strong>
        </p>}
        {order.paymentMethod === 'cash_on_delivery' && <p>Platba proběhne při převzetí zásilky.</p>}
        <Link to="/ucet" className="button button--acid">Zobrazit moje objednávky</Link>
        <Link to="/" className="button button--light">Zpět na začátek</Link>
      </div>
    )
  }

  if (!cartLoading && items.length === 0) {
    return (
      <div className="page-view page-shell simple-message">
        <span>[ EMPTY CART ]</span>
        <h1>NENÍ CO ODESLAT.</h1>
        <Link to="/obchod" className="button button--light">Vybrat objekty</Link>
      </div>
    )
  }

  return (
    <div className="page-view checkout-page">
      <div className="page-shell checkout-grid">
        <form className="checkout-form" onSubmit={handleSubmit}>
          <span className="eyebrow">SECURE_CHANNEL / CHECKOUT</span>
          <h1>{t('checkout')}</h1>

          <fieldset>
            <legend>01 / {t('contact')}</legend>
            <label>E-mail<input required type="email" name="email" autoComplete="email" placeholder="name@domain.cz" /></label>
            <label>{t('phone')}<input required type="tel" name="phone" autoComplete="tel" placeholder="+420 000 000 000" /></label>
          </fieldset>

          <fieldset>
            <legend>02 / {t('delivery')}</legend>
            <div className="form-row">
              <label>{t('firstName')}<input required name="firstName" autoComplete="given-name" /></label>
              <label>{t('surname')}<input required name="lastName" autoComplete="family-name" /></label>
            </div>
            <label>{t('address')}<input required name="address" autoComplete="street-address" /></label>
            <div className="form-row">
              <label>{t('city')}<input required name="city" autoComplete="address-level2" /></label>
              <label>{t('zip')}<input required name="zip" autoComplete="postal-code" inputMode="numeric" /></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>03 / {t('shippingMethod')}</legend>
            <label className="radio-option"><input checked={shippingMethod === 'packeta'} onChange={() => setShippingMethod('packeta')} value="packeta" type="radio" name="shipping" /> {t('packeta')} <span>{subtotal >= 2500 ? t('free') : '89 Kč'}</span></label>
            <label className="radio-option"><input checked={shippingMethod === 'ppl'} onChange={() => setShippingMethod('ppl')} value="ppl" type="radio" name="shipping" /> {t('pplAddress')} <span>{subtotal >= 2500 ? t('free') : '129 Kč'}</span></label>
          </fieldset>

          <fieldset>
            <legend>04 / {t('payment')}</legend>
            <label className="radio-option"><input disabled={!bankTransferEnabled} checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} value="bank_transfer" type="radio" name="payment" /> {t('bankTransfer')} <span>{bankTransferEnabled ? '0 Kč' : t('notConfigured')}</span></label>
            <label className="radio-option"><input checked={paymentMethod === 'cash_on_delivery'} onChange={() => setPaymentMethod('cash_on_delivery')} value="cash_on_delivery" type="radio" name="payment" /> {t('cashOnDelivery')} <span>0 Kč</span></label>
            <p className="security-note">{t('gatewayNote')}</p>
          </fieldset>

          <label className="bot-field" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <BotChallenge key={challengeGeneration} action="checkout" onChange={(token, required) => { setBotToken(token); setBotRequired(required) }} />
          {error && <p className="form-error">{error}</p>}
          <button className="button button--acid button--full" disabled={submitting || cartLoading || (botRequired && !botToken)} type="submit">{submitting ? t('savingOrder') : t('completeOrder').toUpperCase()}</button>
        </form>

        <aside className="order-summary">
          <h2>{t('yourSelection')}</h2>
          {items.map((item) => <div className="order-line" key={item.id}>
            <img src={item.product.image} alt="" />
            <div><strong>{item.product.name}</strong><span>{item.size ?? t('oneSize')} × {item.quantity}</span></div>
            <span>{formatPrice(item.product.price * item.quantity)}</span>
          </div>)}
          <div className="order-total"><span>{t('subtotal').toUpperCase()}</span><strong>{formatPrice(subtotal)}</strong></div>
          <div className="order-total"><span>{t('shippingCost')}</span><strong>{shippingPrice ? formatPrice(shippingPrice) : t('free')}</strong></div>
          <div className="order-total"><span>{t('total')}</span><strong>{formatPrice(subtotal + shippingPrice)}</strong></div>
          <p>{t('serverPriceNote')}</p>
        </aside>
      </div>
    </div>
  )
}
