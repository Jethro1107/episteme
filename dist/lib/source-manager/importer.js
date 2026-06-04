// ============================================================================
// Import Pipeline
// ============================================================================
// Orchestrates source import from Zotero and Obsidian
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { slugify, ensureUniqueSlug } from './slug.js';
import { buildFrontmatter } from './frontmatter.js';
import { findPdfAttachment, downloadAttachment, convertPdfToMarkdown, cleanupTempFiles, } from './zotero-downloader.js';
import { createObsidianClient } from './obsidian-client.js';
import { randomUUID } from 'crypto';
// ----------------------------------------------------------------------------
// Import Pipeline
// ----------------------------------------------------------------------------
/**
 * ImportPipeline - Orchestrates source import
 */
export class ImportPipeline {
    workspacePath;
    zoteroConfig;
    obsidianVaultPath;
    progressCallback;
    existingSlugs = new Set();
    tempDir;
    constructor(options) {
        this.workspacePath = options.workspacePath;
        this.zoteroConfig = options.zoteroConfig;
        this.obsidianVaultPath = options.obsidianVaultPath;
        this.progressCallback = options.onProgress;
        this.tempDir = join(this.workspacePath, '.tmp');
    }
    /**
     * Set Zotero config (can be called separately)
     */
    setZoteroConfig(config) {
        this.zoteroConfig = config;
    }
    /**
     * Set Obsidian vault path
     */
    setObsidianVaultPath(path) {
        this.obsidianVaultPath = path;
    }
    // --------------------------------------------------------------------------
    // Zotero Import
    // --------------------------------------------------------------------------
    /**
     * Import Zotero items
     */
    async importZoteroItems(items, alreadyImportedKeys) {
        if (!this.zoteroConfig) {
            throw new Error('Zotero config not set. Call setZoteroConfig() first.');
        }
        const results = [];
        const failed = [];
        // Load existing slugs from workspace
        await this.loadExistingSlugs();
        // Ensure temp directory exists
        await mkdir(this.tempDir, { recursive: true });
        // Filter out already-imported items
        const toImport = items.filter(item => !alreadyImportedKeys.includes(item.zoteroKey || item.id));
        if (toImport.length === 0) {
            return { success: true, imported: [], failed: [] };
        }
        for (let i = 0; i < toImport.length; i++) {
            const item = toImport[i];
            this.progressCallback?.({
                current: i,
                total: toImport.length,
                status: `Importing "${item.title}"...`,
                itemName: item.title,
            });
            try {
                const result = await this.importSingleZoteroItem(item);
                results.push(result);
                if (!result.sourceInfo) {
                    failed.push({
                        title: item.title,
                        error: result.error || 'Unknown error'
                    });
                }
            }
            catch (error) {
                failed.push({
                    title: item.title,
                    error: error.message
                });
            }
        }
        // Clean up temp directory
        await this.cleanupTempDir();
        return {
            success: failed.length === 0,
            imported: results
                .filter(r => r.sourceInfo)
                .map(r => r.sourceInfo),
            failed,
        };
    }
    /**
     * Import a single Zotero item
     */
    async importSingleZoteroItem(item) {
        const zoteroKey = item.zoteroKey || item.id;
        // 1. Generate slug
        const baseSlug = slugify(item.title);
        const slug = ensureUniqueSlug(baseSlug, this.existingSlugs);
        this.existingSlugs.add(slug);
        // 2. Try to get PDF content
        let content = '';
        let hadPdf = false;
        let conversionStatus = 'metadata-only';
        let note;
        try {
            // Find PDF attachment
            const pdfAttachment = await findPdfAttachment(zoteroKey, this.zoteroConfig);
            if (pdfAttachment) {
                // Download PDF
                const downloadResult = await downloadAttachment(pdfAttachment.key, this.zoteroConfig, this.tempDir);
                if (downloadResult.success && downloadResult.filePath) {
                    const pdfPath = downloadResult.filePath;
                    // Convert to markdown
                    const mdPath = join(this.tempDir, `${zoteroKey}.md`);
                    const convertResult = await convertPdfToMarkdown(pdfPath, mdPath);
                    if (convertResult.success) {
                        try {
                            const fs = await import('node:fs/promises');
                            content = await fs.readFile(mdPath, 'utf-8');
                            hadPdf = true;
                            conversionStatus = 'success';
                        }
                        catch {
                            content = '';
                            conversionStatus = 'metadata-only';
                            note = 'PDF converted but could not read content';
                        }
                        // Clean up temp files
                        await cleanupTempFiles([pdfPath, mdPath]);
                    }
                    else {
                        note = `PDF conversion failed: ${convertResult.error}`;
                        conversionStatus = 'failed';
                        // Clean up PDF on failure
                        const fs = await import('node:fs/promises');
                        await fs.unlink(pdfPath).catch(() => { });
                    }
                }
                else {
                    note = `PDF download failed: ${downloadResult.error}`;
                    conversionStatus = 'failed';
                }
            }
            else {
                note = 'No PDF attachment found';
            }
        }
        catch (error) {
            note = `Error: ${error.message}`;
            conversionStatus = 'failed';
        }
        // 3. Build frontmatter
        const frontmatter = buildFrontmatter({
            title: item.title,
            authors: item.authors ? item.authors.split(', ') : undefined,
            date: item.year ?? undefined,
            tags: [],
            zoteroKey,
            sourceType: 'zotero',
            importedAt: Date.now(),
            note,
        });
        // 4. Combine and write
        const finalContent = frontmatter + content;
        const filePath = join(this.workspacePath, 'sources', `${slug}.md`);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, finalContent, 'utf-8');
        // 5. Build SourceInfo
        const sourceInfo = {
            id: randomUUID(),
            type: 'zotero',
            path: `zotero://select/items/${zoteroKey}`,
            title: item.title,
            authors: item.authors ? item.authors.split(', ') : undefined,
            year: item.year || undefined,
            addedAt: Date.now(),
            importedAt: Date.now(),
            zoteroKey,
            filePath,
        };
        return {
            sourceInfo,
            filePath,
            hadPdf,
            conversionStatus,
            error: note,
        };
    }
    // --------------------------------------------------------------------------
    // Obsidian Import
    // --------------------------------------------------------------------------
    /**
     * Import Obsidian notes
     */
    async importObsidianNotes(notes, alreadyImportedPaths) {
        if (!this.obsidianVaultPath) {
            throw new Error('Obsidian vault path not set. Call setObsidianVaultPath() first.');
        }
        const results = [];
        const failed = [];
        // Load existing slugs
        await this.loadExistingSlugs();
        // Filter out already-imported notes
        const toImport = notes.filter(note => !alreadyImportedPaths.includes(note.id));
        if (toImport.length === 0) {
            return { success: true, imported: [], failed: [] };
        }
        const client = createObsidianClient(this.obsidianVaultPath);
        for (let i = 0; i < toImport.length; i++) {
            const note = toImport[i];
            this.progressCallback?.({
                current: i,
                total: toImport.length,
                status: `Importing "${note.title}"...`,
                itemName: note.title,
            });
            try {
                const result = await this.importSingleObsidianNote(note, client);
                results.push(result);
                if (!result.sourceInfo) {
                    failed.push({
                        title: note.title,
                        error: result.error || 'Unknown error'
                    });
                }
            }
            catch (error) {
                failed.push({
                    title: note.title,
                    error: error.message
                });
            }
        }
        return {
            success: failed.length === 0,
            imported: results
                .filter(r => r.sourceInfo)
                .map(r => r.sourceInfo),
            failed,
        };
    }
    /**
     * Import a single Obsidian note
     */
    async importSingleObsidianNote(note, client) {
        // Generate slug
        const baseSlug = slugify(note.title);
        const slug = ensureUniqueSlug(baseSlug, this.existingSlugs);
        this.existingSlugs.add(slug);
        const originalPath = note.id;
        const filePath = join(this.workspacePath, 'sources', `${slug}.md`);
        // Copy file
        const fs = await import('node:fs/promises');
        const vaultPath = this.obsidianVaultPath; // Assert it's set (validated in caller)
        const sourcePath = join(vaultPath, originalPath);
        try {
            // Read original content
            const content = await fs.readFile(sourcePath, 'utf-8');
            // Build frontmatter with import metadata
            const frontmatter = buildFrontmatter({
                title: note.title,
                sourceType: 'obsidian',
                importedAt: Date.now(),
                originalPath,
            });
            // Prepend frontmatter (if not already present)
            const hasFrontmatter = content.trim().startsWith('---');
            const finalContent = hasFrontmatter
                ? content // Keep existing frontmatter
                : frontmatter + content;
            // Write to workspace
            await mkdir(dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, finalContent, 'utf-8');
            // Build SourceInfo
            const sourceInfo = {
                id: randomUUID(),
                type: 'obsidian',
                path: originalPath,
                title: note.title,
                addedAt: Date.now(),
                importedAt: Date.now(),
                filePath,
            };
            return {
                sourceInfo,
                filePath,
                hadPdf: false,
                conversionStatus: 'success',
            };
        }
        catch (error) {
            return {
                sourceInfo: null,
                filePath,
                hadPdf: false,
                conversionStatus: 'failed',
                error: error.message,
            };
        }
    }
    // --------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------
    /**
     * Load existing slugs from workspace
     */
    async loadExistingSlugs() {
        const sourcesDir = join(this.workspacePath, 'sources');
        try {
            const files = await readdir(sourcesDir);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const slug = file.replace(/\.md$/, '');
                    this.existingSlugs.add(slug);
                }
            }
        }
        catch {
            // Directory doesn't exist yet, that's fine
        }
    }
    /**
     * Clean up temp directory
     */
    async cleanupTempDir() {
        try {
            await rm(this.tempDir, { recursive: true, force: true });
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------
/**
 * Create an import pipeline
 */
export function createImportPipeline(options) {
    return new ImportPipeline(options);
}
//# sourceMappingURL=importer.js.map