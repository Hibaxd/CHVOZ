import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { ApiError } from './security.mjs'

// Paměťový token bucket je druhá obranná vrstva za reverse proxy/WAF.
// Aplikace běží s SQLite jen v jedné instanci, proto je lokální limiter
// konzistentní s podporovaným produkčním modelem.
export function createRateLimiter({ maxEntries = 20_000 } = {}) {
  const buckets = new Map()

  function consume(key, { capacity, windowMs, cost = 1 }) {
    const now = Date.now()
    const refillPerMs = capacity / windowMs
    const previous = buckets.get(key)
    const tokens = previous
      ? Math.min(capacity, previous.tokens + Math.max(0, now - previous.updatedAt) * refillPerMs)
      : capacity

    if (tokens < cost) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cost - tokens) / refillPerMs / 1000))
      throw new ApiError(429, 'RATE_LIMITED', 'Příliš mnoho požadavků. Zkus to prosím později.', { retryAfterSeconds })
    }

    buckets.set(key, { tokens: tokens - cost, updatedAt: now })
    if (buckets.size > maxEntries) prune(now)
  }

  function prune(now = Date.now()) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.updatedAt > 24 * 60 * 60 * 1000 || buckets.size > maxEntries) buckets.delete(key)
      if (buckets.size <= maxEntries * 0.9) break
    }
  }

  return { consume, prune }
}

export function clientAddress(request, config) {
  const direct = normalizeAddress(request.socket.remoteAddress)
  if (!config.trustProxy || !config.trustedProxyAddresses.has(direct)) return direct
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const normalizedForwarded = normalizeAddress(forwarded)
  return normalizedForwarded === 'unknown' ? direct : normalizedForwarded
}

function normalizeAddress(value) {
  const candidate = String(value || '').trim().replace(/^::ffff:/, '')
  return isIP(candidate) ? candidate : 'unknown'
}

export const privacyKey = (value) => createHash('sha256').update(String(value)).digest('hex')
