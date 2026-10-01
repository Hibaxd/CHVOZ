// Datový model produktu drží katalog typově bezpečný a snadno rozšiřitelný.
export type ProductCategory = 'oděv' | 'objekt' | 'doplněk'

export interface Product {
  id: string
  slug: string
  name: string
  code: string
  price: number
  image: string
  images?: string[]
  category: ProductCategory
  description: string
  details: string[]
  sizes?: string[]
  stock: number
  edition: string
  status?: 'available' | 'last-pieces'
}

// Obsah přidaný přes správu se ukládá lokálně a okamžitě se propíše do veřejných stránek.
export interface GalleryEntry {
  id: string
  title: string
  image: string
  year: string
}

export interface ArchiveEntry extends GalleryEntry {
  code: string
  pieces: string
}

// Položka košíku obsahuje jen proměnlivá data; produkt se dohledá v katalogu.
export interface CartItem {
  id: string
  productId: string
  size?: string
  quantity: number
  product: Product
}
