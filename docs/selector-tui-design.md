# Source Selector TUI Component

## Overview

A **unified** TUI component for searching and selecting sources. The same selector UI works for any source provider — Zotero, Obsidian, or future sources. Only the data fetching differs.

Key insight:
> **Same selector, same UX, different providers** — The TUI, search logic, and selection flow are identical regardless of source.

Features:
- Real-time fuzzy search filtering
- Multi-select with visual indicators
- Keyboard navigation
- Smooth scrolling

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚡ Sources                                                           │
├─────────────────────────────────────────────────────────────────────┤
│ 🔍 [attention                                             ] [*]    │
├─────────────────────────────────────────────────────────────────────┤
│  23 results                                          0 selected      │
├─────────────────────────────────────────────────────────────────────┤
│ ◯ │ 2017 │ Attention Is All You Need                           │
│   │      │ Vaswani, Shazeer, Parmar, et al.                     │
│   │      │ transformers, attention, deep-learning               │
├─────────────────────────────────────────────────────────────────────┤
│ ● │ 2020 │ GPT-3: Language Models are Few-Shot Learners        │
│   │      │ Brown, Mann, Ryder, et al.                           │
│   │      │ language-models, few-shot, scaling                   │
├─────────────────────────────────────────────────────────────────────┤
│ ◯ │ 2018 │ BERT: Pre-training of Deep Bidirectional...         │
│   │      │ Devlin, Chang, Lee, Toutanova                        │
│   │      │ BERT, NLP, transformers                             │
├─────────────────────────────────────────────────────────────────────┤
│ ● │ 2023 │ LLM Scaling Laws: A Comprehensive Survey            │
│   │      │ Hoffmann, Levon, et al.                              │
│   │      │ scaling, training, compute                          │
├─────────────────────────────────────────────────────────────────────┤
│                   ↑↓ navigate  ␣ select  ⏎ confirm  esc cancel   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture: Same Selector, Different Providers

```
┌─────────────────────────────────────────────────────────────┐
│                    SourceSelector TUI                       │
│  (identical for all providers)                              │
│  - Search input with fuzzy filter                           │
│  - Scrollable list with multi-select                        │
│  - Keyboard navigation                                       │
│  - Theme-aware styling                                       │
├─────────────────────────────────────────────────────────────┤
│                      SourceProvider                         │
│  (implements the interface, data differs)                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Zotero     │  │  Obsidian   │  │  Future...  │          │
│  │  Provider   │  │  Provider   │  │  Provider   │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│    API fetch         File system       Plugin/SDK          │
│    PDF convert       Metadata parse                         │
└─────────────────────────────────────────────────────────────┘
```

### Provider Interface

```typescript
interface SourceProvider {
  /** Human-readable name */
  name: string;
  
  /** Check if provider is configured (API key, vault path, etc.) */
  isConfigured(): boolean;
  
  /** Fetch all items for search index */
  fetchIndex(): Promise<SourceDoc[]>;
  
  /** Get full content (text, markdown, or converted PDF) */
  getContent(id: string): Promise<string>;
  
  /** Get complete metadata for frontmatter */
  getMetadata(id: string): Promise<Record<string, unknown>>;
}
```

---

## Types

```typescript
// types.ts

/** Normalized document from any source provider */
export interface SourceDoc {
  id: string;
  provider: "zotero" | "obsidian";
  title: string;
  subtitle?: string;        // Journal, venue, folder
  authors?: string[];
  year?: string;
  tags?: string[];
  preview?: string;         // Abstract, excerpt
}

/** Options for creating a SourceSelector */
export interface SourceSelectorOptions {
  multiSelect?: boolean;    // Default: true
  title?: string;
  onComplete: (selected: SourceDoc[], cancelled: boolean) => void;
}
```

---

## Main Component: SourceSelector

