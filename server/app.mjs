import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { lstat, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, relative, resolve } from 'node:path'
import { readConfig } from './config.mjs'
import { openDatabase, purgeExpired } from './database.mjs'
import { clientAddress, createRateLimiter, privacyKey } from './abuse.mjs'
import { verifyBotChallenge } from './bot-protection.mjs'
import {
  ApiError,
  appendCookie,
  cookie,
  hashPassword,
  newOpaqueToken,
  parseCookies,
  publicUser,
  readJson,
  storeImages,
  tokenHash,
  verifyPassword,
} from './security.mjs'

const shippingPrices = { packeta: 89, ppl: 129 }
const staffRoles = new Set(['admin', 'manager'])
const orderStatuses = new Set(['new', 'processing', 'shipped', 'completed', 'cancelled'])
const paymentStatuses = new Set(['pending', 'paid', 'failed', 'refunded'])
const paymentMethods = new Set(['bank_transfer', 'cash_on_delivery'])
export async function createChvozApplication(overrides = {}) {
  const config = readConfig(overrides)
  const database = await openDatabase(config)
  const rateLimiter = createRateLimiter()
  let requestCounter = 0

  const server = createServer({ requireHostHeader: true }, async (request, response) => {
    const requestId = `${Date.now().toString(36)}-${(++requestCounter).toString(36)}`
    response.setHeader('X-Request-Id', requestId)
    applySecurityHeaders(response, config)

    try {
      const address = clientAddress(request, config)
      rateLimiter.consume(`global:${address}`, { capacity: 600, windowMs: 60_000 })
      const url = new URL(request.url || '/', config.publicSiteUrl || 'http://localhost')
      applyCors(request, response, config)
      if (request.method === 'OPTIONS') return sendEmpty(response, 204)

      if (url.pathname.startsWith('/api/')) {
        verifyMutationOrigin(request, config)
        const user = readSession(database, request, response, config)
        return await routeApi({ request, response, url, user, database, config, address, rateLimiter })
      }
      if (url.pathname.startsWith('/uploads/')) return await serveUpload(request, response, url, config)
      return await serveFrontend(request, response, url, config)
    } catch (error) {
      const apiError = error instanceof ApiError
        ? error
        : new ApiError(500, 'INTERNAL_ERROR', 'Server požadavek nedokázal dokončit.')
      if (!(error instanceof ApiError)) console.error(`[${requestId}]`, error)
      if (apiError.status === 429 && apiError.details?.retryAfterSeconds) response.setHeader('Retry-After', String(apiError.details.retryAfterSeconds))
      return sendJson(response, apiError.status, {
        error: { code: apiError.code, message: apiError.message, ...(apiError.details === undefined ? {} : { details: apiError.details }) },
      })
    }
  })

  server.headersTimeout = config.headersTimeoutMs
  server.requestTimeout = config.requestTimeoutMs
  server.keepAliveTimeout = config.keepAliveTimeoutMs
  server.maxHeadersCount = 64
  server.maxRequestsPerSocket = config.maxRequestsPerSocket

  const maintenance = setInterval(() => purgeExpired(database), 60 * 60 * 1000)
  maintenance.unref()
  server.on('close', () => {
    clearInterval(maintenance)
    database.close()
  })
  return { server, database, config }
}

