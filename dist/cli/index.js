/**
 * Episteme CLI
 *
 * Main command-line entry point for Episteme knowledge work harness.
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { getSessionManager } from "../session/index.js";
import { runBootstrap } from "../bootstrap/index.js";
// =============================================================================
// Argument Parsing
// =============================================================================
function parseArgs(argv) {
    const options = {};
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case "--new":
            case "-n":
                options.newSession = true;
                break;
            case "--list":
            case "-l":
                options.list = true;
                break;
            case "--config":
                options.config = true;
                break;
            case "--name":
            case "-N":
                options.name = argv[i + 1];
                i++;
                break;
            default:
                // UUID or name
                if (arg && !arg.startsWith("-")) {
                    options.sessionId = arg;
                }
                break;
        }
    }
    return options;
}
// =============================================================================
// CLI Commands
// =============================================================================
async function listSessions(manager) {
    const sessions = manager.listSessions({ sortBy: "lastAccessed" });
    if (sessions.length === 0) {
        console.log("No sessions found. Run `episteme --new` to create one.");
        return;
    }
    console.log(`\n📚 Episteme Sessions (${sessions.length})\n`);
    for (const session of sessions) {
        const active = manager.getActiveSession();
        const isActive = active?.id === session.id;
        const statusIcon = isActive ? "●" : " ";
        const timeAgo = formatTimeAgo(session.lastAccessed);
        const name = session.name || "Unnamed Session";
        const agent = session.activeAgent || "researcher";
        const sources = session.sourcesCount;
        console.log(`${statusIcon} ${name}`);
        console.log(`  ID: ${session.id.slice(0, 8)}...`);
        console.log(`  Agent: ${agent} | Sources: ${sources} | Last: ${timeAgo}`);
        console.log();
    }
}
async function showConfig(manager) {
    const config = manager.getConfig();
    console.log("\n⚙️  Episteme Configuration\n");
    console.log(`Zotero API Key: ${config.zoteroApiKey ? "✓ set" : "✗ not set"}`);
    console.log(`Zotero Library: ${config.zoteroLibraryType || "user"}/${config.zoteroLibraryId || "default"}`);
    console.log(`Obsidian Vault: ${config.obsidianVault || "✗ not set"}`);
    console.log(`Default Agent: ${config.defaultAgent || "researcher"}`);
    console.log(`Workspace Dir: ${config.workspaceDir || "~/.episteme/sessions"}`);
    console.log(`Agent Dir: ${config.agentDir || "~/.episteme/agent"}`);
    console.log();
}
async function launchPi(sessionId, manager) {
    const info = manager.getSessionInfo(sessionId);
    if (!info) {
        console.error(`❌ Session ${sessionId} not found.`);
        process.exit(1);
    }
    const sessionDir = join(info.path, "session");
    const agentDir = manager.getConfig().agentDir || join(manager.getHomeDir(), "agent");
    const homeDir = manager.getHomeDir();
    // Run bootstrap to sync assets before launch
    console.log("\n🔄 Syncing Episteme assets...");
    const syncResult = await runBootstrap({ verbose: true });
    if (!syncResult.success) {
        console.warn("⚠️  Bootstrap completed with errors. Continuing anyway...");
    }
    console.log(`\n🚀 Launching Episteme session ${sessionId.slice(0, 8)}...`);
    console.log(`   Workspace:  ${info.workspace}`);
    console.log(`   Session:   ${sessionDir}`);
    console.log(`   Agent:     ${agentDir}`);
    console.log();
    // Build environment
    // PI_CODING_AGENT_DIR tells pi where to find extensions, skills, agents, settings
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
            env[key] = value;
        }
    }
    env.PI_CODING_AGENT_DIR = agentDir;
    env.PI_CODING_AGENT_SESSION_DIR = sessionDir;
    env.EPISTEME_SESSION_ID = sessionId;
    env.EPISTEME_SESSION_DIR = sessionDir;
    env.EPISTEME_WORKSPACE = info.workspace;
    env.EPISTEME_HOME = homeDir;
    // Ensure npm bin directory is in PATH (Windows)
    if (process.platform === "win32" && env.PATH) {
        const npmPath = "C:\\Program Files\\nodejs";
        if (!env.PATH.includes(npmPath)) {
            env.PATH = npmPath + ";" + env.PATH;
        }
    }
    // Set NODE_PATH so extensions can find dependencies from project's node_modules
    // This is needed because extensions run from ~/.episteme/agent/ but deps are in project
    const projectDir = process.cwd();
    const projectNodeModules = join(projectDir, "node_modules");
    if (existsSync(projectNodeModules)) {
        // Prepend project node_modules to existing NODE_PATH
        const existingNodePath = env.NODE_PATH || "";
        env.NODE_PATH = projectNodeModules + (existingNodePath ? ";" + existingNodePath : "");
    }
    // Build pi arguments
    // --session-dir: where pi stores session.jsonl files for this episteme session
    const piArgs = [
        "--session-dir", sessionDir,
        "--no-context-files", // Disable project AGENTS.md discovery; we'll inject our own
    ];
    // Determine how to invoke pi
    const { cmd, args: execArgs } = findPiExecutable();
    const child = spawn(cmd, [...execArgs, ...piArgs], {
        cwd: info.workspace,
        env,
        stdio: "inherit",
    });
    child.on("error", (err) => {
        console.error("❌ Failed to launch pi:", err.message);
        process.exit(1);
    });
    child.on("exit", (code) => {
        process.exit(code || 0);
    });
}
function findPiExecutable() {
    // Check environment variable
    const piPath = process.env.EPISTEME_PI_PATH;
    if (piPath) {
        if (process.platform === "win32" && piPath.endsWith(".cmd")) {
            return { cmd: "cmd", args: ["/c", piPath] };
        }
        return { cmd: piPath, args: [] };
    }
    // On Windows, use cmd /c to run .cmd files via npx
    if (process.platform === "win32") {
        // First check if pi.cmd exists directly
        const candidates = [
            "C:\\Users\\jethr\\AppData\\Roaming\\npm\\pi.cmd",
            "C:\\Users\\jethr\\AppData\\Roaming\\npm\\pi",
        ];
        for (const candidate of candidates) {
            if (existsSync(candidate)) {
                return { cmd: "cmd", args: ["/c", candidate] };
            }
        }
        // Fall back to using npx
        return { cmd: "cmd", args: ["/c", "npx", "pi"] };
    }
    else {
        const candidates = ["/usr/local/bin/pi", "/usr/bin/pi", "pi"];
        for (const candidate of candidates) {
            if (existsSync(candidate)) {
                return { cmd: candidate, args: [] };
            }
        }
        // Fall back to npx
        return { cmd: "npx", args: ["pi"] };
    }
}
// =============================================================================
// Utility Functions
// =============================================================================
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1)
        return "just now";
    if (minutes < 60)
        return `${minutes}m ago`;
    if (hours < 24)
        return `${hours}h ago`;
    if (days === 1)
        return "yesterday";
    return `${days}d ago`;
}
// =============================================================================
// Main Entry Point
// =============================================================================
async function main() {
    const args = process.argv;
    // Check for help
    if (args.includes("--help") || args.includes("-h")) {
        printHelp();
        return;
    }
    // Check for version
    if (args.includes("--version") || args.includes("-v")) {
        printVersion();
        return;
    }
    const options = parseArgs(args);
    const manager = getSessionManager();
    // Handle list option
    if (options.list) {
        await listSessions(manager);
        return;
    }
    // Handle config option
    if (options.config) {
        await showConfig(manager);
        return;
    }
    // Determine which session to use
    let sessionId;
    if (options.newSession) {
        // Create new session
        const session = manager.createSession({ name: options.name });
        sessionId = session.id;
    }
    else if (options.sessionId) {
        // Use specified session
        const info = manager.getSessionInfo(options.sessionId);
        if (!info) {
            console.error(`❌ Session ${options.sessionId} not found.`);
            console.error("   Use `episteme --list` to see available sessions.");
            process.exit(1);
        }
        sessionId = options.sessionId;
    }
    else {
        // Use active session or create new
        const active = manager.getActiveSession();
        if (active) {
            sessionId = active.id;
        }
        else {
            const session = manager.createSession({ name: options.name });
            sessionId = session.id;
        }
    }
    // Launch pi with the session
    await launchPi(sessionId, manager);
}
function printHelp() {
    console.log(`
📚 Episteme - Knowledge Work Harness

Usage:
  episteme [options] [session-id]

Options:
  --new, -n          Create a new session
  --list, -l         List all sessions
  --config           Show current configuration
  --name, -N <name>  Set session name
  --help, -h         Show this help message
  --version, -v      Show version

Commands (run inside Episteme):
  /session list      List sessions
  /session switch    Switch session
  /session new       Create new session
  /source add        Add sources
  /agent             Switch agents
  /research          Run research workflow
  /write             Run writing workflow
  /export            Export to Obsidian

Examples:
  episteme                      # Resume active or create new
  episteme abc123               # Open session abc123
  episteme --new --name "ML"    # Create named session
  episteme --list              # Show all sessions
`);
}
function printVersion() {
    console.log("episteme v0.1.0");
}
main().catch((err) => {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
});
//# sourceMappingURL=index.js.map