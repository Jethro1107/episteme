# Source Manager - Implementation Plan

## Overview

The Source Manager is a core extension for Episteme that handles importing and managing research sources (Zotero items and Obsidian notes) within a session workspace.

---

## Architecture

### Directory Structure

```
episteme/
├── src/
│   ├── lib/
│   │   ├── source-manager/
│   │   │   ├── types.ts           # Interfaces
│   │   │   ├── zotero-client.ts   # Zotero API integration
│   │   │   ├── obsidian-client.ts # Vault operations
│   │   │   ├── cache.ts           # Disk cache management
│   │   │   └── fuzzy-list.ts      # Reusable fuzzy search list
│   │   └── index.ts
│   └── cli/
│       └── index.ts
├── extensions/
│   └── source-manager.ts          # Thin extension wrapper
├── .episteme/                     # Bundled assets
│   ├── agents/
│   └── skills/
└── package.json
```

### Design Principles

1. **Library + thin extensions**: Core logic in `src/lib/`, extensions are thin wrappers
2. **Isolated state**: Each extension owns its state, no shared mutable state
3. **Copy to workspace**: Sources are copied into `workspace/sources/`, originals untouched
4. **No MCP for user-facing**: Extension handles commands directly

---

## Functionality

### Commands

| Command | Description |
|---------|-------------|
| `/source add-zotero` | Fetch items from Zotero library, fuzzy select, import |
| `/source add-obsidian` | List Obsidian vault notes, fuzzy select, import |
| `/source list` | Display current sources in workspace |
| `/source remove` | Select and remove source from workspace |
| `/source refresh` | Refresh Zotero cache |

### Zotero Integration

#### Caching

```
~/.episteme/cache/zotero/
├── <user-id>.json   # Cached items (full JSON from API)
└── <user-id>.meta   # Cache metadata
```

**Cache metadata structure:**
```typescript
interface ZoteroCacheMeta {
  cachedAt: number;        // Unix timestamp
  itemCount: number;      // Total items cached
  lastItemKey: string;     // For incremental updates
  libraryVersion: number;  // Zotero's version header
  totalResults: number;    // Total items in library
}
```

**Cache TTL:** Configurable via `config.json` (default: 4 hours)

#### Fetch Strategy

| Aspect | Value |
|--------|-------|
| **Initial load** | Fetch all items (paginated) |
| **Page size** | 100 items per request |
| **Timeout** | 10 seconds per request |
| **Retries** | 3 attempts on 429 (rate limit), wait 2s between |
| **Sort order** | By date modified (descending) |
| **Progress** | Status line: "Fetching items... (150/500)" |

#### Rate Limit Handling

1. On 429 response:
   - Read `Retry-After` header if present, otherwise wait 2s
   - Retry up to 3 times
   - Show status: "Rate limited, waiting..."
2. On persistent failure:
   - Fall back to cached items if available
   - Show warning: "Using cached items (API unavailable)"

#### Empty/Error States

| Scenario | Behavior |
|----------|----------|
| Empty library | Show empty state: "No items in library. Add items to Zotero first." |
| API failure (no cache) | Show error: "Failed to fetch items" with "Retry" button |
| API failure (has cache) | Show warning, use cached items |

### Obsidian Integration

#### Vault Operations

- List `.md` files in vault (recursively)
- Copy selected files to `workspace/sources/`
- Preserve frontmatter and formatting

### Picker UI

**Style:** Matches pi's `/models` and `/resume` pickers

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Select source (fuzzy search)                              │
├─────────────────────────────────────────────────────────────┤
│  [fuzzy search input with live filter]                     │
├─────────────────────────────────────────────────────────────┤
│  ▶ Attention Is All You Need            Vaswani et al. 2017 │
│    Deep Learning for NLP               Devin et al. 2019   │
│    Neural Machine Translation          Bahdanau et al. 2014 │
│    ...                                                         │
├─────────────────────────────────────────────────────────────┤
│  245 items │ Enter: select │ Space: multi-select │ Esc: cancel│
└─────────────────────────────────────────────────────────────┘
```

#### List Item Format

```
{title} {padding} {authors} {year}
```

- Title: Left-aligned, truncated to 50 chars
- Authors: Right-aligned, "et al." for 3+ authors
- Year: Right-aligned, in parens
- Multi-select: Space toggles selection, shows checkmark

#### Fuzzy Search

- Library: `fuse.js`
- Keys: title, authors, year, tags
- Threshold: 0.3 (default)
- Updates live as user types

### Source Import Flow

#### Zotero

```
1. Check config (apiKey, libraryId)
   └─ Missing → Show error: "Configure Zotero API key first"

2. Check/refresh cache
   ├─ Cache fresh → Load from disk
   ├─ Cache stale → Fetch from API
   │  └─ Progress: "Fetching items... (X/Y)"
   └─ Cache missing → Fetch from API

3. Open picker with cached items
   └─ User fuzzy searches, selects (multi-select allowed)

4. For each selected item:
   ├─ Download attachment (if PDF)
   ├─ Convert to Markdown (markitdown)
   └─ Copy to workspace/sources/<slug>-<id>.md

5. Update session metadata (add sources)
6. Show success: "Added X sources to workspace"
```

#### Obsidian

```
1. Check config (vault path)
   └─ Missing → Show error: "Configure Obsidian vault first"

2. List vault .md files
   └─ Recursively, show folder structure

3. Open picker with file list
   └─ User fuzzy searches, selects

