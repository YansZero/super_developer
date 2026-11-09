import http from 'node:http'
import { createGitApiHandler } from './gitHttpServer.mjs'
import { createProjectScanApiHandler } from './projectScanHttpServer.mjs'
import { createGitHubApiHandler } from './githubHttpServer.mjs'
import { createProviderApiHandler } from './providerHttpServer.mjs'
import { createDispatchApiHandler } from './dispatchHttpServer.mjs'
import { createRuleApiHandler } from './ruleHttpServer.mjs'
import { createSpecFilesApiHandler } from './specFilesHttpServer.mjs'
import { createLibraryApiHandler } from './libraryHttpServer.mjs'
import { withAgentLanguage } from './requestI18n.mjs'

const portEnv = Number.parseInt(process.env.SD_LOCAL_AGENT_PORT || '4317', 10)
const port = Number.isFinite(portEnv) && portEnv > 0 && portEnv <= 65535 ? portEnv : 4317
const host = '127.0.0.1'

const gitHandler = createGitApiHandler()
const projectScanHandler = createProjectScanApiHandler()
const githubHandler = createGitHubApiHandler()
const ruleHandler = createRuleApiHandler()
const providerHandler = createProviderApiHandler()
const dispatchHandler = createDispatchApiHandler()
const specFilesHandler = createSpecFilesApiHandler()
const libraryHandler = createLibraryApiHandler()

const server = http.createServer((req, res) => withAgentLanguage(req.headers['accept-language'], () => {
  void libraryHandler(req, res, () => {
    void dispatchHandler(req, res, () => {
      void specFilesHandler(req, res, () => {
        void gitHandler(req, res, () => {
          void projectScanHandler(req, res, () => {
            void githubHandler(req, res, () => {
              void ruleHandler(req, res, () => {
                void providerHandler(req, res)
              })
            })
          })
        })
      })
    })
  })
}))
server.on('close', () => {
  dispatchHandler.close?.()
  libraryHandler.close?.()
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(port, host, () => resolve(undefined))
})

process.stdout.write(
  `Super Developer Local Agent (providers + rules + github) listening on http://${host}:${port}\n`,
)
