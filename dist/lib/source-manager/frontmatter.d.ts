import type { ZoteroItem } from './types.js';
export interface FrontmatterOptions {
    title: string;
    authors?: string[];
    date?: string | number;
    tags?: string[];
    zoteroKey?: string;
    sourceType: 'zotero' | 'obsidian';
    importedAt: number;
    originalPath?: string;
    note?: string;
}
/**
 * Build YAML frontmatter string
 */
export declare function buildFrontmatter(options: FrontmatterOptions): string;
/**
 * Extract tags from Zotero item
 */
export declare function extractTags(item: ZoteroItem): string[];
/**
 * Extract year from Zotero item date
 */
export declare function extractYear(dateStr?: string): number | null;
/**
 * Extract authors from Zotero item creators
 */
export declare function extractAuthors(item: ZoteroItem): string[];
//# sourceMappingURL=frontmatter.d.ts.map