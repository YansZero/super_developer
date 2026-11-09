# Super Developer

[繁體中文](README.md) | [English](README.en.md) | [Español](README.es.md)

個人專案管理與 AI 協作控制台，以模組化 Dashboard、集中設定中心與本機 Node Loopback Agent 建構。整合 Git 操作、Jira 任務排程、AI CLI 派工、Skills/MCP 與 Prompt 統一管理。

---

## 核心功能特色

### 1. 專案總覽與詳情 (Project Overview & Detail)
- **專案管理**：支援使用本機原生檔案選擇器批次加入多個專案資料夾，支援釘選、多選分析、重新分析與安全移除（不刪除本機原始檔案）。
- **即時系統看板與問候語**：頁面頂端配置即時系統時間與依時段變化的動態問候語（早晨、中午、下午、夜間休息提醒），以及可自訂混選最多 5 種動物與 4 款跑道背景（純色、草地、夕陽、夜晚）的動畫展示。
- **跨平台資料夾開啟**：一鍵開啟專案所在的本機目錄，自動適配 macOS（`open`）、Windows（`explorer.exe`）與 Linux（`xdg-open`）。
- **工作區健康狀態與規格檢視**：
  - 水平置頂橫幅即時呈現未提交檔案、領先/落後 Commit 數、Jira 任務數、前後端進度與 AI Provider 狀態。
  - 整合專案 `spec/` 檔案檢視器，支援以 Markdown 預覽派工文件與技術規格。

### 2. Git 操作與 Commit / Stash 工作台
- **指令控制台**：支援 status、fetch、pull、push、branches、commit 歷史與 checkout。
- **互動式 Commit 工作台**：
  - 支援檔案多選勾選與變更差異（Diff）即時對照。
  - 支援 `git stash push -u` 快速暫存所選檔案（含已修改與未追蹤檔案）。
  - 切換專案時具備非同步競爭保護與未提交檔案清單實時更新。
  - 提供 `Push` 按鈕一鍵提交並推送，清空時自動切回控制台。

### 3. Jira 工作中心與 OAuth 整合
- **任務工作台**：整合「我的待辦事項」與「專案派工」，提供搜尋、排序、篩選、狀態分組與卡片/清單檢視切換。
- **Ticket 本機指派**：將 Jira Ticket 指派給本機專案，專案詳情自動呈現關聯之 Jira 專案代碼，重新分析時自動保留指派關係。
- **多組 OAuth Client 支援**：後端 BFF 支援以環境變數與 SQLite 持久化多組 Atlassian OAuth Client，支援獨立登入、連線檢測與切換。

### 4. AI 協作與工作中心 (AI Work Center)
- **AI 工作排程**：集中檢視與管理各專案的 AI Job，保存 Prompt 輸入、Provider、模型、思考強度（Effort）、執行輸出紀錄與即時狀態。
- **分頁與過濾**：執行中工作與歷史工作獨立分開展示，支援按 Job ID、摘要、專案、Jira 關鍵字與篩選器檢索。
- **支援主流 AI CLI**：內建整合 `Antigravity (agy)`、`OpenAI Codex`、`Claude Code`，並支援自訂 CLI Provider。設定檔採安全權限原子寫入本機（`~/.config/super-developer/providers.config.json`），絕不透過前端外洩敏感憑證。

### 5. 資源庫：Skills、MCP 與 Prompt 管理
- **Skills & MCP**：集中管理 `library/skills` 與 `library/mcps`，具備預覽、編輯、附屬檔案管理與 Target 安裝狀態追蹤。
- **Prompt 範本庫**：支援 Markdown 預覽與多語系範本管理，可由 AI 輔助產生草稿或翻譯成繁中、英文、西班牙文。

### 6. 多主題與多國語系
- **四款直角幾何主題**：支援 Modern、Esports、8-Bit 與 Retro 風格，全站直角幾何設計，設定即時持久化於本機。
- **完整多國語系 (i18n)**：支援繁體中文（zh-TW）、英文（en）與西班牙文（es）一鍵切換。

---

## 系統架構

