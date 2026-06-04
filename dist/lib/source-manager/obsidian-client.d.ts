import type { ObsidianNote, SourceInfo } from './types.js';
export declare class ObsidianClient {
    private vaultPath;
    constructor(vaultPath: string);
    /**
     * List all markdown notes in the vault
     */
    listNotes(): Promise<ObsidianNote[]>;
    /**
     * Get note content
     */
    getNoteContent(notePath: string): Promise<string>;
    /**
     * Copy note to workspace
     */
    copyToWorkspace(notePath: string, workspaceDir: string): Promise<SourceInfo>;
    /**
     * Copy multiple notes to workspace
     */
    copyMultipleToWorkspace(notePaths: string[], workspaceDir: string, onProgress?: (current: number, total: number) => void): Promise<SourceInfo[]>;
    /**
     * Check if vault path exists and is accessible
     */
    isVaultAccessible(): Promise<boolean>;
    /**
     * Recursively scan directory for markdown files
     */
    private scanDirectory;
    /**
     * Extract title from markdown content (first H1 or frontmatter title)
     */
    private extractTitle;
    /**
     * Extract title from file path (async, reads content)
     */
    private extractTitleFromPath;
    /**
     * Get title from filename
     */
    private getTitleFromFilename;
}
export declare function createObsidianClient(vaultPath: string): ObsidianClient;
export declare function validateVaultPath(vaultPath: string): Promise<boolean>;
//# sourceMappingURL=obsidian-client.d.ts.map