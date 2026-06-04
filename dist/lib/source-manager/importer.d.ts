import type { SourceListItem, SourceInfo, ZoteroConfig, ImportProgress, ImportResult } from './types.js';
export interface ImportOptions {
    workspacePath: string;
    zoteroConfig?: ZoteroConfig;
    obsidianVaultPath?: string;
    onProgress?: (progress: ImportProgress) => void;
}
export interface ImportedSource {
    sourceInfo: SourceInfo;
    filePath: string;
    hadPdf: boolean;
    conversionStatus: 'success' | 'metadata-only' | 'failed';
    error?: string;
}
/**
 * ImportPipeline - Orchestrates source import
 */
export declare class ImportPipeline {
    private workspacePath;
    private zoteroConfig?;
    private obsidianVaultPath?;
    private progressCallback?;
    private existingSlugs;
    private tempDir;
    constructor(options: ImportOptions);
    /**
     * Set Zotero config (can be called separately)
     */
    setZoteroConfig(config: ZoteroConfig): void;
    /**
     * Set Obsidian vault path
     */
    setObsidianVaultPath(path: string): void;
    /**
     * Import Zotero items
     */
    importZoteroItems(items: SourceListItem[], alreadyImportedKeys: string[]): Promise<ImportResult>;
    /**
     * Import a single Zotero item
     */
    private importSingleZoteroItem;
    /**
     * Import Obsidian notes
     */
    importObsidianNotes(notes: SourceListItem[], alreadyImportedPaths: string[]): Promise<ImportResult>;
    /**
     * Import a single Obsidian note
     */
    private importSingleObsidianNote;
    /**
     * Load existing slugs from workspace
     */
    private loadExistingSlugs;
    /**
     * Clean up temp directory
     */
    private cleanupTempDir;
}
/**
 * Create an import pipeline
 */
export declare function createImportPipeline(options: ImportOptions): ImportPipeline;
//# sourceMappingURL=importer.d.ts.map