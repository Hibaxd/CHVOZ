import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiRequest } from '../lib/api'
import type { ArchiveEntry, GalleryEntry, Product } from '../types/shop'

interface CatalogResponse {
  products: Product[]
  gallery: GalleryEntry[]
  archive: ArchiveEntry[]
}

interface ContentValue extends CatalogResponse {
  allProducts: Product[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addProduct: (product: Omit<Product, 'id' | 'slug'> & Partial<Pick<Product, 'id' | 'slug'>>) => Promise<Product>
  addGalleryEntries: (entries: Array<Omit<GalleryEntry, 'id'> & Partial<Pick<GalleryEntry, 'id'>>>) => Promise<GalleryEntry[]>
  addArchiveEntries: (entries: Array<Omit<ArchiveEntry, 'id'> & Partial<Pick<ArchiveEntry, 'id'>>>) => Promise<ArchiveEntry[]>
  findProduct: (id: string) => Product | undefined
}

const emptyCatalog: CatalogResponse = { products: [], gallery: [], archive: [] }
const ContentContext = createContext<ContentValue | null>(null)

// Veřejný katalog se načítá z databáze. Po změně ve správě se lokální kopie
// aktualizuje odpovědí serveru, takže administrátor okamžitě vidí výsledek.
export function ContentProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<CatalogResponse>(emptyCatalog)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      setCatalog(await apiRequest<CatalogResponse>('/api/catalog'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Katalog se nepodařilo načíst.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo<ContentValue>(() => ({
    ...catalog,
    allProducts: catalog.products,
    loading,
    error,
    refresh,
    addProduct: async (product) => {
      const response = await apiRequest<{ product: Product }>('/api/products', {
        method: 'POST',
        body: JSON.stringify(product),
      })
      const created = response.product
      setCatalog((current) => ({ ...current, products: [...current.products, created] }))
      return created
    },
    addGalleryEntries: async (entries) => {
      if (!entries.length) return []
      const response = await apiRequest<{ entries: GalleryEntry[] }>('/api/gallery', {
        method: 'POST',
        body: JSON.stringify({
          title: entries[0].title,
          year: entries[0].year,
          images: entries.map((entry) => entry.image),
        }),
      })
      const created = response.entries
      setCatalog((current) => ({ ...current, gallery: [...current.gallery, ...created] }))
      return created
    },
    addArchiveEntries: async (entries) => {
      if (!entries.length) return []
      const response = await apiRequest<{ entries: ArchiveEntry[] }>('/api/archive', {
        method: 'POST',
        body: JSON.stringify({
          title: entries[0].title,
          year: entries[0].year,
          code: entries[0].code,
          pieces: entries[0].pieces,
          images: entries.map((entry) => entry.image),
        }),
      })
      const created = response.entries
      setCatalog((current) => ({ ...current, archive: [...current.archive, ...created] }))
      return created
    },
    findProduct: (id) => catalog.products.find((product) => product.id === id),
  }), [catalog, error, loading, refresh])

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
}

export function useContent() {
  const context = useContext(ContentContext)
  if (!context) throw new Error('useContent musí být uvnitř ContentProvider')
  return context
}
