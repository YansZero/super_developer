---
name: codegraph
description: Initialize and use CodeGraph — a local-first pre-indexed AST code knowledge graph (.codegraph/) for fast symbol navigation, call tracing, and impact analysis.
---

# CodeGraph Skill

CodeGraph builds and queries a local-first SQLite knowledge graph (`.codegraph/`) for projects using Tree-sitter. It avoids expensive and token-heavy brute-force grep/file reading by querying code structures, callers, callees, and dependencies directly.

## Prerequisites & Installation

In the `super-developer` workspace, `codegraph` is installed inside the project (`library/mcps/.bin/codegraph` & `node_modules/.bin/codegraph`) via:
```bash
npm run mcp:setup
```

If running outside `super-developer` or installing globally:
```bash
npm install -g @colbymchenry/codegraph
```

## Workflow & Guidelines

### 1. Verification & Auto-Initialization
When working in a repository:
1. Check if CodeGraph is initialized:
   ```bash
   codegraph status
   ```
2. If `.codegraph/` does not exist or needs re-indexing, initialize it:
   ```bash
   codegraph init -i
   ```

### 2. Core Exploration Commands
When you need to investigate symbols, trace dependencies, or evaluate blast radius:

- **Search Symbol**:
  ```bash
  codegraph query <symbol_name>
  ```
- **Trace Callers** (Find who calls this function/method/class):
  ```bash
  codegraph callers <symbol_name>
  ```
- **Trace Callees** (Find what this function calls):
  ```bash
  codegraph callees <symbol_name>
  ```
- **Impact Analysis / Blast Radius** (Assess what breaks before refactoring):
  ```bash
  codegraph impact <symbol_name> --depth 3
  ```
- **Affected Tests**:
  ```bash
  codegraph affected <file_path>
  ```
- **General Architecture Exploration**:
  ```bash
  codegraph explore "<natural language query or question>"
  ```

### 3. MCP Tools (when MCP server is registered)
If CodeGraph MCP server (`codegraph-mcp`) is running, prefer the native MCP tools:
- `codegraph_explore`: Fast natural-language and symbol exploration across the indexed codebase.
- `codegraph_search`: Fast symbol lookup across the codebase.
- `codegraph_context`: Build architectural and contextual summary for a symbol/task.
- `codegraph_callers` & `codegraph_callees`: Two-way call-graph exploration.
- `codegraph_impact`: Transitive blast-radius assessment before code modification.

### 4. Best Practices
- **Inspect before refactor**: Run `codegraph impact` on core types or functions prior to renaming or altering signatures.
- **Save tokens**: Use CodeGraph first instead of scanning files with recursive grep. Read individual source files only when inspecting specific function implementation details.
