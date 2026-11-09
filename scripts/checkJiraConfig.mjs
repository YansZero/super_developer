import { loadJiraPublicConfig, PUBLIC_CONFIG_FIELDS } from '../backend/config/jiraPublicConfig.mjs'

const labels = { valid: '合法', missing: '缺少', invalid: '格式錯誤' }
try {
  const result = loadJiraPublicConfig(process.env)
  for (const { field, status } of result.fields) console.log(`${field}: ${labels[status]}`)
  console.log('真實 OAuth 尚未驗收；公開欄位合法時，BFF 可進入設定模式，先保存 SQLite OAuth Client 再登入。')
  const setupReady = result.fields
    .filter(({ field }) => field !== 'ATLASSIAN_CLIENT_ID')
    .every(({ status }) => status === 'valid')
  process.exitCode = result.valid || setupReady ? 0 : 1
} catch {
  // Do not print raw exceptions, environment contents or input values.
  for (const field of PUBLIC_CONFIG_FIELDS) console.log(`${field}: 格式錯誤`)
  console.log('公開設定檢查失敗；請修正欄位後再啟動 BFF。')
  process.exitCode = 1
}
