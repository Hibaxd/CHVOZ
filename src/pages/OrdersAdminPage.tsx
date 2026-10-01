import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'
import { useAuth } from '../store/AuthContext'
import { AdminShell } from './InventoryPage'

type OrderStatus = 'new' | 'processing' | 'shipped' | 'completed' | 'cancelled'
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

interface AdminOrder {
  id: string
  number: string
  total: number
  currency: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: string
  createdAt: string
}

interface AdminOrderDetail extends AdminOrder {
  email: string
  phone: string
  firstName: string
  lastName: string
  address: string
  city: string
  zip: string
  country: string
  shippingMethod: string
  shippingPrice: number
  subtotal: number
  items: Array<{
    id: string
    productName: string
    productCode: string
    unitPrice: number
    quantity: number
    size?: string
    subtotal: number
  }>
}

interface OrdersResponse {
  orders: AdminOrder[]
  total: number
}

const orderStatuses: OrderStatus[] = ['new', 'processing', 'shipped', 'completed', 'cancelled']
const paymentStatuses: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded']

const orderLabels: Record<OrderStatus, string> = {
  new: 'NOVÁ',
  processing: 'ZPRACOVÁVÁ SE',
  shipped: 'ODESLÁNA',
  completed: 'DOKONČENA',
  cancelled: 'ZRUŠENA',
}

const paymentLabels: Record<PaymentStatus, string> = {
  pending: 'ČEKÁ NA PLATBU',
  paid: 'ZAPLACENO',
  failed: 'PLATBA SELHALA',
  refunded: 'VRÁCENO',
}

const messageFrom = (error: unknown) =>
  error instanceof Error ? error.message : 'Objednávky se nepodařilo načíst.'

const formatTotal = (amount: number, currency: string) => new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency,
  maximumFractionDigits: 0,
}).format(amount)

export function OrdersAdminPage() {
  const { isStaff } = useAuth()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, AdminOrderDetail>>({})
  const [error, setError] = useState('')

  // Přehled načítá posledních sto objednávek; server znovu ověřuje zaměstnaneckou roli.
  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<OrdersResponse>('/api/admin/orders?limit=100&offset=0')
      setOrders(response.orders)
      setTotal(response.total)
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isStaff) void loadOrders()
  }, [isStaff, loadOrders])

  const changeStatus = async (
    order: AdminOrder,
    change: { status: OrderStatus } | { paymentStatus: PaymentStatus },
  ) => {
    setSavingId(order.id)
    setError('')
    try {
      const response = await apiRequest<{ order: AdminOrder }>(
        `/api/admin/orders/${encodeURIComponent(order.id)}/status`,
        { method: 'PATCH', body: JSON.stringify(change) },
      )
      setOrders((current) => current.map((item) => item.id === order.id ? response.order : item))
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setSavingId(null)
    }
  }

  const loadDetail = async (orderId: string) => {
    setSavingId(orderId)
    setError('')
    try {
      const response = await apiRequest<{ order: AdminOrderDetail }>(`/api/orders/${encodeURIComponent(orderId)}`)
      setDetails((current) => ({ ...current, [orderId]: response.order }))
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setSavingId(null)
    }
  }

  return <AdminShell eyebrow="STAFF_CHANNEL / ORDERS" title="OBJEDNÁVKY">
    <section className="admin-form" aria-busy={loading}>
      <div className="order-total">
        <span>CELKEM ZÁZNAMŮ</span>
        <strong>{String(total).padStart(2, '0')}</strong>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="form-message">NAČÍTÁM OBJEDNÁVKY…</p>}
      {!loading && orders.length === 0 && <p className="form-message">ZATÍM NEBYLA VYTVOŘENA ŽÁDNÁ OBJEDNÁVKA.</p>}

      {orders.map((order) => <article className="account-card" key={order.id}>
        <strong>#{order.number}</strong>
        <span>{new Date(order.createdAt).toLocaleString('cs-CZ')}</span>
        <span>{formatTotal(order.total, order.currency)} / {order.paymentMethod.toUpperCase().replaceAll('_', ' ')}</span>

        <button className="text-button" type="button" disabled={savingId === order.id} onClick={() => void loadDetail(order.id)}>
          {details[order.id] ? 'OBNOVIT DETAIL' : 'ZOBRAZIT DETAIL / ADRESU'}
        </button>

        {details[order.id] && <div className="admin-order-detail">
          <div><span className="micro-label">ZÁKAZNÍK</span><strong>{details[order.id].firstName} {details[order.id].lastName}</strong><span>{details[order.id].email}</span><span>{details[order.id].phone}</span></div>
          <div><span className="micro-label">DORUČENÍ / {details[order.id].shippingMethod.toUpperCase()}</span><strong>{details[order.id].address}</strong><span>{details[order.id].zip} {details[order.id].city}, {details[order.id].country}</span></div>
          <div className="admin-order-detail__items"><span className="micro-label">POLOŽKY</span>{details[order.id].items.map((item) => <span key={item.id}>{item.quantity}× {item.productName} {item.size ? `/ ${item.size}` : ''} — {formatTotal(item.subtotal, order.currency)}</span>)}</div>
        </div>}

        <div className="admin-form__grid">
          <label>STAV OBJEDNÁVKY
            <select
              value={order.status}
              disabled={savingId === order.id}
              onChange={(event) => void changeStatus(order, { status: event.target.value as OrderStatus })}
            >
              {orderStatuses.map((status) => <option value={status} key={status}>{orderLabels[status]}</option>)}
            </select>
          </label>
          <label>STAV PLATBY
            <select
              value={order.paymentStatus}
              disabled={savingId === order.id}
              onChange={(event) => void changeStatus(order, { paymentStatus: event.target.value as PaymentStatus })}
            >
              {paymentStatuses.map((status) => <option value={status} key={status}>{paymentLabels[status]}</option>)}
            </select>
          </label>
        </div>
        {savingId === order.id && <span className="form-message">UKLÁDÁM ZMĚNU…</span>}
      </article>)}

      <button className="button button--light" type="button" disabled={loading} onClick={() => void loadOrders()}>
        OBNOVIT OBJEDNÁVKY
      </button>
    </section>
  </AdminShell>
}
