import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const viteEntry = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(viteEntry)) {
  console.error('Chybí node_modules. Nejdřív spusť npm.cmd install nebo pnpm install.')
  process.exit(1)
}

const apiHost = process.env.CHVOZ_HOST || '127.0.0.1'
const apiPort = process.env.CHVOZ_PORT || '8787'
const environment = {
  ...process.env,
  VITE_API_URL: process.env.VITE_API_URL || `http://${apiHost}:${apiPort}`,
}

// Jeden příkaz spustí API i Vite. Oba procesy sdílejí terminál a Ctrl+C je
// korektně ukončí, takže po vývoji nezůstane běžet skrytý lokální server.
const children = [
  spawn(process.execPath, ['--watch', join(root, 'server', 'server.mjs')], { cwd: root, env: environment, stdio: 'inherit' }),
  spawn(process.execPath, [viteEntry], { cwd: root, env: environment, stdio: 'inherit' }),
]

let stopping = false
function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (!child.killed) child.kill('SIGTERM')
  setTimeout(() => process.exit(exitCode), 300).unref()
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`Vývojový proces skončil (${signal || code}).`)
      stop(code || 1)
    }
  })
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

