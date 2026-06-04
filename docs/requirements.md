# Episteme Implementation Plan

## Overview

This document outlines the implementation approach for Episteme, a knowledge work harness built on the pi coding agent SDK.

**Target**: A CLI application (`episteme`) that manages session-based knowledge work workflows using a multi-agent system (researcher, writer, librarian).

## Implementation Phases

### Phase 1: Project Setup

**Goal**: Establish the project structure and core CLI entry point.

#### 1.1 Project Structure

```
episteme/
├── src/
│   ├── cli.ts              # Main CLI entry point
│   ├── session-manager.ts  # Session creation, switching, listing
│   ├── workspace.ts        # Workspace operations
│   └── index.ts            # Main export
├── extensions/
│   ├── source-manager.ts   # Zotero/Obsidian source management
│   ├── agent-selector.ts   # Agent persona switching
│   ├── workflow-orchestrator.ts  # Workflow commands
│   └── status-display.ts   # Status widget/footer
├── agents/
│   ├── researcher.md
│   ├── writer.md
│   └── librarian.md
├── skills/
│   └── obsidian-cli.md
├── prompts/
│   ├── research-workflow.md
│   ├── synthesis-workflow.md
│   └── export-workflow.md
├── docs/
│   └── requirements.md
├── package.json
└── tsconfig.json
```

#### 1.2 CLI Entry Point (`src/cli.ts`)

The CLI handles:
1. Reading `~/.episteme/active.json` for current session
2. Creating new sessions if none active or if explicitly requested
3. Launching pi with episteme configuration

```typescript
// Conceptual structure
interface CliOptions {
  sessionId?: string;
  newSession?: boolean;
  list?: boolean;
}
```

Commands:
- `episteme` → Open last session or create new
- `episteme <uuid>` → Open specific session
- `episteme --new` → Create new session
- `episteme --list` → List all sessions

#### 1.3 Session Manager (`src/session-manager.ts`)

Core responsibilities:
- Create session directory structure
- Manage `~/.episteme/active.json`
- List, switch, delete sessions
- Provide session metadata for status display

```typescript
interface SessionInfo {
  id: string;
  created: number;
  lastAccessed: number;
  sources: SourceInfo[];
  activeAgent: string;
}

interface EpistemeSession {
  id: string;
  dir: string;
  workspace: string;
  metadata: SessionMetadata;
  sessionManager: PiSessionManager;
}
```

### Phase 1: Project Setup ✅

**Completed:**
- [x] Project structure with TypeScript
- [x] CLI entry point (`src/cli/index.ts`)
- [x] Session Manager (`src/session/manager.ts`)
- [x] Workspace creation with 4 subdirectories (sources, plans, notes, artifacts)
- [x] Session metadata persistence (JSON)
- [x] Active session management
- [x] Configuration management (`config.json`)
- [x] pi integration (environment variables, launch options)
- [x] Branch/delete session operations
- [x] Unit tests (18 passing)
- [x] Bootstrap sync system (`src/bootstrap/sync.ts`)

**Files created:**
```
src/
├── session/
│   ├── manager.ts      # Session management
│   ├── manager.test.ts # 18 tests
│   └── index.ts        # Module exports
├── cli/
│   └── index.ts        # CLI with bootstrap integration
├── bootstrap/
│   ├── sync.ts         # Asset sync (.episteme/ → ~/.episteme/agent/)
│   └── index.ts        # Module exports
└── lib/
    └── source-manager/ # Source management library
.episteme/              # Bundled assets (synced via bootstrap)
├── extensions/
├── agents/
└── skills/
```

**Documentation:**
- `docs/session-management.md` - Implementation details
- `docs/ARCHITECTURE.md` - Updated with implementation status
- `docs/source-manager-plan.md` - Source manager implementation plan

### Phase 2: Core Extensions (In Progress)

**Source Manager - Status:**
- ✅ Zotero API client with pagination
- ✅ Obsidian vault scanning
- ✅ Disk cache with TTL
- ✅ Fuzzy search picker (SelectList)
- ✅ Extension loaded successfully
- ✅ Tools: `list_sources`, `add_zotero_source`, `add_obsidian_source`, `remove_source`, `refresh_source_cache`
- ⚠️ **Copy to workspace logic NOT IMPLEMENTED**