```typescript
// SourceSelector.ts

import {
  Component,
  Container,
  Text,
  Box,
  Spacer,
  DynamicBorder,
  matchesKey,
  Key,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

import { SearchInput } from "./SearchInput";
import { SourceList } from "./SourceList";
import type { SourceDoc, SourceProvider, SourceSelectorOptions } from "./types";
import type { Theme } from "@earendil-works/pi-tui";

export class SourceSelector implements Component {
  private container: Container;
  private searchInput: SearchInput;
  private sourceList: SourceList;
  private resultsLabel: Text;
  private selectedLabel: Text;
  private helpText: Text;
  private allDocs: SourceDoc[] = [];
  private filteredDocs: SourceDoc[] = [];
  private selected = new Set<string>();
  private multiSelect: boolean;
  private query = "";
  private theme!: Theme;
  
  public onComplete?: (selected: SourceDoc[], cancelled: boolean) => void;

  constructor(
    private provider: SourceProvider,
    options: { multiSelect?: boolean; title?: string }
  ) {
    this.multiSelect = options.multiSelect ?? true;
    this.container = new Container();
    
    this.setupUI(options.title ?? `Sources from ${provider.name}`);
  }

  private setupUI(title: string): void {
    // Title bar with icon
    this.container.addChild(new DynamicBorder((s) => this.theme.fg("accent", s)));
    this.container.addChild(
      new Text(this.theme.fg("accent", this.theme.bold(`⚡ ${title}`)), 1, 0)
    );
    
    // Search input row
    const searchRow = new Container();
    this.searchInput = new SearchInput(this.theme, (query) => {
      this.query = query;
      this.filter();
    });
    searchRow.addChild(this.searchInput);
    this.container.addChild(searchRow);
    
    // Results header
    this.resultsLabel = new Text(this.theme.fg("muted", "0 results"), 1, 0);
    this.selectedLabel = new Text(this.theme.fg("success", "0 selected"), 1, 0);
    
    const headerRow = new Container();
    headerRow.addChild(this.resultsLabel);
    headerRow.addChild(new Spacer(1));
    headerRow.addChild(this.selectedLabel);
    this.container.addChild(headerRow);
    
    // Separator
    this.container.addChild(new DynamicBorder((s) => this.theme.fg("border", s)));
    
    // Source list
    this.sourceList = new SourceList(
      this.theme,
      [],
      (id) => this.toggle(id),
      this.multiSelect
    );
    this.container.addChild(this.sourceList);
    
    // Separator
    this.container.addChild(new DynamicBorder((s) => this.theme.fg("border", s)));
    
    // Help text
    this.helpText = new Text(
      this.theme.fg("dim", "↑↓ navigate  ␣ select  ⏎ confirm  esc cancel"),
      1,
      0
    );
    this.container.addChild(this.helpText);
    
    // Bottom border
    this.container.addChild(new DynamicBorder((s) => this.theme.fg("accent", s)));
  }

  async load(): Promise<void> {
    // Check configuration first
    if (!this.provider.isConfigured()) {
      throw new Error(`${this.provider.name} not configured. Check config.`);
    }
    
    // Fetch and index all docs
    this.allDocs = await this.provider.fetchIndex();
    this.filter();
  }

  private filter(): void {
    if (!this.query.trim()) {
      this.filteredDocs = [...this.allDocs];
    } else {
      // Simple fuzzy match (could use fuse.js here)
      const q = this.query.toLowerCase();
      this.filteredDocs = this.allDocs.filter((doc) => {
        const title = doc.title.toLowerCase();
        const authors = doc.authors?.join(" ").toLowerCase() ?? "";
        const tags = doc.tags?.join(" ").toLowerCase() ?? "";
        return (
          title.includes(q) ||
          authors.includes(q) ||
          tags.includes(q)
        );
      });
    }
    
    // Update list
    this.sourceList.setItems(this.filteredDocs, this.selected);
    this.resultsLabel.setText(
      this.theme.fg("muted", `${this.filteredDocs.length} results`)
    );
    this.selectedLabel.setText(
      this.selected.size > 0
        ? this.theme.fg("success", `${this.selected.size} selected`)
        : this.theme.fg("dim", "0 selected")
    );
  }

  private toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
    this.sourceList.setSelection(this.selected);
    this.selectedLabel.setText(
      this.selected.size > 0
        ? this.theme.fg("success", `${this.selected.size} selected`)
        : this.theme.fg("dim", "0 selected")
    );
  }

  handleInput(data: string): void {
    // Check for toggle multi-select mode
    if (matchesKey(data, Key.star)) {
      this.multiSelect = !this.multiSelect;
      this.sourceList.setMultiSelect(this.multiSelect);
      return;
    }
    
    // Check for select all
    if (matchesKey(data, Key.ctrl("a"))) {
      this.filteredDocs.forEach((doc) => this.selected.add(doc.id));
      this.sourceList.setSelection(this.selected);
      this.invalidate();
      return;
    }
    
    // Check for deselect all
    if (matchesKey(data, Key.ctrl("d"))) {
      this.selected.clear();
      this.sourceList.setSelection(this.selected);
      this.invalidate();
      return;
    }
    
    // Delegate to search input if focused
    if (this.searchInput.isFocused()) {
      this.searchInput.handleInput(data);
      return;
    }
    
    // Delegate to list
    this.sourceList.handleInput(data);
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }

  // For integration with pi
  getSelected(): SourceDoc[] {
    return this.filteredDocs.filter((doc) => this.selected.has(doc.id));
  }
}
```

