// ============================================================================
// Fuzzy List - Custom Picker UI
// ============================================================================

import Fuse, { type IFuseOptions, type FuseOptionKey } from 'fuse.js';
import type { SourceListItem, FuzzyListResult } from './types.js';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const MAX_DISPLAY_ITEMS = 20;
const MAX_ITEMS_IN_LIST = 500;

// ----------------------------------------------------------------------------
// FuzzyList Class
// ----------------------------------------------------------------------------

export class FuzzyList<T> {
  private items: T[];
  private filteredItems: T[];
  private fuse: Fuse<T>;
  private searchQuery: string = '';
  private selectedIndices: Set<number> = new Set();
  private cursorIndex: number = 0;
  private keys: (keyof T)[];

  constructor(items: T[], keys: (keyof T)[], options?: { threshold?: number }) {
    this.items = items;
    this.keys = keys;
    
    // Configure Fuse.js
    const fuseOptions: IFuseOptions<T> = {
      keys: keys.map(k => ({ name: k as string })) as FuseOptionKey<T>[],
      threshold: options?.threshold ?? 0.3,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 1,
    };
    
    this.fuse = new Fuse(items, fuseOptions);
    this.filteredItems = items;
  }

  /**
   * Update the search query and filter items
   */
  search(query: string): T[] {
    this.searchQuery = query;
    
    if (!query.trim()) {
      this.filteredItems = this.items;
    } else {
      const results = this.fuse.search(query);
      this.filteredItems = results.map(r => r.item);
    }
    
    // Reset cursor and selection when search changes
    this.cursorIndex = 0;
    this.selectedIndices.clear();
    
    // Return only up to MAX_ITEMS_IN_LIST
    return this.filteredItems.slice(0, MAX_ITEMS_IN_LIST);
  }

  /**
   * Get items to display (with limits)
   */
  getDisplayItems(): T[] {
    return this.filteredItems.slice(0, MAX_DISPLAY_ITEMS);
  }

  /**
   * Get total filtered count
   */
  getTotalCount(): number {
    return this.filteredItems.length;
  }

  /**
   * Move cursor up
   */
  moveUp(): number {
    if (this.cursorIndex > 0) {
      this.cursorIndex--;
    }
    return this.cursorIndex;
  }

  /**
   * Move cursor down
   */
  moveDown(): number {
    const maxIndex = Math.min(this.filteredItems.length, MAX_DISPLAY_ITEMS) - 1;
    if (this.cursorIndex < maxIndex) {
      this.cursorIndex++;
    }
    return this.cursorIndex;
  }

  /**
   * Toggle selection at cursor
   */
  toggleSelection(): void {
    if (this.selectedIndices.has(this.cursorIndex)) {
      this.selectedIndices.delete(this.cursorIndex);
    } else {
      this.selectedIndices.add(this.cursorIndex);
    }
  }

  /**
   * Toggle selection at specific index
   */
  toggleSelectionAt(index: number): void {
    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }
  }

  /**
   * Select all visible items
   */
  selectAll(): void {
    const displayCount = Math.min(this.filteredItems.length, MAX_DISPLAY_ITEMS);
    for (let i = 0; i < displayCount; i++) {
      this.selectedIndices.add(i);
    }
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedIndices.clear();
  }

  /**
   * Get selected items
   */
  getSelectedItems(): T[] {
    return Array.from(this.selectedIndices).map(i => this.filteredItems[i]).filter(Boolean);
  }

  /**
   * Get selected indices
   */
  getSelectedIndices(): Set<number> {
    return new Set(this.selectedIndices);
  }

  /**
   * Get cursor index
   */
  getCursorIndex(): number {
    return this.cursorIndex;
  }

  /**
   * Check if cursor position has selection
   */
  isCursorSelected(): boolean {
    return this.selectedIndices.has(this.cursorIndex);
  }

  /**
   * Get current search query
   */
  getSearchQuery(): string {
    return this.searchQuery;
  }

  /**
   * Check if any items are selected
   */
  hasSelection(): boolean {
    return this.selectedIndices.size > 0;
  }

  /**
   * Get selection count
   */
  getSelectionCount(): number {
    return this.selectedIndices.size;
  }

  /**
   * Get items count
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Check if there are more items than displayed
   */
  hasMoreItems(): boolean {
    return this.filteredItems.length > MAX_DISPLAY_ITEMS;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.searchQuery = '';
    this.filteredItems = this.items;
    this.selectedIndices.clear();
    this.cursorIndex = 0;
  }
}

// ----------------------------------------------------------------------------
// FuzzyList Factory
// ----------------------------------------------------------------------------

export function createFuzzyList<T>(
  items: T[],
  keys: (keyof T)[],
  options?: { threshold?: number }
): FuzzyList<T> {
  return new FuzzyList(items, keys, options);
}

// ----------------------------------------------------------------------------
// Format helpers for SourceListItem
// ----------------------------------------------------------------------------

export function formatSourceItem(item: SourceListItem, maxTitleWidth: number = 50): string {
  const title = item.title.length > maxTitleWidth 
    ? item.title.substring(0, maxTitleWidth - 3) + '...' 
    : item.title;
  
  const authorStr = item.authors || 'Unknown';
  const yearStr = item.year ? `(${item.year})` : '';
  
  // Pad title to max width
  const paddedTitle = title.padEnd(maxTitleWidth);
  
  // Format: title | authors year
  return `${paddedTitle} ${authorStr} ${yearStr}`;
}

export function formatSourceItemSimple(item: SourceListItem): { left: string; right: string } {
  return {
    left: item.title,
    right: `${item.authors} ${item.year ? `(${item.year})` : ''}`,
  };
}

// ----------------------------------------------------------------------------
// List Renderer (for terminal output)
// ----------------------------------------------------------------------------

export function renderFuzzyList<T>(
  list: FuzzyList<T>,
  formatter: (item: T, index: number, isCursor: boolean, isSelected: boolean) => string,
  options?: {
    header?: string;
    maxWidth?: number;
  }
): string {
  const maxWidth = options?.maxWidth || 80;
  const displayItems = list.getDisplayItems();
  const cursorIndex = list.getCursorIndex();
  const selectedIndices = list.getSelectedIndices();

  const lines: string[] = [];

  // Header
  if (options?.header) {
    lines.push('');
    lines.push(options.header);
    lines.push('─'.repeat(maxWidth));
  }

  // Search query
  const query = list.getSearchQuery();
  lines.push(`[${query || 'type to filter'}]`);
  lines.push('');

  // Items
  displayItems.forEach((item, idx) => {
    const isCursor = idx === cursorIndex;
    const isSelected = selectedIndices.has(idx);
    const formatted = formatter(item, idx, isCursor, isSelected);
    
    if (isCursor) {
      lines.push(`▶ ${formatted}`);
    } else if (isSelected) {
      lines.push(`☑ ${formatted}`);
    } else {
      lines.push(`  ${formatted}`);
    }
  });

  // Footer
  lines.push('');
  const totalCount = list.getItemCount();
  const filteredCount = list.getTotalCount();
  const selectedCount = list.getSelectionCount();
  
  if (filteredCount !== totalCount) {
    lines.push(`${filteredCount} items (filtered from ${totalCount})`);
  } else {
    lines.push(`${totalCount} items`);
  }
  
  if (selectedCount > 0) {
    lines.push(`${selectedCount} selected`);
  }

  lines.push('↑↓ navigate | Space toggle | Enter select | Esc cancel');

  return lines.join('\n');
}