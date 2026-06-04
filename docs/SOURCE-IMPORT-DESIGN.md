# Source Import Design

## Overview

This document describes the implementation of source import functionality in Episteme. It covers the user experience, import pipeline, and component responsibilities.

---

## User Experience

### Command Flow

```
User Types            →    Extension Handles     →    Importer Does      →    Result
─────────────────────────────────────────────────────────────────────────────────────────
/source add-zotero    →    Show fuzzy picker     →    (waiting)          →    User selects items
/user confirms        →    Call ImportPipeline    →    Download + convert →    Files in sources/
                        →    Update metadata      →                      →    Status notification
```

### Slash Commands

| Command | Description | UX Flow |
|---------|-------------|---------|
| `/source add-zotero` | Add items from Zotero library | 1. Load library (with cache) → 2. Fuzzy picker → 3. Confirm → 4. Import → 5. Done |
| `/source add-obsidian` | Add notes from Obsidian vault | 1. Scan vault → 2. Fuzzy picker → 3. Confirm → 4. Import → 5. Done |
| `/source list` | List imported sources | Show table with title, type, date added |
| `/source remove <id>` | Remove source from workspace | Confirm dialog → Delete file → Update metadata |
| `/source refresh` | Refresh Zotero cache | Show progress → Update cache → Done |

### Loading States

1. **Initial loading**: "Scanning library..." with spinner
2. **Picker ready**: Show filtered list immediately on search
3. **Importing**: "Importing 3 of 5..." with progress bar
4. **Done**: Summary "Imported 4 sources. 1 failed (see logs)"

### Error States

| Error | Message | Recovery |
|-------|---------|----------|
| Zotero API unreachable | "Cannot connect to Zotero. Check your internet." | Retry button |
| PDF conversion failed | "Could not convert 'paper.pdf'. Imported metadata only." | Manual retry |
| Workspace full | "Not enough space. Free up workspace." | Show cleanup options |
| No attachments found | "No PDF found for 'Paper Title'. Import metadata only?" | Continue without PDF |

---

## Component Responsibilities

### Extension (`source-manager.ts`)

**Responsibilities:**
- Register and handle slash commands
- Show TUI picker (SourcePicker component)
- Call ImportPipeline with selected items + workspace
- Update SessionManager metadata after import
- Show notifications (success, errors, progress)

**Not responsible for:**
- File copying logic
- Zotero API calls (delegates to importer)
- Conversion logic

### ImportPipeline (`importer.ts`)

**Responsibilities:**
- Orchestrate import process
- Handle progress reporting
- Coordinate between ZoteroImporter and ObsidianImporter
- Aggregate results (ImportResult)
- Handle retries and errors per item

**Not responsible for:**
- UI/picker logic
- Metadata persistence (calls SessionManager)

### ZoteroImporter (`zotero-importer.ts`)

**Responsibilities:**
- Fetch attachment info from Zotero API
- Download attachments (PDFs) to temp location
- Call markitdown for PDF → Markdown conversion
- Return converted content with metadata

**Not responsible for:**
- Workspace file operations
- Duplicate detection (handled by ImportPipeline)

### ObsidianImporter (part of `obsidian-client.ts`)

**Responsibilities:**
- Copy notes from vault to workspace
- Extract title from content
- Detect duplicates
- Preserve frontmatter

**Already implemented** in `ObsidianClient.copyToWorkspace()`.

### SessionManager

**Responsibilities:**
- Provide workspace path
- Track sources in metadata.json
- `addSource()`, `removeSource()`, `listSources()`

---

## Import Flow Details

### Zotero Import

```
1. User confirms selection in picker
2. Extension calls: ImportPipeline.importZoteroItems(selectedItems, workspace)
3. ImportPipeline:
   a. For each item, call ZoteroImporter.import(item)
      - Fetch attachment info (check for children with itemType='attachment')
      - If attachment exists:
        - Download attachment via Zotero API
        - Save to temp file (e.g., /tmp/episteme/zotero-{key}.pdf)
        - Convert to markdown: markitdown {pdf} -o {temp}.md
        - Read converted content
      - Else:
        - Use item metadata only (no PDF content)
   b. Build frontmatter (title, authors, year, tags, zoteroKey)
   c. Prepend frontmatter to content
   d. Generate slug from title
   e. Copy to workspace/sources/{slug}.md
4. Return ImportResult with imported[] and failed[]
5. Extension updates SessionManager metadata for each successful import
6. Extension shows summary notification
```

### Obsidian Import

