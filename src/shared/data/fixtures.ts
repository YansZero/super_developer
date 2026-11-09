import type {
  IntegrationState,
  ProjectItem,
  ProviderSummary,
  ThemeMeta,
} from '../types/domain'

export const PROTOTYPE_STAGE_BANNER = {
  title: 'Phase 1 UI Prototype (Demo Mode)',
  localAgentStatus: 'Provider Local Agent Offline (Not Connected)',
  dataNotice:
    'Projects shown here are selected by user; click "Analyze Project" to retrieve Git, todos, specs, and Jira summaries via Local Agent and connected services.',
  gitNoRepoWarning: 'No Git repository detected',
} as const

export const THEME_OPTIONS: ThemeMeta[] = [
  {
    id: 'modern',
    name: 'theme.modern.name',
    subtitle: 'theme.modern.description',
    paletteSummary: 'theme.modern.palette',
    effectSummary: 'theme.modern.characteristics',
  },
  {
    id: 'esports',
    name: 'theme.esports.name',
    subtitle: 'theme.esports.description',
    paletteSummary: 'theme.esports.palette',
    effectSummary: 'theme.esports.characteristics',
  },
  {
    id: '8bit',
    name: 'theme.8bit.name',
    subtitle: 'theme.8bit.description',
    paletteSummary: 'theme.8bit.palette',
    effectSummary: 'theme.8bit.characteristics',
  },
  {
    id: 'retro',
    name: 'theme.retro.name',
    subtitle: 'theme.retro.description',
    paletteSummary: 'theme.retro.palette',
    effectSummary: 'theme.retro.characteristics',
  },
]

export const DEMO_PROVIDERS: ProviderSummary[] = [
  {
    id: 'antigravity',
    name: 'Antigravity (agy)',
    shortLabel: 'agy',
    cliCommand: 'agy',
    defaultCliPath: 'agy',
    cliPath: 'agy',
    isBuiltin: true,
    authModeLabel: 'Google Account OAuth login (supports agy models and credentials probe)',
    supportsAuthProbe: true,
    supportsLoginCommand: true,
    loginCommandHint: 'agy',
    loginGuideText: 'provider.loginGuide.antigravity',
    statusKind: 'unknown',
    statusText: '🟡 Unchecked (pending local probe)',
    cliStatus: 'unprobed',
    authStatus: 'unknown',
    version: null,
    checkedAt: null,
    errorCode: null,
    errorMessage: null,
    demoNote:
      'Default unchecked state; click "Test Connection / Re-check" to verify CLI binary and version.',
    isDemo: false,
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    shortLabel: 'codex',
    cliCommand: 'codex',
    defaultCliPath: 'codex',
    cliPath: 'codex',
    isBuiltin: true,
    authModeLabel: 'ChatGPT OAuth / Device Auth (supports codex login status read-only query)',
    supportsAuthProbe: true,
    supportsLoginCommand: true,
    loginCommandHint: 'codex login (use codex login --device-auth for headless environments)',
    loginGuideText: 'provider.loginGuide.codex',
    statusKind: 'unknown',
    statusText: '🟡 Unchecked (pending local probe)',
    cliStatus: 'unprobed',
    authStatus: 'unknown',
    version: null,
    checkedAt: null,
    errorCode: null,
    errorMessage: null,
    demoNote:
      'Default unchecked state; click "Test Connection / Re-check" to verify CLI binary and login status.',
    isDemo: false,
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    shortLabel: 'claude',
    cliCommand: 'claude',
    defaultCliPath: 'claude',
    cliPath: 'claude',
    isBuiltin: true,
    authModeLabel: 'Anthropic subscription / Console OAuth (supports claude auth status --json query)',
    supportsAuthProbe: true,
    supportsLoginCommand: true,
    loginCommandHint: 'claude auth login',
    loginGuideText: 'provider.loginGuide.claude',
    statusKind: 'unknown',
    statusText: '🟡 Unchecked (pending local probe)',
    cliStatus: 'unprobed',
    authStatus: 'unknown',
    version: null,
    checkedAt: null,
    errorCode: null,
    errorMessage: null,
    demoNote:
      'Default unchecked state; click "Test Connection / Re-check" to verify CLI binary and login status.',
    isDemo: false,
  },
]

export const INITIAL_BUILTIN_PROVIDERS: ProviderSummary[] = DEMO_PROVIDERS

