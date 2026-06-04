# Selector Design

## Purpose

The Selector is a reusable component that provides a consistent UI for searching and selecting items across all source providers.

```
┌─────────────────────────────────────────────────────────────┐
│  Search: [attention                ]  [* multi-select]     │
├─────────────────────────────────────────────────────────────┤
│  23 results  │  sorted by relevance                        │
├───────────────┼─────────────────────────────────────────────┤
│  ◯ [2017]     │ Attention Is All You Need                  │
│               │ Vaswani, Shazeer, Parmar, et al.           │
│               │ transformers, attention, deep-learning      │
├───────────────┼─────────────────────────────────────────────┤
│  ● [2020]     │ GPT-3: Language Models are Few-Shot…        │
│               │ Brown, Mann, Ryder, et al.                  │
│               │ language-models, few-shot, scaling          │
├───────────────┼─────────────────────────────────────────────┤
│  ◯ [2018]     │ BERT: Pre-training of Deep Bidirectional…   │
│               │ Devlin, Chang, Lee, Toutanova               │
│               │ BERT, NLP, transformers                    │
└───────────────┴─────────────────────────────────────────────┘
 [↑/↓] navigate  [space] select  [enter] confirm  [/] search  [esc] cancel
```

---

## Selector Interface

```typescript
interface SearchDoc {
  id: string;           // Unique ID (e.g., Zotero key, Obsidian note path)
  title: string;
  subtitle?: string;     // Secondary line (e.g., journal, venue)
  authors?: string[];   // Array of author names
  year?: string;
  tags?: string[];
  preview?: string;     // Abstract or first 200 chars
  score?: number;       // Fuzzy match score (added by selector)
}

interface SelectorOptions {
  query?: string;        // Initial search query
  multiSelect?: boolean; // Allow multiple selections (default: false)
  maxResults?: number;  // Max results to show (default: 50)
  placeholder?: string;  // Search input placeholder
}

interface SelectorResult {
  selected: SearchDoc[];   // Items the user selected
  cancelled: boolean;      // User cancelled
  query: string;           // Final search query
}
```

---

## Selector Class Design

```typescript
class SourceSelector {
  private index: Fuse<SearchDoc>;
  private docs: SearchDoc[];
  private selected: Set<string> = new Set();
  
  constructor(
    private docs: SearchDoc[],
    private options: SelectorOptions = {}
  ) {
    this.index = new Fuse(docs, {
      keys: [
        { name: "title", weight: 0.5 },
        { name: "authors", weight: 0.25 },
        { name: "tags", weight: 0.15 },
        { name: "preview", weight: 0.1 },
      ],
      threshold: 0.3,
      includeScore: true,
      includeMatches: true,
    });
  }
  
  /**
   * Search the index with a query string
   */
  search(query: string): SearchDoc[] {
    if (!query.trim()) {
      return this.docs.map(doc => ({ ...doc, score: 0 }));
    }
    return this.index.search(query).map(result => ({
      ...result.item,
      score: result.score,
      _matches: result.matches,  // For highlighting
    }));
  }
  
  /**
   * Toggle selection for an item
   */
  toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
  }
  
  /**
   * Get current selection
   */
  getSelected(): SearchDoc[] {
    return this.docs.filter(doc => this.selected.has(doc.id));
  }
}
```

---

## Provider Interface

Each source provider implements this interface:

```typescript
interface SourceProvider {
  /** Provider name (used in logging, errors) */
  name: string;
  
  /** Config keys required (e.g., ["zotero.apiKey"]) */
  requiredConfig: string[];
  
  /**
   * Check if provider is configured
   */
  isConfigured(): boolean;
  
  /**
   * Fetch all searchable items for indexing
   * Used for initial load and refresh
   */
  fetchIndex(): Promise<SearchDoc[]>;
  
  /**
   * Get full details for a specific item
   */
  getDetails(id: string): Promise<SearchDoc>;
  
  /**
   * Fetch the content (text, markdown) for an item
   */
  fetchContent(id: string): Promise<string>;
  
  /**
   * Get complete metadata for writing to frontmatter
   */
  getMetadata(id: string): Promise<Record<string, unknown>>;
}
```

---

## Usage Flow

```typescript
async function addFromProvider(provider: SourceProvider, query?: string) {
  // 1. Check configuration
  if (!provider.isConfigured()) {
    throw new Error(`${provider.name} not configured. Check config.`);
  }
  
  // 2. Fetch and index
  const docs = await provider.fetchIndex();
  const selector = new SourceSelector(docs, { 
    query,
    multiSelect: false, 
  });
  
  // 3. Present to user (TUI or streamed to chat)
  const result = await selector.run();  // Blocks until user confirms/cancels
  
  if (result.cancelled) {
    return;
  }
  
  // 4. Process selections
  for (const doc of result.selected) {
    const content = await provider.fetchContent(doc.id);
    const metadata = await provider.getMetadata(doc.id);
    
    const slug = slugify(doc.title);
    const filename = `${slug}-${doc.id}.md`;
    
    await writeSourceFile(filename, content, metadata);
    await updateSessionMetadata(doc);
  }
}
```

