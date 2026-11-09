---
name: graphify
description: Build and query a Graphify repository knowledge graph (graphify-out/graph.json & GRAPH_REPORT.md) and MCP tools (god_nodes, get_neighbors, shortest_path) for architectural analysis.
---

# Graphify Skill

Graphify converts an entire codebase—including source code (via deterministic Tree-sitter AST parsing), documentation, SQL schemas, and configuration files—into a queryable knowledge graph (`graphify-out/graph.json`, `GRAPH_REPORT.md`, and `graph.html`).

## Prerequisites & Installation

In the `super-developer` workspace, `graphify` and `graphify-mcp` are installed inside the project (`library/mcps/.venv/bin/` and linked to `library/mcps/.bin/`) via:
```bash
npm run mcp:setup
```

If installing standalone via `uv` or `pipx`:
```bash
uv tool install "graphifyy[mcp]"
# or: pipx install "graphifyy[mcp]"
```

## Artifacts Generated in `graphify-out/`

1. **`graphify-out/graph.json`**: Persistent, structured knowledge graph of nodes (files, classes, functions, schemas, docs) and edges (imports, calls, references).
2. **`graphify-out/GRAPH_REPORT.md`**: Human- and LLM-readable architectural report highlighting **God Nodes** (highly connected core modules), architectural clusters, and cohesion metrics.
3. **`graphify-out/graph.html`**: Interactive visualization of the repository knowledge graph.

## Workflow & Guidelines

### 1. Building or Updating the Knowledge Graph
Before running deep architectural analysis or multi-module task breakdown:
1. Check if `graphify-out/graph.json` or `graphify-out/GRAPH_REPORT.md` exists.
2. If not present (and write access is permitted), build the graph:
   ```bash
   graphify .
   ```

### 2. When to Query Graphify vs. Grep
- **Use Graphify (`GRAPH_REPORT.md` or `graphify-mcp`)** when mapping Frontend / Backend / BFF module boundaries, identifying God Nodes (core entry points and controllers), or finding shortest dependency paths between modules.
- **Use `grep` / `rg`** only for exact literal string or error message lookups.

### 3. MCP Tools (`graphify-mcp`)
When `graphify-mcp` is connected (running `graphify-mcp --graph graphify-out/graph.json`), prefer these MCP tools over reading raw files:
- `graph_stats`: Overview of total nodes, edges, languages, and cluster distribution.
- `god_nodes`: List the highest-degree central components and entry points in the project.
- `get_neighbors`: Inspect direct upstream callers and downstream dependencies of a specific file or symbol.
- `shortest_path`: Trace how two modules, controllers, or services connect across the codebase.

### 4. Token Budget Discipline
- Read `graphify-out/GRAPH_REPORT.md` or call `god_nodes` / `get_neighbors` first to locate the exact target modules before opening individual source files.
- Combine Graphify insights with Compact Folder ASCII trees for Java / deep namespace projects so architectural outputs stay concise and deterministic.
