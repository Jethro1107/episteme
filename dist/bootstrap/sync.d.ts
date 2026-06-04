export interface BootstrapOptions {
    epistemeHome: string;
    forceSync?: boolean;
    verbose?: boolean;
}
export interface SyncResult {
    success: boolean;
    synced: number;
    skipped: number;
    errors: string[];
}
export declare class Bootstrap {
    private sourceDir;
    private targetDir;
    private forceSync;
    private verbose;
    constructor(options: BootstrapOptions);
    /**
     * Run full bootstrap sync
     */
    sync(): Promise<SyncResult>;
    /**
     * Sync a single asset directory
     */
    private syncDirectory;
    /**
     * Always sync package files in extensions/ (for pi to auto-load deps)
     */
    private syncExtensionFiles;
    /**
     * Write settings.json with extensions path for pi auto-discovery
     */
    private writeSettings;
    /**
     * Check if file needs syncing
     */
    private needsSync;
    /**
     * Clean orphaned files
     */
    private cleanOrphaned;
    private isAssetFile;
    /**
     * Get all files recursively
     */
    private getFilesRecursively;
    private ensureDir;
    getTargetDir(): string;
    getSourceDir(): string;
}
export declare function createBootstrap(options?: Partial<BootstrapOptions>): Bootstrap;
export declare function quickSync(): Promise<boolean>;
export declare function runBootstrap(options?: {
    force?: boolean;
    verbose?: boolean;
}): Promise<SyncResult>;
//# sourceMappingURL=sync.d.ts.map