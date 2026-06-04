/**
 * Episteme Session Manager
 *
 * Manages session lifecycle, workspace isolation, and metadata persistence.
 * Sessions are owned by Episteme - pi's SessionManager handles history only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmSync } from "fs";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
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
function getEpistemeHome() {
    const home = process.env.EPISTEME_HOME || join(process.env.HOME || process.env.USERPROFILE || "", ".episteme");
    return home;
}
// Helper functions that take homeDir as parameter
function configPath(homeDir) {
    return join(homeDir, CONFIG_FILE);
}
function activePath(homeDir) {
    return join(homeDir, ACTIVE_FILE);
}
function sessionsDir(homeDir) {
    return join(homeDir, SESSIONS_DIR);
}
function sessionDir(homeDir, sessionId) {
    return join(sessionsDir(homeDir), sessionId);
}
function metadataPath(homeDir, sessionId) {
    return join(sessionDir(homeDir, sessionId), METADATA_FILE);
}
function workspacePath(homeDir, sessionId) {
    return join(sessionDir(homeDir, sessionId), WORKSPACE_DIR);
}
function piSessionPath(homeDir, sessionId) {
    return join(sessionDir(homeDir, sessionId), SESSION_DIR, SESSION_JSONL);
}
// =============================================================================
// File I/O Utilities
// =============================================================================
function readJsonFile(path, fallback) {
    try {
        if (!existsSync(path))
            return fallback;
        const content = readFileSync(path, "utf8");
        return JSON.parse(content);
    }
    catch {
        return fallback;
    }
}
function writeJsonAtomic(path, data) {
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
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir || getEpistemeHome();
        this.ensureDirectories();
    }
    getHomeDir() {
        return this.homeDir;
    }
    ensureDirectories() {
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
    getConfig() {
        return readJsonFile(configPath(this.homeDir), {});
    }
    updateConfig(updates) {
        const config = this.getConfig();
        const updated = { ...config, ...updates };
        writeJsonAtomic(configPath(this.homeDir), updated);
        return updated;
    }
    // ===========================================================================
    // Session CRUD
    // ===========================================================================
    createSession(options) {
        const id = randomUUID();
        const baseDir = sessionDir(this.homeDir, id);
        const wsDir = workspacePath(this.homeDir, id);
        const WORKSPACE_SUBDIRS = ["sources", "plans", "notes", "artifacts"];
        for (const subdir of WORKSPACE_SUBDIRS) {
            mkdirSync(join(wsDir, subdir), { recursive: true });
        }
        mkdirSync(join(baseDir, SESSION_DIR), { recursive: true });
        // Create metadata
        const metadata = {
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
        return this.getSessionInfo(id);
    }
    getSessionInfo(sessionId) {
        const mPath = metadataPath(this.homeDir, sessionId);
        if (!existsSync(mPath))
            return null;
        const meta = readJsonFile(mPath, null);
        if (!meta)
            return null;
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
    listSessions(options) {
        const sDir = sessionsDir(this.homeDir);
        if (!existsSync(sDir))
            return [];
        let ids;
        try {
            ids = readdirSync(sDir);
        }
        catch {
            return [];
        }
        const sessions = ids
            .filter(id => existsSync(metadataPath(this.homeDir, id)))
            .map(id => this.getSessionInfo(id))
            .filter((s) => s !== null);
        let result = options?.filter ? sessions.filter(options.filter) : sessions;
        if (options?.sortBy) {
            result = [...result].sort((a, b) => {
                if (options.sortBy === "created")
                    return b.created - a.created;
                if (options.sortBy === "name")
                    return (a.name || "").localeCompare(b.name || "");
                return b.lastAccessed - a.lastAccessed;
            });
        }
        if (options?.limit && options.limit > 0) {
            result = result.slice(0, options.limit);
        }
        return result;
    }
    getActiveSession() {
        const active = readJsonFile(activePath(this.homeDir), null);
        if (!active?.sessionId)
            return null;
        return this.getSessionInfo(active.sessionId);
    }
    setActiveSession(sessionId) {
        const info = this.getSessionInfo(sessionId);
        if (!info)
            throw new Error(`Session ${sessionId} does not exist`);
        const meta = this.getSessionMetadata(sessionId);
        if (meta) {
            meta.lastAccessed = Date.now();
            writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
        }
        writeJsonAtomic(activePath(this.homeDir), { sessionId, lastAccessed: Date.now() });
    }
    async switchSession(sessionId) {
        const info = this.getSessionInfo(sessionId);
        if (!info)
            return null;
        this.setActiveSession(sessionId);
        return this.getSessionInfo(sessionId);
    }
    deleteSession(sessionId, options) {
        const info = this.getSessionInfo(sessionId);
        if (!info)
            return false;
        const active = this.getActiveSession();
        if (active?.id === sessionId && !options?.force) {
            throw new Error("Cannot delete active session. Switch away first or use force.");
        }
        try {
            rmSync(sessionDir(this.homeDir, sessionId), { recursive: true, force: true });
        }
        catch {
            return false;
        }
        if (active?.id === sessionId) {
            writeJsonAtomic(activePath(this.homeDir), { sessionId: "", lastAccessed: 0 });
        }
        return true;
    }
    branchSession(sessionId, options) {
        const source = this.getSessionInfo(sessionId);
        if (!source)
            return null;
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
    getSessionMetadata(sessionId) {
        return readJsonFile(metadataPath(this.homeDir, sessionId), null);
    }
    updateSessionMetadata(sessionId, updates) {
        const meta = this.getSessionMetadata(sessionId);
        if (!meta)
            return null;
        const updated = { ...meta, ...updates, id: sessionId };
        writeJsonAtomic(metadataPath(this.homeDir, sessionId), updated);
        return updated;
    }
    setActiveAgent(sessionId, agent) {
        const updated = this.updateSessionMetadata(sessionId, { activeAgent: agent });
        return updated !== null;
    }
    setSessionStatus(sessionId, status) {
        const updated = this.updateSessionMetadata(sessionId, { status });
        return updated !== null;
    }
    // ===========================================================================
    // Sources
    // ===========================================================================
    addSource(sessionId, source) {
        const meta = this.getSessionMetadata(sessionId);
        if (!meta)
            return null;
        const newSource = { ...source, id: randomUUID(), addedAt: Date.now() };
        meta.sources.push(newSource);
        writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
        return newSource;
    }
    removeSource(sessionId, sourceId) {
        const meta = this.getSessionMetadata(sessionId);
        if (!meta)
            return false;
        const idx = meta.sources.findIndex(s => s.id === sourceId);
        if (idx === -1)
            return false;
        meta.sources.splice(idx, 1);
        writeJsonAtomic(metadataPath(this.homeDir, sessionId), meta);
        return true;
    }
    listSources(sessionId) {
        const meta = this.getSessionMetadata(sessionId);
        return meta?.sources || [];
    }
    // ===========================================================================
    // Workspace
    // ===========================================================================
    getWorkspace(sessionId) {
        const info = this.getSessionInfo(sessionId);
        return info?.workspace || null;
    }
    cleanWorkspace(sessionId, options) {
        const ws = this.getWorkspace(sessionId);
        if (!ws)
            return false;
        const cleanDir = (dirPath) => {
            if (existsSync(dirPath)) {
                try {
                    const files = readdirSync(dirPath);
                    for (const file of files) {
                        unlinkSync(join(dirPath, file));
                    }
                }
                catch { /* ignore */ }
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
    getPiSessionPath(sessionId) {
        return piSessionPath(this.homeDir, sessionId);
    }
    getPiEnv(sessionId) {
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
    getPiLaunchOptions(sessionId) {
        const ws = this.getWorkspace(sessionId);
        if (!ws)
            throw new Error(`Session ${sessionId} has no workspace`);
        return {
            cwd: ws,
            env: this.getPiEnv(sessionId),
            sessionFile: this.getPiSessionPath(sessionId),
        };
    }
    // ===========================================================================
    // Utilities
    // ===========================================================================
    getOrCreateSession(options) {
        const active = this.getActiveSession();
        if (active) {
            this.setActiveSession(active.id);
            return active;
        }
        return this.createSession(options);
    }
    hasSession(sessionId) {
        return existsSync(metadataPath(this.homeDir, sessionId));
    }
    getSessionCount() {
        const sDir = sessionsDir(this.homeDir);
        if (!existsSync(sDir))
            return 0;
        try {
            return readdirSync(sDir).filter(id => existsSync(metadataPath(this.homeDir, id))).length;
        }
        catch {
            return 0;
        }
    }
    searchSessions(query) {
        const lower = query.toLowerCase();
        return this.listSessions({
            filter: s => (s.name?.toLowerCase().includes(lower) || s.id.toLowerCase().includes(lower)),
        });
    }
}
// =============================================================================
// Singleton
// =============================================================================
let _instance = null;
export function getSessionManager() {
    if (!_instance)
        _instance = new SessionManager();
    return _instance;
}
export function resetSessionManager() {
    _instance = null;
}
//# sourceMappingURL=manager.js.map