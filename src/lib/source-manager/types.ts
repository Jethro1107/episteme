// ============================================================================
// Source Manager Types
// ============================================================================

// ----------------------------------------------------------------------------
// Source Types
// ----------------------------------------------------------------------------

export type SourceType = 'zotero' | 'obsidian';

export interface SourceInfo {
  id: string;                    // UUID
  type: SourceType;
  path: string;                 // Original path/URL
  title: string;
  authors?: string[];
  year?: number;
  addedAt: number;             // Unix timestamp
  importedAt: number;          // Unix timestamp when added to workspace
  zoteroKey?: string;          // Zotero item key
  tags?: string[];
  filePath?: string;           // Path in workspace/sources/
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

// ----------------------------------------------------------------------------
// Zotero Types
// ----------------------------------------------------------------------------

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
    self: { href: string };
    alternate: { href: string };
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
    tags?: Array<{ tag: string }>;
    parentItem?: string;
    mimeType?: string;
    filename?: string;
    links?: Array<{ href: string }>;
  };
}

export interface ZoteroCreator {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface ZoteroCacheMeta {
  cachedAt: number;            // Unix timestamp
  itemCount: number;           // Total items cached
  lastItemKey: string;         // Last item key for incremental
  libraryVersion: number;      // Zotero's version header
  totalResults: number;        // Total items in library
}

export interface ZoteroFetchOptions {
  limit?: number;              // Items per page (default: 100)
  sort?: 'dateModified' | 'title' | 'author' | 'dateAdded';
  direction?: 'asc' | 'desc';
  since?: number;              // Version to fetch since
  timeout?: number;            // Request timeout in ms (default: 10000)
  maxRetries?: number;         // Max retries on rate limit (default: 3)
}

// ----------------------------------------------------------------------------
// Cache Types
// ----------------------------------------------------------------------------

export interface CacheOptions {
  ttlHours: number;            // TTL in hours
  cacheDir: string;             // Cache directory path
}

// ----------------------------------------------------------------------------
// Obsidian Types
// ----------------------------------------------------------------------------

export interface ObsidianConfig {
  vaultPath: string;
}

export interface ObsidianNote {
  path: string;
  title: string;
  modified: number;
  size: number;
}

// ----------------------------------------------------------------------------
// Fuzzy List Types
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Import Types
// ----------------------------------------------------------------------------

export interface ImportProgress {
  current: number;
  total: number;
  status: string;
  itemName?: string;
}

export interface ImportResult {
  success: boolean;
  imported: SourceInfo[];
  failed: Array<{ title: string; error: string }>;
}

// ----------------------------------------------------------------------------
// Config Types
// ----------------------------------------------------------------------------

export interface EpistemeConfig {
  zoteroApiKey?: string;
  zoteroLibraryType?: 'user' | 'group';
  zoteroLibraryId?: string;
  zoteroCacheTtlHours?: number;
  obsidianVault?: string;
}

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

export function formatAuthors(creators: ZoteroCreator[]): string {
  if (!creators || creators.length === 0) return '';
  
  const authorNames = creators
    .filter(c => c.creatorType === 'author')
    .map(c => {
      if (c.name) return c.name;
      if (c.lastName && c.firstName) return `${c.lastName}, ${c.firstName}`;
      if (c.lastName) return c.lastName;
      return c.firstName || '';
    })
    .filter(Boolean);

  if (authorNames.length === 0) return '';
  if (authorNames.length === 1) return authorNames[0];
  if (authorNames.length === 2) return `${authorNames[0]} & ${authorNames[1]}`;
  return `${authorNames[0]} et al.`;
}

export function extractYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  // Try to extract year from various date formats
  const match = dateStr.match(/\d{4}/);
  return match ? parseInt(match[0], 10) : null;
}