async function routeApi(context) {
  const { request, response, url, user, database, config, address, rateLimiter } = context
  const method = request.method || 'GET'
  const path = url.pathname
  if (['POST', 'PATCH', 'DELETE'].includes(method) && path.startsWith('/api/cart')) {
    limitRequest(rateLimiter, `cart:${address}`, 120, 15 * 60 * 1000)
  }
  if (['POST', 'PATCH', 'DELETE'].includes(method) && (/^\/api\/(?:products|gallery|archive)(?:\/|$)/.test(path) || path.startsWith('/api/admin/'))) {
    limitRequest(rateLimiter, `staff-write:${user?.id || address}`, 60, 60 * 60 * 1000)
  }

  if (method === 'GET' && path === '/api/health') {
    return sendJson(response, 200, { ok: true })
  }
  if (method === 'GET' && path === '/api/config') {
    return sendJson(response, 200, {
      payments: { bankTransfer: Boolean(config.bankAccount), cashOnDelivery: true },
      shipping: { packeta: shippingPrices.packeta, ppl: shippingPrices.ppl, freeFrom: 2500 },
      botProtection: { enabled: config.botProtectionRequired, siteKey: config.botProtectionRequired ? config.turnstileSiteKey : null },
    })
  }

  if (method === 'GET' && path === '/api/auth/me') return sendJson(response, 200, { user: publicUser(user) })
  if (method === 'POST' && path === '/api/auth/register') {
    limitRequest(rateLimiter, `register:${address}`, 5, 60 * 60 * 1000)
    return register(context)
  }
  if (method === 'POST' && path === '/api/auth/login') {
    limitRequest(rateLimiter, `login-ip:${address}`, 12, 15 * 60 * 1000)
    return login(context)
  }
  if (method === 'POST' && path === '/api/auth/logout') return logout(context)

  if (method === 'GET' && path === '/api/catalog') return sendJson(response, 200, readCatalog(database))
  if (method === 'GET' && path === '/api/products') return sendJson(response, 200, { products: readProducts(database) })
  if (method === 'GET' && path === '/api/gallery') return sendJson(response, 200, { gallery: readGallery(database) })
  if (method === 'GET' && path === '/api/archive') return sendJson(response, 200, { archive: readArchive(database) })
  const productSlug = matchPath(path, '/api/products/:slug')
  if (method === 'GET' && productSlug) {
    const row = database.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(productSlug.slug)
    if (!row) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produkt nebyl nalezen.')
    return sendJson(response, 200, { product: productFromRow(row) })
  }

  if (method === 'GET' && path === '/api/cart') {
    const cart = ensureCart(database, request, response, config, user, false)
    return sendJson(response, 200, cart ? getCartSnapshot(database, cart) : emptyCartSnapshot())
  }
  if (method === 'POST' && path === '/api/cart/items') return addCartItem(context)
  const cartItemPath = matchPath(path, '/api/cart/items/:id')
  if (cartItemPath && method === 'PATCH') return updateCartItem(context, cartItemPath.id)
  if (cartItemPath && method === 'DELETE') return deleteCartItem(context, cartItemPath.id)
  if (method === 'DELETE' && path === '/api/cart') return clearCart(context)

  if (method === 'POST' && path === '/api/orders') {
    limitRequest(rateLimiter, `checkout:${address}`, 5, 60 * 60 * 1000)
    return createOrder(context)
  }
  if (method === 'GET' && path === '/api/orders/mine') return listOwnOrders(context)
  const ownOrderPath = matchPath(path, '/api/orders/:id')
  if (method === 'GET' && ownOrderPath) return readOwnOrder(context, ownOrderPath.id)

  if (method === 'POST' && path === '/api/products') return createProduct(context)
  const adminProductPath = matchPath(path, '/api/products/:id')
  if (adminProductPath && method === 'PATCH') return updateProduct(context, adminProductPath.id)
  if (adminProductPath && method === 'DELETE') return deactivateProduct(context, adminProductPath.id)
  if (method === 'POST' && path === '/api/gallery') return createMedia(context, 'gallery')
  if (method === 'POST' && path === '/api/archive') return createMedia(context, 'archive')
  const galleryPath = matchPath(path, '/api/gallery/:id')
  if (galleryPath && method === 'DELETE') return deleteMedia(context, 'gallery', galleryPath.id)
  const archivePath = matchPath(path, '/api/archive/:id')
  if (archivePath && method === 'DELETE') return deleteMedia(context, 'archive', archivePath.id)

  if (method === 'GET' && path === '/api/admin/orders') return listAdminOrders(context)
  const adminOrderStatus = matchPath(path, '/api/admin/orders/:id/status')
  if (method === 'PATCH' && adminOrderStatus) return updateOrderStatus(context, adminOrderStatus.id)
  if (method === 'GET' && path === '/api/admin/users') return listUsers(context)
  if (method === 'POST' && path === '/api/admin/users') return createStaffUser(context)
  const adminUserPath = matchPath(path, '/api/admin/users/:id')
  if (method === 'PATCH' && adminUserPath) return updateUserRole(context, adminUserPath.id)

  throw new ApiError(404, 'NOT_FOUND', 'API endpoint nebyl nalezen.')
}

async function register({ request, response, database, config, address }) {
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  rejectHoneypot(body)
  await verifyBotChallenge(body.botToken, address, config, 'register')
  const username = text(body.username, 'Uživatelské jméno', 3, 40)
  const email = emailValue(body.email)
  const password = String(body.password || '')
  if (password.length < 8 || password.length > 200) throw new ApiError(400, 'WEAK_PASSWORD', 'Heslo musí mít 8 až 200 znaků.')
  const now = Date.now()
  const createdUser = { id: randomUUID(), username, email, role: 'customer' }
  try {
    database.prepare(`INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'customer', ?, ?)`)
      .run(createdUser.id, username, email, await hashPassword(password), now, now)
  } catch (error) {
    if (String(error?.code).startsWith('SQLITE_CONSTRAINT')) throw new ApiError(409, 'ACCOUNT_EXISTS', 'Účet s tímto jménem nebo e-mailem už existuje.')
    throw error
  }
  issueSession(database, response, config, createdUser.id, 'customer')
  attachCartToUser(database, request, config, createdUser.id)
  return sendJson(response, 201, { user: createdUser })
}

async function login({ request, response, database, config, rateLimiter }) {
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  const identifier = String(body.identifier || '').trim()
  limitRequest(rateLimiter, `login-id:${privacyKey(identifier.toLowerCase())}`, 12, 15 * 60 * 1000)
  const password = String(body.password || '')
  const row = database.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE LIMIT 1').get(identifier, identifier)
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Neplatné přihlašovací údaje.')
  }
  // Starší lokální demo používalo SHA-256. Po prvním úspěšném přihlášení se
  // hash transparentně povýší na scrypt, takže migrace nevyžaduje reset hesla.
  if (String(row.password_hash).startsWith('sha256$')) {
    database.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(await hashPassword(password), Date.now(), row.id)
  }
  database.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), row.id)
  issueSession(database, response, config, row.id, row.role)
  attachCartToUser(database, request, config, row.id)
  return sendJson(response, 200, { user: publicUser(row) })
}

function logout({ request, response, database, config }) {
  const value = parseCookies(request.headers.cookie)[config.sessionCookie]
  if (value) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(value))
  appendCookie(response, cookie(config.sessionCookie, '', { maxAge: 0, secure: config.production }))
  return sendJson(response, 200, { ok: true })
}

