import type { ZoteroConfig, ZoteroAttachment } from './types.js';
export interface DownloadResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
/**
 * Get attachments for a Zotero item
 *
 * @param itemKey - The Zotero item key
 * @param config - Zotero API config
 * @returns List of attachments
 */
export declare function getAttachments(itemKey: string, config: ZoteroConfig): Promise<ZoteroAttachment[]>;
/**
 * Find PDF attachment for a Zotero item
 */
export declare function findPdfAttachment(itemKey: string, config: ZoteroConfig): Promise<ZoteroAttachment | null>;
/**
 * Download attachment to temp file
 *
 * @param attachmentKey - Attachment key
 * @param config - Zotero API config
 * @param tempDir - Temp directory for downloads
 * @returns Path to downloaded file
 */
export declare function downloadAttachment(attachmentKey: string, config: ZoteroConfig, tempDir: string): Promise<DownloadResult>;
/**
 * Convert PDF to Markdown using markitdown
 *
 * @param pdfPath - Path to PDF file
 * @param outputPath - Path for output .md file
 * @param timeoutMs - Conversion timeout in ms (default: 120000)
 * @returns Result of conversion
 */
export declare function convertPdfToMarkdown(pdfPath: string, outputPath: string, timeoutMs?: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Clean up temporary files
 */
export declare function cleanupTempFiles(filePaths: string[]): Promise<void>;
/**
 * Download and convert a Zotero item's PDF
 *
 * @param itemKey - Zotero item key
 * @param config - Zotero API config
 * @param tempDir - Temp directory
 * @returns Converted markdown content, or null if failed
 */
export declare function downloadAndConvertPdf(itemKey: string, config: ZoteroConfig, tempDir: string): Promise<{
    content: string;
    pdfPath: string;
} | {
    content: null;
    pdfPath: null;
    error: string;
}>;
//# sourceMappingURL=zotero-downloader.d.ts.map