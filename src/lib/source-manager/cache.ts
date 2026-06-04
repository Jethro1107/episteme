// ============================================================================
// Disk Cache for Zotero Items
// ============================================================================

import { readFile, writeFile, mkdir, stat, access, constants } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ZoteroItem, ZoteroCacheMeta, CacheOptions } from './types.js';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const DEFAULT_TTL_HOURS = 4;
const CACHE_FILE = 'items.json';
const META_FILE = 'meta.json';

// ----------------------------------------------------------------------------
// CacheManager Class
// ----------------------------------------------------------------------------

export class CacheManager {
  private cacheDir: string;
  private ttlMs: number;

  constructor(options: CacheOptions) {
    this.cacheDir = options.cacheDir;
    this.ttlMs = (options.ttlHours || DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  }

  /**
   * Get the cache file path for a library
   */
  private getCachePath(libraryId: string): string {
    return join(this.cacheDir, `zotero-${libraryId}`, CACHE_FILE);
  }

  /**
   * Get the metadata file path for a library
   */
  private getMetaPath(libraryId: string): string {
    return join(this.cacheDir, `zotero-${libraryId}`, META_FILE);
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir(libraryId: string): Promise<void> {
    const dir = join(this.cacheDir, `zotero-${libraryId}`);
    await mkdir(dir, { recursive: true });
  }

  /**
   * Check if cache exists and is fresh
   */
  async isCacheFresh(libraryId: string): Promise<boolean> {
    try {
      const metaPath = this.getMetaPath(libraryId);
      const stats = await stat(metaPath);
      const age = Date.now() - stats.mtimeMs;
      return age < this.ttlMs;
    } catch {
      return false;
    }
  }

  /**
   * Read cache metadata
   */
  async getCacheMeta(libraryId: string): Promise<ZoteroCacheMeta | null> {
    try {
      const metaPath = this.getMetaPath(libraryId);
      const content = await readFile(metaPath, 'utf-8');
      return JSON.parse(content) as ZoteroCacheMeta;
    } catch {
      return null;
    }
  }

  /**
   * Write cache metadata
   */
  async setCacheMeta(libraryId: string, meta: ZoteroCacheMeta): Promise<void> {
    await this.ensureCacheDir(libraryId);
    const metaPath = this.getMetaPath(libraryId);
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  /**
   * Read cached items
   */
  async getItems(libraryId: string): Promise<ZoteroItem[] | null> {
    try {
      const cachePath = this.getCachePath(libraryId);
      const content = await readFile(cachePath, 'utf-8');
      return JSON.parse(content) as ZoteroItem[];
    } catch {
      return null;
    }
  }

  /**
   * Write cached items
   */
  async setItems(libraryId: string, items: ZoteroItem[]): Promise<void> {
    await this.ensureCacheDir(libraryId);
    const cachePath = this.getCachePath(libraryId);
    await writeFile(cachePath, JSON.stringify(items, null, 2), 'utf-8');
  }

  /**
   * Check if cache exists
   */
  async hasCache(libraryId: string): Promise<boolean> {
    try {
      const cachePath = this.getCachePath(libraryId);
      await access(cachePath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cache age in milliseconds
   */
  async getCacheAge(libraryId: string): Promise<number | null> {
    try {
      const metaPath = this.getMetaPath(libraryId);
      const stats = await stat(metaPath);
      return Date.now() - stats.mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Delete cache for a library
   */
  async clearCache(libraryId: string): Promise<void> {
    const dir = join(this.cacheDir, `zotero-${libraryId}`);
    try {
      // Import rm from node:fs/promises is not available in older Node
      const { rm } = await import('node:fs/promises');
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore errors on cleanup
    }
  }

  /**
   * Get cache size in bytes (approximate)
   */
  async getCacheSize(libraryId: string): Promise<number> {
    try {
      const cachePath = this.getCachePath(libraryId);
      const stats = await stat(cachePath);
      return stats.size;
    } catch {
      return 0;
    }
  }
}

// ----------------------------------------------------------------------------
// Cache Factory
// ----------------------------------------------------------------------------

export function createCacheManager(cacheDir: string, ttlHours?: number): CacheManager {
  return new CacheManager({
    cacheDir,
    ttlHours: ttlHours || DEFAULT_TTL_HOURS,
  });
}