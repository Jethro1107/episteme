// ============================================================================
// Source Manager Extension
// ============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text, Component } from "@earendil-works/pi-tui";
import { join } from "node:path";
import type { SourceListItem, ZoteroItem, ImportProgress, SourceInfo } from '../lib/source-manager/types.js';
import { createZoteroClient, validateZoteroConfig } from '../lib/source-manager/zotero-client.js';
import { createObsidianClient, validateVaultPath } from '../lib/source-manager/obsidian-client.js';
import { createFuzzyList } from '../lib/source-manager/fuzzy-list.js';
import { createImportPipeline } from '../lib/source-manager/importer.js';
import { formatAuthors, extractYear } from '../lib/source-manager/types.js';
import { getSessionManager } from '../session/index.js';

// ----------------------------------------------------------------------------
// Extension State
// ----------------------------------------------------------------------------

interface ExtensionState {
  zoteroClient: ReturnType<typeof createZoteroClient> | null;
  obsidianClient: ReturnType<typeof createObsidianClient> | null;
  cachedItems: SourceListItem[];
  currentPicker: 'zotero' | 'obsidian' | null;
}

const state: ExtensionState = {
  zoteroClient: null,
  obsidianClient: null,
  cachedItems: [],
  currentPicker: null,
};

// ----------------------------------------------------------------------------
// Source Picker Component
// ----------------------------------------------------------------------------

