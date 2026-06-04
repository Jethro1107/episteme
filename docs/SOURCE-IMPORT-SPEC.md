# Source Import - Implementation Specification

This document specifies the implementation details for the source import feature.

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/lib/source-manager/importer.ts` | ImportPipeline orchestration |
| `src/lib/source-manager/frontmatter.ts` | Frontmatter builder utility |
| `src/lib/source-manager/slug.ts` | Slug generation from title |
| `src/lib/source-manager/zotero-downloader.ts` | Zotero attachment download |
| `docs/SOURCE-IMPORT-SPEC.md` | This document |

### Files to Modify

| File | Changes |
|------|---------|
| `extensions/source-manager.ts` | Wire up importer, update source list |
| `src/lib/source-manager/index.ts` | Export new modules |
| `src/lib/source-manager/types.ts` | Add ZoteroAttachment type |

---

## Type Additions

### `src/lib/source-manager/types.ts`

```typescript
// Add to existing types

export interface ZoteroAttachment {
  key: string;
  title: string;
  itemType: string;
  filename?: string;
  mimeType?: string;
  linkMode: string;
}

export interface ImportOptions {
  workspacePath: string;
  duplicateMode: 'skip' | 'replace' | 'force';
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportedSource {
  sourceInfo: SourceInfo;
  filePath: string;
  hadPdf: boolean;
  conversionStatus: 'success' | 'metadata-only' | 'failed';
}
```

---

## Module Specifications

### 1. Slug Generator (`src/lib/source-manager/slug.ts`)

```typescript
/**
 * Generate a URL-safe slug from a title
 * 
 * "Attention Is All You Need" → "attention-is-all-you-need"
 * "What's in a name?" → "whats-in-a-name"
 * 
 * @param title - The source title
 * @param maxLength - Maximum slug length (default: 50)
 * @returns URL-safe slug
 */
export function slugify(title: string, maxLength = 50): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // Remove special chars
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/-+/g, '-')             // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '')         // Trim leading/trailing hyphens
    .substring(0, maxLength);
}

/**
 * Ensure slug is unique by appending counter if needed
 * 
 * @param baseSlug - The base slug
 * @param existingSlugs - Set of existing slugs to check
 * @returns Unique slug
 */
export function ensureUniqueSlug(baseSlug: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(baseSlug)) return baseSlug;
  
  let counter = 2;
  while (existingSlugs.has(`${baseSlug}-${counter}`)) {
    counter++;
  }
  return `${baseSlug}-${counter}`;
}
```

### 2. Frontmatter Builder (`src/lib/source-manager/frontmatter.ts`)

```typescript
import type { ZoteroItem, SourceInfo } from './types.js';

export interface FrontmatterOptions {
  title: string;
  authors?: string[];
  date?: string | number;
  tags?: string[];
  zoteroKey?: string;
  sourceType: 'zotero' | 'obsidian';
  importedAt: number;
  originalPath?: string;
  note?: string;  // e.g., "No PDF available", "Conversion failed"
}

/**
 * Build YAML frontmatter string
 */
export function buildFrontmatter(options: FrontmatterOptions): string {
  const lines: string[] = ['---'];
  
  // Title
  lines.push(`title: "${escapeYaml(options.title)}"`);
  
  // Authors
  if (options.authors && options.authors.length > 0) {
    lines.push(`authors: [${options.authors.map(a => `"${escapeYaml(a)}"`).join(', ')}]`);
  }
  
  // Date
  if (options.date) {
    const year = typeof options.date === 'number' 
      ? options.date 
      : options.date.toString().substring(0, 4);
    lines.push(`date: ${year}`);
  }
  
  // Tags
  if (options.tags && options.tags.length > 0) {
    lines.push(`tags: [${options.tags.map(t => `"${escapeYaml(t)}"`).join(', ')}]`);
  }
  
  // Zotero key (only for Zotero sources)
  if (options.zoteroKey) {
    lines.push(`zoteroKey: ${options.zoteroKey}`);
  }
  
  // Source type
  lines.push(`sourceType: ${options.sourceType}`);
  
  // Imported timestamp
  lines.push(`importedAt: ${new Date(options.importedAt).toISOString()}`);
  
  // Original path (for Obsidian)
  if (options.originalPath) {
    lines.push(`originalPath: "${escapeYaml(options.originalPath)}"`);
  }
  
  // Note (if any)
  if (options.note) {
    lines.push(`note: "${escapeYaml(options.note)}"`);
  }
  
  lines.push('---', '');
  
  return lines.join('\n');
}

