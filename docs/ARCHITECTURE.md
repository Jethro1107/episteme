# Episteme Architecture

## Overview

Episteme is a knowledge work agent harness built on the [pi coding agent SDK](https://pi.dev). It provides a structured workspace for AI-augmented research, note-taking, and synthesis using a multi-agent system.

**Related Documents:**
- [Source Import Design](./SOURCE-IMPORT-DESIGN.md) - Detailed import pipeline and component design
- [Source Import UX](./SOURCE-IMPORT-UX.md) - UX decisions and user experience details

**Unlike Feynman** (which operates in the current working directory and delegates session management to pi), Episteme creates an **isolated session workspace** for each knowledge work session. The session is a complete research environment, not just a conversation history.

---

## Core Design Principle

> **Workspace-per-session**: Every session has its own isolated workspace directory. The working directory is always set to `~/.episteme/sessions/<uuid>/workspace`.

This is non-negotiable and distinct from Feynman's approach.

---

## Directory Structure

### Application Directory (Bundled with npm package)

```
episteme/
├── bin/
│   └── episteme.js          # Entry point
├── src/
│   ├── bootstrap/
│   │   └── sync.ts           # Sync agents/skills to ~/.episteme/agent/
│   ├── cli.ts                # Commands: setup, session, source, agent, etc.
│   ├── config/
│   │   └── paths.ts          # Path resolution for ~/.episteme/
│   ├── pi/
│   │   └── launch.ts         # Spawn pi with Episteme settings
│   └── ui/                   # Terminal output helpers
├── .episteme/                # Bundled assets (synced to ~/.episteme/)
│   ├── agents/
│   │   ├── researcher.md
│   │   ├── writer.md
│   │   └── librarian.md
│   ├── skills/
│   │   └── obsidian-cli.md
│   └── prompts/
│       ├── research-workflow.md
│       ├── synthesis-workflow.md
│       └── export-workflow.md
├── extensions/
├── prompts/                  # Slash command workflows
└── package.json
```

### User Home Directory (Runtime State)

```
~/.episteme/
├── config.json              # API keys, defaults, vault paths
├── active.json              # { sessionId: "uuid", lastAccessed: ts }
├── agent/                   # Synced from .episteme/ (bootstrap)
│   ├── agents/
│   ├── skills/
│   └── themes/
├── sessions/                # Session workspaces
│   └── <uuid>/
│       ├── workspace/        # cwd for agent operations
│       ├── metadata.json     # Session state (sources, agent, status)
│       └── session.jsonl     # pi session history
└── memory/                  # Optional persistent memory
```

---

## Session Model

Each session is:

- **Isolated**: Has its own workspace directory, no bleed-over between sessions
- **Complete**: Contains workspace files, sources, pi session history, and metadata
- **Tied to its workspace**: cwd is always set to `sessions/<uuid>/workspace`
- **Persistent**: Sessions can be resumed, branched, and exported
- **Source-aware**: All sources are copied into the workspace as Markdown files

### Session Directory Contents

```
sessions/<uuid>/
├── workspace/               # The working directory for this session
│   ├── sources/             # Imported Zotero/Obsidian sources (.md)
│   ├── plans/               # Research plans, outlines, approaches
│   ├── notes/              # Research findings, synthesis, analysis
│   └── artifacts/          # Final outputs, exports, deliverables
├── metadata.json            # Session metadata
│   ├── created: ts
│   ├── lastAccessed: ts
│   ├── status: "active" | "paused" | "complete"
│   ├── sources: [{ id, type, path, addedAt }]
│   └── lastAgent: "researcher" | "writer" | "librarian"
└── session/                 # pi session history
    └── session.jsonl         # (from --session-dir)
```

### Workspace Subdirectories

| Directory | Purpose |
|-----------|--------|
| `sources/` | Imported Zotero/Obsidian sources with frontmatter |
| `plans/` | Research plans, outlines, approach documentation |
| `notes/` | Research findings, synthesis, analysis from agents |
| `artifacts/` | Final deliverables, exports, curated outputs |

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      Episteme CLI                           │
│  (session CRUD, source management, launch orchestration)   │
├─────────────────────────────────────────────────────────────┤
│                    Session Manager                          │
│  (active.json, workspace lifecycle, cwd management)         │
├─────────────────────────────────────────────────────────────┤
│                      pi Runtime                             │
│  (spawned process with --session-dir + cwd set)             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Episteme Extensions, Skills, Agents                │   │
│  │  (synced from .episteme/ via bootstrap)              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## CLI Commands

### Core Session Commands

```
episteme [session-id]    → Launch with specific session (creates if needed)
episteme                 → Launch with last active session (or create new)
/session list            → Show all sessions
/session switch <id>     → Switch to different session
/session new             → Create a new session
/session delete <id>     → Delete a session
/session export <id>      → Export session to archive
```

### Source Commands

```
/source add-zotero       → Fuzzy search Zotero library → Import with PDF conversion
/source add-obsidian     → Fuzzy search Obsidian vault → Copy notes to sources/
/source list             → Show imported sources (list format, /resume style)
/source remove <id>      → Remove source from workspace (confirm dialog)
/source refresh          → Refresh Zotero cache (TTL-based)
```

**Source Import UX (see `docs/SOURCE-IMPORT-UX.md` for details):**
- **Confirmation**: Import starts immediately on Enter (no extra step)
- **Already-imported items**: Shown with checkbox, still selectable for re-import
- **Failure handling**: Continue with others on failure, report summary at end
- **List format**: Simple list with type badge, /resume style

### Agent Workflow Commands

```
/research                → Invoke researcher agent on sources
/write                   → Invoke writer agent on research outputs
/export                  → Librarian exports to Obsidian
/workflow                → Run full research → write → export
```

### Workspace Commands

```
/workspace clean          → Clean workspace, keep sources
/workspace status         → Show workspace state
```

---

## Agent System

### Agent Personas

**Researcher** (`agents/researcher.md`)
- Reads and comprehends all source materials
- Extracts key findings, arguments, evidence
- Identifies connections and gaps between sources
- Writes research notes synthesizing understanding
- Tools: Uses Zotero MCP tools for library access

**Writer** (`agents/writer.md`)
- Synthesizes research into coherent narratives
- Drafts and refines notes based on research outputs
- Structures information for clarity and usability
- Maintains consistency with source materials

**Librarian** (`agents/librarian.md`)
- Organizes workspace files and outputs
- Manages source metadata and citations
- Exports notes to external systems (Obsidian)
- Uses Obsidian CLI + direct filesystem for exports
- Maintains cleanliness and navigability

### Agent Collaboration

Agents collaborate via shared files in the workspace (iterative overlap, not strict handoff):

```
sources/*.md → researcher → <slug>-notes.md
                          ↕
                       writer → <slug>-draft.md
                          ↓
                    librarian → artifacts/<slug>-artifact.md → Obsidian
```

**File naming convention**: All output files use a slug derived from the topic:
- Lowercase, hyphens, no filler words
- Max 5 words (e.g., `attention-mechanisms`, `climate-llm-impact`)
- Example: `<slug>-research.md`, `<slug>-draft.md`, `<slug>-artifact.md`

---

## Source Management

### Supported Sources

| Source | User Access | Agent Access | Format |
|--------|-------------|--------------|--------|
| Zotero | Direct API + markitdown | MCP tools | `.md` with frontmatter |
| Obsidian | Obsidian CLI | CLI + terminal | Flat `.md` files |

### Source Workflow

1. **Add**: User invokes command, fuzzy-selects items, files copied to `workspace/sources/`
2. **List**: Show current session's sources with metadata
3. **Remove**: Delete source from workspace (not from original)
4. **Query**: Agents use tools to read and analyze sources

### Zotero Integration

- **User commands**: Hit Zotero API directly, convert PDFs with markitdown
- **Agent tools**: Use Zotero MCP server tools for library access
- Preserves metadata in frontmatter (title, authors, tags, date)

### Obsidian Integration

- **User commands**: Obsidian CLI for listing vault notes
- **Agent actions**: CLI + direct terminal for note operations
- **Writeback**: Librarian writes to vault folder directly (vault-agnostic)

---

## Bootstrap System

Assets are bundled with the app and synced to `~/.episteme/agent/` on first run and updates.

```
.episteme/ (bundled)  →  bootstrap/sync.ts  →  ~/.episteme/agent/ (runtime)
├── agents/
├── skills/
└── themes/
```

This pattern is borrowed from Feynman and ensures:
- Clean upgrades (managed files are tracked)
- User modifications are preserved when appropriate
- Bundled content stays in sync

---

## pi Integration

Episteme spawns pi as a child process with:

```typescript
spawn(process.execPath, [wrapper, piMain, ...args], {
    cwd: sessionWorkspace,      // Always set to workspace/
    env: buildPiEnv(options),    // Includes FEYNMAN_*-style env vars
});
```

Key environment variables:
- `EPISTEME_SESSION_DIR`: pi session history location
- `EPISTEME_WORKSPACE`: session workspace path
- `EPISTEME_AGENT_DIR`: synced agent definitions

---

## Export Workflow (Curated)

The Librarian does not mirror everything to Obsidian. Export is curated:

1. Writer produces `draft-notes.md`
2. User reviews and annotates
3. Librarian exports selected content to Obsidian vault
4. Metadata and tags preserved in frontmatter

---

## Technology Stack

### Core
- [pi coding agent SDK](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)
- Node.js/TypeScript

### Dependencies
- **pi-subagents**: Multi-agent orchestration
- **Zotero API**: HTTP client for library access (user commands)
- **Zotero MCP**: Server tools for agent access
- **markitdown**: PDF to Markdown conversion
- **Obsidian CLI**: Vault operations (user commands)
- **fuse.js**: Fuzzy search implementation

### Integration Points
- Zotero MCP via pi-mcp-adapter
- Obsidian CLI via skill
- Standard pi tools (read, bash, write, edit)

---

## Design Principles

1. **Workspace Isolation**: Each session is independent, no cross-contamination
2. **Source Ownership**: Sources are copied, originals untouched
3. **Agent Collaboration**: Agents work through shared files (iterative overlap)
4. **Persistent History**: Sessions survive restarts, enable branching
5. **TUI-Native UX**: All interactions feel like natural pi commands
6. **Minimal Surface Area**: Powerful but simple command structure

---

## Implementation Status

### Phase 1: Project Setup ✅

- [x] Project structure with TypeScript
- [x] Session Manager (`src/session/manager.ts`)
- [x] CLI entry point (`src/cli/index.ts`)
- [x] Workspace directory creation
- [x] Session metadata persistence (JSON files)
- [x] Active session management

### Phase 2: Core Extensions (In Progress)

- [x] Source Manager (`extensions/source-manager.ts`) - Bundled in .episteme/
- [x] Source Manager Library (`src/lib/source-manager/`) - Library + types
- [ ] Agent Selector (`extensions/agent-selector.ts`)
- [ ] Workflow Orchestrator (`extensions/workflow-orchestrator.ts`)
- [ ] Status Display (`extensions/status-display.ts`)

**Source Manager Implementation Status:**
| Component | Status | Details |
|-----------|--------|---------|
| Zotero API client | ✅ Done | Pagination, rate limiting, disk cache |
| Obsidian vault scanner | ✅ Done | Recursive scanning, title extraction |
| Fuzzy search picker | ✅ Done | TUI component with keyboard nav |
| Extension registration | ✅ Done | Commands loaded via settings.json |
| File copy (Obsidian) | ✅ Done | `ObsidianClient.copyToWorkspace()` exists |
| **Import pipeline** | ✅ Done | `ImportPipeline` class with progress reporting |
| **Zotero importer** | ✅ Done | `downloadAndConvertPdf()` with markitdown |
| **Frontmatter builder** | ✅ Done | `buildFrontmatter()` utility |
| **Slug generator** | ✅ Done | `slugify()` with uniqueness handling |
| **Metadata update** | ✅ Done | Extension calls `SessionManager.addSource()` |
| **Zotero attachment download** | ✅ Done | `downloadAttachment()` via API |
| **PDF → Markdown conversion** | ✅ Done | `convertPdfToMarkdown()` via markitdown |

**Source Import Flow:**
```
/user runs /source add-zotero
    → Extension shows fuzzy picker (already-imported items checked)
    → User selects items (Space to toggle, Ctrl+A select all)
    → User presses Enter → import starts immediately
    → ImportPipeline.importZoteroItems() for each item:
        → Fetch attachment info from Zotero API
        → Download PDF to .tmp/
        → Convert PDF to Markdown (markitdown)
        → Build frontmatter (title, authors, year, zoteroKey)
        → Copy .md to workspace/sources/<slug>.md
        → Clean up temp files
    → Return ImportResult { imported[], failed[] }
    → Extension updates session metadata
    → Show summary notification
```

### Phase 3: Agents

- [x] Researcher Agent (`agents/researcher.md`) - Synced via bootstrap
- [x] Writer Agent (`agents/writer.md`) - Synced via bootstrap
- [x] Librarian Agent (`agents/librarian.md`) - Synced via bootstrap

### Phase 4: Skills and Prompts (In Progress)

- [ ] Obsidian CLI Skill (`skills/obsidian-cli.md`)
- [ ] Workflow Prompts (`prompts/`)
- [x] **Source Import Service** (`src/lib/source-manager/importer.ts`) - Core import logic
- [x] **Zotero Attachment Downloader** (`src/lib/source-manager/zotero-downloader.ts`) - PDF/API attachments
- [x] **Slug Generator** (`src/lib/source-manager/slug.ts`)
- [x] **Frontmatter Builder** (`src/lib/source-manager/frontmatter.ts`)

### Phase 5: Integration and Testing (In Progress)

- [ ] CLI integration testing
- [ ] Full workflow testing
- [ ] UX testing
- [x] Bootstrap sync system (`src/bootstrap/sync.ts`)

---

## Future Considerations

- [ ] Multi-select for bulk source operations
- [ ] Session branching (fork a research direction)
- [ ] Export formats beyond Obsidian (Markdown, LaTeX, etc.)
- [ ] Shared source library (common references across sessions)
- [ ] Citation management and bibliography generation

---

## Source Import Design

### Import Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Extension (source-manager.ts)                │
│  - Registers /source commands                                    │
│  - Shows UI picker (SourcePicker TUI)                          │
│  - Receives selected items                                      │
│  - Calls ImportPipeline                                         │
│  - Updates SessionManager metadata                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ImportPipeline (importer.ts)                       │
│  - orchestrates import for selected items                       │
│  - handles progress reporting                                    │
│  - returns ImportResult                                         │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌────────────────────┐     ┌────────────────────┐
        │ ZoteroImporter     │     │ ObsidianImporter   │
        │ - fetch attachments│     │ - copyToWorkspace  │
        │ - download PDFs    │     │ - handle duplicates│
        │ - convert (markit) │     │ - extract metadata │
        └────────────────────┘     └────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌────────────────────┐     ┌────────────────────┐
        │ FrontmatterBuilder│     │ SessionManager     │
        │ - title, authors  │     │ - addSource()      │
        │ - year, tags      │     │ - update metadata  │
        │ - zoteroKey       │     │ - track sources    │
        └────────────────────┘     └────────────────────┘
```

### Zotero Import Details

1. **Item Selection**: User selects items from library via fuzzy picker
2. **Attachment Detection**: Check if item has attachments (PDF, etc.)
   - Use Zotero API `items/{key}/items` to get children
   - Filter by `itemType === 'attachment'`
3. **Download**: Fetch attachment file via API
   - Requires API key with read access
   - Save to temp location
4. **Conversion**: Convert PDF to Markdown
   - Use `markitdown` CLI tool
   - Preserve formatting where possible
5. **Frontmatter**: Add YAML frontmatter to converted content
   ```yaml
   ---
   title: "Paper Title"
   authors: ["Author 1", "Author 2"]
   date: 2024
   tags: ["machine-learning", "transformers"]
   zoteroKey: ABCD1234
   imported: 2024-06-04
   ---
   ```
6. **Copy to Workspace**: Copy final .md to `workspace/sources/`
7. **Metadata Update**: Call `SessionManager.addSource()`

### Obsidian Import Details

1. **Note Selection**: User selects notes from vault via fuzzy picker
2. **Copy**: Use existing `ObsidianClient.copyToWorkspace()`
3. **Duplicate Detection**: Check if note already imported (by path or title)
4. **Frontmatter**: Preserve existing frontmatter, add import metadata
5. **Metadata Update**: Call `SessionManager.addSource()`

### Duplicate Handling

| Scenario | Behavior |
|----------|----------|
| Zotero item already imported | Skip, show warning |
| Obsidian note already imported | Skip, show warning |
| Same item re-selected in same session | Ignore (already imported) |
| User wants to re-import | Show option to refresh/replace |

### Error Handling

- Partial success: Import what we can, report failures
- API errors: Show message, suggest retry
- Conversion failures: Keep original PDF reference, note conversion failed
- File system errors: Report specific error, suggest workspace cleanup