async function addCartItem({ request, response, database, config, user }) {
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  const productId = text(body.productId, 'Produkt', 1, 100)
  const quantity = integer(body.quantity ?? 1, 'Množství', 1, 20)
  const product = database.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(productId)
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produkt nebyl nalezen.')
  const size = normalizeSize(body.size, product)
  const cart = ensureCart(database, request, response, config, user)
  const existing = database.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND size = ?').get(cart.id, productId, size)
  const nextQuantity = Number(existing?.quantity || 0) + quantity
  if (nextQuantity > product.stock) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Požadované množství není skladem.', { available: product.stock })
  const now = Date.now()
  if (existing) database.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(nextQuantity, now, existing.id)
  else database.prepare('INSERT INTO cart_items (id, cart_id, product_id, size, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), cart.id, productId, size, quantity, now, now)
  return sendJson(response, 200, getCartSnapshot(database, cart))
}

async function updateCartItem({ request, response, database, config, user }, itemId) {
  const cart = ensureCart(database, request, response, config, user)
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  const quantity = integer(body.quantity, 'Množství', 0, 20)
  const item = database.prepare('SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ? AND ci.cart_id = ?').get(itemId, cart.id)
  if (!item) throw new ApiError(404, 'CART_ITEM_NOT_FOUND', 'Položka košíku nebyla nalezena.')
  if (quantity === 0) database.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId)
  else {
    if (quantity > item.stock) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Požadované množství není skladem.', { available: item.stock })
    database.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(quantity, Date.now(), itemId)
  }
  return sendJson(response, 200, getCartSnapshot(database, cart))
}

function deleteCartItem({ request, response, database, config, user }, itemId) {
  const cart = ensureCart(database, request, response, config, user)
  database.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cart.id)
  return sendJson(response, 200, getCartSnapshot(database, cart))
}

function clearCart({ request, response, database, config, user }) {
  const cart = ensureCart(database, request, response, config, user)
  database.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id)
  return sendJson(response, 200, getCartSnapshot(database, cart))
}

