import { createChvozApplication } from './app.mjs'

const { server, config } = await createChvozApplication()

server.listen(config.port, config.host, () => {
  console.log(`CHVOZ API: http://${config.host}:${config.port}`)
  if (!config.adminPassword && !config.adminPasswordSha256) {
    console.warn('Admin se vytvoří při prvním startu s CHVOZ_ADMIN_PASSWORD nebo CHVOZ_ADMIN_PASSWORD_SHA256. Heslo se nikdy nedává do klientského VITE_* prostředí.')
  }
})

server.on('clientError', (error, socket) => {
  if (!socket.writable) return socket.destroy()
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    const deadline = setTimeout(() => {
      server.closeAllConnections()
      process.exit(1)
    }, 10_000)
    deadline.unref()
    server.close(() => {
      clearTimeout(deadline)
      process.exit(0)
    })
  })
}
