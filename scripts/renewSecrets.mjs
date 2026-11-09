import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeSecrets } from './secretInitialization.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, 'backend', '.env')
const envExamplePath = path.join(root, 'backend', '.env.example')

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath)
    console.log(`未偵測到 ${envPath}，已自動自 backend/.env.example 複製建立初始環境檔。`)
  } else {
    console.error(`找不到 ${envPath} 且不存在範本 ${envExamplePath}；未寫入任何檔案。`)
    process.exit(1)
  }
}

let source
try {
  source = initializeSecrets(fs.readFileSync(envPath, 'utf8'))
} catch (error) {
  console.error(`初始化密鑰失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
  process.exit(1)
}

const temporaryPath = `${envPath}.renew-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
try {
  fs.writeFileSync(temporaryPath, source, { mode: 0o600, flag: 'wx' })
  fs.chmodSync(temporaryPath, 0o600)
  fs.renameSync(temporaryPath, envPath)
  console.log('已補齊缺少的密鑰，既有密鑰保持不變；值未輸出。請重新啟動 BFF。')
} catch (error) {
  try { fs.rmSync(temporaryPath, { force: true }) } catch { /* best-effort cleanup */ }
  console.error(`更新 backend/.env 失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
  process.exit(1)
}
