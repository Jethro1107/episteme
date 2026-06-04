// ============================================================================
// Bootstrap - Asset Sync System
// ============================================================================
// Syncs bundled assets from .episteme/ to ~/.episteme/agent/
// Also writes settings.json so pi auto-loads the extensions.

import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat, copyFile, rm, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const DEFAULT_EPISTEME_HOME = '.episteme';
const DEFAULT_AGENT_DIR = 'agent';

// Asset directories to sync
const ASSET_DIRS = ['extensions', 'agents', 'skills', 'themes', 'prompts'];

// Files to always sync in extensions/
const ALWAYS_SYNC_EXTENSIONS = ['package.json', 'package-lock.json'];

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Bootstrap Class
// ----------------------------------------------------------------------------

export class Bootstrap {
  private sourceDir: string;
  private targetDir: string;
  private forceSync: boolean;
  private verbose: boolean;

  constructor(options: BootstrapOptions) {
    this.sourceDir = options.epistemeHome;
    this.targetDir = join(homedir(), DEFAULT_EPISTEME_HOME, DEFAULT_AGENT_DIR);
    this.forceSync = options.forceSync ?? false;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Run full bootstrap sync
   */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      skipped: 0,
      errors: [],
    };

    // Ensure target directory exists
    await this.ensureDir(this.targetDir);

    // Sync each asset directory
    for (const assetType of ASSET_DIRS) {
      try {
        const synced = await this.syncDirectory(assetType, result);
        result.synced += synced;
      } catch (error) {
        result.errors.push(`Failed to sync ${assetType}: ${(error as Error).message}`);
      }
    }

    // Always sync package files in extensions/
    await this.syncExtensionFiles(result);

    // Write settings.json with extensions path
    await this.writeSettings(result);

    // Clean orphaned files
    await this.cleanOrphaned(result);

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Sync a single asset directory
   */
  private async syncDirectory(type: string, result: SyncResult): Promise<number> {
    const sourcePath = join(this.sourceDir, type);
    const targetPath = join(this.targetDir, type);

    if (!existsSync(sourcePath)) {
      if (this.verbose) {
        console.log(`  ${type}/: not found in bundle, skipping`);
      }
      return 0;
    }

    await this.ensureDir(targetPath);

    const files = await this.getFilesRecursively(sourcePath);
    
    if (files.length === 0) {
      if (this.verbose) {
        console.log(`  ${type}/: no files to sync`);
      }
      return 0;
    }

    let synced = 0;

    for (const file of files) {
      const relativePath = file.slice(sourcePath.length + 1);
      const targetFile = join(targetPath, relativePath);

      if (await this.needsSync(file, targetFile)) {
        await this.ensureDir(dirname(targetFile));
        await copyFile(file, targetFile);
        synced++;

        if (this.verbose) {
          console.log(`  ${type}/${relativePath}`);
        }
      } else {
        result.skipped++;
      }
    }

    return synced;
  }

  /**
   * Always sync package files in extensions/ (for pi to auto-load deps)
   */
  private async syncExtensionFiles(result: SyncResult): Promise<void> {
    const sourcePath = join(this.sourceDir, 'extensions');
    const targetPath = join(this.targetDir, 'extensions');

    if (!existsSync(sourcePath)) return;
    await this.ensureDir(targetPath);

    for (const pkgFile of ALWAYS_SYNC_EXTENSIONS) {
      const sourceFile = join(sourcePath, pkgFile);
      const targetFile = join(targetPath, pkgFile);

      if (existsSync(sourceFile)) {
        const needsSync = await this.needsSync(sourceFile, targetFile);
        if (needsSync || this.forceSync) {
          await copyFile(sourceFile, targetFile);
          result.synced++;
          if (this.verbose) {
            console.log(`  extensions/${pkgFile}`);
          }
        } else {
          result.skipped++;
        }
      }
    }
  }