```
┌────────────────────────────────────────────────────────┐
│                   Vite + React 19 Frontend             │
│   (AppShell, Project Overview, Git, Jira, AI Center)   │
└──────────────┬───────────────────────────┬─────────────┘
               │ (Proxy /api/...)          │ (Direct /api/...)
               ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│      Jira BFF (Node.js)   │ │  Local Provider Agent    │
│  - Express 4 + SQLite     │ │  - Native Node Loopback  │
│  - OAuth 2.0 Clients      │ │  - Local Git & FS Ops    │
│  - Tickets & Sites State  │ │  - CLI Adapters (agy,    │
└───────────────────────────┘ │    codex, claude)        │
                              └──────────────────────────┘
```

- **前端**：Vite 8、React 19、TypeScript 6、Sass。
- **後端 (BFF)**：Node.js 24 原生 SQLite、Express、Session 與 Helmet。
- **本機 Agent**：Node.js Loopback 伺服器，負責本機檔案操作、Git 指令執行與 AI CLI 程序調度。

---

## 安裝與快速啟動

### 系統需求
- **Node.js 24** 或以上版本（需具備內建 SQLite 支援）。
- **npm 10** 或以上版本。
- *(選配)* **Python 3.10+ 及 venv 套件**（如 `sudo apt install python3-venv`，僅在啟用 Graphify 知識圖譜 Skill / MCP 時需要）。

### 1. 快速安裝（推薦一鍵設定）

```bash
# 複製儲存庫並進入目錄
cd super_developer

# 安裝根目錄相依套件
npm ci

# 一鍵初始化：建立環境設定檔、安裝後端依賴並產生隨機安全密鑰
npm run setup

# 啟動全端開發環境（前端 5173 + 後端 BFF 4318）
npm run dev:all
```

### 2. 手動逐步安裝流程

```bash
# 1. 安裝前端相依套件
npm ci

# 2. 複製後端環境變數設定檔
npm run env:init
# 或手動執行：cp backend/.env.example backend/.env

# 3. 安裝後端 BFF 依賴套件
npm run bff:install

# 4. 產生或補齊本機隨機安全密鑰（SESSION_SECRET 與 TOKEN_ENCRYPTION_KEY）
npm run renew

# 5. 啟動開發伺服器
npm run dev:all
```

> **注意**：`npm run renew` 會檢查 `backend/.env`，若缺少 `SESSION_SECRET` 或 `TOKEN_ENCRYPTION_KEY` 則會自動補齊 32 位元強隨機金鑰，既有數值將維持不變。

---

## 常用指令列表

| 指令 | 說明 |
|---|---|
| `npm run setup` | 一鍵完成環境設定：複製 `.env`、安裝後端套件並生成安全金鑰 |
| `npm run env:init` | 檢查並自 `backend/.env.example` 複製生成 `backend/.env` |
| `npm run bff:install` | 安裝後端 BFF 依賴套件（等同 `npm --prefix backend ci`） |
| `npm run renew` | 自動補齊環境設定檔中缺少的加密密鑰，保留既有設定 |
| `npm run dev:all` | 同時啟動前端 Vite 伺服器（Port 5173）與後端 Jira BFF（Port 4318） |
| `npm run dev:frontend` | 僅啟動前端 Vite 開發伺服器 |
| `npm run dev:bff` | 編譯並啟動後端 Jira BFF 服務 |
| `npm run build` | 編譯前端靜態產物與後端生產代碼 |
| `npm run typecheck` | 執行前後端完整 TypeScript 型別檢查 |
| `npm run lint` | 執行 ESLint 靜態代碼檢查 |
| `npm run jira:config:check` | 檢查目前 Jira 公開連線環境設定合法性 |

---

## 本機目錄與安全規則

下列目錄與檔案屬於本機執行暫存或私有憑證，已設定由 Git 排除且不應提交至版本庫：

- `backend/.env` 與各類 `.env.*`（僅保留範本 `backend/.env.example`）
- `backend/data/`（包含本機 SQLite 資料庫、使用者 Session 與 OAuth Token）
- `~/.config/super-developer/`（使用者本機 AI CLI Provider 連線組態）
- `dist/`、`backend/dist/`、`node_modules/`（編譯產物與相依套件目錄）
