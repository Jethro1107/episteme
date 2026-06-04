// ============================================================================
// Zotero API Client
// ============================================================================

import ZoteroApiClient, { type MultiReadResponse, type ApiResponse } from 'zotero-api-client';
import type { 
  ZoteroConfig, 
  ZoteroItem, 
  ZoteroCacheMeta, 
  ImportProgress 
} from './types.js';
import { CacheManager, createCacheManager } from './cache.js';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 2000;

// ----------------------------------------------------------------------------
// Progress Callback Type
// ----------------------------------------------------------------------------

export type ProgressCallback = (progress: ImportProgress) => void;

// ----------------------------------------------------------------------------
// ZoteroClient Class
// ----------------------------------------------------------------------------

export class ZoteroClient {
  private config: ZoteroConfig;
  private api: ReturnType<typeof ZoteroApiClient>;
  private cache: CacheManager;

  constructor(config: ZoteroConfig, cacheManager: CacheManager) {
    this.config = config;
    this.cache = cacheManager;
    
    // Initialize the API client
    // libraryId should be a number for user/group type
    const libraryId = parseInt(this.config.libraryId, 10);
    this.api = ZoteroApiClient(config.apiKey).library(config.libraryType, libraryId);
  }

  /**
   * Get items with caching
   * Uses disk cache if fresh, otherwise fetches from API
   */
  async getItems(
    onProgress?: ProgressCallback
  ): Promise<ZoteroItem[]> {
    // Check if we have a fresh cache
    const isFresh = await this.cache.isCacheFresh(this.config.libraryId);
    
    if (isFresh) {
      onProgress?.({ current: 0, total: 0, status: 'Loading from cache...' });
      const cached = await this.cache.getItems(this.config.libraryId);
      if (cached) {
        onProgress?.({ current: cached.length, total: cached.length, status: 'Loaded from cache' });
        return cached;
      }
    }

    // Fetch from API
    return this.fetchItems(onProgress);
  }

  /**
   * Force refresh from API
   */
  async refreshItems(onProgress?: ProgressCallback): Promise<ZoteroItem[]> {
    return this.fetchItems(onProgress);
  }

  /**
   * Check if cache is stale
   */
  async isCacheStale(): Promise<boolean> {
    return !(await this.cache.isCacheFresh(this.config.libraryId));
  }

  /**
   * Get cache metadata
   */
  async getCacheMeta(): Promise<ZoteroCacheMeta | null> {
    return this.cache.getCacheMeta(this.config.libraryId);
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clearCache(this.config.libraryId);
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  /**
   * Fetch items from Zotero API with pagination and rate limit handling
   */
  private async fetchItems(onProgress?: ProgressCallback): Promise<ZoteroItem[]> {
    const limit = DEFAULT_LIMIT;
    const sort = 'dateModified';
    const direction = 'desc';
    const timeout = DEFAULT_TIMEOUT;
    const maxRetries = DEFAULT_MAX_RETRIES;

    let allItems: ZoteroItem[] = [];
    let totalResults = 0;
    let libraryVersion = 0;

    onProgress?.({ current: 0, total: 0, status: 'Connecting to Zotero API...' });

    try {
      // First, get the total count by fetching with limit=0
      const countResponse = await this.fetchWithRetry(
        () => this.api.items().top().get({ limit: 0 }) as Promise<MultiReadResponse<ZoteroItem>>,
        timeout,
        maxRetries
      );
      
      const multiResponse = countResponse as MultiReadResponse<ZoteroItem>;
      totalResults = multiResponse.getTotalResults() ?? 0;
      libraryVersion = countResponse.getVersion() ?? 0;

      if (totalResults === 0) {
        onProgress?.({ current: 0, total: 0, status: 'No items in library' });
        return [];
      }

      onProgress?.({ current: 0, total: totalResults, status: `Fetching ${totalResults} items...` });

      // Fetch items in pages
      let start = 0;

      while (start < totalResults) {
        const response = await this.fetchWithRetry(
          () => this.api.items().top().get({ 
            limit, 
            start, 
            sort, 
            direction 
          }),
          timeout,
          maxRetries
        );

        const items = response.getData() as ZoteroItem[];
        allItems = allItems.concat(items);

        // Update progress
        const current = Math.min(start + limit, totalResults);
        onProgress?.({ 
          current, 
          total: totalResults, 
          status: `Fetching items... (${current}/${totalResults})` 
        });

        start += limit;

        // Update library version from response
        const respVersion = response.getVersion();
        if (respVersion) libraryVersion = respVersion;
      }

      // Cache the results
      onProgress?.({ current: totalResults, total: totalResults, status: 'Caching items...' });
      await this.cache.setItems(this.config.libraryId, allItems);
      await this.cache.setCacheMeta(this.config.libraryId, {
        cachedAt: Date.now(),
        itemCount: allItems.length,
        lastItemKey: allItems.length > 0 ? allItems[allItems.length - 1].key : '',
        libraryVersion,
        totalResults,
      });

      onProgress?.({ 
        current: totalResults, 
        total: totalResults, 
        status: `Loaded ${allItems.length} items` 
      });

      return allItems;

    } catch (error) {
      // On error, try to return cached items
      const cached = await this.cache.getItems(this.config.libraryId);
      if (cached && cached.length > 0) {
        onProgress?.({ 
          current: cached.length, 
          total: cached.length, 
          status: 'Using cached items (API error)' 
        });
        return cached;
      }
      throw error;
    }
  }

  /**
   * Fetch with retry logic for rate limiting
   */
  private async fetchWithRetry<T>(
    fn: () => Promise<ApiResponse<T>>,
    timeout: number,
    maxRetries: number
  ): Promise<ApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const result = await fn();
        clearTimeout(timeoutId);

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error (429)
        if (this.isRateLimitError(error)) {
          if (attempt < maxRetries) {
            // Wait and retry
            const waitTime = this.getRetryAfter(error) || RATE_LIMIT_WAIT_MS;
            console.log(`Rate limited, waiting ${waitTime}ms...`);
            await this.sleep(waitTime);
            continue;
          }
        }

        // Other error or exhausted retries
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Check if error is a rate limit (429) error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const status = (error as { status?: number }).status;
      return status === 429;
    }
    return false;
  }

  /**
   * Get Retry-After value from error
   */
  private getRetryAfter(error: unknown): number | null {
    if (error && typeof error === 'object') {
      const headers = (error as { responseHeaders?: Record<string, string> }).responseHeaders;
      if (headers && headers['Retry-After']) {
        return parseInt(headers['Retry-After'], 10) * 1000;
      }
    }
    return null;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

export function createZoteroClient(
  config: ZoteroConfig,
  cacheDir: string,
  ttlHours?: number
): ZoteroClient {
  const cacheManager = createCacheManager(cacheDir, ttlHours);
  return new ZoteroClient(config, cacheManager);
}

// ----------------------------------------------------------------------------
// Helper: Validate config
// ----------------------------------------------------------------------------

export function validateZoteroConfig(config: Partial<ZoteroConfig>): config is ZoteroConfig {
  if (!config.apiKey) throw new Error('Zotero API key is required');
  if (!config.libraryId) throw new Error('Zotero library ID is required');
  if (!config.libraryType || !['user', 'group'].includes(config.libraryType)) {
    throw new Error('Zotero library type must be "user" or "group"');
  }
  return true;
}