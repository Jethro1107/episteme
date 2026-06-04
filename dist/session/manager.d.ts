/**
 * Episteme Session Manager
 *
 * Manages session lifecycle, workspace isolation, and metadata persistence.
 * Sessions are owned by Episteme - pi's SessionManager handles history only.
 */
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
export declare class SessionManager {
    private homeDir;
    constructor(homeDir?: string);
    getHomeDir(): string;
    private ensureDirectories;
    getConfig(): EpistemeConfig;
    updateConfig(updates: Partial<EpistemeConfig>): EpistemeConfig;
    createSession(options?: {
        name?: string;
        tags?: string[];
    }): SessionInfo;
    getSessionInfo(sessionId: string): SessionInfo | null;
    listSessions(options?: {
        filter?: (info: SessionInfo) => boolean;
        sortBy?: "lastAccessed" | "created" | "name";
        limit?: number;
    }): SessionInfo[];
    getActiveSession(): SessionInfo | null;
    setActiveSession(sessionId: string): void;
    switchSession(sessionId: string): Promise<SessionInfo | null>;
    deleteSession(sessionId: string, options?: {
        force?: boolean;
    }): boolean;
    branchSession(sessionId: string, options?: {
        name?: string;
    }): SessionInfo | null;
    getSessionMetadata(sessionId: string): SessionMetadata | null;
    updateSessionMetadata(sessionId: string, updates: Partial<SessionMetadata>): SessionMetadata | null;
    setActiveAgent(sessionId: string, agent: "researcher" | "writer" | "librarian"): boolean;
    setSessionStatus(sessionId: string, status: "active" | "paused" | "complete"): boolean;
    addSource(sessionId: string, source: Omit<SourceInfo, "id" | "addedAt">): SourceInfo | null;
    removeSource(sessionId: string, sourceId: string): boolean;
    listSources(sessionId: string): SourceInfo[];
    getWorkspace(sessionId: string): string | null;
    cleanWorkspace(sessionId: string, options?: {
        keepSources?: boolean;
    }): boolean;
    getPiSessionPath(sessionId: string): string;
    getPiEnv(sessionId: string): Record<string, string>;
    getPiLaunchOptions(sessionId: string): {
        cwd: string;
        env: Record<string, string>;
        sessionFile: string;
    };
    getOrCreateSession(options?: {
        name?: string;
    }): SessionInfo;
    hasSession(sessionId: string): boolean;
    getSessionCount(): number;
    searchSessions(query: string): SessionInfo[];
}
export declare function getSessionManager(): SessionManager;
export declare function resetSessionManager(): void;
//# sourceMappingURL=manager.d.ts.map