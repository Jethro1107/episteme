/**
 * Session Manager Tests
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "./manager.js";
import { join } from "path";
import { existsSync, rmSync, mkdirSync, readdirSync, readFileSync } from "fs";
// Use unique test directories to avoid cross-test pollution
let testCounter = 0;
function getTestHome() {
    return join(process.cwd(), `.episteme-test-${++testCounter}`);
}
function cleanupDir(dir) {
    if (!existsSync(dir))
        return;
    try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            try {
                rmSync(fullPath, { recursive: true, force: true });
            }
            catch {
                // ignore
            }
        }
    }
    catch {
        // ignore
    }
}
// Reset singleton before each test
beforeEach(() => {
    // The module-level singleton gets reset via test isolation
});
describe("SessionManager", () => {
    describe("createSession", () => {
        it("creates session with workspace", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession({ name: "Test" });
            expect(session.id).toBeTruthy();
            expect(session.name).toBe("Test");
            expect(session.status).toBe("active");
            expect(existsSync(session.workspace)).toBe(true);
            expect(existsSync(join(session.workspace, "sources"))).toBe(true);
            expect(existsSync(join(session.workspace, "plans"))).toBe(true);
            expect(existsSync(join(session.workspace, "notes"))).toBe(true);
            expect(existsSync(join(session.workspace, "artifacts"))).toBe(true);
            cleanupDir(home);
        });
        it("sets session as active", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            // Read active.json directly to verify
            const activeData = JSON.parse(readFileSync(join(home, "active.json"), "utf8"));
            expect(activeData.sessionId).toBe(session.id);
            cleanupDir(home);
        });
        it("generates valid UUID", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            // UUID format check
            expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            cleanupDir(home);
        });
    });
    describe("getSessionInfo", () => {
        it("returns null for non-existent session", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const info = manager.getSessionInfo("non-existent");
            expect(info).toBeNull();
            cleanupDir(home);
        });
        it("returns info for existing session", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const created = manager.createSession({ name: "My Session" });
            const info = manager.getSessionInfo(created.id);
            expect(info).not.toBeNull();
            expect(info.name).toBe("My Session");
            expect(info.status).toBe("active");
            cleanupDir(home);
        });
    });
    describe("listSessions", () => {
        it("returns empty array when no sessions", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const sessions = manager.listSessions();
            expect(sessions).toHaveLength(0);
            cleanupDir(home);
        });
        it("lists created sessions", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            manager.createSession();
            manager.createSession();
            const sessions = manager.listSessions();
            expect(sessions.length).toBe(2);
            cleanupDir(home);
        });
    });
    describe("switchSession", () => {
        it("changes active session", async () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const s1 = manager.createSession({ name: "One" });
            const s2 = manager.createSession({ name: "Two" });
            await manager.switchSession(s2.id);
            // Verify via active.json
            const activeData = JSON.parse(readFileSync(join(home, "active.json"), "utf8"));
            expect(activeData.sessionId).toBe(s2.id);
            cleanupDir(home);
        });
    });
    describe("deleteSession", () => {
        it("deletes session with force", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            const result = manager.deleteSession(session.id, { force: true });
            expect(result).toBe(true);
            expect(manager.getSessionInfo(session.id)).toBeNull();
            cleanupDir(home);
        });
        it("throws when deleting active without force", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            expect(() => {
                manager.deleteSession(session.id);
            }).toThrow();
            cleanupDir(home);
        });
    });
    describe("sources", () => {
        it("adds source to session", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            const source = manager.addSource(session.id, {
                type: "zotero",
                path: "/test/item.pdf",
                title: "Test Paper",
            });
            expect(source).not.toBeNull();
            expect(source.id).toBeTruthy();
            expect(source.title).toBe("Test Paper");
            cleanupDir(home);
        });
        it("lists session sources", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            manager.addSource(session.id, {
                type: "zotero",
                path: "/test/item1.pdf",
                title: "Paper 1",
            });
            manager.addSource(session.id, {
                type: "obsidian",
                path: "/vault/note.md",
                title: "Note",
            });
            const sources = manager.listSources(session.id);
            expect(sources.length).toBe(2);
            cleanupDir(home);
        });
        it("removes source from session", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            const source = manager.addSource(session.id, {
                type: "zotero",
                path: "/test/item.pdf",
                title: "Test Paper",
            });
            const removed = manager.removeSource(session.id, source.id);
            expect(removed).toBe(true);
            expect(manager.listSources(session.id)).toHaveLength(0);
            cleanupDir(home);
        });
    });
    describe("branchSession", () => {
        it("creates branch with copied sources", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const original = manager.createSession({ name: "Original" });
            manager.addSource(original.id, {
                type: "obsidian",
                path: "/vault/note.md",
                title: "Note",
            });
            const branch = manager.branchSession(original.id, { name: "Branch" });
            expect(branch).not.toBeNull();
            expect(branch.name).toBe("Branch");
            expect(branch.id).not.toBe(original.id);
            expect(manager.listSources(branch.id)).toHaveLength(1);
            cleanupDir(home);
        });
    });
    describe("config", () => {
        it("starts with empty config", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const config = manager.getConfig();
            expect(Object.keys(config).length).toBe(0);
            cleanupDir(home);
        });
        it("updates and persists config", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            manager.updateConfig({ zoteroApiKey: "key123", obsidianVault: "/vault" });
            const config = manager.getConfig();
            expect(config.zoteroApiKey).toBe("key123");
            expect(config.obsidianVault).toBe("/vault");
            cleanupDir(home);
        });
    });
    describe("pi integration", () => {
        it("returns correct pi session path", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            const piPath = manager.getPiSessionPath(session.id);
            expect(piPath).toContain("session");
            expect(piPath).toContain("session.jsonl");
            cleanupDir(home);
        });
        it("returns env vars for pi launch", () => {
            const home = getTestHome();
            mkdirSync(join(home, "sessions"), { recursive: true });
            const manager = new SessionManager(home);
            const session = manager.createSession();
            const env = manager.getPiEnv(session.id);
            expect(env.EPISTEME_SESSION_ID).toBe(session.id);
            expect(env.EPISTEME_WORKSPACE).toBeTruthy();
            expect(env.EPISTEME_HOME).toBe(home);
            cleanupDir(home);
        });
    });
});
//# sourceMappingURL=manager.test.js.map