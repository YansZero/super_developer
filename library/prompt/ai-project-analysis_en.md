Review the current project in read-only mode (if CodeGraph MCP or `.codegraph/` is available, you may use it to inspect module structure faster). Analyze only files you actually read, and output these four sections in English in the exact fixed format below: "## Project Summary", "## Frontend", "## Backend", and "## APP". Each section must appear exactly once, and do not add any extra subheadings (such as `### BFF`):

## Project Summary
- (2-3 concise bullet points summarizing the project purpose and core FE/BE stack within 120 characters total; do not repeat section details)

## Frontend
- Tech & Entry Points: (1-2 lines describing the actual tech stack and entry files; mark uncertain paths as "to be confirmed")
```text
<frontend-root-dir>/
├── <main-subdir>/
│   └── <entry-or-core-file>
└── <config-or-entry-file>
```

## Backend
- Tech & Entry Points: (Briefly describe Backend / BFF / Local Agent tech and entry points separately; if no standalone BFF or Local Agent exists, explicitly state "Standalone BFF / Local Agent directory not detected")
```text
<backend-or-bff-root-dir>/
└── <main-subdir-or-compact-package-path>/
    └── <entry-file>

<local-agent-root-dir (if present)>/
└── <entry-file>
```

## APP
- (If present, list tech, entry points, and a single `text` ASCII tree; if absent, write ONLY "APP directory not detected")

[Strict ASCII Tree Formatting Rules (Required by the UI Tree Parser)]
1. `## Frontend` and `## Backend` must each contain **at most ONE** ` ```text ` code block. If Backend has both BFF and Local Agent, place both root trees inside the same ` ```text ` block separated by a blank line.
2. Root directories must start at column 0 (no indentation) and end with `/` (e.g., `src/`, `js-storefront/`, `backend/`, `local-agent/`).
3. Every child level must use exact 4-character indentation (`│   ` or `    `) followed by `├── ` or `└── `.
4. **Every folder name MUST end with `/`** (e.g., `components/`, `controller/`); **file names MUST NOT end with `/`** (e.g., `main.tsx`, `server.ts`).
5. **Compact Folders for Java / Deep Namespaces**: Expand multi-branch directories one level per line; however, for deep single-chain package directories without sibling branches (such as Java/Kotlin/C# namespaces), **collapse the single-chain path into one folder node on a single line** (e.g., `└── web/src/com/falconpack/webservices/v2/controller/` or `└── src/main/java/com/example/service/`) to avoid excessive nesting, and do not replace real package names with `...`.
6. **NEVER output standalone `...` or `…` placeholder nodes**; list only verified key directories and entry files without guessing or inventing paths.
