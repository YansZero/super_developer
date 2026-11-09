import './local-agent/gitHttpServer.d.ts'
import './local-agent/projectScanHttpServer.d.ts'
import './local-agent/githubHttpServer.d.ts'
import './local-agent/providerHttpServer.d.ts'
import './local-agent/dispatchHttpServer.d.ts'
import './local-agent/specFilesHttpServer.d.ts'
import './local-agent/ruleHttpServer.d.ts'
import './local-agent/libraryHttpServer.d.ts'
import { env } from 'node:process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLogger, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createGitApiHandler } from './local-agent/gitHttpServer.mjs'
import { createProjectScanApiHandler } from './local-agent/projectScanHttpServer.mjs'
import { createGitHubApiHandler } from './local-agent/githubHttpServer.mjs'
import { createProviderApiHandler } from './local-agent/providerHttpServer.mjs'
import { createDispatchApiHandler } from './local-agent/dispatchHttpServer.mjs'
import { createSpecFilesApiHandler } from './local-agent/specFilesHttpServer.mjs'
import { createRuleApiHandler } from './local-agent/ruleHttpServer.mjs'
import { createLibraryApiHandler } from './local-agent/libraryHttpServer.mjs'
import { withAgentLanguage } from './local-agent/requestI18n.mjs'

function localProviderAgentPlugin() {
  const gitApiHandler = createGitApiHandler()
  const projectScanApiHandler = createProjectScanApiHandler()
  const githubApiHandler = createGitHubApiHandler()
  const ruleApiHandler = createRuleApiHandler()
  const providerApiHandler = createProviderApiHandler()
  const dispatchApiHandler = createDispatchApiHandler({ backendPort: resolveBffPort() })
  const specFilesApiHandler = createSpecFilesApiHandler()
  const libraryApiHandler = createLibraryApiHandler()
  return {
    name: 'super-developer-local-provider-agent',
    configureServer(server: {
      middlewares: {
        use: (
          fn: (
            req: Parameters<typeof providerApiHandler>[0],
            res: Parameters<typeof providerApiHandler>[1],
            next: () => void,
          ) => void,
        ) => void
      }
    }) {
      server.middlewares.use((req, res, next) => withAgentLanguage(req.headers?.['accept-language'], () => {
        void libraryApiHandler(req, res, () => {
          // Dispatch owns both /api/agent/runs/:id/events and the legacy dispatch routes.
          void dispatchApiHandler(req, res, () => {
            void specFilesApiHandler(req, res, () => {
              void gitApiHandler(req, res, () => {
                void projectScanApiHandler(req, res, () => {
                  void githubApiHandler(req, res, () => {
                    void ruleApiHandler(req, res, () => {
                      void providerApiHandler(req, res, next)
                    })
                  })
                })
              })
            })
          })
        })
      }))
    },
    configurePreviewServer(server: {
      middlewares: {
        use: (
          fn: (
            req: Parameters<typeof providerApiHandler>[0],
            res: Parameters<typeof providerApiHandler>[1],
            next: () => void,
          ) => void,
        ) => void
      }
    }) {
      server.middlewares.use((req, res, next) => withAgentLanguage(req.headers?.['accept-language'], () => {
        void libraryApiHandler(req, res, () => {
          // Dispatch owns both /api/agent/runs/:id/events and the legacy dispatch routes.
          void dispatchApiHandler(req, res, () => {
            void specFilesApiHandler(req, res, () => {
              void gitApiHandler(req, res, () => {
                void projectScanApiHandler(req, res, () => {
                  void githubApiHandler(req, res, () => {
                    void ruleApiHandler(req, res, () => {
                      void providerApiHandler(req, res, next)
                    })
                  })
                })
              })
            })
          })
        })
      }))
    },
  }
}

function resolveBffPort(): number {
  if (/^\d+$/.test(env.SD_BFF_PORT ?? '')) {
    const port = Number(env.SD_BFF_PORT)
    if (port >= 1 && port <= 65535) return port
  }
  try {
    const envFile = readFileSync(resolve(process.cwd(), 'backend/.env'), 'utf8')
    const match = envFile.match(/^\s*SD_BFF_PORT\s*=\s*(\d+)\s*$/m)
    if (match) {
      const port = Number(match[1])
      if (port >= 1 && port <= 65535) return port
    }
  } catch {
    // backend/.env is optional or inaccessible
  }
  return 4318
}

// Only Jira/auth paths go to BFF; local-agent middleware retains its own routes.
const jiraPort = resolveBffPort()
const jiraProxy = {
  target: `http://127.0.0.1:${jiraPort}`,
  configure(proxy: unknown) {
    const emitter = proxy as { on: (event: 'error', listener: (error: unknown, req: unknown, res: unknown) => void) => void }
    emitter.on('error', (_error, _req, response) => {
      const res = response as { headersSent?: boolean; writeHead?: (status: number, headers: Record<string,string>) => void; end?: (body: string) => void }
      if (!res.headersSent && res.writeHead) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end?.(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Jira BFF is not running or temporarily unavailable' } }))
      }
    })
  },
}

const viteLogger = createLogger()
const safeLogger = {
  ...viteLogger,
  error(message: string, options?: Parameters<typeof viteLogger.error>[1]) {
    // Vite's default proxy log contains the callback URL, including OAuth query parameters.
    if (message.includes('http proxy error:') || message.includes('ws proxy error:')) {
      viteLogger.error('Jira BFF proxy unavailable', { timestamp: true })
      return
    }
    viteLogger.error(message, options)
  },
}

export default defineConfig({
  customLogger: safeLogger,
  plugins: [react(), localProviderAgentPlugin()],
  server: {
    host: 'localhost',
    port: 5173,
    proxy: { '/auth': jiraProxy, '/api/jira': jiraProxy, '/api/projects': jiraProxy, '/api/jobs': jiraProxy },
  },
  preview: { proxy: { '/auth': jiraProxy, '/api/jira': jiraProxy, '/api/projects': jiraProxy, '/api/jobs': jiraProxy } },
})
