/**
 * Episteme Session Manager
 * 
 * Manages session lifecycle, workspace isolation, and metadata persistence.
 * Sessions are owned by Episteme - pi's SessionManager handles history only.
 */

import { 
  existsSync, 
  mkdirSync, 
  readFileSync, 
  writeFileSync, 
  readdirSync, 
  unlinkSync,
  rmSync
} from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";

// =============================================================================
// Types
// =============================================================================

export interface SourceInfo {
  id: string;
  type: "zotero" | "obsidian";
  path: string;
  title: string;
  addedAt: number;
  zoteroKey?: string;
}

export interface SessionMetadata {
  id: string;
  created: number;
  lastAccessed: number;
  status: "active" | "paused" | "complete";
  sources: SourceInfo[];
  activeAgent: "researcher" | "writer" | "librarian";
  name?: string;
  tags?: string[];
}

export interface ActiveSession {
  sessionId: string;
  lastAccessed: number;
}

export interface EpistemeConfig {
  zoteroApiKey?: string;
  zoteroLibraryType?: "user" | "group";
  zoteroLibraryId?: string;
  obsidianVault?: string;
  defaultAgent?: "researcher" | "writer" | "librarian";
  workspaceDir?: string;
  agentDir?: string;
  piExecutable?: string;
}

export interface SessionInfo {
  id: string;
  path: string;
  workspace: string;
  created: number;
  lastAccessed: number;
  status: "active" | "paused" | "complete";
  name?: string;
  sourcesCount: number;
  activeAgent?: "researcher" | "writer" | "librarian";
}

// =============================================================================
// Constants
// =============================================================================

const CONFIG_FILE = "config.json";
const ACTIVE_FILE = "active.json";
const SESSIONS_DIR = "sessions";
const METADATA_FILE = "metadata.json";
const WORKSPACE_DIR = "workspace";
const SESSION_DIR = "session";
const SESSION_JSONL = "session.jsonl";
const WORKSPACE_SUBDIRS = ["sources", "plans", "notes", "artifacts"];

// =============================================================================
// Path Utilities
// =============================================================================

function getEpistemeHome(): string {
  const home = process.env.EPISTEME_HOME || join(process.env.HOME || process.env.USERPROFILE || "", ".episteme");
  return home;
}

// Helper functions that take homeDir as parameter
function configPath(homeDir: string): string {
  return join(homeDir, CONFIG_FILE);
}

function activePath(homeDir: string): string {
  return join(homeDir, ACTIVE_FILE);
}

function sessionsDir(homeDir: string): string {
  return join(homeDir, SESSIONS_DIR);
}

function sessionDir(homeDir: string, sessionId: string): string {
  return join(sessionsDir(homeDir), sessionId);
}

function metadataPath(homeDir: string, sessionId: string): string {
  return join(sessionDir(homeDir, sessionId), METADATA_FILE);
}

function workspacePath(homeDir: string, sessionId: string): string {
  return join(sessionDir(homeDir, sessionId), WORKSPACE_DIR);
}

function piSessionPath(homeDir: string, sessionId: string): string {
  return join(sessionDir(homeDir, sessionId), SESSION_DIR, SESSION_JSONL);
}

