import { openDatabase } from './database.mjs'
import { readConfig } from './config.mjs'

if (process.env.NODE_ENV !== 'production') throw new Error('Bootstrap spusť výhradně s NODE_ENV=production.')
if (!process.env.CHVOZ_ADMIN_PASSWORD && !process.env.CHVOZ_ADMIN_PASSWORD_SHA256) {
  throw new Error('Pro první bootstrap nastav jednorázové CHVOZ_ADMIN_PASSWORD.')
}

const config = readConfig()
if (/onedrive|dropbox|google drive/i.test(config.dataDirectory)) {
  throw new Error('Produkční data nesmí být na synchronizovaném disku.')
}

const database = await openDatabase(config)
try {
  const admin = database.prepare("SELECT username, password_hash FROM users WHERE role = 'admin' LIMIT 1").get()
  if (!admin) throw new Error('Admin účet se nepodařilo vytvořit.')
  console.log(`CHVOZ production bootstrap: OK (${admin.username})`)
} finally {
  database.close()
}