**Implementation:**
- Extension: `.episteme/extensions/source-manager.ts`
- Bootstrap syncs to: `~/.episteme/agent/` + writes `settings.json`
- pi loads via: `settings.json` with `packages: ["./extensions"]`
- Dependencies resolved via: `NODE_PATH` set to project `node_modules`

**Pending:**
- [ ] Agent Selector extension (`/agent` commands)
- [ ] Workflow Orchestrator extension (`/research`, `/write`, `/export`)
- [ ] Status Display extension (footer/widget status)

### Phase 3: Agents ✅

- [x] Researcher Agent (`agents/researcher.md`)
- [x] Writer Agent (`agents/writer.md`)
- [x] Librarian Agent (`agents/librarian.md`)

### Phase 4: Skills and Prompts (Pending)

- [ ] Obsidian CLI Skill
- [ ] Workflow Prompts

### Phase 5: Integration and Testing (Pending)

### Phase 2: Core Extensions (Pending)

**Goal**: Build the extensions that provide episteme's functionality.

#### 2.1 Source Manager (`extensions/source-manager.ts`)

**Provides**: `/source` command group

**Tools registered**:
- `add_zotero_source()` - Interactive fuzzy search + conversion
- `add_obsidian_source()` - Fuzzy search vault + copy
- `list_workspace_sources()` - List current session sources
- `remove_source()` - Remove source from workspace

**Commands**:
```
/source add-zotero   → Invoke Zotero picker, convert, add to workspace
/source add-obsidian → Invoke Obsidian note picker, copy to workspace
/source list         → Display current sources in widget
/source remove       → Remove selected source
```

**UX Flow for `/source add-zotero`**:
1. Call Zotero API → fetch library items
2. Present fuzzy-search SelectList (title, authors, year)
3. User selects item(s) (multi-select with Space)
4. Show progress: Downloading → Converting → Saving
5. Update workspace metadata
6. Notify user of success

**UX Flow for `/source add-obsidian`**:
1. List `.md` files from vault path
2. Present fuzzy-search SelectList
3. User selects → Copy to workspace
4. Update workspace metadata

**Dependencies**:
- Zotero API client (fetch library)
- markitdown (PDF → MD conversion)
- fuse.js (fuzzy search)
- @earendil-works/pi-tui (SelectList component)

#### 2.2 Agent Selector (`extensions/agent-selector.ts`)

**Provides**: `/agent` command group

**Commands**:
```
/agent researcher  → Switch to researcher persona (load researcher.md)
/agent writer      → Switch to writer persona
/agent librarian   → Switch to librarian persona
/agent current     → Show current active agent
```

**Implementation**:
- Loads agent system prompt from `~/.episteme/agents/<name>.md`
- Updates session's active agent in metadata
- Updates status display to show current agent

#### 2.3 Workflow Orchestrator (`extensions/workflow-orchestrator.ts`)

**Provides**: Workflow commands and subagent integration

**Commands**:
```
/research    → Run researcher agent on workspace sources
/write       → Run writer agent on research outputs
/export      → Run librarian agent to export to Obsidian
/workflow    → Run full research → write → export pipeline
```

