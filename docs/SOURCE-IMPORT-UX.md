# Source Import - UX Decisions

This document records the UX decisions for the source import feature.

---

## Command UX

### Import Confirmation

**Decision: Confirm imports immediately**

```
Flow:
1. User types /source add-zotero
2. Picker opens with library items
3. User selects items (Space to toggle, Ctrl+A to select all)
4. User presses Enter
5. Import starts immediately
```

- Simpler flow, no extra "confirm" step
- User sees what's being imported in the picker

---

### Already-Imported Items

**Decision: Show as "imported" with checkbox**

```
Picker display:
☑ [Z] Attention Is All You Need - Vaswani et al. (2017)  ← Already imported, still checked
  [Z] BERT - Devlin et al. (2018)                         ← Not imported
☑ [Z] GPT-3 - Brown et al. (2020)                         ← Already imported, still checked
```

- Shows user what's already in workspace
- User can still re-select if they want to force refresh
- Checked state persists across navigation

---

### Bulk Import Failure Handling

**Decision: Continue with others, report at end**

```
If 3 of 5 items fail:
Progress: "Importing... (2/5)"
...
Final: "Import completed. 2 sources imported. 3 failed:
       - 'Paper A': PDF not found
       - 'Paper B': Conversion failed
       - 'Paper C': Network error
       Run /source list to see imported sources."
```

- User gets full summary at the end
- They can retry failed items later
- No need to babysit the import

---

### Source List Format

**Decision: Resemble pi's /resume style**

```
/source list

📚 Sources (4)

  [Z] Attention Is All You Need
      Vaswani et al. (2017) • added 2h ago

  [Z] BERT: Pre-training of Deep Bidirectional
      Devlin et al. (2018) • added yesterday

  [O] My Research Notes
      imported yesterday

  [Z] GPT-3 (import failed)
      Conversion error
```

- Simple list, not a table
- Type badge ([Z] Zotero, [O] Obsidian)
- Metadata on second line
- Error state shows reason

---

## Import Content Decisions

### Zotero Import Scope

**Decision: Metadata + extracted text (PDF if available, else metadata)**

```
Flow:
1. Check if item has PDF attachment
2. If yes:
   a. Download PDF
   b. Convert with markitdown
   c. Prepend frontmatter
   d. Save to workspace
3. If no PDF:
   a. Use item metadata only
   b. Include abstract if available
   c. Note "No PDF available" in frontmatter
```

- Full content when possible
- Graceful fallback if no PDF or conversion fails
- User gets the most value from each import

---

### Markitdown Invocation

**Decision: CLI via spawn**

```typescript
import { spawn } from 'child_process';

// Convert PDF to markdown
const markitdown = spawn('npx', ['markitdown', pdfPath, '-o', outputPath], {
  cwd: workspaceDir,
});

markitdown.on('close', (code) => {
  if (code === 0) {
    // Success - read outputPath
  } else {
    // Failed - fallback to metadata only
  }
});
```

- No new dependencies (uses npx)
- Works in both dev and production
- Can be replaced with direct invocation later

---

### Workspace Path Access

**Decision: Extension receives workspace path from pi context**

```typescript
// In extension command handler
pi.registerCommand('source add-zotero', {
  async handler(_args, ctx) {
    // Get workspace from pi context
    const workspace = ctx.workspace;  // or similar
    
    // Pass to importer
    await importer.import(items, workspace);
  }
});
```

- Extension doesn't need to import SessionManager
- pi controls workspace (matches pi's architecture)
- Easier to test, more decoupled

---

### Filename Generation

**Decision: Slug from title**

```
Source: "Attention Is All You Need"
Filename: "attention-is-all-you-need.md"

Source: "BERT: Pre-training of Deep Bidirectional"
Filename: "bert-pre-training-of-deep-bidirectional.md"

Source: "What's in a name? A study of formal names"
Filename: "whats-in-a-name-a-study-of-formal-names.md"
```

- Human-readable
- Consistent with workspace naming conventions
- Truncated to reasonable length (~50 chars)

---

## Summary of Decisions

| Decision | Choice |
|----------|--------|
| Import confirmation | Immediate on Enter |
| Already-imported items | Show with checkbox, still selectable |
| Failure handling | Continue, report at end |
| Source list format | Simple list, /resume style |
| Zotero import scope | Metadata + PDF text |
| Markitdown invocation | CLI via spawn |
| Workspace path | From pi context (ctx) |
| Filename | Slug from title |

---

## Remaining Questions for Implementation

1. **Extension → Importer interface**: What API does ImportPipeline expose?
2. **Duplicate detection timing**: Check before picker shows, or after selection?
3. **Retry mechanism**: Should failed items be stored for retry?
4. **Markitdown availability**: Assume npx works, or need to verify?

These will be answered in the implementation spec.