```
1. User confirms selection in picker
2. Extension calls: ImportPipeline.importObsidianNotes(selectedNotes, workspace)
3. ImportPipeline:
   a. For each note, call ObsidianClient.copyToWorkspace(notePath, workspace)
      - Copy .md file to workspace/sources/
      - Extract title from content
      - Check for duplicates (by original path)
   b. Return ImportResult
4. Extension updates SessionManager metadata
5. Extension shows summary notification
```

---

## Frontmatter Format

All imported sources get YAML frontmatter:

```yaml
---
title: "Attention Is All You Need"
authors: ["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"]
date: 2017
tags: ["transformers", "attention-mechanism", "nlp"]
zoteroKey: "ABCD1234"          # Only for Zotero imports
sourceType: "zotero"           # "zotero" or "obsidian"
importedAt: 2024-06-04T12:00:00Z
originalPath: "papers/attention.pdf"  # Only for Obsidian imports
---
```

### Obsidian Sources

```yaml
---
title: "My Research Notes"
sourceType: "obsidian"
importedAt: 2024-06-04T12:00:00Z
originalPath: "notes/research.md"
vault: "/path/to/vault"
---
```

---

## Duplicate Detection

### Strategy

1. **Track by source ID**: Zotero items tracked by `zoteroKey`, Obsidian by `originalPath`
2. **Skip on import**: If `zoteroKey` already in session sources, skip with warning
3. **Allow re-import**: User can force re-import with `/source refresh <id>`

### Duplicate Check Flow

```
Extension receives selected items
  ↓
For each item, check if already imported:
  → SessionManager.listSources() → check zoteroKey/originalPath
  → If exists: mark as duplicate, skip (with warning)
  → If not: add to import queue
  ↓
ImportPipeline imports only non-duplicate items
  ↓
Show summary: "Imported 3 sources. 2 skipped (already imported)"
```

---

## Error Handling

### Per-Item Errors

- **API failure**: Log error, continue with next item
- **Download failure**: Log error, skip item, note in ImportResult
- **Conversion failure**: Keep PDF path in frontmatter, note "conversion failed"
- **Write failure**: Log error, report to user

### Aggregate Errors

- **All failed**: Show "Import failed" with error details
- **Partial success**: Show "Imported 3 of 5 sources" with failed items listed

### Recovery

| Scenario | Recovery Action |
|----------|----------------|
| API timeout | Retry once, then skip |
| PDF conversion fails | Save metadata only, note failure |
| Disk full | Stop import, show cleanup suggestion |
| Duplicate detected | Skip silently, warn at end |

---

## Progress Reporting

### ProgressCallback Interface

```typescript
interface ImportProgress {
  current: number;      // Items completed
  total: number;        // Total items to import
  status: string;       // Human-readable status
  itemName?: string;    // Current item being processed
}
```

### UX Progress Flow

1. **Start**: "Importing 5 sources..."
2. **Item progress**: "Converting 'Paper Title' (2/5)..."
3. **Completion**: "Imported 4 sources in 12s. 1 failed."
4. **Errors**: "Failed: 'Paper' (conversion error). See /source list for details."

---

## Implementation Plan

### Phase 1: Obsidian Import (Quick Win)

1. Wire up existing `ObsidianClient.copyToWorkspace()` in extension
2. Add duplicate detection
3. Update SessionManager metadata

### Phase 2: Zotero Import

1. Create `ZoteroImporter` class
2. Implement attachment fetching via Zotero API
3. Integrate `markitdown` for PDF conversion
4. Add frontmatter builder
5. Wire in extension

### Phase 3: Polish

1. Progress reporting with proper UI
2. Error recovery and retry logic
3. Duplicate handling refinement
4. Bulk import optimization

---

## File Structure

```
src/lib/source-manager/
├── index.ts                    # Public exports
├── types.ts                   # Type definitions
├── zotero-client.ts           # API client (existing)
├── obsidian-client.ts         # Vault client (existing, has copyToWorkspace)
├── cache.ts                   # Disk cache (existing)
├── fuzzy-list.ts              # Fuzzy search (existing)
├── importer.ts                # NEW: ImportPipeline orchestration
├── zotero-importer.ts         # NEW: Zotero-specific import logic
├── frontmatter.ts             # NEW: Frontmatter builder utility
└── slug.ts                    # NEW: Slug generation utility

extensions/
└── source-manager.ts          # Extension (update to use importer)
```

---

## Testing Considerations

- Unit test importer with mocked Zotero/Obsidian clients
- Integration test with real API (use test library)
- E2E test: add source → verify file in workspace → verify metadata updated
- Error path: test API failures, disk full, etc.