/**
 * Escape special YAML characters
 */
function escapeYaml(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}
```

### 3. Zotero Downloader (`src/lib/source-manager/zotero-downloader.ts`)

```typescript
import { spawn } from 'child_process';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ZoteroItem, ZoteroAttachment } from './types.js';

// Use the Zotero API client to fetch attachments
// This extends the existing zotero-client.ts

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
export async function getAttachments(
  itemKey: string,
  config: ZoteroConfig
): Promise<ZoteroAttachment[]> {
  // Use zotero-api-client to fetch children
  const api = ZoteroApiClient(config.apiKey).library(config.libraryType, parseInt(config.libraryId, 10));
  
  const response = await api.items(itemKey).children().get();
  const items = response.getData() as any[];
  
  return items
    .filter(item => item.itemType === 'attachment')
    .map(item => ({
      key: item.key,
      title: item.title || 'Untitled Attachment',
      itemType: item.itemType,
      filename: item.filename,
      mimeType: item.mimeType,
      linkMode: item.linkMode,
    }));
}

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
  // Fetch attachment metadata first
  const api = ZoteroApiClient(config.apiKey).library(config.libraryType, parseInt(config.libraryId, 10));
  
  try {
    const response = await api.items(attachmentKey).get();
    const attachment = response.getData() as any;
    
    if (!attachment.filename) {
      return { success: false, error: 'No filename for attachment' };
    }
    
    // Download via Zotero API (GET items/{key}/file)
    const downloadUrl = `${response.getLinks()?.self?.href}/file`;
    
    // Use fetch to download
    const response = await fetch(downloadUrl, {
      headers: {
        'Zotero-API-Key': config.apiKey,
        'Zotero-API-Version': '3',
      },
    });
    
    if (!response.ok) {
      return { success: false, error: `Download failed: ${response.status}` };
    }
    
    // Save to temp file
    const buffer = await response.arrayBuffer();
    const tempPath = join(tempDir, `${attachmentKey}.pdf`);
    
    await mkdir(dirname(tempPath), { recursive: true });
    await writeFile(tempPath, Buffer.from(buffer));
    
    return { success: true, filePath: tempPath };
    
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Convert PDF to Markdown using markitdown
 * 
 * @param pdfPath - Path to PDF file
 * @param outputPath - Path for output .md file
 * @returns Result of conversion
 */
export async function convertPdfToMarkdown(
  pdfPath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const markitdown = spawn('npx', ['markitdown', pdfPath, '-o', outputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stderr = '';
    markitdown.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    markitdown.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr || `markitdown exited with code ${code}` });
      }
    });
    
    markitdown.on('error', (error) => {
      resolve({ success: false, error: (error as Error).message });
    });
    
    // Timeout after 2 minutes
    setTimeout(() => {
      markitdown.kill();
      resolve({ success: false, error: 'Conversion timed out' });
    }, 120000);
  });
}
```

### 4. ImportPipeline (`src/lib/source-manager/importer.ts`)

```typescript
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { SourceListItem, ImportOptions, ImportProgress, ImportResult, SourceInfo } from './types.js';
import { slugify, ensureUniqueSlug } from './slug.js';
import { buildFrontmatter } from './frontmatter.js';
import { createZoteroClient, type ZoteroConfig } from './zotero-client.js';
import { createObsidianClient } from './obsidian-client.js';
import { getAttachments, downloadAttachment, convertPdfToMarkdown } from './zotero-downloader.js';
import { randomUUID } from 'crypto';

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
export class ImportPipeline {
  private workspacePath: string;
  private progressCallback?: (p: ImportProgress) => void;
  private zoteroConfig?: ZoteroConfig;
  private existingSlugs: Set<string> = new Set();

