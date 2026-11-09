# Super Developer

[English](README.en.md) | [繁體中文](README.md) | [Español](README.es.md)

Personal project management and AI collaboration console built with a modular dashboard, centralized settings center, and a local Node Loopback Agent. Seamlessly integrates Git workflows, Jira task scheduling, AI CLI dispatching, Skills/MCP management, and Prompt engineering.

---

## Key Features

### 1. Project Overview & Detail
- **Project Directory Management**: Batch-add multiple local project folders via native platform file picker. Supports project pinning, multi-selection analysis, re-analysis, and safe removal (without deleting local files on disk).
- **Real-Time System Clock & Dynamic Greetings**: Live system clock at page header with time-of-day greeting messages (Morning, Noon, Afternoon, Night fatigue care). Includes customizable animated animal tracks with up to 5 animals and 4 scenic backgrounds (Solid, Grass, Sunset, Night).
- **Cross-Platform Open Folder**: Instant one-click folder launch adapted for macOS (`open`), Windows (`explorer.exe`), and Linux (`xdg-open`).
- **Workspace Health & Specification Viewer**:
  - Horizontal top banner showing real-time uncommitted files, ahead/behind commit counts, Jira tickets, stack progress, and AI provider availability.
  - Built-in `spec/` markdown document viewer for reviewing technical specifications and dispatch records.

### 2. Git Operations & Commit / Stash Workbench
- **Command Console**: Full support for status, fetch, pull, push, branches, commit log, and checkout.
- **Interactive Commit Workbench**:
  - Multi-file selection with side-by-side syntax-highlighted diff viewer.
  - Quick stash with `git stash push -u` for selected modified and untracked files.
  - Async race-condition protection and real-time pending change refreshes when switching between projects.
  - Dedicated `Push` button for one-click commit and push; automatically navigates back to console when all files are committed.

### 3. Jira Work Center & OAuth Integration
- **Ticket Workbench**: Unified workbench combining "My Tasks" and "Project Dispatch" with search, column sorting, filtering, status grouping, and Card/List view modes.
- **Local Ticket Assignment**: Assign Jira tickets to local workspace projects; Project Detail automatically displays source Jira project codes and retains bindings upon re-analysis.
- **Multiple OAuth Clients**: Express/TypeScript BFF supports persisting multiple Atlassian OAuth clients via environment variables or SQLite database, enabling independent login, connectivity check, and client switching.

### 4. AI Collaboration & Work Center
- **AI Job Scheduling**: Centrally view and manage AI tasks across all projects. Records prompt inputs, selected provider, model, reasoning effort, execution output logs, and live execution status.
- **Independent Tabbed Sections**: Active jobs and completed history sections are paginated and collapsible independently, with search support across Job ID, summary, project, and Jira keys.
- **Native AI CLI Integration**: Built-in support for `Antigravity (agy)`, `OpenAI Codex`, `Claude Code`, and custom CLI providers. Configuration is securely persisted with atomic operations (`~/.config/super-developer/providers.config.json`), ensuring zero credential leakage to frontend storage.

### 5. Central Library: Skills, MCP & Prompts
- **Skills & MCP Management**: Manage `library/skills` and `library/mcps` with preview-first editing, attachment controls, and target agent installation tracking.
- **Prompt Templates**: Markdown-based prompt manager with multi-language preview, AI-assisted drafting, and automated translation between Traditional Chinese, English, and Spanish.

### 6. Themes & Internationalization (i18n)
- **Sharp-Corner Themes**: 4 unified styles (Modern, Esports, 8-Bit, and Retro) with immediate local persistence.
- **Full Localization**: Seamless one-click switching between Traditional Chinese (`zh-TW`), English (`en`), and Spanish (`es`).

---

## Architecture Overview

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

- **Frontend**: Vite 8, React 19, TypeScript 6, Sass.
- **Backend (BFF)**: Node.js 24 with native SQLite, Express, Session, and Helmet.
- **Local Agent**: Node.js Loopback service managing local filesystem access, Git execution, and AI CLI sub-processes.

---

## Installation & Quick Start

### Prerequisites
- **Node.js 24** or higher (with native SQLite support enabled).
- **npm 10** or higher.
- *(Optional)* **Python 3.10+ with venv support** (e.g. `sudo apt install python3-venv`, only required if enabling the Graphify knowledge graph Skill/MCP).

### 1. Quick Setup (Recommended)

```bash
# Clone repository and enter directory
cd super_developer

# Install root dependencies
npm ci

# One-click initialization: sets up .env, installs backend deps, and generates secrets
npm run setup

# Start full-stack development environment (Frontend: 5173, Backend BFF: 4318)
npm run dev:all
```

### 2. Manual Step-by-Step Setup

```bash
# 1. Install frontend dependencies
npm ci

# 2. Initialize backend environment file
npm run env:init
# Or manually run: cp backend/.env.example backend/.env

# 3. Install backend BFF dependencies
npm run bff:install

# 4. Generate local random cryptographic secrets (SESSION_SECRET & TOKEN_ENCRYPTION_KEY)
npm run renew

# 5. Start the full-stack development servers
npm run dev:all
```

> **Note**: `npm run renew` verifies `backend/.env`. If `SESSION_SECRET` or `TOKEN_ENCRYPTION_KEY` are missing or empty, it generates 32-byte cryptographically secure random keys while preserving existing configuration values.

---

## Command Reference

| Command | Description |
|---|---|
| `npm run setup` | One-click setup: copies `.env`, installs BFF packages, and generates secrets |
| `npm run env:init` | Verifies and copies `backend/.env.example` to `backend/.env` |
| `npm run bff:install` | Installs backend BFF dependencies (`npm --prefix backend ci`) |
| `npm run renew` | Generates missing cryptographic keys in backend `.env` |
| `npm run dev:all` | Concurrently starts Vite frontend (port 5173) and Jira BFF (port 4318) |
| `npm run dev:frontend` | Starts Vite frontend dev server only |
| `npm run dev:bff` | Builds and starts Jira BFF server only |
| `npm run build` | Builds frontend production assets and backend bundle |
| `npm run typecheck` | Runs comprehensive TypeScript typecheck for frontend and backend |
| `npm run lint` | Runs ESLint static analysis |
| `npm run jira:config:check` | Validates public Jira configuration parameters |

---

## Local Files & Security Rules

The following paths contain machine-local state or private credentials, are excluded by Git, and must never be committed:

- `backend/.env` and other `.env.*` files (only `backend/.env.example` is committed as a template)
- `backend/data/` (local SQLite database, session files, and OAuth tokens)
- `~/.config/super-developer/` (local AI CLI provider configuration file)
- `dist/`, `backend/dist/`, `node_modules/` (build artifacts and dependency folders)