---

## UI Rendering (TUI vs Chat)

The selector abstracts over the rendering layer:

```typescript
interface SelectorRenderer {
  /** Render the current state */
  render(state: SelectorState): void;
  
  /** Handle user input */
  handleInput(key: string): void;
  
  /** Return when selection is confirmed or cancelled */
  awaitConfirm(): Promise<SelectorResult>;
}

class TuiRenderer implements SelectorRenderer {
  // Uses blessed or similar for terminal UI
}

class ChatRenderer implements SelectorRenderer {
  // Streams updates to pi chat, accepts input via user messages
}
```

For pi integration, we likely use the ChatRenderer — streaming results as markdown and capturing user responses.

---

## SearchDoc Normalization

Providers may return different structures. Normalize to `SearchDoc`:

```typescript
function normalizeZoteroItem(item: ZoteroItem): SearchDoc {
  return {
    id: item.key,
    title: item.data.title,
    subtitle: item.data.bookTitle ?? item.data.publicationTitle,
    authors: item.data.creators?.map(c => c.name ?? `${c.firstName} ${c.lastName}`),
    year: item.data.date?.match(/\d{4}/)?.[0],
    tags: item.data.tags,
    preview: item.data.abstractNote,
  };
}

function normalizeObsidianNote(note: ObsidianNote): SearchDoc {
  return {
    id: note.path,
    title: note.title,
    subtitle: note.folder,
    authors: [],  // Obsidian has no inherent author concept
    year: undefined,
    tags: note.tags,
    preview: note.excerpt,
  };
}
```

---

## File Naming

Filename format: `<slug>-<id>.<ext>`

```typescript
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-")
    .slice(0, 5)  // Max 5 words
    .join("-");
}

// Examples:
// "Attention Is All You Need" → "attention-is-all-you-need"
// "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding" → "bert-pretraining-deep-bidirectional"
```

---

## State Management

The selector maintains state across interactions:

```typescript
interface SelectorState {
  query: string;
  results: SearchDoc[];
  cursor: number;        // Current position in results
  selected: Set<string>; // Selected item IDs
  mode: "browse" | "search" | "confirm";
  page: number;          // For pagination
}
```

---

## Key Bindings

| Key | Action |
|-----|--------|
| `↑` / `k` | Move cursor up |
| `↓` / `j` | Move cursor down |
| `Space` | Toggle selection |
| `Enter` | Confirm selection |
| `Esc` | Cancel |
| `/` | Focus search input |
| `*` | Toggle multi-select mode |
| `a` | Select all |
| `n` | Deselect all |
| `g` / `G` | Go to first / last |

---

## Implementation Notes

### For pi Chat UI

Since pi doesn't have a TUI, the selector streams results as formatted markdown:

```markdown
## Select sources (multi-select)
**23 results** for "attention"

| | Title | Year | Tags |
|--|-------|------|------|
| ○ | Attention Is All You Need | 2017 | transformers, attention |
| ● | GPT-3: Language Models... | 2020 | LLM, few-shot |
| ○ | BERT: Pre-training... | 2018 | BERT, NLP |

Reply with numbers (e.g., `1,3`), or "all", "none", "done"
```

Then parse user response to resolve selection.

### Lazy Loading

For large libraries, fetch index in batches:

```typescript
async fetchIndex(batchSize = 100): Promise<SearchDoc[]> {
  let all: SearchDoc[] = [];
  let start = 0;
  let hasMore = true;
  
  while (hasMore) {
    const batch = await this.fetchBatch(start, batchSize);
    all.push(...batch);
    hasMore = batch.length === batchSize;
    start += batchSize;
  }
  
  return all;
}
```

---

## Testing Strategy

```typescript
describe("SourceSelector", () => {
  it("searches by title with fuzzy matching");
  it("ranks exact matches higher");
  it("supports multi-select");
  it("handles empty results");
  it("normalizes results from different providers");
});

describe("ZoteroProvider", () => {
  it("fetches and normalizes index");
  it("fetches content for PDF items");
  it("handles API errors gracefully");
  it("caches index to reduce API calls");
});
```

---

## Extension Points

- **Custom renderers**: Implement `SelectorRenderer` for different UIs
- **Sorting options**: Add `sortBy: "relevance" | "year" | "title"`
- **Filters**: Add `filter: { tags?: string[], year?: Range }`
- **Pagination**: Add `pageSize` option for large resultsets