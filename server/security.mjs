import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { lstat, mkdir, readdir, stat, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_LENGTH = 64

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// Scrypt je paměťově náročný password KDF; na rozdíl od prostého SHA-256 je
// vhodný pro hesla a každý účet dostává unikátní náhodnou sůl.
export async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, SCRYPT_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`
}

export async function verifyPassword(password, encoded) {
  try {
    if (String(encoded).startsWith('sha256$')) {
      const expected = Buffer.from(String(encoded).slice('sha256$'.length), 'hex')
      const actual = createHash('sha256').update(password).digest()
      return expected.length === actual.length && timingSafeEqual(expected, actual)
    }
    const [algorithm, n, r, p, saltValue, expectedValue] = String(encoded).split('$')
    if (algorithm !== 'scrypt') return false
    const expected = Buffer.from(expectedValue, 'base64url')
    const derived = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    })
    return expected.length === derived.length && timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

export const newOpaqueToken = () => randomBytes(32).toString('base64url')
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex')

export function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    try {
      cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      // Poškozená cookie se ignoruje místo pádu celého požadavku.
    }
  }
  return cookies
}

export function cookie(name, value, { maxAge, secure = false } = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Priority=High']
  if (Number.isFinite(maxAge)) attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  if (secure) attributes.push('Secure')
  return attributes.join('; ')
}

export function appendCookie(response, value) {
  const current = response.getHeader('Set-Cookie')
  response.setHeader('Set-Cookie', current ? [...(Array.isArray(current) ? current : [current]), value] : value)
}

export async function readJson(request, limitBytes) {
  const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Požadavek musí používat application/json.')
  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    request.resume()
    throw new ApiError(413, 'BODY_TOO_LARGE', 'Odeslaná data jsou příliš velká.')
  }
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limitBytes) {
      request.resume()
      throw new ApiError(413, 'BODY_TOO_LARGE', 'Odeslaná data jsou příliš velká.')
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Požadavek neobsahuje platný JSON.')
  }
}

const imageFormats = {
  'image/png': { extension: 'png', valid: (data) => data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/jpeg': { extension: 'jpg', valid: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/webp': { extension: 'webp', valid: (data) => data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP' },
  'image/gif': { extension: 'gif', valid: (data) => ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString()) },
}

// Klient může poslat data URL, server ale nevěří deklarovanému MIME typu:
// dekóduje Base64, ověří magické bajty a soubor pojmenuje hashem obsahu.
export async function storeDataUrlImage(dataUrl, config) {
  if (typeof dataUrl !== 'string') throw new ApiError(400, 'INVALID_IMAGE', 'Obrázek musí být data URL.')
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(dataUrl)
  if (!match) throw new ApiError(400, 'INVALID_IMAGE', 'Podporované formáty jsou PNG, JPEG, WebP a GIF.')
  if (match[2].length > Math.ceil(config.imageLimitBytes * 4 / 3) + 16) throw new ApiError(400, 'INVALID_IMAGE', 'Obrázek překračuje povolenou velikost.')
  const data = Buffer.from(match[2], 'base64')
  const format = imageFormats[match[1]]
  if (!data.length || data.length > config.imageLimitBytes || !format.valid(data)) {
    throw new ApiError(400, 'INVALID_IMAGE', `Obrázek je poškozený nebo překračuje limit ${Math.round(config.imageLimitBytes / 1024 / 1024)} MB.`)
  }
  const dimensions = imageDimensions(data, match[1])
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > config.imageMaxDimension || dimensions.height > config.imageMaxDimension || dimensions.width * dimensions.height > config.imageMaxPixels) {
    throw new ApiError(400, 'INVALID_IMAGE_DIMENSIONS', `Obrázek smí mít nejvýše ${config.imageMaxDimension} px na stranu a ${Math.round(config.imageMaxPixels / 1_000_000)} megapixelů.`)
  }
  const filename = `${createHash('sha256').update(data).digest('hex')}.${format.extension}`
  await mkdir(config.uploadsDirectory, { recursive: true })
  const destination = join(config.uploadsDirectory, filename)
  try {
    const existing = await lstat(destination)
    if (existing.isFile()) return `/uploads/${filename}`
    throw new ApiError(400, 'INVALID_UPLOAD_TARGET', 'Cíl uploadu není běžný soubor.')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await assertUploadCapacity(config, data.length)
  try {
    await writeFile(destination, data, { flag: 'wx' })
  } catch (error) {
    if (error?.code === 'EEXIST') {
      if ((await lstat(destination)).isFile()) return `/uploads/${filename}`
      throw new ApiError(400, 'INVALID_UPLOAD_TARGET', 'Cíl uploadu není běžný soubor.')
    }
    if (['ENOSPC', 'EDQUOT'].includes(error?.code)) throw new ApiError(507, 'UPLOAD_STORAGE_FULL', 'Úložiště obrázků je plné.')
    throw error
  }
  return `/uploads/${filename}`
}

function imageDimensions(data, mime) {
  if (mime === 'image/png' && data.length >= 24) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  if (mime === 'image/gif' && data.length >= 10) return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) }
  if (mime === 'image/jpeg') return jpegDimensions(data)
  if (mime === 'image/webp') return webpDimensions(data)
  return null
}

function jpegDimensions(data) {
  let offset = 2
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue }
    const marker = data[offset + 1]
    if (marker === 0xd9 || marker === 0xda) break
    const length = data.readUInt16BE(offset + 2)
    if (length < 2 || offset + 2 + length > data.length) return null
    if (startOfFrameMarkers.has(marker)) return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) }
    offset += 2 + length
  }
  return null
}

function webpDimensions(data) {
  const type = data.subarray(12, 16).toString()
  if (type === 'VP8X' && data.length >= 30) {
    return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) }
  }
  if (type === 'VP8L' && data.length >= 25 && data[20] === 0x2f) {
    const b1 = data[21], b2 = data[22], b3 = data[23], b4 = data[24]
    return { width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) }
  }
  if (type === 'VP8 ' && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff }
  }
  return null
}

export async function storeImages(values, config) {
  if (!Array.isArray(values) || values.length < 1 || values.length > config.imageLimitCount) {
    throw new ApiError(400, 'INVALID_IMAGES', `Nahraj 1 až ${config.imageLimitCount} obrázků.`)
  }
  const stored = []
  // Sekvenční zápis drží kontrolu kvóty konzistentní i při vícenásobném uploadu.
  for (const value of values) stored.push(await storeDataUrlImage(value, config))
  return stored
}

async function assertUploadCapacity(config, incomingBytes) {
  const filesystem = await statfs(config.uploadsDirectory)
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
  if (availableBytes - incomingBytes < config.uploadMinFreeBytes) {
    throw new ApiError(507, 'UPLOAD_STORAGE_LOW', 'Úložiště obrázků nemá dostatečnou bezpečnostní rezervu.')
  }

  let usedBytes = 0
  for (const entry of await readdir(config.uploadsDirectory, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    usedBytes += (await stat(join(config.uploadsDirectory, entry.name))).size
    if (usedBytes + incomingBytes > config.uploadQuotaBytes) {
      throw new ApiError(507, 'UPLOAD_QUOTA_EXCEEDED', 'Úložiště obrázků dosáhlo nastavené kvóty.')
    }
  }
}

export function publicUser(row) {
  return row ? { id: row.id, username: row.username, email: row.email, role: row.role } : null
}