  constructor(options: ImportOptions) {
    this.workspacePath = options.workspacePath;
    this.progressCallback = options.onProgress;
  }

  setZoteroConfig(config: ZoteroConfig): void {
    this.zoteroConfig = config;
  }

  /**
   * Import Zotero items
   */
  async importZoteroItems(
    items: SourceListItem[],
    alreadyImportedKeys: string[]
  ): Promise<ImportResult> {
    if (!this.zoteroConfig) {
      throw new Error('Zotero config not set');
    }

    const results: ImportedSource[] = [];
    const failed: Array<{ title: string; error: string }> = [];
    
    // Load existing slugs from workspace
    await this.loadExistingSlugs();
    
    // Filter out already-imported items
    const toImport = items.filter(item => !alreadyImportedKeys.includes(item.zoteroKey || item.id));
    
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
          failed.push({ title: item.title, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        failed.push({ title: item.title, error: (error as Error).message });
      }
    }

    return {
      success: failed.length === 0,
      imported: results.filter(r => r.sourceInfo).map(r => r.sourceInfo!),
      failed,
    };
  }

  /**
   * Import Obsidian notes
   */
  async importObsidianNotes(
    notes: SourceListItem[],
    alreadyImportedPaths: string[]
  ): Promise<ImportResult> {
    const client = createObsidianClient(this.workspacePath); // Note: need vault path, not workspace
    // Actually, for Obsidian, we need to pass vault path differently
    
    // ... (similar structure)
  }

