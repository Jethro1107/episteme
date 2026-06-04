import type { SourceListItem } from './types.js';
export declare class FuzzyList<T> {
    private items;
    private filteredItems;
    private fuse;
    private searchQuery;
    private selectedIndices;
    private cursorIndex;
    private keys;
    constructor(items: T[], keys: (keyof T)[], options?: {
        threshold?: number;
    });
    /**
     * Update the search query and filter items
     */
    search(query: string): T[];
    /**
     * Get items to display (with limits)
     */
    getDisplayItems(): T[];
    /**
     * Get total filtered count
     */
    getTotalCount(): number;
    /**
     * Move cursor up
     */
    moveUp(): number;
    /**
     * Move cursor down
     */
    moveDown(): number;
    /**
     * Toggle selection at cursor
     */
    toggleSelection(): void;
    /**
     * Toggle selection at specific index
     */
    toggleSelectionAt(index: number): void;
    /**
     * Select all visible items
     */
    selectAll(): void;
    /**
     * Clear all selections
     */
    clearSelection(): void;
    /**
     * Get selected items
     */
    getSelectedItems(): T[];
    /**
     * Get selected indices
     */
    getSelectedIndices(): Set<number>;
    /**
     * Get cursor index
     */
    getCursorIndex(): number;
    /**
     * Check if cursor position has selection
     */
    isCursorSelected(): boolean;
    /**
     * Get current search query
     */
    getSearchQuery(): string;
    /**
     * Check if any items are selected
     */
    hasSelection(): boolean;
    /**
     * Get selection count
     */
    getSelectionCount(): number;
    /**
     * Get items count
     */
    getItemCount(): number;
    /**
     * Check if there are more items than displayed
     */
    hasMoreItems(): boolean;
    /**
     * Reset to initial state
     */
    reset(): void;
}
export declare function createFuzzyList<T>(items: T[], keys: (keyof T)[], options?: {
    threshold?: number;
}): FuzzyList<T>;
export declare function formatSourceItem(item: SourceListItem, maxTitleWidth?: number): string;
export declare function formatSourceItemSimple(item: SourceListItem): {
    left: string;
    right: string;
};
export declare function renderFuzzyList<T>(list: FuzzyList<T>, formatter: (item: T, index: number, isCursor: boolean, isSelected: boolean) => string, options?: {
    header?: string;
    maxWidth?: number;
}): string;
//# sourceMappingURL=fuzzy-list.d.ts.map