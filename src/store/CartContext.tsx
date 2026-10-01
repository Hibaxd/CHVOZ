import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiRequest } from '../lib/api'
import type { CartItem } from '../types/shop'
import { useAuth } from './AuthContext'

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  subtotal: number
  isCartOpen: boolean
  loading: boolean
  error: string | null
  addItem: (productId: string, size?: string) => Promise<void>
  removeItem: (productId: string, size?: string) => Promise<void>
  updateQuantity: (productId: string, size: string | undefined, quantity: number) => Promise<void>
  clearCart: () => Promise<void>
  refetch: () => Promise<void>
  openCart: () => void
  closeCart: () => void
}

interface CartResponse {
  items: CartItem[]
  count: number
  subtotal: number
}

const CartContext = createContext<CartContextValue | null>(null)
const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Košík se nepodařilo aktualizovat.'

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [itemCount, setItemCount] = useState(0)
  const [subtotal, setSubtotal] = useState(0)
  const [isCartOpen, setCartOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Server je jediným zdrojem pravdy pro položky, dostupnost i finanční součty.
  const applyCart = useCallback((cart: CartResponse) => {
    setItems(cart.items)
    setItemCount(cart.count)
    setSubtotal(cart.subtotal)
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      applyCart(await apiRequest<CartResponse>('/api/cart'))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [applyCart])

  // Po změně identity server spojí anonymní a uživatelský košík a vrátí aktuální stav.
  useEffect(() => {
    if (!authLoading) void refetch()
  }, [authLoading, refetch, user?.id])

  const runMutation = useCallback(async (path: string, options: RequestInit) => {
    setLoading(true)
    setError(null)
    try {
      applyCart(await apiRequest<CartResponse>(path, options))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [applyCart])

  const addItem = useCallback(async (productId: string, size?: string) => {
    setCartOpen(true)
    await runMutation('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, size, quantity: 1 }),
    })
  }, [runMutation])

  const removeItem = useCallback(async (productId: string, size?: string) => {
    const item = items.find((entry) => entry.productId === productId && entry.size === size)
    if (!item) return
    await runMutation(`/api/cart/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
  }, [items, runMutation])

  const updateQuantity = useCallback(async (
    productId: string,
    size: string | undefined,
    quantity: number,
  ) => {
    if (quantity <= 0) {
      await removeItem(productId, size)
      return
    }
    const item = items.find((entry) => entry.productId === productId && entry.size === size)
    if (!item) return
    await runMutation(`/api/cart/items/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    })
  }, [items, removeItem, runMutation])

  const clearCart = useCallback(async () => {
    await runMutation('/api/cart', { method: 'DELETE' })
  }, [runMutation])

  const value = useMemo<CartContextValue>(() => ({
    items,
    itemCount,
    subtotal,
    isCartOpen,
    loading,
    error,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    refetch,
    openCart: () => setCartOpen(true),
    closeCart: () => setCartOpen(false),
  }), [addItem, clearCart, error, isCartOpen, itemCount, items, loading, refetch, removeItem, subtotal, updateQuantity])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart musí být použit uvnitř CartProvider')
  return context
}
