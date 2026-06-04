// ============================================================================
// Zotero Downloader
// ============================================================================
// Handles attachment fetching and PDF download/conversion

import { spawn } from 'child_process';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ZoteroConfig, ZoteroItem, ZoteroAttachment } from './types.js';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// ----------------------------------------------------------------------------
// Zotero API Import
// ----------------------------------------------------------------------------

// Dynamic import to avoid issues with module resolution in extension context
let ZoteroApiClient: any = null;

async function getZoteroApiClient() {
  if (!ZoteroApiClient) {
    const module = await import('zotero-api-client');
    ZoteroApiClient = module.default || module;
  }
  return ZoteroApiClient;
}

// ----------------------------------------------------------------------------
// Attachment Fetching
// ----------------------------------------------------------------------------

/**
 * Get attachments for a Zotero item
 * 
 * @param itemKey - The Zotero item key
 * @param config - Zotero API config
 * @returns List of attachments
 */
export async function getAttachments(
  itemKey: string,
  config: ZoteroConfig
): Promise<ZoteroAttachment[]> {
  const ApiClient = await getZoteroApiClient();
  const api = ApiClient(config.apiKey).library(
    config.libraryType === 'group' ? 'group' : 'user',
    parseInt(config.libraryId, 10)
  );
  
  try {
    // Fetch children of the item (attachments are children)
    const response = await api.items(itemKey).children().get();
    const items = response.getData() as any[];
    
    return items
      .filter((item: any) => item.itemType === 'attachment')
      .map((item: any) => ({
        key: item.key,
        title: item.title || 'Untitled Attachment',
        itemType: item.itemType,
        filename: item.filename,
        mimeType: item.mimeType,
        linkMode: item.linkMode,
      }));
  } catch (error) {
    console.error(`Failed to fetch attachments for ${itemKey}:`, error);
    return [];
  }
}

/**
 * Find PDF attachment for a Zotero item
 */
export async function findPdfAttachment(
  itemKey: string,
  config: ZoteroConfig
): Promise<ZoteroAttachment | null> {
  const attachments = await getAttachments(itemKey, config);
  return attachments.find(a => a.mimeType === 'application/pdf') || null;
}

// ----------------------------------------------------------------------------
// Attachment Download
// ----------------------------------------------------------------------------

/**
 * Download attachment to temp file
 * 
 * @param attachmentKey - Attachment key
 * @param config - Zotero API config
 * @param tempDir - Temp directory for downloads
 * @returns Path to downloaded file
 */
export async function downloadAttachment(
  attachmentKey: string,
  config: ZoteroConfig,
  tempDir: string
): Promise<DownloadResult> {
  const ApiClient = await getZoteroApiClient();
  const api = ApiClient(config.apiKey).library(
    config.libraryType === 'group' ? 'group' : 'user',
    parseInt(config.libraryId, 10)
  );
  
  try {
    // Fetch attachment metadata to get the download URL
    const response = await api.items(attachmentKey).get();
    const attachment = response.getData() as any;
    const links = response.getLinks() as any;
    
    if (!attachment.filename) {
      return { success: false, error: 'No filename for attachment' };
    }
    
    // Get the file download URL
    const downloadUrl = links?.alternate?.href 
      ? `${links.alternate.href}/file`
      : undefined;
    
    if (!downloadUrl) {
      return { success: false, error: 'Could not determine download URL' };
    }
    
    // Download the file
    const response2 = await fetch(downloadUrl, {
      headers: {
        'Zotero-API-Key': config.apiKey,
        'Zotero-API-Version': '3',
      },
    });
    
    if (!response2.ok) {
      return { success: false, error: `Download failed: ${response2.status}` };
    }
    
    // Save to temp file
    const buffer = await response2.arrayBuffer();
    const ext = attachment.filename.split('.').pop() || 'pdf';
    const tempPath = join(tempDir, `${attachmentKey}.${ext}`);
    
    await mkdir(dirname(tempPath), { recursive: true });
    await writeFile(tempPath, Buffer.from(buffer));
    
    return { success: true, filePath: tempPath };
    
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// ----------------------------------------------------------------------------
// PDF Conversion
// ----------------------------------------------------------------------------

/**
 * Convert PDF to Markdown using markitdown
 * 
 * @param pdfPath - Path to PDF file
 * @param outputPath - Path for output .md file
 * @param timeoutMs - Conversion timeout in ms (default: 120000)
 * @returns Result of conversion
 */
export async function convertPdfToMarkdown(
  pdfPath: string,
  outputPath: string,
  timeoutMs = 120000
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const markitdown = spawn(
      'npx',
      ['markitdown', pdfPath, '-o', outputPath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
      }
    );
    
    let stderr = '';
    
    markitdown.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    markitdown.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ 
          success: false, 
          error: stderr || `markitdown exited with code ${code}` 
        });
      }
    });
    
    markitdown.on('error', (error: Error) => {
      resolve({ success: false, error: (error as Error).message });
    });
    
    // Timeout handler
    const timeoutId = setTimeout(() => {
      markitdown.kill();
      resolve({ success: false, error: 'Conversion timed out' });
    }, timeoutMs);
    
    // Clean up timeout on success
    markitdown.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

// ----------------------------------------------------------------------------
// Cleanup
// ----------------------------------------------------------------------------

/**
 * Clean up temporary files
 */
export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
  for (const path of filePaths) {
    try {
      await unlink(path);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ----------------------------------------------------------------------------
// Full Import Flow
// ----------------------------------------------------------------------------

/**
 * Download and convert a Zotero item's PDF
 * 
 * @param itemKey - Zotero item key
 * @param config - Zotero API config
 * @param tempDir - Temp directory
 * @returns Converted markdown content, or null if failed
 */
export async function downloadAndConvertPdf(
  itemKey: string,
  config: ZoteroConfig,
  tempDir: string
): Promise<{ content: string; pdfPath: string } | { content: null; pdfPath: null; error: string }> {
  // Find PDF attachment
  const pdfAttachment = await findPdfAttachment(itemKey, config);
  
  if (!pdfAttachment) {
    return { content: null, pdfPath: null, error: 'No PDF attachment found' };
  }
  
  // Download PDF
  const downloadResult = await downloadAttachment(pdfAttachment.key, config, tempDir);
  
  if (!downloadResult.success || !downloadResult.filePath) {
    return { 
      content: null, 
      pdfPath: null, 
      error: downloadResult.error || 'Download failed' 
    };
  }
  
  const pdfPath = downloadResult.filePath;
  
  // Convert to markdown
  const mdPath = join(tempDir, `${itemKey}.md`);
  const convertResult = await convertPdfToMarkdown(pdfPath, mdPath);
  
  if (!convertResult.success) {
    // Clean up PDF on failure
    await cleanupTempFiles([pdfPath]);
    return { content: null, pdfPath: null, error: convertResult.error || 'Conversion failed' };
  }
  
  // Read converted content
  try {
    const content = await readFile(mdPath, 'utf-8');
    
    // Clean up temp files
    await cleanupTempFiles([pdfPath, mdPath]);
    
    return { content, pdfPath };
  } catch (error) {
    return { content: null, pdfPath: null, error: (error as Error).message };
  }
}