class SourcePicker extends Component {
  private list: ReturnType<typeof createFuzzyList<SourceListItem>>;
  private searchQuery: string = '';
  private cursorIndex: number = 0;
  private onSelect: ((items: SourceListItem[]) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private alreadyImportedKeys: Set<string> = new Set();

  constructor(items: SourceListItem[], alreadyImported: string[] = []) {
    super();
    this.list = createFuzzyList(items, ['title', 'authors'], { threshold: 0.3 });
    this.alreadyImportedKeys = new Set(alreadyImported);
    
    // Pre-select already imported items
    const displayItems = this.list.getDisplayItems();
    for (let i = 0; i < displayItems.length; i++) {
      const item = displayItems[i];
      if (this.alreadyImportedKeys.has(item.zoteroKey || item.id)) {
        this.list.toggleSelectionAt(i);
      }
    }
  }

  setCallbacks(onSelect: (items: SourceListItem[]) => void, onCancel: () => void): void {
    this.onSelect = onSelect;
    this.onCancel = onCancel;
  }

  setSearchQuery(query: string): void {
    this.list.search(query);
    this.searchQuery = query;
    this.cursorIndex = 0;
    this.invalidate();
  }

  moveUp(): void {
    this.cursorIndex = this.list.moveUp();
    this.invalidate();
  }

  moveDown(): void {
    this.cursorIndex = this.list.moveDown();
    this.invalidate();
  }

  toggleSelection(): void {
    this.list.toggleSelectionAt(this.cursorIndex);
    this.invalidate();
  }

  selectAll(): void {
    this.list.selectAll();
    this.invalidate();
  }

  confirm(): void {
    if (this.onSelect) {
      this.onSelect(this.list.getSelectedItems());
    }
  }

  cancel(): void {
    if (this.onCancel) {
      this.onCancel();
    }
  }

  render(width: number, height: number, theme: import("@earendil-works/pi-tui").Theme): import("@earendil-works/pi-tui").Component {
    const displayItems = this.list.getDisplayItems();
    const lines: string[] = [];

    // Header
    lines.push(theme.fg('accent', '╭─ Select source ─────────────────────────────╮'));
    lines.push(theme.fg('muted', `│ ${this.searchQuery || 'type to filter...'}`));
    lines.push(theme.fg('accent', '├────────────────────────────────────────────────┤'));

    // Items
    const maxVisible = Math.min(displayItems.length, 15);
    for (let i = 0; i < maxVisible; i++) {
      const item = displayItems[i];
      const isCursor = i === this.cursorIndex;
      const isSelected = this.list.getSelectedIndices().has(i);
      const isImported = this.alreadyImportedKeys.has(item.zoteroKey || item.id);

      // Badge: imported items show ✓
      const badge = isImported ? theme.fg('success', '✓ ') : '  ';
      const checkMark = isSelected ? theme.fg('accent', '☑ ') : '  ';
      const cursorArrow = isCursor ? theme.fg('accent', '▶ ') : '  ';
      
      const title = item.title.length > 35 ? item.title.substring(0, 32) + '...' : item.title;
      const authorYear = item.authors 
        ? `${item.authors}${item.year ? ` (${item.year})` : ''}`
        : (item.year ? `(${item.year})` : '');
      
      const typeBadge = item.type === 'zotero' ? '[Z]' : '[O]';
      const line = `${checkMark}${badge}${cursorArrow}${typeBadge} ${title.padEnd(35)} ${theme.fg('muted', authorYear)}`;
      
      if (isCursor) {
        lines.push(theme.fg('accent', `│ ${line}`));
      } else if (isImported) {
        lines.push(theme.fg('muted', `│ ${line}`));
      } else {
        lines.push(`│ ${line}`);
      }
    }

    // Fill empty space
    const emptyLines = maxVisible < 15 ? 15 - maxVisible : 0;
    for (let i = 0; i < emptyLines; i++) {
      lines.push('│                                                │');
    }

    // Footer
    lines.push(theme.fg('accent', '├────────────────────────────────────────────────┤'));
    const total = this.list.getTotalCount();
    const selected = this.list.getSelectionCount();
    const imported = [...this.alreadyImportedKeys].filter(k => 
      displayItems.some(item => (item.zoteroKey || item.id) === k)
    ).length;
    lines.push(theme.fg('muted', `│ ${total} items | ${selected} selected | ${imported} imported        │`));
    lines.push(theme.fg('muted', '│ ↑↓ navigate | Space select | Enter import | Esc cancel │'));
    lines.push(theme.fg('accent', '╰────────────────────────────────────────────────╯'));

    const text = new Text(lines.join('\n'), 1, 1);
    return text;
  }

  onKey(key: string): boolean {
    switch (key) {
      case 'up':
      case 'ctrl+p':
        this.moveUp();
        return true;
      case 'down':
      case 'ctrl+n':
        this.moveDown();
        return true;
      case ' ':
        this.toggleSelection();
        return true;
      case 'return':
        this.confirm();
        return true;
      case 'escape':
        this.cancel();
        return true;
      case 'ctrl+a':
        this.selectAll();
        return true;
      default:
        // If it's a printable character, add to search
        if (key.length === 1 && key >= ' ' && key <= '~') {
          this.setSearchQuery(this.searchQuery + key);
          return true;
        }
        if (key === 'backspace') {
          this.setSearchQuery(this.searchQuery.slice(0, -1));
          return true;
        }
        return false;
    }
  }
}

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

function convertZoteroItemToSourceListItem(item: ZoteroItem): SourceListItem {
  return {
    id: item.key,
    title: item.data.title || 'Untitled',
    authors: formatAuthors(item.data.creators || []),
    year: extractYear(item.data.date) || extractYear(item.data.dateAdded) || null,
    type: 'zotero',
    selected: false,
    zoteroKey: item.key,
  };
}

function getZoteroConfig(): { apiKey: string; libraryType: 'user' | 'group'; libraryId: string } | null {
  const sessionManager = getSessionManager();
  const config = sessionManager.getConfig();
  
  if (!config.zoteroApiKey || !config.zoteroLibraryId) {
    return null;
  }

  return {
    apiKey: config.zoteroApiKey,
    libraryType: config.zoteroLibraryType || 'user',
    libraryId: config.zoteroLibraryId,
  };
}

function getAlreadyImportedKeys(sources: SourceInfo[]): string[] {
  return sources
    .filter(s => s.zoteroKey)
    .map(s => s.zoteroKey as string);
}

function getAlreadyImportedPaths(sources: SourceInfo[]): string[] {
  return sources
    .filter(s => s.type === 'obsidian' && s.path)
    .map(s => s.path);
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// ----------------------------------------------------------------------------
// Extension Setup
// ----------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Register source commands
  pi.registerCommand('source', {
    description: 'Manage sources (add, list, remove)',
    subcommands: ['add-zotero', 'add-obsidian', 'list', 'remove', 'refresh'],
  });

  pi.registerCommand('source add-zotero', {
    description: 'Add sources from Zotero library',
    async handler(_args, ctx) {
      // Get workspace path
      const workspace = process.env.EPISTEME_WORKSPACE;
      if (!workspace) {
        ctx.ui.notify('Workspace not found', 'error');
        return;
      }

      // Get config
      const config = getZoteroConfig();
      if (!config) {
        ctx.ui.notify('Zotero not configured. Set zoteroApiKey and zoteroLibraryId in config.', 'error');
        return;
      }

      // Validate config
      try {
        validateZoteroConfig(config);
      } catch (e) {
        ctx.ui.notify(`Invalid Zotero config: ${(e as Error).message}`, 'error');
        return;
      }

      ctx.ui.setStatus('source-manager', 'Loading Zotero library...');

      try {
        // Create client
        const sessionManager = getSessionManager();
        const epistemeConfig = sessionManager.getConfig();
        const cacheDir = epistemeConfig.workspaceDir || join(process.env.HOME || '', '.episteme', 'cache');
        const ttlHours = epistemeConfig.zoteroCacheTtlHours || 4;

        state.zoteroClient = createZoteroClient(config, cacheDir, ttlHours);

        // Fetch items with progress
        const items = await state.zoteroClient.getItems((progress: ImportProgress) => {
          ctx.ui.setStatus('source-manager', progress.status);
        });

        if (items.length === 0) {
          ctx.ui.notify('No items in Zotero library', 'info');
          return;
        }

        // Convert to list items
        const listItems = items.map(convertZoteroItemToSourceListItem);
        state.cachedItems = listItems;
        state.currentPicker = 'zotero';

        // Get already-imported keys
        const activeSession = sessionManager.getActiveSession();
        const existingSources = activeSession 
          ? sessionManager.getSessionMetadata(activeSession.id)?.sources || []
          : [];
        const alreadyImportedKeys = getAlreadyImportedKeys(existingSources);

        // Show picker
        const selected = await ctx.ui.custom<SourceListItem[]>(
          (tui, theme, keybindings, done) => {
            const picker = new SourcePicker(listItems, alreadyImportedKeys);
            picker.setCallbacks(
              (items) => done(items),
              () => done([])
            );

            // Handle keyboard input
            const wrapper = new Component();
            wrapper.onKey = (key) => {
              if (key === 'escape') {
                done([]);
                return true;
              }
              return picker.onKey(key);
            };

            return picker;
          },
          { overlay: true, overlayOptions: { anchor: 'center', width: '80%', margin: 2 } }
        );

        if (!selected || selected.length === 0) {
          ctx.ui.notify('Selection cancelled', 'info');
          return;
        }

        // Import selected items
        ctx.ui.setStatus('source-manager', 'Importing...');

        const importer = createImportPipeline({
          workspacePath: join(workspace, 'sources'),
          zoteroConfig: config,
          onProgress: (progress) => {
            ctx.ui.setStatus('source-manager', progress.status);
          },
        });

        const result = await importer.importZoteroItems(selected, alreadyImportedKeys);

        // Update session metadata
        for (const source of result.imported) {
          if (activeSession) {
            sessionManager.addSource(activeSession.id, source);
          }
        }

        // Show summary
        if (result.failed.length > 0) {
          const failedSummary = result.failed.map(f => `  - ${f.title}: ${f.error}`).join('\n');
          ctx.ui.notify(
            `Imported ${result.imported.length} sources. ${result.failed.length} failed:\n${failedSummary}`,
            'warning'
          );
        } else {
          ctx.ui.notify(`Imported ${result.imported.length} sources`, 'success');
        }

      } catch (error) {
        ctx.ui.notify(`Failed to import: ${(error as Error).message}`, 'error');
      } finally {
        ctx.ui.setStatus('source-manager', null);
      }
    },
  });

  pi.registerCommand('source add-obsidian', {
    description: 'Add sources from Obsidian vault',
    async handler(_args, ctx) {
      const sessionManager = getSessionManager();
      const config = sessionManager.getConfig();

      if (!config.obsidianVault) {
        ctx.ui.notify('Obsidian vault not configured. Set obsidianVault in config.', 'error');
        return;
      }

      // Get workspace path
      const workspace = process.env.EPISTEME_WORKSPACE;
      if (!workspace) {
        ctx.ui.notify('Workspace not found', 'error');
        return;
      }

      ctx.ui.setStatus('source-manager', 'Loading Obsidian vault...');

      try {
        // Validate and create client
        const isValid = await validateVaultPath(config.obsidianVault);
        if (!isValid) {
          ctx.ui.notify('Obsidian vault path not found', 'error');
          return;
        }

        state.obsidianClient = createObsidianClient(config.obsidianVault);

        // List notes
        const notes = await state.obsidianClient.listNotes();

        if (notes.length === 0) {
          ctx.ui.notify('No notes in vault', 'info');
          return;
        }

        // Convert to list items
        const listItems: SourceListItem[] = notes.map(n => ({
          id: n.path,
          title: n.title,
          authors: '',
          year: null,
          type: 'obsidian',
          selected: false,
        }));

        state.cachedItems = listItems;
        state.currentPicker = 'obsidian';

        // Get already-imported paths
        const activeSession = sessionManager.getActiveSession();
        const existingSources = activeSession 
          ? sessionManager.getSessionMetadata(activeSession.id)?.sources || []
          : [];
        const alreadyImportedPaths = getAlreadyImportedPaths(existingSources);

        // Show picker
        const selected = await ctx.ui.custom<SourceListItem[]>(
          (tui, theme, keybindings, done) => {
            const picker = new SourcePicker(listItems, alreadyImportedPaths);
            picker.setCallbacks(
              (items) => done(items),
              () => done([])
            );
            return picker;
          },
          { overlay: true, overlayOptions: { anchor: 'center', width: '80%', margin: 2 } }
        );

        if (!selected || selected.length === 0) {
          ctx.ui.notify('Selection cancelled', 'info');
          return;
        }

        // Import selected notes
        ctx.ui.setStatus('source-manager', 'Importing...');

        const importer = createImportPipeline({
          workspacePath: join(workspace, 'sources'),
          obsidianVaultPath: config.obsidianVault,
          onProgress: (progress) => {
            ctx.ui.setStatus('source-manager', progress.status);
          },
        });

        const result = await importer.importObsidianNotes(selected, alreadyImportedPaths);

        // Update session metadata
        for (const source of result.imported) {
          if (activeSession) {
            sessionManager.addSource(activeSession.id, source);
          }
        }

        // Show summary
        if (result.failed.length > 0) {
          ctx.ui.notify(
            `Imported ${result.imported.length} notes. ${result.failed.length} failed.`,
            'warning'
          );
        } else {
          ctx.ui.notify(`Imported ${result.imported.length} notes`, 'success');
        }

      } catch (error) {
        ctx.ui.notify(`Failed to import: ${(error as Error).message}`, 'error');
      } finally {
        ctx.ui.setStatus('source-manager', null);
      }
    },
  });

  pi.registerCommand('source list', {
    description: 'List sources in workspace',
    async handler(_args, ctx) {
      const sessionManager = getSessionManager();
      const activeSession = sessionManager.getActiveSession();

      if (!activeSession) {
        ctx.ui.notify('No active session', 'error');
        return;
      }

      const metadata = sessionManager.getSessionMetadata(activeSession.id);
      const sources = metadata?.sources || [];

      if (sources.length === 0) {
        ctx.ui.notify('No sources in workspace', 'info');
        return;
      }

      // Format sources list (like /resume style)
      const lines: string[] = [];
      
      lines.push('');
      lines.push(ctx.ui.theme?.fg('accent', '📚 Sources') + ` (${sources.length})`);
      lines.push('');

      for (const source of sources) {
        const badge = source.type === 'zotero' ? '[Z]' : '[O]';
        const title = source.title.length > 60 ? source.title.substring(0, 57) + '...' : source.title;
        const timeAgo = formatTimeAgo(source.importedAt || source.addedAt);
        
        // Source line
        lines.push(`  ${ctx.ui.theme?.fg('accent', badge)} ${title}`);
        
        // Metadata line
        const metaParts: string[] = [];
        if (source.authors && source.authors.length > 0) {
          metaParts.push(source.authors.join(', '));
        }
        if (source.year) {
          metaParts.push(source.year.toString());
        }
        metaParts.push(`added ${timeAgo}`);
        
        if (metaParts.length > 0) {
          lines.push(`      ${metaParts.join(' • ')}`);
        }
        
        lines.push('');
      }

      // Show as text output
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

  pi.registerCommand('source remove', {
    description: 'Remove source from workspace',
    async handler(_args, ctx) {
      const sessionManager = getSessionManager();
      const activeSession = sessionManager.getActiveSession();

      if (!activeSession) {
        ctx.ui.notify('No active session', 'error');
        return;
      }

      const metadata = sessionManager.getSessionMetadata(activeSession.id);
      const sources = metadata?.sources || [];

      if (sources.length === 0) {
        ctx.ui.notify('No sources to remove', 'info');
        return;
      }

      // Show selection dialog
      const options = sources.map(s => {
        const badge = s.type === 'zotero' ? '[Z]' : '[O]';
        return `${badge} ${s.title}`;
      });
      const selected = await ctx.ui.select('Select source to remove:', options);

      if (!selected) {
        return;
      }

      const index = options.indexOf(selected);
      const source = sources[index];

      const confirmed = await ctx.ui.confirm('Remove source?', `Remove "${source.title}" from workspace?`);
      if (!confirmed) return;

      // Remove from metadata (file deletion is handled by workspace clean)
      sessionManager.removeSource(activeSession.id, source.id);
      ctx.ui.notify('Source removed', 'info');
    },
  });

  pi.registerCommand('source refresh', {
    description: 'Refresh Zotero cache',
    async handler(_args, ctx) {
      const config = getZoteroConfig();
      if (!config) {
        ctx.ui.notify('Zotero not configured', 'error');
        return;
      }

      ctx.ui.setStatus('source-manager', 'Refreshing Zotero cache...');

      try {
        const sessionManager = getSessionManager();
        const epistemeConfig = sessionManager.getConfig();
        const cacheDir = epistemeConfig.workspaceDir || join(process.env.HOME || '', '.episteme', 'cache');
        const ttlHours = epistemeConfig.zoteroCacheTtlHours || 4;

        state.zoteroClient = createZoteroClient(config, cacheDir, ttlHours);

        await state.zoteroClient.refreshItems((progress: ImportProgress) => {
          ctx.ui.setStatus('source-manager', progress.status);
        });

        ctx.ui.notify('Zotero cache refreshed', 'info');
      } catch (error) {
        ctx.ui.notify(`Refresh failed: ${(error as Error).message}`, 'error');
      } finally {
        ctx.ui.setStatus('source-manager', null);
      }
    },
  });

  // Session start handler
  pi.on('session_start', async (_event, ctx) => {
    ctx.ui.setStatus('source-manager', null);
  });

  // Clean up status on shutdown
  pi.on('session_shutdown', async (_event, ctx) => {
    ctx.ui.setStatus('source-manager', null);
    ctx.ui.setWidget('source-list', undefined);
  });
}