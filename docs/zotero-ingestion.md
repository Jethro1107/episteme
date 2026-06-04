# Zotero Ingestion - Design Specification

## Overview

Source ingestion is handled via a pi extension (`episteme-source.ts`) that registers `/source` commands. This document specifies the Zotero ingestion flow.

---

## Extension Architecture

```
pi session (Episteme workspace)
    │
    └── episteme-source.ts (pi extension)
            │
            ├── Command registration
            ├── /source add-zotero
            ├── /source list
            └── /source remove
```

The extension lives in `extensions/episteme-source.ts` and is loaded when pi is launched by Episteme.

---

## Command Interface

### `/source add-zotero [query]`

Fuzzy-searches the Zotero library and adds selected items to the workspace.

**Flow:**
1. Check `~/.episteme/config.json` for Zotero API key
2. If no key → prompt user to configure
3. Fetch user's library metadata (title, authors, year, tags) via Zotero API
4. Build fuse.js index from library metadata
5. Fuzzy search on `query` (or show full library if no query)
6. Present results to user (multi-select)
7. For each selected item:
   - Fetch full metadata
   - If PDF attachment exists → convert with markitdown
   - Write `sources/<slug>.md` with frontmatter + content
8. Update `metadata.json` with source entries

---

## Authentication

### Config Storage

`~/.episteme/config.json`:

```json
{
  "zotero": {
    "apiKey": "...",
    "userId": "...",
    "libraryType": "user",  // or "group"
    "libraryId": "..."
  },
  "obsidian": {
    "vaultPath": "..."
  }
}
```

### Auth Check

```typescript
function requireZoteroAuth(): ZoteroConfig {
  const config = readConfig();
  if (!config.zotero?.apiKey) {
    throw new Error("Zotero not configured. Run: episteme config zotero <api-key>");
  }
  return config.zotero;
}
```

---

## Zotero API Integration

### API Base

```
https://api.zotero.org/<libraryType>/<libraryId>/items
```

### Endpoints Used

| Operation | Endpoint | Purpose |
|-----------|----------|---------|
| List items | `GET /items?format=json&limit=100` | Fetch library for search |
| Item metadata | `GET /items/<key>` | Get full item details |
| PDF attachment | `GET /items/<key>/file` | Download PDF for conversion |

### API Key Header

```
Zotero-API-Key: <apiKey>
```

---

## Search Implementation

### Index Structure

```typescript
interface ZoteroSearchDoc {
  key: string;           // Zotero item key (e.g., "ABCD1234")
  title: string;
  authors: string[];     // "Author1, Author2, ..."
  year?: string;
  tags: string[];
  abstract?: string;
}
```

### Fuzzy Search

```typescript
const fuse = new Fuse(zoteroDocs, {
  keys: [
    { name: "title", weight: 0.5 },
    { name: "authors", weight: 0.3 },
    { name: "tags", weight: 0.15 },
    { name: "year", weight: 0.05 }
  ],
  threshold: 0.3,
  includeScore: true,
});
```

---

## Item Selection UI

Present a selectable list:

```
Select sources to add:
┌──┬─────────────────────────────────────────────────────┬──────┬────────┐
│  │ Title                                                │ Year │ Tags   │
├──┼─────────────────────────────────────────────────────┼──────┼────────┤
│◯ │ Attention Is All You Need                           │ 2017 │ trans… │
│◯ │ BERT: Pre-training of Deep Bidirectional…           │ 2018 │ NLP…   │
│● │ GPT-3: Language Models are Few-Shot Learners         │ 2020 │ LLM…   │
└──┴─────────────────────────────────────────────────────┴──────┴────────┘

 [↑/↓] Navigate  [Space] Select  [Enter] Confirm  [Esc] Cancel
```

- Default to single selection, `*` prefix for multi-select mode
- Show key bindings in prompt
- Truncate long titles with ellipsis

---

## Source File Format

### Filename

`<slug>-<zoteroKey>.md`

Where `slug` is derived from title (kebab-case, max 5 words).

Examples:
- `attention-is-all-you-need-ABCD1234.md`
- `bert-pretraining-deep-BCDE2345.md`

### Frontmatter

```yaml
---
title: "Attention Is All You Need"
authors: ["Vaswani, Shazeer, Parmar, ..."]
year: 2017
date: 2017-06-12
abstract: "We propose a new simple network architecture, the Transformer..."
doi: "10.48550/arXiv.1706.03762"
zoteroKey: ABCD1234
zoteroLink: "https://www.zotero.org/items/ABCD1234"
tags:
  - transformers
  - attention-mechanism
  - neural-networks
collections: ["ML", "NLP"]
source: zotero
imported: 2024-01-15T10:30:00Z
hasPdf: true
pdfConverted: true
---
```

### Content

After frontmatter, include the markdown content:

- If PDF converted: markitdown output
- If no PDF: abstract text (or "No content available")

---

## PDF Conversion

### Using markitdown

```bash
markitdown <input.pdf> --format markdown --output <output.md>
```

### Handling Conversion Failures

1. **markitdown not installed** → Error with install instructions
2. **PDF unreadable** → Write error to frontmatter, skip conversion, use abstract only
3. **Large PDF** → Warn user, offer to skip

```yaml
conversionError: "PDF text extraction failed"
conversionErrorDetail: "markitdown: unable to parse encrypted PDF"
```

---

## Source Metadata Tracking

### metadata.json Updates

```json
{
  "sources": [
    {
      "id": "ABCD1234",
      "type": "zotero",
      "filename": "attention-is-all-you-need-ABCD1234.md",
      "addedAt": "2024-01-15T10:30:00Z",
      "status": "ready",
      "metadata": {
        "title": "Attention Is All You Need",
        "year": 2017,
        "tags": ["transformers", "attention-mechanism"]
      }
    }
  ]
}
```

---

## Error Handling

| Error | Response |
|-------|----------|
| No API key | Prompt to configure |
| Network failure | Show error, suggest retry |
| Item not found | Skip item, report in summary |
| PDF conversion failed | Mark in frontmatter, continue |
| No PDF attachment | Proceed with metadata only |

---

## Implementation Notes

### Extension Registration

```typescript
export function registerEpistemeCommands(context: ExtensionContext) {
  context.registerSlashCommand({
    name: "source",
    description: "Manage session sources (Zotero, Obsidian)",
    subcommands: [
      { name: "add-zotero", description: "Add from Zotero library" },
      { name: "add-obsidian", description: "Add from Obsidian vault" },
      { name: "list", description: "List current sources" },
      { name: "remove", description: "Remove a source" },
    ],
    handler: sourceCommandHandler,
  });
}
```

### Session Context Access

The extension needs access to the current workspace path:

```typescript
// From environment or session state
const workspacePath = process.env.EPISTEME_WORKSPACE ?? 
  path.join(os.homedir(), ".episteme", "sessions", sessionId, "workspace");
```

---

## File Output Summary

```
workspace/
├── sources/
│   ├── attention-is-all-you-need-ABCD1234.md
│   └── bert-pretraining-deep-BCDE2345.md
└── metadata.json (updated)
```

---

## Next Steps

1. Finalize this spec
2. Handle Obsidian ingestion similarly
3. Implement the extension in `extensions/episteme-source.ts`
4. Write unit tests for API integration, search, file writing