---

## SearchInput Component

```typescript
// SearchInput.ts

import { Component, Container, Text, matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-tui";

export class SearchInput implements Component {
  private container: Container;
  private inputText = "";
  private cursorPos = 0;
  private focused = false;
  private theme: Theme;
  private onChange: (query: string) => void;
  
  private inputDisplay!: Text;
  private cursorDisplay!: Text;

  constructor(theme: Theme, onChange: (query: string) => void) {
    this.theme = theme;
    this.onChange = onChange;
    
    this.container = new Container();
    this.build();
  }

  private build(): void {
    // Clear
    this.container.clear();
    
    // Search icon
    this.container.addChild(new Text(this.theme.fg("accent", "🔍"), 0, 0));
    
    // Input area
    const display = `[${this.inputText || this.theme.fg("dim", "search...")}]`;
    const multiIcon = " [*]" + (this.theme.fg("dim", " multi"));
    
    this.inputDisplay = new Text(
      display + multiIcon,
      0,
      0
    );
    this.container.addChild(this.inputDisplay);
    
    // Cursor indicator
    this.cursorDisplay = new Text(
      this.focused ? this.theme.fg("accent", "◂") : " ",
      0,
      0
    );
    this.container.addChild(this.cursorDisplay);
  }

  isFocused(): boolean {
    return this.focused;
  }

  handleInput(data: string): void {
    // Click/focus activation
    if (data === "click") {
      this.focused = true;
      this.invalidate();
      return;
    }
    
    // Escape to unfocus
    if (matchesKey(data, Key.escape)) {
      this.focused = false;
      this.invalidate();
      return;
    }
    
    // Type to focus and filter
    if (data.length === 1 && !matchesKey(data, Key.escape)) {
      this.focused = true;
      this.inputText += data;
      this.cursorPos++;
      this.onChange(this.inputText);
      this.invalidate();
      return;
    }
    
    // Backspace
    if (matchesKey(data, Key.backspace)) {
      this.inputText = this.inputText.slice(0, -1);
      this.cursorPos = Math.max(0, this.cursorPos - 1);
      this.onChange(this.inputText);
      this.invalidate();
      return;
    }
    
    // Ctrl+U to clear
    if (matchesKey(data, Key.ctrl("u"))) {
      this.inputText = "";
      this.cursorPos = 0;
      this.onChange(this.inputText);
      this.invalidate();
      return;
    }
  }

  render(width: number): string[] {
    this.build();
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}
```

---

## SourceList Component

