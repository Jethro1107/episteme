import type { ZoteroConfig, ZoteroItem, ZoteroCacheMeta, ImportProgress } from './types.js';
import { CacheManager } from './cache.js';
export type ProgressCallback = (progress: ImportProgress) => void;
export declare class ZoteroClient {
    private config;
    private api;
    private cache;
    constructor(config: ZoteroConfig, cacheManager: CacheManager);
    /**
     * Get items with caching
     * Uses disk cache if fresh, otherwise fetches from API
     */
    getItems(onProgress?: ProgressCallback): Promise<ZoteroItem[]>;
    /**
     * Force refresh from API
     */
    refreshItems(onProgress?: ProgressCallback): Promise<ZoteroItem[]>;
    /**
     * Check if cache is stale
     */
    isCacheStale(): Promise<boolean>;
    /**
     * Get cache metadata
     */
    getCacheMeta(): Promise<ZoteroCacheMeta | null>;
    /**
     * Clear cache
     */
    clearCache(): Promise<void>;
    /**
     * Fetch items from Zotero API with pagination and rate limit handling
     */
    private fetchItems;
    /**
     * Fetch with retry logic for rate limiting
     */
    private fetchWithRetry;
    /**
     * Check if error is a rate limit (429) error
     */
    private isRateLimitError;
    /**
     * Get Retry-After value from error
     */
    private getRetryAfter;
    /**
     * Sleep helper
     */
    private sleep;
}
export declare function createZoteroClient(config: ZoteroConfig, cacheDir: string, ttlHours?: number): ZoteroClient;
export declare function validateZoteroConfig(config: Partial<ZoteroConfig>): config is ZoteroConfig;
//# sourceMappingURL=zotero-client.d.ts.map