4. Copy selected files to workspace/sources/
   └─ Preserve frontmatter and formatting

5. Update session metadata
6. Show success
```

### Source Metadata

**Imported source file format:**

```markdown
---
title: "Attention Is All You Need"
authors: ["Vaswani et al."]
date: 2017
source: zotero
zoteroKey: ABCD1234
type: paper
tags: ["transformers", "attention"]
imported: 2024-01-15T10:30:00Z
---

# Attention Is All You Need

[Converted Markdown content]
```

---

## Configuration

### config.json

```json
{
  "zoteroApiKey": "string",
  "zoteroLibraryType": "user" | "group",
  "zoteroLibraryId": "string",
  "zoteroCacheTtlHours": 4,
  "obsidianVault": "string"
}
```

### Settings Required Before Use

| Source | Required Config |
|--------|-----------------|
| Zotero | `zoteroApiKey`, `zoteroLibraryId` |
| Obsidian | `obsidianVault` |

---

## Dependencies

```json
{
  "dependencies": {
    "zotero-api-client": "^0.48.0",
    "fuse.js": "^7.0.0",
    "markitdown": "^latest"
  }
}
```

---

## Testing Strategy

### Unit Tests (Vitest)

**Mocked tests:**

1. **zotero-client.test.ts**
   - Mock zotero-api-client responses
   - Test pagination handling
   - Test rate limit retry logic
   - Test cache write/read

2. **obsidian-client.test.ts**
   - Mock fs operations
   - Test file copying
   - Test frontmatter preservation

3. **fuzzy-list.test.ts**
   - Mock pi-tui components
   - Test fuzzy filtering
   - Test keyboard navigation

4. **cache.test.ts**
   - Mock fs operations
   - Test TTL expiration
   - Test stale cache handling

### Test Data

- Sample Zotero API responses (JSON fixtures)
- Sample Obsidian vault structure
- Edge cases: empty library, rate limited, malformed data

---

## Implementation Order

### Phase 1: Foundation ✅

1. **Setup** ✅
   - [x] Add dependencies to package.json
   - [x] Create `src/lib/source-manager/` directory
   - [x] Create `types.ts` with all interfaces

2. **Zotero Client** ✅ (`zotero-client.ts`)
   - [x] Configure API client
   - [x] Fetch items with pagination
   - [x] Handle rate limits and retries
   - [x] Parse and normalize item data

3. **Cache** ✅ (`cache.ts`)
   - [x] Read/write cache files
   - [x] Check TTL expiration
   - [x] Handle stale cache

### Phase 2: UI Components ✅

4. **Fuzzy List** ✅ (`fuzzy-list.ts`)
   - [x] Build custom picker (matching pi style)
   - [x] Integrate fuse.js for filtering
   - [x] Handle keyboard navigation
   - [x] Handle multi-select

### Phase 3: Integration ⚠️

5. **Obsidian Client** ✅ (`obsidian-client.ts`)
   - [x] List vault files
   - [x] Copy files to workspace

6. **Extension** ⚠️ (`extensions/source-manager.ts`)
   - [x] Wire commands to library
   - [x] Handle errors and edge cases
   - [x] Update session metadata
   - [ ] **TODO: Implement actual copy-to-workspace logic for Zotero items**

### Phase 4: Polish

7. **Progress Updates**
   - Status line during fetch
   - Progress indicators

8. **Testing**
   - Write unit tests
   - Integration test via CLI

9. **Documentation**
   - Update ARCHITECTURE.md
   - Update requirements.md

---

## File Inventory

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/source-manager/types.ts` | Interfaces | ✅ Done |
| `src/lib/source-manager/zotero-client.ts` | Zotero API | ✅ Done |
| `src/lib/source-manager/obsidian-client.ts` | Vault ops | ✅ Done |
| `src/lib/source-manager/cache.ts` | Disk cache | ✅ Done |
| `src/lib/source-manager/fuzzy-list.ts` | Picker UI | ✅ Done |
| `src/lib/source-manager/index.ts` | Module export | ✅ Done |
| `.episteme/extensions/source-manager.ts` | Extension wrapper | ✅ Done |
| `src/lib/source-manager/zotero-client.test.ts` | Unit tests | TODO |
| `src/lib/source-manager/obsidian-client.test.ts` | Unit tests | TODO |
| `src/lib/source-manager/cache.test.ts` | Unit tests | TODO |

---

## Open Questions

1. ~~Attachment handling~~ - Answer: Import metadata only (no PDF download yet)
2. **Duplicate detection** - Warn or skip on duplicate import?
3. ~~Large vault handling~~ - Answer: Scan recursively, no pagination needed for now
4. ~~Cache location~~ - Answer: `~/.episteme/cache/zotero/`

## Known Issues / TODOs

| Issue | Severity | Description |
|-------|----------|-------------|
| Copy to workspace | **HIGH** | Zotero item selection works but doesn't copy files to `workspace/sources/` |
| PDF import | MEDIUM | markitdown integration not implemented for PDF → Markdown conversion |
| Session metadata | LOW | Sources added via extension should update session metadata |
| Progress UI | LOW | Status line updates work but could show more detail during long operations |

---

## Reference

- [pi extensions docs](file:///C:/Users/jethr/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)
- [pi skills docs](file:///C:/Users/jethr/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/docs/skills.md)
- [zotero-api-client](https://github.com/tnajdek/zotero-api-client)
- [fuse.js](https://github.com/fusejs/fuse.js)
- [markitdown](https://github.com/marketplace/actions/markitdown)