```typescript
// SourceList.ts

import { Component, Container, Text, Spacer, matchesKey, Key } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-tui";
import type { SourceDoc } from "./types";

export class SourceList implements Component {
  private container: Container;
  private items: SourceDoc[] = [];
  private selected = new Set<string>();
  private cursor = 0;
  private scrollOffset = 0;
  private visibleRows = 10;
  private multiSelect = true;
  private theme: Theme;
  private onToggle: (id: string) => void;
  
  private itemComponents: Container[] = [];

  constructor(
    theme: Theme,
    items: SourceDoc[],
    onToggle: (id: string) => void,
    multiSelect = true
  ) {
    this.theme = theme;
    this.items = items;
    this.onToggle = onToggle;
    this.multiSelect = multiSelect;
    
    this.container = new Container();
    this.build();
  }

  setItems(items: SourceDoc[], selected: Set<string>): void {
    this.items = items;
    this.selected = selected;
    this.cursor = Math.min(this.cursor, Math.max(0, items.length - 1));
    this.scrollOffset = Math.max(0, this.cursor - Math.floor(this.visibleRows / 2));
    this.build();
  }

  setSelection(selected: Set<string>): void {
    this.selected = selected;
    this.build();
  }

  setMultiSelect(enabled: boolean): void {
    this.multiSelect = enabled;
    this.build();
  }

  private build(): void {
    this.container.clear();
    this.itemComponents = [];
    
    // Visible items based on scroll
    const visibleItems = this.items.slice(this.scrollOffset, this.scrollOffset + this.visibleRows);
    
    for (let i = 0; i < visibleItems.length; i++) {
      const item = visibleItems[i];
      const isSelected = this.selected.has(item.id);
      const isCursor = this.scrollOffset + i === this.cursor;
      
      const row = this.buildItemRow(item, isSelected, isCursor);
      this.itemComponents.push(row);
      this.container.addChild(row);
    }
    
    // Scroll indicator if needed
    if (this.items.length > this.visibleRows) {
      const scrollInfo = `┄ ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + this.visibleRows, this.items.length)} / ${this.items.length} ┄`;
      this.container.addChild(new Text(this.theme.fg("dim", scrollInfo), 1, 0));
    }
  }

  private buildItemRow(item: SourceDoc, isSelected: boolean, isCursor: boolean): Container {
    const row = new Container();
    
    // Selection indicator
    const indicator = isSelected
      ? this.theme.fg("success", "●")
      : this.theme.fg("dim", "◯");
    row.addChild(new Text(indicator, 0, 0));
    
    // Year (fixed width)
    const year = item.year ? item.year.padEnd(4) : "    ";
    const yearColor = isCursor ? "accent" : "muted";
    row.addChild(new Text(this.theme.fg(yearColor, ` │ ${year} │ `), 0, 0));
    
    // Title (truncated)
    const title = truncateToWidth(item.title, 40);
    const titleColor = isCursor ? "accent" : "text";
    row.addChild(new Text(this.theme.fg(titleColor, title), 0, 0));
    
    // Second line (authors)
    const authors = item.authors?.slice(0, 3).join(", ") ?? "";
    const subtitle = truncateToWidth(authors, 50);
    row.addChild(new Text(this.theme.fg("dim", `   ${subtitle}`), 1, 0));
    
    // Third line (tags)
    if (item.tags && item.tags.length > 0) {
      const tags = item.tags.slice(0, 5).join(", ");
      const tagsDisplay = truncateToWidth(`   📎 ${tags}`, 50);
      row.addChild(new Text(this.theme.fg("muted", tagsDisplay), 1, 0));
    }
    
    return row;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || matchesKey(data, Key.k)) {
      if (this.cursor > 0) {
        this.cursor--;
        if (this.cursor < this.scrollOffset) {
          this.scrollOffset--;
        }
        this.build();
      }
    } else if (matchesKey(data, Key.down) || matchesKey(data, Key.j)) {
      if (this.cursor < this.items.length - 1) {
        this.cursor++;
        if (this.cursor >= this.scrollOffset + this.visibleRows) {
          this.scrollOffset++;
        }
        this.build();
      }
    } else if (matchesKey(data, Key.space)) {
      const item = this.items[this.cursor];
      if (item) {
        this.onToggle(item.id);
      }
    } else if (matchesKey(data, Key.enter)) {
      const item = this.items[this.cursor];
      if (item && this.multiSelect) {
        // Enter selects and confirms, or moves to next if single select
        // For multi-select, space toggles and enter confirms selection
        // Actually, for multi-select workflow: space=toggle, enter=confirm
        // But we want to allow confirming directly from list
        // Let's interpret as: confirm current selection
        return; // Let parent handle
      }
    }
  }

  render(width: number): string[] {
    return this.container.render(width);
  }

  invalidate(): void {
    this.container.invalidate();
  }
}
```

