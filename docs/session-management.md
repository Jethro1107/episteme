# Session Management Implementation

## Overview

This document describes the implemented session management system for Episteme. Session management provides the core infrastructure for isolated, persistent research workspaces.

---

## SessionManager Class

### Location
`src/session/manager.ts`

### API

```typescript
import { SessionManager } from "./session/index.js";

const manager = new SessionManager();  // Uses ~/.episteme
// Or: new SessionManager("/custom/path")
```

### Session CRUD

| Method | Description |
|--------|-------------|
| `createSession(options?)` | Creates new session, returns `SessionInfo` |
| `getSessionInfo(id)` | Returns `SessionInfo` or `null` |
| `listSessions(options?)` | Lists all sessions with optional filter/sort |
| `switchSession(id)` | Switches active session |
| `deleteSession(id, options?)` | Deletes session (force option for active) |
| `branchSession(id, options?)` | Creates branch with copied sources |

### Configuration

| Method | Description |
|--------|-------------|
| `getConfig()` | Returns `EpistemeConfig` object |
| `updateConfig(updates)` | Merges updates into config file |

### Metadata Management

| Method | Description |
|--------|-------------|
| `getSessionMetadata(id)` | Returns full `SessionMetadata` object |
| `updateSessionMetadata(id, updates)` | Partial update of metadata |
| `setActiveAgent(id, agent)` | Set current agent persona |
| `setSessionStatus(id, status)` | Set status (active/paused/complete) |

### Source Management

| Method | Description |
|--------|-------------|
| `addSource(id, source)` | Add source, returns `SourceInfo` |
| `removeSource(id, sourceId)` | Remove source by ID |
| `listSources(id)` | List all sources in session |

### Workspace Operations

| Method | Description |
|--------|-------------|
| `getWorkspace(id)` | Returns workspace path |
| `cleanWorkspace(id, options?)` | Clean workspace (keepSources option) |

### pi Integration

| Method | Description |
|--------|-------------|
| `getPiEnv(id)` | Returns env vars for pi launch |
| `getPiLaunchOptions(id)` | Returns `{ cwd, env, sessionFile }` |

---

## Data Structures

### SessionInfo
```typescript
interface SessionInfo {
  id: string;                    // UUID
  path: string;                 // ~/.episteme/sessions/<uuid>
  workspace: string;            // ~/.episteme/sessions/<uuid>/workspace
  created: number;              // Unix timestamp
  lastAccessed: number;         // Unix timestamp
  status: "active" | "paused" | "complete";
  name?: string;
  sourcesCount: number;
  activeAgent?: "researcher" | "writer" | "librarian";
}
```

### SessionMetadata
```typescript
interface SessionMetadata {
  id: string;
  created: number;
  lastAccessed: number;
  status: "active" | "paused" | "complete";
  sources: SourceInfo[];
  activeAgent: "researcher" | "writer" | "librarian";
  name?: string;
  tags?: string[];
}
```

### SourceInfo
```typescript
interface SourceInfo {
  id: string;                    // UUID
  type: "zotero" | "obsidian";
  path: string;                 // Original path or URL
  title: string;
  addedAt: number;             // Unix timestamp
  zoteroKey?: string;          // Zotero item key
}
```

### EpistemeConfig
```typescript
interface EpistemeConfig {
  zoteroApiKey?: string;
  zoteroLibraryType?: "user" | "group";
  zoteroLibraryId?: string;
  obsidianVault?: string;
  defaultAgent?: "researcher" | "writer" | "librarian";
  workspaceDir?: string;
  agentDir?: string;
  piExecutable?: string;
}
```

---

## File Storage

### Location
`~/.episteme/` (configurable via `EPISTEME_HOME` env var)

### Files

| File | Purpose |
|------|---------|
| `config.json` | Global configuration (API keys, vault paths) |
| `active.json` | Current active session tracking |

### Directories

```
~/.episteme/
├── config.json              # Global config
├── active.json              # { sessionId, lastAccessed }
└── sessions/
    └── <uuid>/
        ├── metadata.json    # Session metadata
        ├── workspace/       # Session workspace
        │   ├── sources/     # Imported sources
        │   ├── plans/       # Research plans
        │   ├── notes/       # Research findings
        │   └── artifacts/   # Final outputs
        └── session/        # pi session history
            └── session.jsonl
```

---

## Workspace Structure

Created automatically on session creation:

```
workspace/
├── sources/     # Imported Zotero/Obsidian sources (.md)
├── plans/       # Research plans, outlines, approaches
├── notes/       # Research findings, synthesis, analysis
└── artifacts/   # Final outputs, exports, deliverables
```

---

## Usage Examples

### Create a new session
```typescript
const session = manager.createSession({ name: "My Research" });
console.log(session.workspace);  // ~/.episteme/sessions/<uuid>/workspace
```

### Add a source
```typescript
const source = manager.addSource(session.id, {
  type: "zotero",
  path: "/path/to/paper.pdf",
  title: "Attention Is All You Need",
  zoteroKey: "ABCD1234",
});
```

### Switch sessions
```typescript
await manager.switchSession(otherSessionId);
```

### Branch a session
```typescript
const branch = manager.branchSession(session.id, {
  name: "Exploration: Different Approach",
});
```

### Get pi launch environment
```typescript
const { cwd, env, sessionFile } = manager.getPiLaunchOptions(sessionId);
// Spawn pi with cwd=cwd, env={...env}, --session-dir=dirname(sessionFile)
```

---

## Tests

Run tests:
```bash
npm test
```

Test file: `src/session/manager.test.ts`
- Uses unique temporary directories per test to avoid pollution
- 18 tests covering all major functionality

---

## Implementation Notes

1. **Singleton pattern**: `getSessionManager()` returns the singleton instance
2. **Atomic writes**: Config/metadata files are written atomically (no partial writes)
3. **UUID generation**: Uses `crypto.randomUUID()` for session IDs
4. **Path resolution**: Respects `EPISTEME_HOME` env var for testing
5. **Session isolation**: Each session has complete isolation - no shared state

## Integration with Source Manager

The Source Manager extension integrates with SessionManager to:

1. **Read config**: Gets `zoteroApiKey`, `zoteroLibraryId`, `obsidianVault` from config
2. **Copy sources**: Copies selected items to `workspace/sources/`
3. **Update metadata**: Calls `addSource()` to register imported sources
4. **Access workspace**: Uses `getWorkspace(id)` to determine copy destination

### Workflow

```
User selects items in picker → Extension copies to workspace/sources/
                               → Extension calls sessionManager.addSource()
                               → Source appears in /source list
```

**Note:** The copy-to-workspace logic for Zotero items is not yet implemented.
The picker works correctly but selected items are not yet copied to `workspace/sources/`.