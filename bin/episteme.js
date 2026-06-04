#!/usr/bin/env node
/**
 * Episteme CLI Entry Point
 * 
 * Shell script wrapper that launches the TypeScript CLI.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

// Try to find the built CLI
const distPath = join(rootDir, "dist", "cli", "index.js");
const srcPath = join(rootDir, "src", "cli", "index.ts");

// Determine which entry point to use
let entryPoint;
let execArgs;

if (existsSync(distPath)) {
  // Production: use compiled JavaScript
  entryPoint = process.execPath;
  execArgs = [distPath];
} else if (existsSync(srcPath)) {
  // Development: use tsx with tsx loader
  entryPoint = "npx";
  execArgs = ["tsx", srcPath];
} else {
  console.error("Error: Could not find entry point. Run 'npm run build' first.");
  process.exit(1);
}

// Spawn the child process
const child = spawn(
  entryPoint,
  [...execArgs, ...process.argv.slice(2)],
  {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  }
);

child.on("error", (err) => {
  console.error("Failed to start Episteme:", err.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code || 0);
});