---

## Usage in Extension

The extension registers commands that delegate to the unified selector:

```typescript
// index.ts

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SourceSelector } from "./SourceSelector";
import { ZoteroProvider } from "./providers/ZoteroProvider";
import { ObsidianProvider } from "./providers/ObsidianProvider";

// Provider registry - add new providers here
const PROVIDERS: Record<string, () => SourceProvider> = {
  zotero: () => new ZoteroProvider(readConfig().zotero),
  obsidian: () => new ObsidianProvider(readConfig().obsidian),
};

export default function (pi: ExtensionAPI) {
  // Single unified command - asks for provider first
  pi.registerCommand("source-add", {
    description: "Add sources from connected libraries",
    handler: async (args, ctx) => {
      // Let user pick provider
      const providerNames = Object.keys(PROVIDERS);
      const chosen = await ctx.ui.select("Source", providerNames);
      if (!chosen) return;

      const provider = PROVIDERS[chosen]();
      
      if (!provider.isConfigured()) {
        ctx.ui.notify(`${provider.name} not configured`, "error");
        return;
      }

      // Create selector (same UI regardless of provider)
      const selector = new SourceSelector(provider, {
        multiSelect: true,
        title: provider.name,
        onComplete: async (selected, cancelled) => {
          // Process selected sources
          for (const doc of selected) {
            const content = await provider.getContent(doc.id);
            const metadata = await provider.getMetadata(doc.id);
            await writeToWorkspace(doc.id, content, metadata);
          }
          
          ctx.ui.notify(`Added ${selected.length} source(s)`, "success");
        },
      });

      await selector.load();
      ctx.ui.custom(selector, { overlay: true });
    },
  });

  // Separate commands for quick access (optional)
  pi.registerCommand("source-add-zotero", { ... });
  pi.registerCommand("source-add-obsidian", { ... });
}
```

### Command Structure

| Command | Description |
|---------|-------------|
| `/source-add` | Unified: pick provider → search → select → add |
| `/source-add-zotero` | Direct: skip provider selection |
| `/source-add-obsidian` | Direct: skip provider selection |

---

## Keyboard Shortcuts Summary

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate list |
| `k` / `j` | Navigate list (vim style) |
| `Space` | Toggle selection |
| `Enter` | Confirm selection |
| `Esc` | Cancel |
| `/` | Focus search input |
| `Ctrl+A` | Select all visible |
| `Ctrl+D` | Deselect all |
| `*` | Toggle multi-select mode |
| `Ctrl+U` | Clear search |

---

## Theme Integration

The selector uses the passed `theme` parameter to style:

```typescript
// Colors used
theme.fg("accent", ...)     // Title, cursor indicator, selected icon
theme.fg("text", ...)       // Normal text
theme.fg("muted", ...)      // Secondary text, year, tags
theme.fg("dim", ...)        // Placeholder text, help
theme.fg("success", ...)    // Selected count, selected icon
theme.fg("border", ...)     // Separators
```

---

## Performance Considerations

1. **Lazy loading** — Only render visible items
2. **Cache filtered results** — Don't re-filter on every keypress (debounce)
3. **Incremental search** — Show results as you type with 100ms debounce

```typescript
private debounceTimer?: NodeJS.Timeout;

private onSearchInput(query: string): void {
  clearTimeout(this.debounceTimer);
  this.debounceTimer = setTimeout(() => {
    this.filter(query);
  }, 100);
}
```

---

## Provider Implementation (Zotero Example)