export const INITIAL_INTEGRATIONS: IntegrationState[] = [
  {
    service: 'github',
    displayName: 'GitHub OAuth & Repository Mapping',
    connected: false,
    statusLabel: 'Not Connected (Device Flow Ready)',
    scopeDescription: 'Minimal scope: read:user (reads public profile and public repos only)',
    unimplementedNotice:
      'Authorized via GitHub Device Flow; credentials stored in system Keyring without repo write or private repo access.',
  },
  {
    service: 'jira',
    displayName: 'integration.jira.title',
    connected: false,
    statusLabel: 'Not Connected (OAuth Ready)',
    scopeDescription: 'integration.jira.scope',
    unimplementedNotice:
      'Connect to Atlassian Jira to sync projects and tickets.',
  },
]

export const DEMO_PROJECTS: ProjectItem[] = [
  {
    id: 'proj-nebula-commerce',
    name: 'Nebula Commerce Ledger',
    folderDisplayName: '~/workspace/nebula-commerce (Demo Folder)',
    summary: 'Multi-tenant order checkout and inventory reconciliation platform, split into React 19 frontend and Go billing microservice.',
    techStack: ['React 19', 'TypeScript', 'Go 1.23', 'PostgreSQL'],
    updatedAtLabel: 'Demo Snapshot · 10m ago',
    isDemoFixture: true,
    git: {
      status: 'normal',
      branchName: 'feat/checkout-split-ledger',
      lastCommitHash: 'a84f21c',
      lastCommitMessage: 'feat(checkout): add split-billing pre-check and tax calculation panel',
      aheadCount: 2,
      behindCount: 0,
      openPrCount: 3,
      openIssueCount: 5,
      remoteUrl: 'https://github.com/example-org/nebula-commerce',
    },
    frontendProgress: {
      available: true,
      missingReason: null,
      sourceFileLabel: 'docs/todo-frontend.md (Demo)',
      todos: [
        {
          id: 'neb-fe-1',
          title: 'Create split-billing detail drawer and currency precision formatters',
          completed: true,
          category: 'frontend',
          sourceFileLabel: 'docs/todo-frontend.md',
        },
        {
          id: 'neb-fe-2',
          title: 'Implement promo code conflict warnings and a11y keyboard navigation',
          completed: true,
          category: 'frontend',
          sourceFileLabel: 'docs/todo-frontend.md',
        },
        {
          id: 'neb-fe-3',
          title: 'Connect credit memo preview form and abnormal field highlights',
          completed: false,
          category: 'frontend',
          sourceFileLabel: 'docs/todo-frontend.md',
        },
      ],
    },
    backendProgress: {
      available: true,
      missingReason: null,
      sourceFileLabel: 'docs/todo-backend.md (Demo)',
      todos: [
        {
          id: 'neb-be-1',
          title: 'Implement idempotent payment token verification and transaction record schema',
          completed: true,
          category: 'backend',
          sourceFileLabel: 'docs/todo-backend.md',
        },
        {
          id: 'neb-be-2',
          title: 'Add inventory lock timeout rollback across multi-warehouse transfers',
          completed: false,
          category: 'backend',
          sourceFileLabel: 'docs/todo-backend.md',
        },
        {
          id: 'neb-be-3',
          title: 'Write batch CSV reconciliation export streaming endpoint tests',
          completed: false,
          category: 'backend',
          sourceFileLabel: 'docs/todo-backend.md',
        },
      ],
    },
    spec: {
      available: true,
      fileName: 'specs/checkout-ledger-v2.md (Demo Spec)',
      updatedAtLabel: '2026-10-27 18:40',
      missingReason: null,
      sections: [
        {
          id: 'sec-scope',
          heading: '1. Core Billing Boundaries',
          summary: 'Defines primary order, split child orders, and tax rounding distribution principles.',
          clauses: [
            'Single orders can be split into up to 10 sub-merchant records; rounding remainder goes to primary merchant.',
            'Frontend estimation is for preview only; final ledger amounts follow backend transaction snapshot.',
          ],
        },
        {
          id: 'sec-idempotency',
          heading: '2. Idempotency & Failure Rollback',
          summary: 'Every checkout submission must include an Idempotency-Key to prevent duplicate charges.',
          clauses: [
            'Duplicate Idempotency-Key within 24h returns original transaction summary.',
            'Inventory reservation failure aborts payment record creation and returns explicit out-of-stock codes.',
          ],
        },
        {
          id: 'sec-audit',
          heading: '3. Audit Logging & PII Masking',
          summary: 'Ensures ledger exports and logs never contain plaintext credentials or customer PII.',
          clauses: [
            'Transaction logs only retain last four card digits and authorization tracking IDs.',
            'Exported reports must record operator ID and timestamp.',
          ],
        },
      ],
    },
    frontendTree: [
      {
        id: 'neb-fe-root',
        name: 'frontend/src',
        kind: 'folder',
        note: 'React 19 Frontend Source',
        children: [
          {
            id: 'neb-fe-checkout',
            name: 'features/checkout',
            kind: 'folder',
            children: [
              { id: 'neb-fe-c1', name: 'CheckoutSplitPanel.tsx', kind: 'file', note: 'Split preview panel' },
              { id: 'neb-fe-c2', name: 'CheckoutSplitPanel.css', kind: 'file', note: '4px grid styles' },
              { id: 'neb-fe-c3', name: 'currencyFormat.ts', kind: 'file', note: 'Currency precision utility' },
            ],
          },
          {
            id: 'neb-fe-shared',
            name: 'shared/ui',
            kind: 'folder',
            children: [
              { id: 'neb-fe-s1', name: 'LedgerBadge.tsx', kind: 'file', note: 'Ledger status badge' },
            ],
          },
        ],
      },
    ],
    backendTree: [
      {
        id: 'neb-be-root',
        name: 'backend/internal',
        kind: 'folder',
        note: 'Go Ledger Service',
        children: [
          {
            id: 'neb-be-ledger',
            name: 'ledger',
            kind: 'folder',
            children: [
              { id: 'neb-be-l1', name: 'allocator.go', kind: 'file', note: 'Tax and rounding allocator' },
              { id: 'neb-be-l2', name: 'idempotency_store.go', kind: 'file', note: 'Idempotency key storage layer' },
            ],
          },
          {
            id: 'neb-be-api',
            name: 'transport/http',
            kind: 'folder',
            children: [
              { id: 'neb-be-a1', name: 'checkout_handler.go', kind: 'file', note: 'Checkout endpoint handler' },
            ],
          },
        ],
      },
    ],
    jira: {
      linked: true,
      siteName: 'nebula-team.atlassian.net (Demo)',
      projectKey: 'NEB',
      projectName: 'Nebula Checkout & Ledger',
      unlinkedReason: null,
      tickets: [
        {
          key: 'NEB-104',
          title: 'Auto-release reserved stock and report error code on warehouse transfer timeout',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          assignee: 'Lin Chen',
          updatedAt: '2026-10-27 16:20',
          summaryText: 'Account coordinator must trigger compensation event when warehouse service does not respond within 5s.',
        },
        {
          key: 'NEB-109',
          title: 'Credit memo form supports batch item selection and tax recalculation',
          status: 'TODO',
          priority: 'MEDIUM',
          assignee: 'Maya Wu',
          updatedAt: '2026-10-27 14:05',
          summaryText: 'Frontend credit memo interface displays split ratios and previews refundable tax upon partial returns.',
        },
        {
          key: 'NEB-098',
          title: 'Checkout split drawer supports focus trap and high contrast theme',
          status: 'DONE',
          priority: 'LOW',
          assignee: 'Maya Wu',
          updatedAt: '2026-10-26 19:10',
          summaryText: 'Add focus trap and ARIA labels to ensure screen readers announce split subtotal.',
        },
      ],
    },
  },
  {
    id: 'proj-sandbox-prototype',
    name: 'Local Shader Sandbox',
    folderDisplayName: '~/experiments/shader-sandbox (Demo No-Git Folder)',
    summary: 'Local WebGL particle and audio visualization draft project, currently iterating in local directory without Git initialized.',
    techStack: ['Vite', 'TypeScript', 'WebGL2'],
    updatedAtLabel: 'Demo Snapshot · 35m ago',
    isDemoFixture: true,
    git: {
      status: 'no-git',
      branchName: null,
      lastCommitHash: null,
      lastCommitMessage: null,
      aheadCount: 0,
      behindCount: 0,
      openPrCount: 0,
      openIssueCount: 0,
      remoteUrl: null,
    },
    frontendProgress: {
      available: true,
      missingReason: null,
      sourceFileLabel: 'todo-ui.md (Demo)',
      todos: [
        {
          id: 'shd-fe-1',
          title: 'Build material parameter slider panel and live FPS overlay',
          completed: true,
          category: 'frontend',
          sourceFileLabel: 'todo-ui.md',
        },
        {
          id: 'shd-fe-2',
          title: 'Add preset JSON export and shortcut reset functionality',
          completed: false,
          category: 'frontend',
          sourceFileLabel: 'todo-ui.md',
        },
      ],
    },
    backendProgress: {
      available: false,
      missingReason: 'Todo missing: No backend todo file detected in selected folder (pure frontend sandbox or backend list not created).',
      sourceFileLabel: null,
      todos: [],
    },
    spec: {
      available: false,
      fileName: null,
      updatedAtLabel: null,
      missingReason: 'Spec missing: No markdown specification file specified or found in project folder.',
      sections: [],
    },
    frontendTree: [
      {
        id: 'shd-fe-root',
        name: 'src',
        kind: 'folder',
        note: 'Frontend renderer directory',
        children: [
          {
            id: 'shd-fe-shaders',
            name: 'shaders',
            kind: 'folder',
            children: [
              { id: 'shd-fe-s1', name: 'particleField.frag.glsl', kind: 'file', note: 'Fragment shader' },
              { id: 'shd-fe-s2', name: 'particleField.vert.glsl', kind: 'file', note: 'Vertex shader' },
            ],
          },
          { id: 'shd-fe-main', name: 'ControlsOverlay.tsx', kind: 'file', note: 'Parameter control panel' },
        ],
      },
    ],
    backendTree: [],
    jira: {
      linked: false,
      siteName: null,
      projectKey: null,
      projectName: null,
      unlinkedReason: 'No Jira project mapped: visit Settings > Jira to configure mapping.',
      tickets: [],
    },
  },
  {
    id: 'proj-edge-telemetry',
    name: 'Edge Telemetry Gateway',
    folderDisplayName: '~/workspace/edge-telemetry (Demo Folder)',
    summary: 'Edge node metric aggregation and alert inspection console, currently on Detached HEAD to verify historical stress test snapshot.',
    techStack: ['React 19', 'Rust', 'gRPC', 'SQLite'],
    updatedAtLabel: 'Demo Snapshot · 1h ago',
    isDemoFixture: true,
    git: {
      status: 'detached',
      branchName: 'HEAD (detached at 9f4c2a1)',
      lastCommitHash: '9f4c2a1',
      lastCommitMessage: 'perf(collector): benchmark ring buffer batch write latency',
      aheadCount: 0,
      behindCount: 3,
      openPrCount: 1,
      openIssueCount: 2,
      remoteUrl: 'https://github.com/example-org/edge-telemetry',
    },
    frontendProgress: {
      available: true,
      missingReason: null,
      sourceFileLabel: 'docs/frontend-checklist.md (Demo)',
      todos: [
        {
          id: 'edg-fe-1',
          title: 'Implement node latency heatmap and alert level filter',
          completed: true,
          category: 'frontend',
          sourceFileLabel: 'docs/frontend-checklist.md',
        },
        {
          id: 'edg-fe-2',
          title: 'Add reconnect countdown notification and time range lock',
          completed: false,
          category: 'frontend',
          sourceFileLabel: 'docs/frontend-checklist.md',
        },
      ],
    },
    backendProgress: {
      available: true,
      missingReason: null,
      sourceFileLabel: 'docs/backend-checklist.md (Demo)',
      todos: [
        {
          id: 'edg-be-1',
          title: 'Implement gRPC metric batch compression and backpressure drop counter',
          completed: true,
          category: 'backend',
          sourceFileLabel: 'docs/backend-checklist.md',
        },
        {
          id: 'edg-be-2',
          title: 'Verify SQLite WAL rotation disk limits under high-frequency writes',
          completed: true,
          category: 'backend',
          sourceFileLabel: 'docs/backend-checklist.md',
        },
      ],
    },
    spec: {
      available: true,
      fileName: 'docs/telemetry-gateway-spec.md (Demo Spec)',
      updatedAtLabel: '2026-10-25 11:15',
      missingReason: null,
      sections: [
        {
          id: 'edg-sec-1',
          heading: '1. Edge Metric Sampling Frequency & Backpressure Policy',
          summary: 'Automatically degrade non-critical debug metrics while preserving alert events when upstream queue exceeds 80% capacity.',
          clauses: [
            'CRITICAL level events must never be dropped during backpressure.',
            'Output sampling drop statistics every 10s for frontend console display.',
          ],
        },
      ],
    },
    frontendTree: [
      {
        id: 'edg-fe-root',
        name: 'web-console/src',
        kind: 'folder',
        children: [
          { id: 'edg-fe-1', name: 'LatencyHeatmap.tsx', kind: 'file', note: 'Latency distribution panel' },
          { id: 'edg-fe-2', name: 'AlertRuleTable.tsx', kind: 'file', note: 'Alert rule table' },
        ],
      },
    ],
    backendTree: [
      {
        id: 'edg-be-root',
        name: 'collector-rs/src',
        kind: 'folder',
        children: [
          { id: 'edg-be-1', name: 'ring_buffer.rs', kind: 'file', note: 'Zero-allocation queue' },
          { id: 'edg-be-2', name: 'wal_writer.rs', kind: 'file', note: 'Batch persistence module' },
        ],
      },
    ],
    jira: {
      linked: false,
      siteName: null,
      projectKey: null,
      projectName: null,
      unlinkedReason: 'No Jira project mapped: this repository is not bound to a remote Jira Project.',
      tickets: [],
    },
  },
]
