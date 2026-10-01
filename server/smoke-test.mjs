import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clientAddress } from './abuse.mjs'

const temporaryData = await mkdtemp(join(tmpdir(), 'chvoz-backend-smoke-'))
const port = 18_000 + Math.floor(Math.random() * 1_000)
const baseUrl = `http://127.0.0.1:${port}`
const adminPassword = `Smoke-${Date.now()}-secure`
const child = spawn(process.execPath, ['server/server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    CHVOZ_PORT: String(port),
    CHVOZ_DATA_DIR: temporaryData,
    CHVOZ_ADMIN_USERNAME: 'SmokeAdmin',
    CHVOZ_ADMIN_EMAIL: 'smoke-admin@chvoz.test',
    // Testuje se i migrace původního SHA-256 admin hashe na scrypt při loginu.
    CHVOZ_ADMIN_PASSWORD_SHA256: createHash('sha256').update(adminPassword).digest('hex'),
    CHVOZ_BANK_ACCOUNT: '123456789/0100',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let cookies = new Map()
const cookieHeader = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
function absorbCookies(response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim())
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    if (attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0')) cookies.delete(name)
    else cookies.set(name, value)
  }
}

async function api(path, { method = 'GET', body, expected = 200, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(path === '/api/orders' && method === 'POST' && !headers['Idempotency-Key'] ? { 'Idempotency-Key': randomUUID() } : {}), ...(cookies.size ? { Cookie: cookieHeader() } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  absorbCookies(response)
  const payload = await response.json()
  if (response.status !== expected) throw new Error(`${method} ${path}: očekáváno ${expected}, vráceno ${response.status} ${JSON.stringify(payload)}`)
  return payload
}

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

try {
  const proxyConfig = { trustProxy: true, trustedProxyAddresses: new Set(['127.0.0.1']) }
  if (clientAddress({ socket: { remoteAddress: '198.51.100.4' }, headers: { 'x-forwarded-for': '203.0.113.7' } }, proxyConfig) !== '198.51.100.4') throw new Error('Untrusted peer spoofed X-Forwarded-For.')
  if (clientAddress({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.7' } }, proxyConfig) !== '203.0.113.7') throw new Error('Trusted proxy address was not used.')

  for (let attempt = 0; attempt < 50; attempt++) {
    try { await api('/api/health'); break } catch {
      if (attempt === 49) throw new Error('Server se nespustil včas.')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  const emptyCartResponse = await fetch(`${baseUrl}/api/cart`)
  if (emptyCartResponse.headers.has('set-cookie')) throw new Error('Empty cart read created a persistent cart cookie.')
  if (!emptyCartResponse.headers.get('content-security-policy')?.includes("default-src 'self'")) throw new Error('Security headers are missing.')
  const staticResponse = await fetch(`${baseUrl}/assets/chvoz-logo-header.png`)
  const staticEtag = staticResponse.headers.get('etag')
  if (!staticEtag) throw new Error('Static asset ETag is missing.')
  const notModified = await fetch(`${baseUrl}/assets/chvoz-logo-header.png`, { headers: { 'If-None-Match': staticEtag } })
  if (notModified.status !== 304 || !notModified.headers.get('cache-control')) throw new Error('Static 304 response lost cache metadata.')
  await api('/api/auth/register', { method: 'POST', expected: 403, headers: { Origin: 'https://attacker.invalid' }, body: { username: 'blocked', email: 'blocked@example.test', password: 'Customer-Password-42' } })

  const catalog = await api('/api/catalog')
  if (catalog.products.length < 4 || catalog.gallery.length < 6 || catalog.archive.length < 4) throw new Error('Seed katalogu není kompletní.')
  const publicConfig = await api('/api/config')
  if (!publicConfig.payments.bankTransfer || publicConfig.shipping.freeFrom !== 2500) throw new Error('Veřejná konfigurace dopravy a plateb není správná.')

  const suffix = Date.now()
  const registration = await api('/api/auth/register', { method: 'POST', expected: 201, body: { username: `customer${suffix}`, email: `customer${suffix}@example.test`, password: 'Customer-Password-42' } })
  if (registration.user.role !== 'customer') throw new Error('Registrace nevytvořila customer účet.')

  const added = await api('/api/cart/items', { method: 'POST', body: { productId: 'signal-hoodie', size: 'M', quantity: 2 } })
  if (added.count !== 2 || added.subtotal !== 4980) throw new Error('Košík nepočítá správně.')

  // Objekt bez velikostí musí jít vložit bez hodnoty `size`.
  await api('/api/cart/items', { method: 'POST', expected: 400, body: { productId: 'signal-hoodie', size: 'XXL', quantity: 1 } })
  await api('/api/cart/items', { method: 'POST', expected: 409, body: { productId: 'signal-hoodie', size: 'M', quantity: 20 } })

  const addedWithoutSize = await api('/api/cart/items', { method: 'POST', body: { productId: 'chrome-links', quantity: 1 } })
  if (addedWithoutSize.count !== 3 || addedWithoutSize.subtotal !== 5770) throw new Error('Cart failed to accept a product without sizes.')
  const sizeLessItem = addedWithoutSize.items.find((item) => item.productId === 'chrome-links')
  await api(`/api/cart/items/${sizeLessItem.id}`, { method: 'DELETE' })

  const checkoutKey = randomUUID()
  const orderBody = {
    email: `customer${suffix}@example.test`, phone: '+420 777 000 000', firstName: 'Smoke', lastName: 'Test', address: 'Testovací 1', city: 'Praha', zip: '11000', country: 'CZ', shippingMethod: 'packeta', paymentMethod: 'cash_on_delivery',
  }
  const orderResult = await api('/api/orders', { method: 'POST', expected: 201, headers: { 'Idempotency-Key': checkoutKey }, body: orderBody })
  if (orderResult.order.total !== 4980 || orderResult.order.paymentStatus !== 'pending') throw new Error('Objednávka nemá správný součet, dopravu zdarma nebo stav.')
  const repeatedOrder = await api('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': checkoutKey }, body: orderBody })
  if (!repeatedOrder.repeated || repeatedOrder.order.number !== orderResult.order.number) throw new Error('Idempotent checkout did not return the original order.')
  await api('/api/orders', { method: 'POST', expected: 409, headers: { 'Idempotency-Key': checkoutKey }, body: { ...orderBody, city: 'Brno' } })

  const ownOrders = await api('/api/orders/mine')
  if (ownOrders.orders.length !== 1) throw new Error('Objednávka není připojena k účtu.')
  await api('/api/auth/logout', { method: 'POST' })

  await api('/api/auth/login', { method: 'POST', body: { identifier: 'SmokeAdmin', password: adminPassword } })
  const createdProduct = await api('/api/products', { method: 'POST', expected: 201, body: {
    name: 'SMOKE OBJECT', code: 'TEST_001', price: 100, category: 'objekt', description: 'Testovací objekt', details: ['Bod'], stock: 1, edition: 'TEST', images: [pixel],
  } })
  if (!createdProduct.product.image.startsWith('/uploads/')) throw new Error('Upload produktu nebyl uložen bezpečně na disk.')

  const updatedProduct = await api(`/api/products/${createdProduct.product.id}`, { method: 'PATCH', body: { stock: 3 } })
  if (updatedProduct.product.stock !== 3) throw new Error('Product update did not persist.')

  const galleryEntry = await api('/api/gallery', { method: 'POST', expected: 201, body: { title: 'SMOKE FRAME', year: '2026', images: [pixel] } })
  const archiveEntry = await api('/api/archive', { method: 'POST', expected: 201, body: { title: 'SMOKE MEMORY', year: '2026', code: 'TEST_02', pieces: '01 OBJECT', images: [pixel] } })
  await api(`/api/gallery/${galleryEntry.entries[0].id}`, { method: 'DELETE' })
  await api(`/api/archive/${archiveEntry.entries[0].id}`, { method: 'DELETE' })

  const managerPassword = `Manager-${suffix}-secure`
  const manager = await api('/api/admin/users', { method: 'POST', expected: 201, body: { username: `manager${suffix}`, email: `manager${suffix}@example.test`, password: managerPassword, role: 'manager' } })
  if (manager.user.role !== 'manager') throw new Error('Admin did not create a manager account.')
  await api('/api/auth/logout', { method: 'POST' })
  await api('/api/auth/login', { method: 'POST', body: { identifier: manager.user.username, password: managerPassword } })
  await api('/api/admin/orders')
  await api('/api/admin/users', { expected: 403 })
  await api('/api/auth/logout', { method: 'POST' })
  await api('/api/auth/login', { method: 'POST', body: { identifier: 'SmokeAdmin', password: adminPassword } })
  await api(`/api/products/${createdProduct.product.id}`, { method: 'DELETE' })

  const adminOrders = await api('/api/admin/orders')
  if (adminOrders.total !== 1) throw new Error('Admin nevidí objednávky.')
  await api(`/api/admin/orders/${orderResult.order.id}/status`, { method: 'PATCH', body: { status: 'processing', paymentStatus: 'paid' } })
  await api(`/api/admin/orders/${orderResult.order.id}/status`, { method: 'PATCH', body: { status: 'cancelled' } })
  const restoredCatalog = await api('/api/catalog')
  if (restoredCatalog.products.find((product) => product.id === 'signal-hoodie').stock !== 8) throw new Error('Zrušení objednávky nevrátilo sklad.')

  console.log('CHVOZ backend smoke test: OK')
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ])
  }
  await rm(temporaryData, { recursive: true, force: true })
}
