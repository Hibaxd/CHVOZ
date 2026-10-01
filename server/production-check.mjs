import { existsSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { relative } from 'node:path'
import { readConfig } from './config.mjs'

if (process.env.NODE_ENV !== 'production') throw new Error('Spusť kontrolu s NODE_ENV=production a skutečnými produkčními secrets.')
const config = readConfig()

if (/onedrive|dropbox|google drive/i.test(config.dataDirectory)) throw new Error('CHVOZ_DATA_DIR nesmí být na synchronizovaném disku.')
if (!existsSync(config.databasePath)) throw new Error(`Databáze neexistuje: ${config.databasePath}`)
if (!existsSync(config.distDirectory)) throw new Error('Chybí dist/. Nejdřív spusť pnpm run build.')

const sourceMaps = readdirSync(config.distDirectory, { recursive: true }).filter((name) => String(name).endsWith('.map'))
if (sourceMaps.length) throw new Error('Produkční dist obsahuje source mapy.')

const database = new DatabaseSync(config.databasePath, { readOnly: true })
try {
  const integrity = database.prepare('PRAGMA integrity_check').get()
  if (integrity.integrity_check !== 'ok') throw new Error(`SQLite integrity_check selhal: ${JSON.stringify(integrity)}`)
  const admin = database.prepare("SELECT username, password_hash FROM users WHERE role = 'admin' LIMIT 1").get()
  if (!admin) throw new Error('Databáze nemá administrátora.')
  if (!String(admin.password_hash).startsWith('scrypt$')) throw new Error('Admin heslo ještě není migrované na scrypt. Před deployem se jednou bezpečně přihlas a bootstrap hash odstraň.')
} finally {
  database.close()
}

if (process.env.CHVOZ_ADMIN_PASSWORD || process.env.CHVOZ_ADMIN_PASSWORD_SHA256) {
  throw new Error('Admin bootstrap secret je stále v prostředí. Po vytvoření scrypt účtu jej před spuštěním služby odstraň.')
}

console.log(`CHVOZ production check: OK (${relative(process.cwd(), config.databasePath) || config.databasePath})`)
