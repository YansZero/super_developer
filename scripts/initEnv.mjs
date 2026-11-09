import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, 'backend', '.env')
const envExamplePath = path.join(root, 'backend', '.env.example')

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath)
    console.log('已成功將 backend/.env.example 複製為 backend/.env。')
  } else {
    console.error(`找不到範本檔案：${envExamplePath}`)
    process.exit(1)
  }
} else {
  console.log('backend/.env 已存在，保留既有設定。')
}
