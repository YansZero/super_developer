import { AsyncLocalStorage } from 'node:async_hooks'
import { createNodeI18n } from '../shared/nodeI18n.mjs'

const requestLanguage = new AsyncLocalStorage()
const defaultTranslator = createNodeI18n('zh-TW')

export function withAgentLanguage(language, handle) {
  return requestLanguage.run(createNodeI18n(language, 'zh-TW'), handle)
}

export function agentMessage(key, values) {
  return (requestLanguage.getStore() ?? defaultTranslator).t(key, values)
}
