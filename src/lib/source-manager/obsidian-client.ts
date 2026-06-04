// ============================================================================
// Obsidian Vault Client
// ============================================================================

import { readdir, stat, readFile, copyFile, mkdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import type { ObsidianNote, SourceInfo } from './types.js';

// ----------------------------------------------------------------------------
// ObsidianClient Class
// ----------------------------------------------------------------------------

export class ObsidianClient {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  /**
   * List all markdown notes in the vault
   */
  async listNotes(): Promise<ObsidianNote[]> {
    const notes: ObsidianNote[] = await this.scanDirectory(this.vaultPath);
    return notes.sort((a, b) => b.modified - a.modified);
  }

  /**
   * Get note content
   */
  async getNoteContent(notePath: string): Promise<string> {
    const fullPath = join(this.vaultPath, notePath);
    return readFile(fullPath, 'utf-8');
  }

  /**
   * Copy note to workspace
   */
  async copyToWorkspace(
    notePath: string, 
    workspaceDir: string
  ): Promise<SourceInfo> {
    const sourcePath = join(this.vaultPath, notePath);
    const fileName = basename(notePath);
    const destPath = join(workspaceDir, 'sources', fileName);

    // Ensure sources directory exists
    await mkdir(join(workspaceDir, 'sources'), { recursive: true });

    // Copy the file
    await copyFile(sourcePath, destPath);

    // Get file stats for metadata
    const stats = await stat(destPath);

    // Extract title from content
    const content = await readFile(destPath, 'utf-8');
    const title = this.extractTitle(content) || fileName.replace(/\.md$/, '');

    return {
      id: crypto.randomUUID(),
      type: 'obsidian',
      path: notePath,
      title,
      addedAt: Date.now(),
      importedAt: Date.now(),
      filePath: destPath,
    };
  }

  /**
   * Copy multiple notes to workspace
   */
  async copyMultipleToWorkspace(
    notePaths: string[],
    workspaceDir: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<SourceInfo[]> {
    const results: SourceInfo[] = [];
    const total = notePaths.length;

    for (let i = 0; i < notePaths.length; i++) {
      try {
        const sourceInfo = await this.copyToWorkspace(notePaths[i], workspaceDir);
        results.push(sourceInfo);
        onProgress?.(i + 1, total);
      } catch (error) {
        console.error(`Failed to copy ${notePaths[i]}:`, error);
        // Continue with other files
      }
    }

    return results;
  }

  /**
   * Check if vault path exists and is accessible
   */
  async isVaultAccessible(): Promise<boolean> {
    try {
      await stat(this.vaultPath);
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  /**
   * Recursively scan directory for markdown files
   */
  private async scanDirectory(dirPath: string, relativeTo?: string): Promise<ObsidianNote[]> {
    const notes: ObsidianNote[] = [];
    
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativePath = relativeTo 
          ? join(relativeTo, entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          // Skip hidden directories and common non-note directories
          if (!entry.name.startsWith('.') && 
              !['node_modules', '__pycache__'].includes(entry.name)) {
            const subNotes = await this.scanDirectory(fullPath, relativePath);
            notes.push(...subNotes);
          }
        } else if (entry.isFile() && extname(entry.name) === '.md') {
          const stats = await stat(fullPath);
          const title = await this.extractTitleFromPath(fullPath) || this.getTitleFromFilename(entry.name);
          
          notes.push({
            path: relativePath,
            title,
            modified: stats.mtimeMs,
            size: stats.size,
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return notes;
  }

  /**
   * Extract title from markdown content (first H1 or frontmatter title)
   */
  private extractTitle(content: string): string | null {
    // Check for frontmatter title
    const frontmatterMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    if (frontmatterMatch) {
      return frontmatterMatch[1].trim();
    }

    // Check for first H1
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    return null;
  }

  /**
   * Extract title from file path (async, reads content)
   */
  private async extractTitleFromPath(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      return this.extractTitle(content);
    } catch {
      return null;
    }
  }

  /**
   * Get title from filename
   */
  private getTitleFromFilename(filename: string): string {
    return filename
      .replace(/\.md$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/^\d+\.\s*/, ''); // Remove leading numbers like "01. "
  }
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

export function createObsidianClient(vaultPath: string): ObsidianClient {
  return new ObsidianClient(vaultPath);
}

// ----------------------------------------------------------------------------
// Helper: Validate vault path
// ----------------------------------------------------------------------------

export async function validateVaultPath(vaultPath: string): Promise<boolean> {
  try {
    const stats = await stat(vaultPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}