  /**
   * Write settings.json with extensions path for pi auto-discovery
   */
  private async writeSettings(result: SyncResult): Promise<void> {
    const settingsPath = join(this.targetDir, 'settings.json');
    
    const settings = {
      lastChangelogVersion: "0.78.0",
      quietStartup: false,
      packages: ["./extensions"]
    };

    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      result.synced++;
      if (this.verbose) {
        console.log(`  settings.json`);
      }
    } catch (error) {
      result.errors.push(`Failed to write settings.json: ${(error as Error).message}`);
    }
  }

  /**
   * Check if file needs syncing
   */
  private async needsSync(sourcePath: string, targetPath: string): Promise<boolean> {
    if (!existsSync(targetPath)) return true;
    if (this.forceSync) return true;

    try {
      const sourceStat = await stat(sourcePath);
      const targetStat = await stat(targetPath);
      return sourceStat.mtimeMs > targetStat.mtimeMs;
    } catch {
      return true;
    }
  }

  /**
   * Clean orphaned files
   */
  private async cleanOrphaned(result: SyncResult): Promise<void> {
    if (!this.forceSync) return;

    for (const assetType of ASSET_DIRS) {
      const targetPath = join(this.targetDir, assetType);
      const sourcePath = join(this.sourceDir, assetType);

      if (!existsSync(targetPath) || !existsSync(sourcePath)) continue;

      try {
        const targetFiles = await this.getFilesRecursively(targetPath);
        const sourceFiles = await this.getFilesRecursively(sourcePath);
        const sourceRelative = new Set(
          sourceFiles.map(f => f.slice(sourcePath.length + 1))
        );

        for (const targetFile of targetFiles) {
          const relativePath = targetFile.slice(targetPath.length + 1);
          if (!sourceRelative.has(relativePath) && this.isAssetFile(relativePath)) {
            await rm(targetFile, { force: true });
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  private isAssetFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['ts', 'js', 'md', 'json'].includes(ext || '');
  }

  /**
   * Get all files recursively
   */
  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            const subFiles = await this.getFilesRecursively(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Doesn't exist or can't read
    }

    return files;
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch {
      // Already exists
    }
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getSourceDir(): string {
    return this.sourceDir;
  }
}

// ----------------------------------------------------------------------------
// Factory Functions
// ----------------------------------------------------------------------------

export function createBootstrap(options?: Partial<BootstrapOptions>): Bootstrap {
  const epistemeHome = options?.epistemeHome ?? findSourceDir();
  
  return new Bootstrap({
    epistemeHome,
    forceSync: options?.forceSync ?? false,
    verbose: options?.verbose ?? false,
  });
}

function findSourceDir(): string {
  const cwd = process.cwd();
  const possibilities = [
    join(cwd, '.episteme'),
    join(cwd, 'node_modules', 'episteme', '.episteme'),
  ];

  for (const dir of possibilities) {
    if (existsSync(dir)) {
      return dir;
    }
  }

  return join(cwd, '.episteme');
}

export async function quickSync(): Promise<boolean> {
  const bootstrap = createBootstrap({ verbose: false });
  const result = await bootstrap.sync();
  return result.success;
}

// ----------------------------------------------------------------------------
// CLI Integration
// ----------------------------------------------------------------------------

export async function runBootstrap(options?: {
  force?: boolean;
  verbose?: boolean;
}): Promise<SyncResult> {
  const bootstrap = createBootstrap({
    forceSync: options?.force ?? false,
    verbose: options?.verbose ?? false,
  });

  if (options?.verbose) {
    console.log('🔄 Syncing Episteme assets...');
    console.log(`   From: ${bootstrap.getSourceDir()}`);
    console.log(`   To:   ${bootstrap.getTargetDir()}`);
    console.log('');
  }

  const result = await bootstrap.sync();

  if (options?.verbose) {
    if (result.success) {
      console.log('');
      console.log(`✅ Synced ${result.synced} files`);
      if (result.skipped > 0) {
        console.log(`   (${result.skipped} skipped as up-to-date)`);
      }
    } else {
      console.log('');
      console.log(`⚠️  Sync completed with ${result.errors.length} errors`);
      for (const error of result.errors) {
        console.log(`   - ${error}`);
      }
    }
  }

  return result;
}
