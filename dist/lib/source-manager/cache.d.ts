import type { ZoteroItem, ZoteroCacheMeta, CacheOptions } from './types.js';
export declare class CacheManager {
    private cacheDir;
    private ttlMs;
    constructor(options: CacheOptions);
    /**
     * Get the cache file path for a library
     */
    private getCachePath;
    /**
     * Get the metadata file path for a library
     */
    private getMetaPath;
    /**
     * Ensure cache directory exists
     */
    ensureCacheDir(libraryId: string): Promise<void>;
    /**
     * Check if cache exists and is fresh
     */
    isCacheFresh(libraryId: string): Promise<boolean>;
    /**
     * Read cache metadata
     */
    getCacheMeta(libraryId: string): Promise<ZoteroCacheMeta | null>;
    /**
     * Write cache metadata
     */
    setCacheMeta(libraryId: string, meta: ZoteroCacheMeta): Promise<void>;
    /**
     * Read cached items
     */
    getItems(libraryId: string): Promise<ZoteroItem[] | null>;
    /**
     * Write cached items
     */
    setItems(libraryId: string, items: ZoteroItem[]): Promise<void>;
    /**
     * Check if cache exists
     */
    hasCache(libraryId: string): Promise<boolean>;
    /**
     * Get cache age in milliseconds
     */
    getCacheAge(libraryId: string): Promise<number | null>;
    /**
     * Delete cache for a library
     */
    clearCache(libraryId: string): Promise<void>;
    /**
     * Get cache size in bytes (approximate)
     */
    getCacheSize(libraryId: string): Promise<number>;
}
export declare function createCacheManager(cacheDir: string, ttlHours?: number): CacheManager;
//# sourceMappingURL=cache.d.ts.map