async function createOrder({ request, response, database, config, user, address }) {
  const idempotencyKey = String(request.headers['idempotency-key'] || '')
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Objednávka vyžaduje platný Idempotency-Key.')
  }
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  rejectHoneypot(body)
  const contact = {
    email: emailValue(body.email),
    phone: text(body.phone, 'Telefon', 5, 40),
    firstName: text(body.firstName ?? body.name, 'Jméno', 1, 80),
    lastName: text(body.lastName ?? body.surname, 'Příjmení', 1, 80),
    address: text(body.address, 'Adresa', 3, 160),
    city: text(body.city, 'Město', 1, 100),
    zip: text(body.zip, 'PSČ', 3, 20),
    country: text(body.country || 'CZ', 'Země', 2, 2).toUpperCase(),
  }
  const shippingMethod = String(body.shippingMethod || '')
  if (!(shippingMethod in shippingPrices)) throw new ApiError(400, 'INVALID_SHIPPING_METHOD', 'Neplatný způsob dopravy.')
  const paymentMethod = String(body.paymentMethod || '')
  if (!paymentMethods.has(paymentMethod)) throw new ApiError(400, 'INVALID_PAYMENT_METHOD', 'Neplatný způsob platby.')
  if (paymentMethod === 'bank_transfer' && !config.bankAccount) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Bankovní převod zatím není nakonfigurovaný.')

  const cartToken = parseCookies(request.headers.cookie)[config.cartCookie]
  const cart = cartToken
    ? database.prepare('SELECT * FROM carts WHERE token_hash = ? AND expires_at > ?').get(tokenHash(cartToken), Date.now())
    : null
  const idempotencyScope = user ? `user:${user.id}` : cart ? `cart:${cart.token_hash}` : null
  if (!idempotencyScope) throw new ApiError(400, 'EMPTY_CART', 'Košík je prázdný.')

  // Klíč je svázaný s účtem (nebo tajným tokenem guest košíku) a normalizovaným
  // obsahem checkoutu. Stejný náhodný klíč proto nemůže zpřístupnit cizí objednávku.
  const idempotencyKeyHash = tokenHash(`${idempotencyScope}\0${idempotencyKey}`)
  const idempotencyPayloadHash = tokenHash(JSON.stringify({ contact, shippingMethod, paymentMethod }))
  const previousOrder = database.prepare('SELECT * FROM orders WHERE idempotency_key_hash = ?').get(idempotencyKeyHash)
  if (previousOrder) return sendRepeatedOrder(response, previousOrder, cart, idempotencyPayloadHash, config)
  if (!cart || cart.converted_order_id) throw new ApiError(400, 'EMPTY_CART', 'Košík je prázdný.')

  await verifyBotChallenge(body.botToken, address, config, 'checkout')

  let orderId
  let repeated = false
  database.exec('BEGIN IMMEDIATE')
  try {
    // Druhá kontrola probíhá až po získání SQLite write locku. Dva paralelní retry
    // tak skončí stejnou objednávkou místo 500 nebo dvojího odečtení skladu.
    const concurrentOrder = database.prepare('SELECT * FROM orders WHERE idempotency_key_hash = ?').get(idempotencyKeyHash)
    if (concurrentOrder) {
      assertIdempotencyPayload(concurrentOrder, idempotencyPayloadHash)
      orderId = concurrentOrder.id
      repeated = true
    } else {
      const cartItems = database.prepare('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY created_at').all(cart.id)
      if (!cartItems.length) throw new ApiError(400, 'EMPTY_CART', 'Košík je prázdný.')
      const snapshots = []
      let subtotal = 0
      for (const item of cartItems) {
        const product = database.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(item.product_id)
        if (!product || product.stock < item.quantity) {
          throw new ApiError(409, 'INSUFFICIENT_STOCK', `${product?.name || 'Produkt'} už není v požadovaném množství skladem.`, { productId: item.product_id, available: Number(product?.stock || 0) })
        }
        const lineSubtotal = product.price * item.quantity
        subtotal += lineSubtotal
        snapshots.push({ item, product, lineSubtotal })
      }

      const now = Date.now()
      orderId = randomUUID()
      const number = createOrderNumber()
      const shippingPrice = subtotal >= 2500 ? 0 : shippingPrices[shippingMethod]
      database.prepare(`
        INSERT INTO orders
          (id, order_number, user_id, email, phone, first_name, last_name, address, city, zip, country, shipping_method, shipping_price, subtotal, total, currency, status, payment_status, payment_method, idempotency_key_hash, idempotency_payload_hash, source_cart_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CZK', 'new', 'pending', ?, ?, ?, ?, ?, ?)
      `).run(orderId, number, user?.id || null, contact.email, contact.phone, contact.firstName, contact.lastName, contact.address, contact.city, contact.zip, contact.country, shippingMethod, shippingPrice, subtotal, subtotal + shippingPrice, paymentMethod, idempotencyKeyHash, idempotencyPayloadHash, cart.id, now, now)

      for (const { item, product, lineSubtotal } of snapshots) {
        database.prepare(`INSERT INTO order_items (id, order_id, product_id, product_name, product_code, unit_price, quantity, size, image, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), orderId, product.id, product.name, product.code, product.price, item.quantity, item.size, product.image, lineSubtotal)
        const result = database.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?').run(item.quantity, now, product.id, item.quantity)
        if (result.changes !== 1) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Sklad se během objednávky změnil. Zkus to prosím znovu.')
      }
      database.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id)
      database.prepare('UPDATE carts SET converted_order_id = ?, updated_at = ? WHERE id = ?').run(orderId, now, cart.id)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    const duplicate = database.prepare('SELECT * FROM orders WHERE idempotency_key_hash = ?').get(idempotencyKeyHash)
    if (duplicate) return sendRepeatedOrder(response, duplicate, cart, idempotencyPayloadHash, config)
    throw error
  }

  const savedOrder = database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
  if (savedOrder.source_cart_id === cart.id) appendCookie(response, cookie(config.cartCookie, '', { maxAge: 0, secure: config.production }))
  if (repeated) return sendJson(response, 200, { order: orderSummary(savedOrder, config), repeated: true })
  writeAuditEvent(database, user, 'order.create', 'order', orderId, { shippingMethod, paymentMethod })
  return sendJson(response, 201, { order: orderSummary(savedOrder, config) })
}

function assertIdempotencyPayload(order, payloadHash) {
  if (!order.idempotency_payload_hash || order.idempotency_payload_hash !== payloadHash) {
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Tento checkout klíč už byl použit pro jiný obsah objednávky.')
  }
}

function sendRepeatedOrder(response, order, cart, payloadHash, config) {
  assertIdempotencyPayload(order, payloadHash)
  if (cart && order.source_cart_id === cart.id) appendCookie(response, cookie(config.cartCookie, '', { maxAge: 0, secure: config.production }))
  return sendJson(response, 200, { order: orderSummary(order, config), repeated: true })
}

function listOwnOrders({ response, database, user, config }) {
  requireUser(user)
  const orders = database.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map((row) => orderSummary(row, config))
  return sendJson(response, 200, { orders })
}

function readOwnOrder({ response, database, user, config }, orderId) {
  requireUser(user)
  const row = staffRoles.has(user.role)
    ? database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    : database.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, user.id)
  if (!row) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Objednávka nebyla nalezena.')
  return sendJson(response, 200, { order: fullOrder(database, row, config) })
}

async function createProduct({ request, response, database, config, user }) {
  requireStaff(user)
  const body = await readJson(request, config.jsonBodyLimitBytes)
  const product = await normalizeProductInput(body, null, config)
  const now = Date.now()
  product.id = randomUUID()
  product.slug = uniqueSlug(database, body.slug || product.name)
  database.prepare(`
    INSERT INTO products (id, slug, name, code, price, image, images_json, category, description, details_json, sizes_json, stock, edition, status, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(product.id, product.slug, product.name, product.code, product.price, product.image, JSON.stringify(product.images), product.category, product.description, JSON.stringify(product.details), product.sizes ? JSON.stringify(product.sizes) : null, product.stock, product.edition, product.status, now, now)
  writeAuditEvent(database, user, 'product.create', 'product', product.id)
  return sendJson(response, 201, { product: productFromRow(database.prepare('SELECT * FROM products WHERE id = ?').get(product.id)) })
}

async function updateProduct({ request, response, database, config, user }, productId) {
  requireStaff(user)
  const existing = database.prepare('SELECT * FROM products WHERE id = ?').get(productId)
  if (!existing) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produkt nebyl nalezen.')
  const body = await readJson(request, config.jsonBodyLimitBytes)
  const product = await normalizeProductInput(body, productFromRow(existing), config)
  const slug = body.slug && body.slug !== existing.slug ? uniqueSlug(database, body.slug, productId) : existing.slug
  database.prepare(`UPDATE products SET slug=?, name=?, code=?, price=?, image=?, images_json=?, category=?, description=?, details_json=?, sizes_json=?, stock=?, edition=?, status=?, active=?, updated_at=? WHERE id=?`)
    .run(slug, product.name, product.code, product.price, product.image, JSON.stringify(product.images), product.category, product.description, JSON.stringify(product.details), product.sizes ? JSON.stringify(product.sizes) : null, product.stock, product.edition, product.status, product.active ? 1 : 0, Date.now(), productId)
  writeAuditEvent(database, user, 'product.update', 'product', productId)
  return sendJson(response, 200, { product: productFromRow(database.prepare('SELECT * FROM products WHERE id = ?').get(productId)) })
}

function deactivateProduct({ response, database, user }, productId) {
  requireStaff(user)
  const result = database.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ?').run(Date.now(), productId)
  if (!result.changes) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Produkt nebyl nalezen.')
  writeAuditEvent(database, user, 'product.deactivate', 'product', productId)
  return sendJson(response, 200, { ok: true })
}

async function createMedia({ request, response, database, config, user }, mode) {
  requireStaff(user)
  const body = await readJson(request, config.jsonBodyLimitBytes)
  const title = text(body.title, 'Název', 1, 120)
  const year = text(body.year, 'Rok', 4, 4)
  if (!/^20\d{2}$/.test(year)) throw new ApiError(400, 'INVALID_YEAR', 'Rok musí mít formát 20XX.')
  const images = await storeImages(body.images, config)
  const now = Date.now()
  let entries
  if (mode === 'gallery') {
    entries = images.map((image) => ({ id: randomUUID(), title, image, year }))
    const statement = database.prepare('INSERT INTO gallery (id, title, image, year, created_at) VALUES (?, ?, ?, ?, ?)')
    for (const entry of entries) statement.run(entry.id, entry.title, entry.image, entry.year, now)
  } else {
    const code = text(body.code, 'Kód série', 1, 80)
    const pieces = text(body.pieces, 'Počet objektů', 1, 80)
    entries = images.map((image) => ({ id: randomUUID(), title, image, year, code, pieces }))
    const statement = database.prepare('INSERT INTO archive (id, title, image, year, code, pieces, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const entry of entries) statement.run(entry.id, entry.title, entry.image, entry.year, entry.code, entry.pieces, now)
  }
  for (const entry of entries) writeAuditEvent(database, user, `${mode}.create`, mode, entry.id)
  return sendJson(response, 201, { entries })
}

function deleteMedia({ response, database, user }, table, id) {
  requireStaff(user)
  const result = database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
  if (!result.changes) throw new ApiError(404, 'MEDIA_NOT_FOUND', 'Záznam nebyl nalezen.')
  writeAuditEvent(database, user, `${table}.delete`, table, id)
  return sendJson(response, 200, { ok: true })
}

function listAdminOrders({ response, database, user, url, config }) {
  requireStaff(user)
  const limit = integer(url.searchParams.get('limit') || 50, 'Limit', 1, 100)
  const offset = integer(url.searchParams.get('offset') || 0, 'Offset', 0, 100_000)
  const orders = database.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset).map((row) => orderSummary(row, config))
  const total = Number(database.prepare('SELECT COUNT(*) AS count FROM orders').get().count)
  return sendJson(response, 200, { orders, total, limit, offset })
}

async function updateOrderStatus({ request, response, database, config, user }, orderId) {
  requireStaff(user)
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  const existing = database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
  if (!existing) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Objednávka nebyla nalezena.')
  const updates = []
  const parameters = []
  if (body.status !== undefined) {
    if (!orderStatuses.has(body.status)) throw new ApiError(400, 'INVALID_ORDER_STATUS', 'Neplatný stav objednávky.')
    updates.push('status = ?'); parameters.push(body.status)
  }
  if (body.paymentStatus !== undefined) {
    if (!paymentStatuses.has(body.paymentStatus)) throw new ApiError(400, 'INVALID_PAYMENT_STATUS', 'Neplatný stav platby.')
    updates.push('payment_status = ?'); parameters.push(body.paymentStatus)
  }
  if (!updates.length) throw new ApiError(400, 'NO_CHANGES', 'Nebyla zadána žádná změna.')
  database.exec('BEGIN IMMEDIATE')
  try {
    if (body.status === 'cancelled' && existing.status !== 'cancelled' && !existing.stock_restored) {
      const items = database.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').all(orderId)
      for (const item of items) database.prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?').run(item.quantity, Date.now(), item.product_id)
      updates.push('stock_restored = 1')
    } else if (existing.status === 'cancelled' && body.status && body.status !== 'cancelled' && existing.stock_restored) {
      const items = database.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ? AND product_id IS NOT NULL').all(orderId)
      for (const item of items) {
        const result = database.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?').run(item.quantity, Date.now(), item.product_id, item.quantity)
        if (result.changes !== 1) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Zrušenou objednávku nelze obnovit, protože některý produkt už není skladem.')
      }
      updates.push('stock_restored = 0')
    }
    updates.push('updated_at = ?'); parameters.push(Date.now(), orderId)
    database.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...parameters)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  writeAuditEvent(database, user, 'order.status', 'order', orderId, { status: body.status, paymentStatus: body.paymentStatus })
  return sendJson(response, 200, { order: fullOrder(database, database.prepare('SELECT * FROM orders WHERE id = ?').get(orderId), config) })
}

function listUsers({ response, database, user }) {
  requireAdmin(user)
  const users = database.prepare('SELECT id, username, email, role, created_at, last_login_at FROM users ORDER BY created_at DESC').all().map(userFromRow)
  return sendJson(response, 200, { users })
}

async function createStaffUser({ request, response, database, config, user }) {
  requireAdmin(user)
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  const role = body.role === 'manager' ? 'manager' : 'customer'
  const password = String(body.password || '')
  if (password.length < 8 || password.length > 200) throw new ApiError(400, 'WEAK_PASSWORD', 'Heslo musí mít 8 až 200 znaků.')
  const row = { id: randomUUID(), username: text(body.username, 'Uživatelské jméno', 3, 40), email: emailValue(body.email), role }
  const now = Date.now()
  try {
    database.prepare('INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(row.id, row.username, row.email, await hashPassword(password), role, now, now)
  } catch (error) {
    if (String(error?.code).startsWith('SQLITE_CONSTRAINT')) throw new ApiError(409, 'ACCOUNT_EXISTS', 'Účet s tímto jménem nebo e-mailem už existuje.')
    throw error
  }
  writeAuditEvent(database, user, 'user.create', 'user', row.id, { role })
  return sendJson(response, 201, { user: row })
}

async function updateUserRole({ request, response, database, config, user }, userId) {
  requireAdmin(user)
  const body = await readJson(request, config.smallJsonBodyLimitBytes)
  if (!['admin', 'manager', 'customer'].includes(body.role)) throw new ApiError(400, 'INVALID_ROLE', 'Neplatná role.')
  const target = database.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'Uživatel nebyl nalezen.')
  if (target.role === 'admin' && body.role !== 'admin') {
    const count = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count)
    if (count <= 1) throw new ApiError(409, 'LAST_ADMIN', 'Poslednímu administrátorovi nelze odebrat roli.')
  }
  database.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(body.role, Date.now(), userId)
  if (body.role !== target.role) database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
  writeAuditEvent(database, user, 'user.role', 'user', userId, { from: target.role, to: body.role })
  return sendJson(response, 200, { user: publicUser({ ...target, role: body.role }) })
}

function readSession(database, request, response, config) {
  const value = parseCookies(request.headers.cookie)[config.sessionCookie]
  if (!value) return null
  const now = Date.now()
  const row = database.prepare(`
    SELECT u.*, s.expires_at AS session_expires_at, s.created_at AS session_created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash(value), now)
  const absoluteLifetime = row && staffRoles.has(row.role) ? config.staffSessionMaxAgeSeconds : config.sessionMaxAgeSeconds
  if (!row || row.session_created_at + absoluteLifetime * 1000 <= now) {
    if (row) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(value))
    appendCookie(response, cookie(config.sessionCookie, '', { maxAge: 0, secure: config.production }))
    return null
  }
  return row
}

function issueSession(database, response, config, userId, role = 'customer') {
  const value = newOpaqueToken()
  const now = Date.now()
  const maxAge = staffRoles.has(role) ? config.staffSessionMaxAgeSeconds : config.sessionMaxAgeSeconds
  database.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, now)
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(tokenHash(value), userId, now + maxAge * 1000, now)
  appendCookie(response, cookie(config.sessionCookie, value, { maxAge, secure: config.production }))
}

function ensureCart(database, request, response, config, user, create = true) {
  const cookies = parseCookies(request.headers.cookie)
  const currentToken = cookies[config.cartCookie]
  const now = Date.now()
  let cart = currentToken
    ? database.prepare('SELECT * FROM carts WHERE token_hash = ? AND expires_at > ? AND converted_order_id IS NULL').get(tokenHash(currentToken), now)
    : null
  if (!cart && !create) return null
  if (!cart) {
    const token = newOpaqueToken()
    cart = { id: randomUUID(), token_hash: tokenHash(token), user_id: user?.id || null, created_at: now, updated_at: now, expires_at: now + config.cartMaxAgeSeconds * 1000 }
    database.prepare('INSERT INTO carts (id, token_hash, user_id, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(cart.id, cart.token_hash, cart.user_id, now, now, cart.expires_at)
    appendCookie(response, cookie(config.cartCookie, token, { maxAge: config.cartMaxAgeSeconds, secure: config.production }))
  } else {
    const expiresAt = now + config.cartMaxAgeSeconds * 1000
    database.prepare('UPDATE carts SET user_id = COALESCE(?, user_id), updated_at = ?, expires_at = ? WHERE id = ?').run(user?.id || null, now, expiresAt, cart.id)
    appendCookie(response, cookie(config.cartCookie, currentToken, { maxAge: config.cartMaxAgeSeconds, secure: config.production }))
  }
  return cart
}

function attachCartToUser(database, request, config, userId) {
  const token = parseCookies(request.headers.cookie)[config.cartCookie]
  if (token) database.prepare('UPDATE carts SET user_id = ?, updated_at = ? WHERE token_hash = ? AND converted_order_id IS NULL').run(userId, Date.now(), tokenHash(token))
}

function getCartSnapshot(database, cart) {
  const rows = database.prepare(`
    SELECT ci.id AS cart_item_id, ci.product_id, ci.size, ci.quantity, p.*
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ? AND p.active = 1 ORDER BY ci.created_at
  `).all(cart.id)
  const items = rows.map((row) => ({
    id: row.cart_item_id,
    productId: row.product_id,
    ...(row.size ? { size: row.size } : {}),
    quantity: row.quantity,
    product: productFromRow(row),
  }))
  return {
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  }
}

function emptyCartSnapshot() {
  return { items: [], count: 0, subtotal: 0 }
}

function readCatalog(database) {
  return { products: readProducts(database), gallery: readGallery(database), archive: readArchive(database) }
}
const readProducts = (database) => database.prepare('SELECT * FROM products WHERE active = 1 ORDER BY created_at, name').all().map(productFromRow)
const readGallery = (database) => database.prepare('SELECT id, title, image, year FROM gallery ORDER BY created_at, id').all()
const readArchive = (database) => database.prepare('SELECT id, title, image, year, code, pieces FROM archive ORDER BY year DESC, created_at').all()

function productFromRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    code: row.code,
    price: Number(row.price),
    image: row.image,
    images: parseJson(row.images_json, [row.image]),
    category: row.category,
    description: row.description,
    details: parseJson(row.details_json, []),
    ...(row.sizes_json ? { sizes: parseJson(row.sizes_json, []) } : {}),
    stock: Number(row.stock),
    edition: row.edition,
    status: row.status,
    active: Boolean(row.active),
  }
}

async function normalizeProductInput(body, existing, config) {
  const hasImages = Array.isArray(body.images) && body.images.length > 0
  const images = hasImages ? await storeImages(body.images, config) : existing?.images
  if (!images?.length) throw new ApiError(400, 'INVALID_IMAGES', 'Nahraj alespoň jeden obrázek.')
  const category = body.category ?? existing?.category
  if (!['oděv', 'objekt', 'doplněk'].includes(category)) throw new ApiError(400, 'INVALID_CATEGORY', 'Neplatná kategorie produktu.')
  const details = body.details ?? existing?.details ?? []
  const sizes = body.sizes ?? existing?.sizes
  if (!Array.isArray(details) || details.length > 30) throw new ApiError(400, 'INVALID_DETAILS', 'Textové body nejsou platné.')
  if (sizes !== undefined && (!Array.isArray(sizes) || sizes.length > 30)) throw new ApiError(400, 'INVALID_SIZES', 'Velikosti nejsou platné.')
  const status = body.status ?? existing?.status ?? 'available'
  if (!['available', 'last-pieces'].includes(status)) throw new ApiError(400, 'INVALID_STATUS', 'Neplatný stav produktu.')
  return {
    name: text(body.name ?? existing?.name, 'Název', 1, 120),
    code: text(body.code ?? existing?.code, 'Kód', 1, 80),
    price: integer(body.price ?? existing?.price, 'Cena', 0, 10_000_000),
    image: images[0], images,
    category,
    description: text(body.description ?? existing?.description, 'Popis', 1, 2_000),
    details: details.map((value) => text(value, 'Textový bod', 1, 300)),
    sizes: sizes?.map((value) => text(value, 'Velikost', 1, 30)),
    stock: integer(body.stock ?? existing?.stock, 'Sklad', 0, 1_000_000),
    edition: text(body.edition ?? existing?.edition, 'Edice', 1, 120),
    status,
    active: body.active ?? existing?.active ?? true,
  }
}

function fullOrder(database, row, config) {
  return {
    ...orderSummary(row, config),
    email: row.email,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    address: row.address,
    city: row.city,
    zip: row.zip,
    country: row.country,
    shippingMethod: row.shipping_method,
    shippingPrice: row.shipping_price,
    subtotal: row.subtotal,
    items: database.prepare('SELECT id, product_id, product_name, product_code, unit_price, quantity, size, image, subtotal FROM order_items WHERE order_id = ?').all(row.id).map((item) => ({
      id: item.id, productId: item.product_id, productName: item.product_name, productCode: item.product_code, unitPrice: item.unit_price, quantity: item.quantity, ...(item.size ? { size: item.size } : {}), image: item.image, subtotal: item.subtotal,
    })),
  }
}

function orderSummary(row, config) {
  const order = {
    id: row.id,
    number: row.order_number,
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    createdAt: new Date(row.created_at).toISOString(),
  }
  if (row.payment_method === 'bank_transfer' && config.bankAccount) {
    const variableSymbol = (BigInt(`0x${tokenHash(row.id).slice(0, 12)}`) % 10_000_000_000n).toString()
    order.bankTransfer = { accountNumber: config.bankAccount, variableSymbol }
  }
  return order
}

function userFromRow(row) {
  return { id: row.id, username: row.username, email: row.email, role: row.role, createdAt: new Date(row.created_at).toISOString(), lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null }
}

function writeAuditEvent(database, user, action, entityType, entityId, metadata = {}) {
  database.prepare('INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), user?.id || null, action, entityType, entityId || null, JSON.stringify(metadata), Date.now())
}

function requireUser(user) {
  if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Pro tuto akci se musíš přihlásit.')
}
function requireStaff(user) {
  requireUser(user)
  if (!staffRoles.has(user.role)) throw new ApiError(403, 'STAFF_REQUIRED', 'Tato akce je dostupná pouze správci obchodu.')
}
function requireAdmin(user) {
  requireUser(user)
  if (user.role !== 'admin') throw new ApiError(403, 'ADMIN_REQUIRED', 'Tato akce je dostupná pouze administrátorovi.')
}

function normalizeSize(value, productRow) {
  const sizes = parseJson(productRow.sizes_json, [])
  // Produkty bez variant ukládají `sizes_json` jako JSON hodnotu null.
  // Takový produkt se přidá bez velikosti; pole vyžadujeme jen u oděvů s variantami.
  if (!Array.isArray(sizes) || !sizes.length) return ''
  const size = String(value || '')
  if (!sizes.includes(size)) throw new ApiError(400, 'INVALID_SIZE', 'Vyber dostupnou velikost produktu.')
  return size
}

function uniqueSlug(database, value, excludedId) {
  const base = slugify(value) || `object-${Date.now()}`
  let candidate = base
  let index = 2
  const isTaken = (slug) => excludedId
    ? database.prepare('SELECT 1 FROM products WHERE slug = ? AND id != ?').get(slug, excludedId)
    : database.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)
  while (isTaken(candidate)) candidate = `${base}-${index++}`
  return candidate
}

function slugify(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
}

function text(value, label, minimum, maximum) {
  const result = String(value ?? '').trim()
  if (result.length < minimum || result.length > maximum) throw new ApiError(400, 'INVALID_FIELD', `${label} musí mít ${minimum} až ${maximum} znaků.`, { field: label })
  return result
}
function emailValue(value) {
  const email = String(value || '').trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'INVALID_EMAIL', 'Zadej platnou e-mailovou adresu.')
  return email
}
function integer(value, label, minimum, maximum) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new ApiError(400, 'INVALID_NUMBER', `${label} musí být celé číslo od ${minimum} do ${maximum}.`)
  return number
}
const parseJson = (value, fallback) => { try { return JSON.parse(value) } catch { return fallback } }
const createOrderNumber = () => `CHV-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`

function matchPath(actual, template) {
  const actualParts = actual.split('/').filter(Boolean)
  const templateParts = template.split('/').filter(Boolean)
  if (actualParts.length !== templateParts.length) return null
  const values = {}
  for (let index = 0; index < templateParts.length; index++) {
    if (templateParts[index].startsWith(':')) values[templateParts[index].slice(1)] = decodeURIComponent(actualParts[index])
    else if (templateParts[index] !== actualParts[index]) return null
  }
  return values
}

function applyCors(request, response, config) {
  const origin = request.headers.origin
  response.setHeader('Vary', 'Origin')
  if (origin && config.allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Idempotency-Key')
}
function verifyMutationOrigin(request, config) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method || '')) return
  const origin = request.headers.origin
  if (origin && config.allowedOrigins.has(origin)) return
  if (!origin && config.production) {
    try {
      const refererOrigin = request.headers.referer ? new URL(request.headers.referer).origin : null
      if (refererOrigin && config.allowedOrigins.has(refererOrigin)) return
    } catch {
      // Neplatný Referer se chová stejně jako chybějící.
    }
  }
  if (origin || config.production) throw new ApiError(403, 'INVALID_ORIGIN', 'Požadavek přišel z nepovoleného původu.')
}

function limitRequest(rateLimiter, key, capacity, windowMs) {
  rateLimiter.consume(key, { capacity, windowMs })
}

function rejectHoneypot(body) {
  if (String(body?.website || '').trim()) throw new ApiError(400, 'INVALID_REQUEST', 'Požadavek nebyl přijat.')
}

function applySecurityHeaders(response, config) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(config.production ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
  response.setHeader('Content-Security-Policy', csp)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
  if (config.production) response.setHeader('Strict-Transport-Security', 'max-age=31536000')
}

async function serveUpload(request, response, url, config) {
  if (!['GET', 'HEAD'].includes(request.method || '')) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Metoda není povolena.')
  const filename = url.pathname.slice('/uploads/'.length)
  if (!/^[a-f0-9]{64}\.(?:png|jpg|webp|gif)$/.test(filename)) throw new ApiError(404, 'NOT_FOUND', 'Soubor nebyl nalezen.')
  return streamFile(request, response, join(config.uploadsDirectory, filename), true)
}

async function serveFrontend(request, response, url, config) {
  if (!['GET', 'HEAD'].includes(request.method || '')) throw new ApiError(404, 'NOT_FOUND', 'Stránka nebyla nalezena.')
  if (!existsSync(config.distDirectory)) throw new ApiError(404, 'FRONTEND_NOT_BUILT', 'Frontend ještě není sestaven. Spusť vývojový server nebo npm run build.')
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '')
  let filePath = resolve(config.distDirectory, requested || 'index.html')
  if (relative(config.distDirectory, filePath).startsWith('..')) throw new ApiError(404, 'NOT_FOUND', 'Soubor nebyl nalezen.')
  try {
    if (!(await stat(filePath)).isFile()) filePath = join(config.distDirectory, 'index.html')
  } catch {
    filePath = extname(filePath) ? filePath : join(config.distDirectory, 'index.html')
  }
  try { return await streamFile(request, response, filePath, false) } catch (error) {
    if (error?.code === 'ENOENT') throw new ApiError(404, 'NOT_FOUND', 'Soubor nebyl nalezen.')
    throw error
  }
}

async function streamFile(request, response, filePath, immutable) {
  const info = immutable ? await lstat(filePath) : await stat(filePath)
  if (!info.isFile()) throw new ApiError(404, 'NOT_FOUND', 'Soubor nebyl nalezen.')
  const type = mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
  const fingerprinted = /[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|png|jpe?g|webp|gif)$/.test(filePath)
  const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
  const cacheControl = immutable || fingerprinted ? 'public, max-age=31536000, immutable' : extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600'
  response.setHeader('Content-Type', type)
  response.setHeader('Cache-Control', cacheControl)
  response.setHeader('ETag', etag)
  response.setHeader('Last-Modified', info.mtime.toUTCString())
  if (request.headers['if-none-match'] === etag) {
    response.statusCode = 304
    return response.end()
  }
  response.statusCode = 200
  response.setHeader('Content-Length', info.size)
  if (request.method === 'HEAD') return response.end()
  createReadStream(filePath).pipe(response)
}

function sendJson(response, status, payload) {
  if (response.writableEnded) return
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.setHeader('Cache-Control', 'no-store')
  response.end(body)
}
function sendEmpty(response, status) { response.statusCode = status; response.end() }

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
