import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword } from './security.mjs'

export async function openDatabase(config) {
  mkdirSync(dirname(config.databasePath), { recursive: true })
  mkdirSync(config.uploadsDirectory, { recursive: true })
  const database = new DatabaseSync(config.databasePath)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA trusted_schema = OFF;')
  database.exec(schema)
  ensureColumn(database, 'orders', 'payment_method', "TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'cash_on_delivery'))")
  ensureColumn(database, 'orders', 'stock_restored', 'INTEGER NOT NULL DEFAULT 0 CHECK (stock_restored IN (0, 1))')
  ensureColumn(database, 'orders', 'idempotency_key_hash', 'TEXT')
  ensureColumn(database, 'orders', 'idempotency_payload_hash', 'TEXT')
  ensureColumn(database, 'orders', 'source_cart_id', 'TEXT')
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_idx ON orders(idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;')
  seedCatalog(database)
  await seedAdmin(database, config)
  purgeExpired(database)
  return database
}

export function purgeExpired(database) {
  const now = Date.now()
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  database.prepare('DELETE FROM carts WHERE expires_at <= ? AND converted_order_id IS NULL').run(now)
  database.prepare('DELETE FROM carts WHERE converted_order_id IS NOT NULL AND updated_at <= ?').run(now - 30 * 24 * 60 * 60 * 1000)
}

async function seedAdmin(database, config) {
  const existingAdmin = database.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
  if (existingAdmin || (!config.adminPassword && !config.adminPasswordSha256)) return
  const now = Date.now()
  const passwordHash = config.adminPassword
    ? await hashPassword(config.adminPassword)
    : `sha256$${config.adminPasswordSha256}`
  database.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', ?, ?)
  `).run(randomUUID(), config.adminUsername, config.adminEmail, passwordHash, now, now)
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((entry) => entry.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function seedCatalog(database) {
  const insertProduct = database.prepare(`
    INSERT OR IGNORE INTO products
      (id, slug, name, code, price, image, images_json, category, description, details_json, sizes_json, stock, edition, status, active, created_at, updated_at)
    VALUES
      (:id, :slug, :name, :code, :price, :image, :images, :category, :description, :details, :sizes, :stock, :edition, :status, 1, :now, :now)
  `)
  const now = Date.now()
  for (const product of seedProducts) insertProduct.run({
    ...product,
    images: JSON.stringify([product.image]),
    details: JSON.stringify(product.details),
    sizes: product.sizes ? JSON.stringify(product.sizes) : null,
    status: product.status || 'available',
    now,
  })

  const galleryInsert = database.prepare('INSERT OR IGNORE INTO gallery (id, title, image, year, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const entry of seedGallery) galleryInsert.run(entry.id, entry.title, entry.image, entry.year, now)
  const archiveInsert = database.prepare('INSERT OR IGNORE INTO archive (id, title, image, year, code, pieces, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const entry of seedArchive) archiveInsert.run(entry.id, entry.title, entry.image, entry.year, entry.code, entry.pieces, now)
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'manager', 'customer')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  image TEXT NOT NULL,
  images_json TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('oděv', 'objekt', 'doplněk')),
  description TEXT NOT NULL,
  details_json TEXT NOT NULL,
  sizes_json TEXT,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  edition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'last-pieces')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS products_active_idx ON products(active, created_at);

CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image TEXT NOT NULL,
  year TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS archive (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image TEXT NOT NULL,
  year TEXT NOT NULL,
  code TEXT NOT NULL,
  pieces TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  converted_order_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS carts_expiry_idx ON carts(expires_at);
CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  size TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 99),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (cart_id, product_id, size)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CZ',
  shipping_method TEXT NOT NULL CHECK (shipping_method IN ('packeta', 'ppl')),
  shipping_price INTEGER NOT NULL CHECK (shipping_price >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'CZK',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processing', 'shipped', 'completed', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'cash_on_delivery')),
  stock_restored INTEGER NOT NULL DEFAULT 0 CHECK (stock_restored IN (0, 1)),
  idempotency_key_hash TEXT,
  idempotency_payload_hash TEXT,
  source_cart_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL,
  subtotal INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
`

const seedProducts = [
  { id: 'signal-hoodie', slug: 'signal-hoodie-01', name: 'SIGNAL HOODIE 01', code: 'OBJ_001', price: 2490, image: '/assets/product-hoodie.webp', category: 'oděv', description: 'Těžká oversized mikina s vyšívanou signální stopou na hrudi.', details: ['460 g/m² bavlna', 'Oversized střih', 'Sítotisk + výšivka', 'Vyrobeno v ČR'], sizes: ['S', 'M', 'L', 'XL'], stock: 8, edition: 'DROP_01 / 2026' },
  { id: 'passage-tee', slug: 'passage-tee-02', name: 'PASSAGE TEE 02', code: 'OBJ_002', price: 990, image: '/assets/product-tee.webp', category: 'oděv', description: 'Washed black tričko s vrstevnicovou kresbou přes spodní lem.', details: ['240 g/m² bavlna', 'Boxy střih', 'Ručně tažený sítotisk', 'Unisex'], sizes: ['S', 'M', 'L', 'XL'], stock: 14, edition: 'DROP_01 / 2026' },
  { id: 'chrome-links', slug: 'chrome-links-keychain', name: 'CHROME LINKS', code: 'OBJ_003', price: 790, image: '/assets/product-keychain.webp', category: 'objekt', description: 'Surový kovový přívěsek odlévaný v malé číslované sérii.', details: ['Ruční odlitek', 'Nerezová ocel', 'Každý kus je originál', 'Délka 18 cm'], stock: 5, edition: 'SERIES_06 / 30 PCS', status: 'last-pieces' },
  { id: 'echo-cap', slug: 'echo-cap-03', name: 'ECHO CAP 03', code: 'OBJ_004', price: 890, image: '/assets/product-cap.webp', category: 'doplněk', description: 'Šestipanelová čepice s výšivkou rozbitého signálu.', details: ['100% bavlna', 'Kovové zapínání', 'Výšivka v Praze', 'Unisex'], stock: 11, edition: 'DROP_01 / 2026' },
]

const seedGallery = [
  { id: 'gallery-passage-01', title: 'PASSAGE_01', image: '/assets/chvoz-tunnel.webp', year: '2026' },
  { id: 'gallery-object-study-06', title: 'OBJECT_STUDY_06', image: '/assets/product-keychain.webp', year: '2026' },
  { id: 'gallery-drop-test-02', title: 'DROP_TEST_02', image: '/assets/product-tee.webp', year: '2026' },
  { id: 'gallery-echo-frame-14', title: 'ECHO_FRAME_14', image: '/assets/product-cap.webp', year: '2026' },
  { id: 'gallery-signal-fitting-03', title: 'SIGNAL_FITTING_03', image: '/assets/product-hoodie.webp', year: '2026' },
  { id: 'gallery-no-signal-00', title: 'NO_SIGNAL_00', image: '/assets/chvoz-tunnel.webp', year: '2026' },
]

const seedArchive = [
  { id: 'archive-drop-00', year: '2026', code: 'DROP_00', title: 'DEAD FREQUENCY', image: '/assets/product-hoodie.webp', pieces: '08 OBJECTS' },
  { id: 'archive-series-05', year: '2025', code: 'SERIES_05', title: 'NIGHT PASSAGE', image: '/assets/product-tee.webp', pieces: '13 OBJECTS' },
  { id: 'archive-drop-03', year: '2024', code: 'DROP_03', title: 'FALSE MEMORY', image: '/assets/chvoz-tunnel.webp', pieces: '06 OBJECTS' },
  { id: 'archive-series-02', year: '2023', code: 'SERIES_02', title: 'RAW SIGNAL', image: '/assets/product-keychain.webp', pieces: '11 OBJECTS' },
]
