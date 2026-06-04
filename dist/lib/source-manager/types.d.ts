export type SourceType = 'zotero' | 'obsidian';
export interface SourceInfo {
    id: string;
    type: SourceType;
    path: string;
    title: string;
    authors?: string[];
    year?: number;
    addedAt: number;
    importedAt: number;
    zoteroKey?: string;
    tags?: string[];
    filePath?: string;
}
export interface SourceListItem {
    id: string;
    title: string;
    authors: string;
    year: number | null;
    type: SourceType;
    selected: boolean;
    zoteroKey?: string;
}
export interface ZoteroConfig {
    apiKey: string;
    libraryType: 'user' | 'group';
    libraryId: string;
}
export interface ZoteroAttachment {
    key: string;
    title: string;
    itemType: string;
    filename?: string;
    mimeType?: string;
    linkMode: string;
}
export interface ZoteroItem {
    key: string;
    version: number;
    library: {
        type: string;
        id: number;
        name: string;
    };
    links: {
        self: {
            href: string;
        };
        alternate: {
            href: string;
        };
    };
    meta: {
        created: string;
        modified: string;
        accessed: string;
        approved: boolean;
    };
    data: {
        key: string;
        itemType: string;
        title: string;
        abstractNote?: string;
        creators?: ZoteroCreator[];
        date?: string;
        dateAdded?: string;
        dateModified?: string;
        identifier?: string;
        shortTitle?: string;
        url?: string;
        tags?: Array<{
            tag: string;
        }>;
        parentItem?: string;
        mimeType?: string;
        filename?: string;
        links?: Array<{
            href: string;
        }>;
    };
}
export interface ZoteroCreator {
    creatorType: string;
    firstName?: string;
    lastName?: string;
    name?: string;
}
export interface ZoteroCacheMeta {
    cachedAt: number;
    itemCount: number;
    lastItemKey: string;
    libraryVersion: number;
    totalResults: number;
}
export interface ZoteroFetchOptions {
    limit?: number;
    sort?: 'dateModified' | 'title' | 'author' | 'dateAdded';
    direction?: 'asc' | 'desc';
    since?: number;
    timeout?: number;
    maxRetries?: number;
}
export interface CacheOptions {
    ttlHours: number;
    cacheDir: string;
}
export interface ObsidianConfig {
    vaultPath: string;
}
export interface ObsidianNote {
    path: string;
    title: string;
    modified: number;
    size: number;
}
export interface FuzzyListOptions<T> {
    items: T[];
    keys: (keyof T)[];
    threshold?: number;
    maxDisplay?: number;
}
export interface FuzzyListResult<T> {
    selected: T[];
    cancelled: boolean;
}
export interface ImportProgress {
    current: number;
    total: number;
    status: string;
    itemName?: string;
}
export interface ImportResult {
    success: boolean;
    imported: SourceInfo[];
    failed: Array<{
        title: string;
        error: string;
    }>;
}
export interface EpistemeConfig {
    zoteroApiKey?: string;
    zoteroLibraryType?: 'user' | 'group';
    zoteroLibraryId?: string;
    zoteroCacheTtlHours?: number;
    obsidianVault?: string;
}
export declare function formatAuthors(creators: ZoteroCreator[]): string;
export declare function extractYear(dateStr?: string): number | null;
//# sourceMappingURL=types.d.ts.map