// =============================================================================
// File I/O Utilities
// =============================================================================

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    const content = readFileSync(path, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic<T>(path: string, data: T): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

// =============================================================================
// SessionManager Class
// =============================================================================

export class SessionManager {
  private homeDir: string;
  
  constructor(homeDir?: string) {
    this.homeDir = homeDir || getEpistemeHome();
    this.ensureDirectories();
  }

  getHomeDir(): string {
    return this.homeDir;
  }

  private ensureDirectories(): void {
    if (!existsSync(this.homeDir)) {
      mkdirSync(this.homeDir, { recursive: true });
    }
    const sDir = sessionsDir(this.homeDir);
    if (!existsSync(sDir)) {
      mkdirSync(sDir, { recursive: true });
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  getConfig(): EpistemeConfig {
    return readJsonFile(configPath(this.homeDir), {});
  }

  updateConfig(updates: Partial<EpistemeConfig>): EpistemeConfig {
    const config = this.getConfig();
    const updated = { ...config, ...updates };
    writeJsonAtomic(configPath(this.homeDir), updated);
    return updated;
  }

  // ===========================================================================
  // Session CRUD
  // ===========================================================================

  createSession(options?: { name?: string; tags?: string[] }): SessionInfo {
    const id = randomUUID();
    const baseDir = sessionDir(this.homeDir, id);
    const wsDir = workspacePath(this.homeDir, id);
    
const WORKSPACE_SUBDIRS = ["sources", "plans", "notes", "artifacts"];
    
    for (const subdir of WORKSPACE_SUBDIRS) {
      mkdirSync(join(wsDir, subdir), { recursive: true });
    }
    mkdirSync(join(baseDir, SESSION_DIR), { recursive: true });

    // Create metadata
    const metadata: SessionMetadata = {
      id,
      created: Date.now(),
      lastAccessed: Date.now(),
      status: "active",
      sources: [],
      activeAgent: "researcher",
      name: options?.name,
      tags: options?.tags,
    };
    writeJsonAtomic(metadataPath(this.homeDir, id), metadata);
    this.setActiveSession(id);
    return this.getSessionInfo(id)!;
  }

  getSessionInfo(sessionId: string): SessionInfo | null {
    const mPath = metadataPath(this.homeDir, sessionId);
    if (!existsSync(mPath)) return null;
    const meta = readJsonFile<SessionMetadata>(mPath, null as any);
    if (!meta) return null;
    return {
      id: meta.id,
      path: sessionDir(this.homeDir, sessionId),
      workspace: workspacePath(this.homeDir, sessionId),
      created: meta.created,
      lastAccessed: meta.lastAccessed,
      status: meta.status,
      name: meta.name,
      sourcesCount: meta.sources.length,
      activeAgent: meta.activeAgent,
    };
  }

  listSessions(options?: { 
    filter?: (info: SessionInfo) => boolean;
    sortBy?: "lastAccessed" | "created" | "name";
    limit?: number;
  }): SessionInfo[] {
    const sDir = sessionsDir(this.homeDir);
    if (!existsSync(sDir)) return [];
    
    let ids: string[];
    try {
      ids = readdirSync(sDir);
    } catch {
      return [];
    }
    
    const sessions = ids
      .filter(id => existsSync(metadataPath(this.homeDir, id)))
      .map(id => this.getSessionInfo(id))
      .filter((s): s is SessionInfo => s !== null);

    let result = options?.filter ? sessions.filter(options.filter) : sessions;

    if (options?.sortBy) {
      result = [...result].sort((a, b) => {
        if (options.sortBy === "created") return b.created - a.created;
        if (options.sortBy === "name") return (a.name || "").localeCompare(b.name || "");
        return b.lastAccessed - a.lastAccessed;
      });
    }

    if (options?.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  getActiveSession(): SessionInfo | null {
    const active = readJsonFile<ActiveSession>(activePath(this.homeDir), null as any);
    if (!active?.sessionId) return null;
    return this.getSessionInfo(active.sessionId);
  }

  setActiveSession(sessionId: string): void {
    const info = this.getSessionInfo(sessionId);
    if (!info) throw new Error(`Session ${sessionId} does not exist`);
    
    const meta = this.getSessionMetadata(sessionId);
    if (meta) {
      meta.lastAccessed = Date.now();
      writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
    }
    
    writeJsonAtomic(activePath(this.homeDir), { sessionId, lastAccessed: Date.now() });
  }

  async switchSession(sessionId: string): Promise<SessionInfo | null> {
    const info = this.getSessionInfo(sessionId);
    if (!info) return null;
    this.setActiveSession(sessionId);
    return this.getSessionInfo(sessionId);
  }

  deleteSession(sessionId: string, options?: { force?: boolean }): boolean {
    const info = this.getSessionInfo(sessionId);
    if (!info) return false;
    
    const active = this.getActiveSession();
    if (active?.id === sessionId && !options?.force) {
      throw new Error("Cannot delete active session. Switch away first or use force.");
    }
    
    try {
      rmSync(sessionDir(this.homeDir, sessionId), { recursive: true, force: true });
    } catch {
      return false;
    }
    
    if (active?.id === sessionId) {
      writeJsonAtomic(activePath(this.homeDir), { sessionId: "", lastAccessed: 0 });
    }
    return true;
  }

  branchSession(sessionId: string, options?: { name?: string }): SessionInfo | null {
    const source = this.getSessionInfo(sessionId);
    if (!source) return null;
    
    const newSession = this.createSession({
      name: options?.name || `${source.name || "Session"} (branch)`,
    });
    
    const srcMeta = this.getSessionMetadata(sessionId);
    if (srcMeta) {
      const newMeta = this.getSessionMetadata(newSession.id);
      if (newMeta) {
        newMeta.sources = [...srcMeta.sources];
        writeJsonAtomic(metadataPath(this.homeDir, newSession.id), newMeta);
      }
    }
    
    return this.getSessionInfo(newSession.id);
  }

  // ===========================================================================
  // Metadata
  // ===========================================================================

  getSessionMetadata(sessionId: string): SessionMetadata | null {
    return readJsonFile(metadataPath(this.homeDir, sessionId), null as any);
  }

  updateSessionMetadata(sessionId: string, updates: Partial<SessionMetadata>): SessionMetadata | null {
    const meta = this.getSessionMetadata(sessionId);
    if (!meta) return null;
    const updated = { ...meta, ...updates, id: sessionId };
    writeJsonAtomic(metadataPath(this.homeDir, sessionId), updated);
    return updated;
  }

  setActiveAgent(sessionId: string, agent: "researcher" | "writer" | "librarian"): boolean {
    const updated = this.updateSessionMetadata(sessionId, { activeAgent: agent });
    return updated !== null;
  }

  setSessionStatus(sessionId: string, status: "active" | "paused" | "complete"): boolean {
    const updated = this.updateSessionMetadata(sessionId, { status });
    return updated !== null;
  }

  // ===========================================================================
  // Sources
  // ===========================================================================

  addSource(sessionId: string, source: Omit<SourceInfo, "id" | "addedAt">): SourceInfo | null {
    const meta = this.getSessionMetadata(sessionId);
    if (!meta) return null;
    
    const newSource: SourceInfo = { ...source, id: randomUUID(), addedAt: Date.now() };
    meta.sources.push(newSource);
    writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
    return newSource;
  }

  removeSource(sessionId: string, sourceId: string): boolean {
    const meta = this.getSessionMetadata(sessionId);
    if (!meta) return false;
    
    const idx = meta.sources.findIndex(s => s.id === sourceId);
    if (idx === -1) return false;
    
    meta.sources.splice(idx, 1);
    writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
    return true;
  }

  listSources(sessionId: string): SourceInfo[] {
    const meta = this.getSessionMetadata(sessionId);
    return meta?.sources || [];
  }

  // ===========================================================================
  // Workspace
  // ===========================================================================

  getWorkspace(sessionId: string): string | null {
    const info = this.getSessionInfo(sessionId);
    return info?.workspace || null;
  }

  cleanWorkspace(sessionId: string, options?: { keepSources?: boolean }): boolean {
    const ws = this.getWorkspace(sessionId);
    if (!ws) return false;

    const cleanDir = (dirPath: string) => {
      if (existsSync(dirPath)) {
        try {
          const files = readdirSync(dirPath);
          for (const file of files) {
            unlinkSync(join(dirPath, file));
          }
        } catch { /* ignore */ }
      }
    };

    const dirsToClean = options?.keepSources 
      ? WORKSPACE_SUBDIRS.filter(d => d !== "sources")
      : WORKSPACE_SUBDIRS;

    for (const subdir of dirsToClean) {
      cleanDir(join(ws, subdir));
    }

    if (!options?.keepSources) {
      const meta = this.getSessionMetadata(sessionId);
      if (meta) {
        meta.sources = [];
        writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
      }
    }
    return true;
  }

  // ===========================================================================
  // Pi Integration
  // ===========================================================================

  getPiSessionPath(sessionId: string): string {
    return piSessionPath(this.homeDir, sessionId);
  }

  getPiEnv(sessionId: string): Record<string, string> {
    const cfg = this.getConfig();
    const ws = this.getWorkspace(sessionId);
    const piPath = this.getPiSessionPath(sessionId);
    return {
      EPISTEME_SESSION_ID: sessionId,
      EPISTEME_SESSION_DIR: dirname(piPath),
      EPISTEME_WORKSPACE: ws || "",
      EPISTEME_HOME: this.homeDir,
      EPISTEME_AGENT_DIR: cfg.agentDir || join(this.homeDir, "agent"),
      ZOTERO_API_KEY: cfg.zoteroApiKey || "",
      OBSIDIAN_VAULT: cfg.obsidianVault || "",
    };
  }

  getPiLaunchOptions(sessionId: string): { cwd: string; env: Record<string, string>; sessionFile: string } {
    const ws = this.getWorkspace(sessionId);
    if (!ws) throw new Error(`Session ${sessionId} has no workspace`);
    return {
      cwd: ws,
      env: this.getPiEnv(sessionId),
      sessionFile: this.getPiSessionPath(sessionId),
    };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  getOrCreateSession(options?: { name?: string }): SessionInfo {
    const active = this.getActiveSession();
    if (active) {
      this.setActiveSession(active.id);
      return active;
    }
    return this.createSession(options);
  }

  hasSession(sessionId: string): boolean {
    return existsSync(metadataPath(this.homeDir, sessionId));
  }

  getSessionCount(): number {
    const sDir = sessionsDir(this.homeDir);
    if (!existsSync(sDir)) return 0;
    try {
      return readdirSync(sDir).filter(id => existsSync(metadataPath(this.homeDir, id))).length;
    } catch {
      return 0;
    }
  }

  searchSessions(query: string): SessionInfo[] {
    const lower = query.toLowerCase();
    return this.listSessions({
      filter: s => (s.name?.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower)),
    });
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _instance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!_instance) _instance = new SessionManager();
  return _instance;
}

export function resetSessionManager(): void {
  _instance = null;
}