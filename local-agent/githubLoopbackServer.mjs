import http from 'node:http'
import { createGitHubApiHandler } from './githubHttpServer.mjs'

export function startLoopbackGitHubServer(options = {}) {
  const host = options.host || '127.0.0.1'
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new Error('Local Agent GitHub server may only bind to loopback (127.0.0.1 / ::1).')
  }
  const port = typeof options.port === 'number' ? options.port : 4319
  const handler = createGitHubApiHandler(options)
  const server = http.createServer((req, res) => {
    void handler(req, res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const addr = server.address()
      const boundPort = typeof addr === 'object' && addr ? addr.port : port
      resolve({
        server,
        host,
        port: boundPort,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => (err ? rejClose(err) : resClose()))
          }),
      })
    })
  })
}
