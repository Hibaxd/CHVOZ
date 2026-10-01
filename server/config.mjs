import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDirectory = dirname(fileURLToPath(import.meta.url))
export const projectRoot = resolve(serverDirectory, '..')

// Node načte lokální serverové proměnné ještě před sestavením konfigurace.
// Soubor není součástí výsledného browser bundlu a v repozitáři je ignorovaný.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile(join(projectRoot, '.env.local'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

// Konfigurace je záměrně postavená jen na proměnných prostředí. Citlivé údaje
// tak nikdy nemusí skončit ve zdrojovém kódu ani ve Vite klientském bundlu.
export function readConfig(overrides = {}) {
  const dataDirectory = resolve(overrides.dataDirectory || process.env.CHVOZ_DATA_DIR || join(projectRoot, 'data'))
  const production = (overrides.nodeEnv || process.env.NODE_ENV) === 'production'
  const configuredOrigins = overrides.allowedOrigins || process.env.CHVOZ_ALLOWED_ORIGINS
  const configuredProxyAddresses = overrides.trustedProxyAddresses || process.env.CHVOZ_TRUSTED_PROXY_ADDRESSES || '127.0.0.1,::1'
  const allowedOrigins = Array.isArray(configuredOrigins)
    ? configuredOrigins
    : String(configuredOrigins || 'http://127.0.0.1:4173,http://localhost:4173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)

  const config = {
    host: overrides.host || process.env.CHVOZ_HOST || '127.0.0.1',
    port: Number(overrides.port ?? process.env.CHVOZ_PORT ?? 8787),
    production,
    dataDirectory,
    databasePath: resolve(overrides.databasePath || process.env.CHVOZ_DATABASE_PATH || join(dataDirectory, 'chvoz.sqlite')),
    uploadsDirectory: resolve(overrides.uploadsDirectory || join(dataDirectory, 'uploads')),
    distDirectory: resolve(overrides.distDirectory || join(projectRoot, 'dist')),
    allowedOrigins: new Set(allowedOrigins.map(normalizeOrigin)),
    sessionCookie: production ? '__Host-chvoz_session' : 'chvoz_session',
    cartCookie: production ? '__Host-chvoz_cart' : 'chvoz_cart',
    sessionMaxAgeSeconds: 60 * 60 * 24 * 30,
    staffSessionMaxAgeSeconds: 60 * 60 * 12,
    cartMaxAgeSeconds: 60 * 60 * 24 * 30,
    jsonBodyLimitBytes: 16 * 1024 * 1024,
    smallJsonBodyLimitBytes: 32 * 1024,
    imageLimitBytes: 1_200_000,
    imageLimitCount: 8,
    imageMaxDimension: 8_000,
    imageMaxPixels: 24_000_000,
    uploadQuotaBytes: positiveInteger(overrides.uploadQuotaBytes ?? process.env.CHVOZ_UPLOAD_QUOTA_BYTES, 2 * 1024 * 1024 * 1024, 'CHVOZ_UPLOAD_QUOTA_BYTES'),
    uploadMinFreeBytes: positiveInteger(overrides.uploadMinFreeBytes ?? process.env.CHVOZ_UPLOAD_MIN_FREE_BYTES, 512 * 1024 * 1024, 'CHVOZ_UPLOAD_MIN_FREE_BYTES'),
    trustProxy: booleanValue(overrides.trustProxy ?? process.env.CHVOZ_TRUST_PROXY, false),
    trustedProxyAddresses: new Set(
      (Array.isArray(configuredProxyAddresses) ? configuredProxyAddresses : String(configuredProxyAddresses).split(','))
        .map((address) => String(address).trim().replace(/^::ffff:/, ''))
        .filter(Boolean),
    ),
    turnstileSiteKey: overrides.turnstileSiteKey ?? process.env.CHVOZ_TURNSTILE_SITE_KEY,
    turnstileSecretKey: overrides.turnstileSecretKey ?? process.env.CHVOZ_TURNSTILE_SECRET_KEY,
    botProtectionRequired: booleanValue(overrides.botProtectionRequired ?? process.env.CHVOZ_REQUIRE_BOT_CHECK, production),
    publicSiteUrl: normalizeOptionalOrigin(overrides.publicSiteUrl || process.env.CHVOZ_PUBLIC_URL),
    headersTimeoutMs: 15_000,
    requestTimeoutMs: 30_000,
    keepAliveTimeoutMs: 5_000,
    maxRequestsPerSocket: 100,
    adminUsername: process.env.CHVOZ_ADMIN_USERNAME || 'Hiba',
    adminEmail: process.env.CHVOZ_ADMIN_EMAIL || 'admin@chvoz.local',
    adminPassword: process.env.CHVOZ_ADMIN_PASSWORD,
    adminPasswordSha256: process.env.CHVOZ_ADMIN_PASSWORD_SHA256,
    bankAccount: process.env.CHVOZ_BANK_ACCOUNT,
  }

  validateConfig(config, overrides)
  return config
}

function booleanValue(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function positiveInteger(value, fallback, name) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} musí být kladné celé číslo.`)
  return parsed
}

function normalizeOrigin(value) {
  const parsed = new URL(String(value))
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`Neplatný webový origin: ${value}`)
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`Origin nesmí obsahovat cestu, query ani fragment: ${value}`)
  }
  return parsed.origin
}

function normalizeOptionalOrigin(value) {
  return value ? normalizeOrigin(value) : undefined
}

function validateConfig(config, overrides) {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) throw new Error('CHVOZ_PORT musí být platný TCP port.')
  if (config.botProtectionRequired && (!config.turnstileSiteKey || !config.turnstileSecretKey || !config.publicSiteUrl)) {
    throw new Error('Bot ochrana vyžaduje CHVOZ_PUBLIC_URL, CHVOZ_TURNSTILE_SITE_KEY a CHVOZ_TURNSTILE_SECRET_KEY.')
  }
  if (!config.production) return

  if (!process.env.CHVOZ_DATA_DIR && !overrides.dataDirectory) throw new Error('V produkci je povinné explicitně nastavit CHVOZ_DATA_DIR na lokální trvalý disk.')
  if (!config.allowedOrigins.size || [...config.allowedOrigins].some((origin) => !origin.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(origin))) {
    throw new Error('CHVOZ_ALLOWED_ORIGINS musí v produkci obsahovat pouze skutečné HTTPS originy.')
  }
  if (!config.publicSiteUrl || !config.allowedOrigins.has(config.publicSiteUrl)) {
    throw new Error('CHVOZ_PUBLIC_URL musí být jeden z HTTPS originů v CHVOZ_ALLOWED_ORIGINS.')
  }
  if (config.trustProxy && !config.trustedProxyAddresses.size) {
    throw new Error('CHVOZ_TRUST_PROXY vyžaduje alespoň jednu adresu v CHVOZ_TRUSTED_PROXY_ADDRESSES.')
  }
}