```typescript
// providers/ZoteroProvider.ts

import type { SourceProvider, SourceDoc } from "../types";

export class ZoteroProvider implements SourceProvider {
  name = "Zotero";
  private config: ZoteroConfig;
  private cache?: SourceDoc[];

  constructor(config: ZoteroConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return Boolean(this.config?.apiKey && this.config?.userId);
  }

  async fetchIndex(): Promise<SourceDoc[]> {
    if (this.cache) return this.cache;
    
    const response = await fetch(
      `https://api.zotero.org/users/${this.config.userId}/items`,
      { headers: { "Zotero-API-Key": this.config.apiKey } }
    );
    
    const data = await response.json();
    this.cache = data.map((item: ZoteroItem): SourceDoc => ({
      id: item.key,
      provider: "zotero",
      title: item.data.title,
      subtitle: item.data.publicationTitle,
      authors: item.data.creators?.map((c) => `${c.firstName} ${c.lastName}`),
      year: item.data.date?.match(/\d{4}/)?.[0],
      tags: item.data.tags,
      preview: item.data.abstractNote,
    }));
    
    return this.cache;
  }

  async getContent(id: string): Promise<string> {
    // Fetch PDF attachment and convert via markitdown
    // Return markdown content or abstract fallback
  }

  async getMetadata(id: string): Promise<Record<string, unknown>> {
    // Return full Zotero item metadata for frontmatter
  }
}
```

### Obsidian Provider (Same Interface)

```typescript
// providers/ObsidianProvider.ts

import type { SourceProvider, SourceDoc } from "../types";
import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

export class ObsidianProvider implements SourceProvider {
  name = "Obsidian";
  private config: ObsidianConfig;
  private cache?: SourceDoc[];

  constructor(config: ObsidianConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return Boolean(this.config?.vaultPath);
  }

  async fetchIndex(): Promise<SourceDoc[]> {
    if (this.cache) return this.cache;
    
    // Scan vault recursively for .md files
    const files = this.scanVault(this.config.vaultPath);
    
    this.cache = files.map((file): SourceDoc => {
      const content = readFileSync(file, "utf8");
      const frontmatter = this.parseFrontmatter(content);
      
      return {
        id: file,  // Use file path as ID
        provider: "obsidian",
        title: frontmatter.title ?? this.extractTitle(content),
        subtitle: this.extractFolder(file),
        authors: frontmatter.author ? [frontmatter.author] : [],
        year: frontmatter.date?.match(/\d{4}/)?.[0],
        tags: frontmatter.tags ?? [],
        preview: this.extractPreview(content),
      };
    });
    
    return this.cache;
  }

  // ... getContent and getMetadata implementations
}
```

> **Key point**: Both providers implement the same interface. The selector UI never changes — only the data fetching differs.

---

## Extension Code Base Design

```
extensions/
└── episteme-source/
    ├── index.ts              # Entry point, registers commands
    ├── SourceSelector.ts     # Main selector component (provider-agnostic)
    ├── SearchInput.ts        # Search input with fuzzy filtering
    ├── SourceList.ts         # Scrollable result list with multi-select
    ├── types.ts              # Shared types (SourceDoc, SourceProvider, etc.)
    └── providers/
        ├── ZoteroProvider.ts  # Zotero API integration
        ├── ObsidianProvider.ts # Obsidian vault integration
        └── index.ts           # Provider registry
```

## Future Enhancements

- [ ] **Virtual scrolling** for large lists (1000+ items) — render only visible rows
- [ ] Fuzzy search with fuse.js scoring (provider-agnostic)
- [ ] Sort options (relevance, year, title, date added)
- [ ] Filter by tags, year range
- [ ] Preview panel on item select
- [ ] Drag to reorder selected items
- [ ] Export selection to JSON/CSV

---

## Adding New Providers

To add a new source provider:

1. **Implement `SourceProvider` interface**

```typescript
// providers/MyProvider.ts
import type { SourceProvider, SourceDoc } from "../types";

export class MyProvider implements SourceProvider {
  name = "MySource";
  
  isConfigured(): boolean { ... }
  
  async fetchIndex(): Promise<SourceDoc[]> {
    // Fetch and normalize items to SourceDoc[]
  }
  
  async getContent(id: string): Promise<string> {
    // Return full content/markdown
  }
  
  async getMetadata(id: string): Promise<SourceMetadata> {
    // Return metadata for frontmatter
  }
}
```

2. **Register in provider registry**

```typescript
const PROVIDERS = {
  zotero: () => new ZoteroProvider(config),
  obsidian: () => new ObsidianProvider(config),
  mysource: () => new MyProvider(config),
};
```

3. **Done** — The selector UI works automatically with the new provider.