**Implementation**:
- Uses subagent pattern (like pi's `subagent` extension)
- Spawns episteme agents with appropriate tasks
- Manages file flow between agents
- Shows progress and results

**Workflow Orchestration**:
```typescript
// /research workflow
1. Build task: "Analyze all sources in workspace, create research-notes.md"
2. Invoke researcher agent via subagent
3. Wait for completion
4. Update metadata with research output path

// /write workflow  
1. Build task: "Write synthesis based on research-notes.md, create draft-notes.md"
2. Invoke writer agent
3. Wait for completion

// /export workflow
1. Build task: "Export draft-notes.md to Obsidian vault via obsidian-cli"
2. Invoke librarian agent
3. Wait for completion
```

#### 2.4 Status Display (`extensions/status-display.ts`)

**Provides**: Persistent status widget and footer

**Display Elements**:
- Session ID (abbreviated)
- Active agent (with color indicator)
- Source count
- Current workflow status

**Implementation**:
- Uses `ctx.ui.setStatus()` for footer
- Uses `ctx.ui.setWidget()` for above-editor status
- Updates on: agent change, source add/remove, workflow start/end

### Phase 3: Agents

**Goal**: Define the three agent personas with clear instructions.

#### 3.1 Researcher Agent (`agents/researcher.md`)

```markdown
---
name: researcher
description: Analyzes sources, extracts key information, identifies gaps
tools: read,grep,find,ls,bash
model: anthropic/claude-sonnet-4-5
---

# Researcher Agent

You are a thorough research analyst specializing in literature review and source analysis.

## Role

Your task is to:
1. Read and comprehend all source materials in the workspace
2. Extract key findings, arguments, and evidence from each source
3. Identify connections, contradictions, and synergies between sources
4. Note gaps, open questions, or areas needing deeper investigation
5. Synthesize your understanding in structured research notes

## Workflow

1. Start by listing and reading all sources in the workspace
2. Take notes on each source's key contributions
3. Identify themes and connections across sources
4. Write comprehensive research notes to `research-notes.md`
5. Flag any sources that need deeper analysis

## Output Format

Write your research synthesis to `research-notes.md` with:
- Summary of key findings across all sources
- Thematic connections and patterns
- Individual source summaries (if needed)
- Open questions and research gaps
- Suggested areas for further investigation

## Guidelines

- Be thorough and comprehensive
- Ground findings in specific source evidence
- Note disagreements or contradictions between sources
- Flag uncertainty clearly
- Structure notes for easy reference by other agents
```

#### 3.2 Writer Agent (`agents/writer.md`)

```markdown
---
name: writer
description: Synthesizes research into coherent narratives and notes
tools: read,grep,find,ls,write,edit,bash
model: anthropic/claude-sonnet-4-5
---

# Writer Agent

You are a skilled technical writer who synthesizes research into clear, usable notes.

## Role

Your task is to:
1. Read research notes and source materials
2. Synthesize findings into coherent narratives
3. Structure information for clarity and usability
4. Write clean Markdown notes suitable for export
5. Ensure notes maintain connection to sources

## Workflow

1. Read `research-notes.md` and relevant sources
2. Identify the key narrative or argument
3. Structure notes logically (chronological, thematic, or hierarchical)
4. Write to `draft-notes.md` in clean Markdown
5. Add source references and citations
6. Review for clarity and completeness

## Output Format

Write synthesis to `draft-notes.md`:
- Clear title and structure
- Coherent narrative (not just bullet points)
- Source citations inline
- Summary and conclusions
- Optional: suggestions for future work

## Guidelines

- Write for a knowledgeable reader
- Maintain clarity over density
- Connect ideas logically
- Preserve source attribution
- Output should be immediately useful
```

#### 3.3 Librarian Agent (`agents/librarian.md`)

```markdown
---
name: librarian
description: Organizes workspace, manages exports to Obsidian
tools: read,ls,bash,write
---

# Librarian Agent

You are a meticulous librarian who organizes information and manages exports.

## Role

Your task is to:
1. Organize workspace files logically
2. Prepare notes for export
3. Export to Obsidian vault using obsidian-cli
4. Maintain workspace cleanliness
5. Ensure proper file naming and organization

## Workflow

1. List current workspace contents
2. Read `draft-notes.md` to understand export target
3. Determine appropriate vault location and filename
4. Prepare metadata (date, tags, source references)
5. Export to Obsidian via CLI
6. Verify successful export
7. Optionally clean up workspace

## Export Options

- Create new note in vault
- Update existing note in vault
- Specify vault folder and filename

## Guidelines

- Use clear, descriptive filenames
- Preserve all Markdown formatting
- Add appropriate frontmatter (date, tags, sources)
- Verify exports are successful
- Maintain workspace organization
```

### Phase 4: Skills and Prompts

#### 4.1 Obsidian CLI Skill (`skills/obsidian-cli.md`)

```markdown
---
name: obsidian-cli
description: Operations for Obsidian vault management via CLI
---

# Obsidian CLI

Use obsidian-cli or direct filesystem operations for vault interactions.

## Available Operations

### List Notes
```bash
ls <vault-path>
```

### Create Note
```bash
# Direct filesystem
echo "# Title" > <vault-path>/Folder/Note.md
```

### Update Note
```bash
# Read existing, modify, write back
```

### Add Frontmatter
```markdown
---
created: 2024-01-15
tags: [research, notes]
sources: [zotero-item-id]
---
```

## Best Practices

- Always add frontmatter with date and tags
- Use meaningful filenames (lowercase, hyphens)
- Organize in logical folder structure
- Preserve Markdown formatting
```

#### 4.2 Workflow Prompts (`prompts/`)

**research-workflow.md**: Standard research task prompt
**synthesis-workflow.md**: Standard synthesis task prompt  
**export-workflow.md**: Standard export task prompt

### Phase 5: Integration and Testing

#### 5.1 CLI Integration

```typescript
// Main launch flow
async function main() {
  const opts = parseArgs();
  
  if (opts.list) {
    await listSessions();
    return;
  }
  
  const session = opts.sessionId 
    ? await openSession(opts.sessionId)
    : await getOrCreateSession();
  
  await launchInteractiveMode(session);
}
```

#### 5.2 Configuration

**`~/.episteme/config.json`**:
```json
{
  "zoteroApiKey": "...",
  "obsidianVault": "/path/to/vault",
  "defaultAgent": "researcher",
  "workspaceDir": "~/.episteme/sessions"
}
```

**`~/.episteme/active.json`**:
```json
{
  "sessionId": "uuid",
  "lastAccessed": 1704067200000
}
```

#### 5.3 Testing Plan

1. **Unit Tests**: Session manager, source manager logic
2. **Integration Tests**: Full workflow (create session → add source → research → export)
3. **UX Tests**: TUI interactions, keyboard navigation

## Implementation Order

1. ~~Project setup + CLI entry point~~ ✅
2. ~~Session manager (create, list, switch)~~ ✅
3. ~~Basic workspace creation~~ ✅
4. Source manager extension (Obsidian first, simpler)
5. Agent selector extension
6. Zotero source integration
7. Workflow orchestrator
8. Status display
9. Agent definitions
10. Skills and prompts
11. Testing and refinement

## File Naming Conventions

| Entity | Filename |
|--------|----------|
| Researcher agent | `researcher.md` |
| Writer agent | `writer.md` |
| Librarian agent | `librarian.md` |
| Obsidian skill | `obsidian-cli.md` |
| Research workflow prompt | `research-workflow.md` |
| Synthesis workflow prompt | `synthesis-workflow.md` |
| Export workflow prompt | `export-workflow.md` |

## Key Dependencies

```json
{
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^latest",
    "@earendil-works/pi-tui": "^latest",
    "fuse.js": "^7.0.0",
    "markitdown": "^latest"
  }
}
```

## API Reference

### Session Metadata

```typescript
interface SessionMetadata {
  id: string;
  created: number;
  lastAccessed: number;
  sources: SourceInfo[];
  activeAgent: "researcher" | "writer" | "librarian";
  status: "idle" | "researching" | "writing" | "exporting";
}

interface SourceInfo {
  id: string;
  type: "zotero" | "obsidian";
  path: string;
  title: string;
  addedAt: number;
}
```

### Extension Registration

```typescript
export default function (pi: ExtensionAPI) {
  // Register commands
  pi.registerCommand("source", { ... });
  pi.registerCommand("agent", { ... });
  pi.registerCommand("research", { ... });
  pi.registerCommand("write", { ... });
  pi.registerCommand("export", { ... });
  pi.registerCommand("workflow", { ... });
  
  // Register tools
  pi.registerTool({ name: "add_zotero_source", ... });
  pi.registerTool({ name: "add_obsidian_source", ... });
  pi.registerTool({ name: "list_workspace_sources", ... });
  
  // Subscribe to events for status updates
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("episteme", "Session active");
  });
}
```

## Considerations

### Pi Command Name Collision

`/session` is reserved by pi. All episteme commands use alternative names:
- `/source` instead of `/session sources`
- `/agent` for persona selection
- `/workspace` for workspace operations

### Subagent Pattern

The workflow orchestrator uses the subagent pattern from pi's examples:
- Agents are `.md` files loaded from `~/.episteme/agents/`
- Each agent invocation spawns a subprocess with appropriate system prompt
- Results are captured and written to workspace files

### Session Isolation

Each session has:
- Independent workspace directory
- Independent session history (pi's session.jsonl)
- Independent metadata
- No sharing of sources between sessions (unless explicitly configured)

### Error Handling

- Zotero API failures: Show error, offer retry
- Conversion failures: Log error, skip item, continue
- Export failures: Show error, preserve draft in workspace
- Agent failures: Log output, allow manual recovery