  /**
   * Import a single Zotero item
   */
  private async importSingleZoteroItem(item: SourceListItem): Promise<ImportedSource> {
    const zoteroKey = item.zoteroKey || item.id;
    
    // 1. Generate slug
    const baseSlug = slugify(item.title);
    const slug = ensureUniqueSlug(baseSlug, this.existingSlugs);
    this.existingSlugs.add(slug);
    
    // 2. Try to get PDF
    let content = '';
    let hadPdf = false;
    let conversionStatus: 'success' | 'metadata-only' | 'failed' = 'metadata-only';
    let note: string | undefined;
    
    try {
      // Fetch attachments
      const attachments = await getAttachments(zoteroKey, this.zoteroConfig!);
      
      // Find PDF attachment
      const pdfAttachment = attachments.find(a => a.mimeType === 'application/pdf');
      
      if (pdfAttachment) {
        // Download PDF
        const downloadResult = await downloadAttachment(
          pdfAttachment.key,
          this.zoteroConfig!,
          join(this.workspacePath, '.tmp')
        );
        
        if (downloadResult.success && downloadResult.filePath) {
          // Convert to markdown
          const mdPath = join(this.workspacePath, '.tmp', `${zoteroKey}.md`);
          const convertResult = await convertPdfToMarkdown(downloadResult.filePath, mdPath);
          
          if (convertResult.success) {
            content = await readFile(mdPath, 'utf-8');
            hadPdf = true;
            conversionStatus = 'success';
            
            // Clean up temp files
            await unlink(downloadResult.filePath).catch(() => {});
            await unlink(mdPath).catch(() => {});
          } else {
            note = `PDF conversion failed: ${convertResult.error}`;
            conversionStatus = 'failed';
          }
        } else {
          note = `PDF download failed: ${downloadResult.error}`;
          conversionStatus = 'failed';
        }
      } else {
        note = 'No PDF attachment found';
      }
    } catch (error) {
      note = `Error: ${(error as Error).message}`;
      conversionStatus = 'failed';
    }

    // 3. Build frontmatter
    const frontmatter = buildFrontmatter({
      title: item.title,
      authors: item.authors ? item.authors.split(', ') : undefined,
      date: item.year,
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
    const sourceInfo: SourceInfo = {
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

  /**
   * Load existing slugs from workspace
   */
  private async loadExistingSlugs(): Promise<void> {
    const sourcesDir = join(this.workspacePath, 'sources');
    
    try {
      const files = await readdir(sourcesDir);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const slug = file.replace(/\.md$/, '');
          this.existingSlugs.add(slug);
        }
      }
    } catch {
      // Directory doesn't exist yet, that's fine
    }
  }
}

/**
 * Factory function
 */
export function createImportPipeline(options: ImportOptions): ImportPipeline {
  return new ImportPipeline(options);
}
```

---

## Extension Changes

### `extensions/source-manager.ts` - Update Import Flow

Key changes:
1. After user confirms selection, call ImportPipeline
2. Show progress during import
3. Update SessionManager metadata for each import
4. Show summary notification

```typescript
// In the add-zotero handler, replace the TODO with:

// 1. Get workspace path (from ctx or env)
const workspace = process.env.EPISTEME_WORKSPACE;
if (!workspace) {
  ctx.ui.notify('Workspace not found', 'error');
  return;
}

// 2. Get already-imported keys
const sessionManager = getSessionManager();
const activeSession = sessionManager.getActiveSession();
const existingSources = activeSession 
  ? sessionManager.getSessionMetadata(activeSession.id)?.sources || []
  : [];
const alreadyImportedKeys = existingSources
  .filter(s => s.type === 'zotero')
  .map(s => s.zoteroKey)
  .filter(Boolean) as string[];

// 3. Create importer
const importer = createImportPipeline({
  workspacePath: join(workspace, 'sources'),
  onProgress: (progress) => {
    ctx.ui.setStatus('source-manager', progress.status);
  },
});

// 4. Set Zotero config
const zoteroConfig = await getZoteroConfig();
importer.setZoteroConfig(zoteroConfig);

// 5. Import items
const result = await importer.importZoteroItems(selected, alreadyImportedKeys);

// 6. Update session metadata
for (const source of result.imported) {
  sessionManager.addSource(activeSession.id, source);
}

// 7. Show summary
if (result.failed.length > 0) {
  ctx.ui.notify(
    `Imported ${result.imported.length} sources. ${result.failed.length} failed.`,
    'warning'
  );
} else {
  ctx.ui.notify(`Imported ${result.imported.length} sources`, 'success');
}
```

---

## Testing Strategy

### Unit Tests

- `slug.ts`: Test slugify and ensureUniqueSlug
- `frontmatter.ts`: Test buildFrontmatter with various inputs
- `importer.ts`: Mock ZoteroClient, test import logic

### Integration Tests

- Test with mock Zotero API (use recorded responses)
- Test with actual Obsidian vault (use temp vault)

### E2E Tests

1. Start Episteme
2. Run `/source add-zotero`
3. Select items
4. Verify files in `workspace/sources/`
5. Verify metadata in `metadata.json`

---

## Error Codes

| Code | Meaning |
|------|---------|
| `E_NO_WORKSPACE` | EPISTEME_WORKSPACE not set |
| `E_NO_CONFIG` | Zotero/Obsidian config not set |
| `E_API_FAILED` | Zotero API call failed |
| `E_NO_ATTACHMENT` | No PDF attachment found |
| `E_DOWNLOAD_FAILED` | Failed to download PDF |
| `E_CONVERSION_FAILED` | markitdown failed |
| `E_WRITE_FAILED` | Failed to write file to workspace |

---

## Performance Considerations

1. **Cache Zotero API calls**: Use existing cache for item metadata
2. **Parallel downloads**: Download multiple PDFs concurrently (max 3)
3. **Skip already-imported**: Don't re-process items already in session
4. **Clean temp files**: Delete temp PDFs after conversion

---

## Dependencies to Add

None required - using existing:
- `zotero-api-client` (already in package.json)
- `markitdown` (via npx)
- Node.js built-ins (fs, path, child_process)