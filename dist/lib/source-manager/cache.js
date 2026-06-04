// ============================================================================
// Disk Cache for Zotero Items
// ============================================================================
import { readFile, writeFile, mkdir, stat, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
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
    cacheDir;
    ttlMs;
    constructor(options) {
        this.cacheDir = options.cacheDir;
        this.ttlMs = (options.ttlHours || DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
    }
    /**
     * Get the cache file path for a library
     */
    getCachePath(libraryId) {
        return join(this.cacheDir, `zotero-${libraryId}`, CACHE_FILE);
    }
    /**
     * Get the metadata file path for a library
     */
    getMetaPath(libraryId) {
        return join(this.cacheDir, `zotero-${libraryId}`, META_FILE);
    }
    /**
     * Ensure cache directory exists
     */
    async ensureCacheDir(libraryId) {
        const dir = join(this.cacheDir, `zotero-${libraryId}`);
        await mkdir(dir, { recursive: true });
    }
    /**
     * Check if cache exists and is fresh
     */
    async isCacheFresh(libraryId) {
        try {
            const metaPath = this.getMetaPath(libraryId);
            const stats = await stat(metaPath);
            const age = Date.now() - stats.mtimeMs;
            return age < this.ttlMs;
        }
        catch {
            return false;
        }
    }
    /**
     * Read cache metadata
     */
    async getCacheMeta(libraryId) {
        try {
            const metaPath = this.getMetaPath(libraryId);
            const content = await readFile(metaPath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    /**
     * Write cache metadata
     */
    async setCacheMeta(libraryId, meta) {
        await this.ensureCacheDir(libraryId);
        const metaPath = this.getMetaPath(libraryId);
        await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }
    /**
     * Read cached items
     */
    async getItems(libraryId) {
        try {
            const cachePath = this.getCachePath(libraryId);
            const content = await readFile(cachePath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    /**
     * Write cached items
     */
    async setItems(libraryId, items) {
        await this.ensureCacheDir(libraryId);
        const cachePath = this.getCachePath(libraryId);
        await writeFile(cachePath, JSON.stringify(items, null, 2), 'utf-8');
    }
    /**
     * Check if cache exists
     */
    async hasCache(libraryId) {
        try {
            const cachePath = this.getCachePath(libraryId);
            await access(cachePath, constants.R_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get cache age in milliseconds
     */
    async getCacheAge(libraryId) {
        try {
            const metaPath = this.getMetaPath(libraryId);
            const stats = await stat(metaPath);
            return Date.now() - stats.mtimeMs;
        }
        catch {
            return null;
        }
    }
    /**
     * Delete cache for a library
     */
    async clearCache(libraryId) {
        const dir = join(this.cacheDir, `zotero-${libraryId}`);
        try {
            // Import rm from node:fs/promises is not available in older Node
            const { rm } = await import('node:fs/promises');
            await rm(dir, { recursive: true, force: true });
        }
        catch {
            // Ignore errors on cleanup
        }
    }
    /**
     * Get cache size in bytes (approximate)
     */
    async getCacheSize(libraryId) {
        try {
            const cachePath = this.getCachePath(libraryId);
            const stats = await stat(cachePath);
            return stats.size;
        }
        catch {
            return 0;
        }
    }
}
// ----------------------------------------------------------------------------
// Cache Factory
// ----------------------------------------------------------------------------
export function createCacheManager(cacheDir, ttlHours) {
    return new CacheManager({
        cacheDir,
        ttlHours: ttlHours || DEFAULT_TTL_HOURS,
    });
}
//# sourceMappingURL=cache.js.map