#!/usr/bin/env node

import { spawn } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🔨 Building NTSR TINY Executable (< 10MB)...");

/**
 * Run a command and return a promise
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      ...options,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

try {
  // Clean previous build
  const distDir = join(__dirname, "..", "dist");
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
    console.log("🧹 Cleaned previous build");
  }

  // Ensure dist directory exists
  mkdirSync(distDir, { recursive: true });
  console.log("📁 Created dist directory");

  // Read package.json to get version
  const packageJsonPath = join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;

  console.log(`📦 Building NTSR v${version} (TINY - Basic functionality only)`);

  // Create a super minimal version - just basic TypeScript execution
  const tinyEntry = `#!/usr/bin/env node

// NTSR TINY v${version} - Ultra-lightweight TypeScript runner
// Only includes basic functionality to keep size under 10MB

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const { extname } = require('path');

const VERSION = "${version}";

function showVersion() {
  console.log(\`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    NTSR - Nehonix TypeScript Runner v\${VERSION}          ║
║                                                                              ║
║     Copyright (c) 2025 NEHONIX. Licensed under MIT License.                 ║
║     Part of the Fortify library ecosystem - optimized for speed             ║
╚══════════════════════════════════════════════════════════════════════════════╝

  TINY BUILD - Basic TypeScript execution only
  For full features, use the complete version
\`);
}

function showHelp() {
  console.log(\`
NTSR TINY v\${VERSION} - Ultra-lightweight TypeScript runner

USAGE:
  ntsr <script.ts> [script-arguments...]
  ntsr [options]

OPTIONS:
  --help, -h         Show this help message
  --version, -v      Show version information

EXAMPLES:
  ntsr server.ts
  ntsr app.ts --port 3000

NOTE: This is the TINY build with basic functionality only.
For advanced features, use the complete NTSR version.
\`);
}

function runTypeScript(scriptPath, scriptArgs) {
  // Try tsx first (most compatible)
  const tsx = spawn('tsx', [scriptPath, ...scriptArgs], { 
    stdio: 'inherit',
    shell: true 
  });

  tsx.on('error', () => {
    // Fallback to ts-node
    const tsNode = spawn('ts-node', [scriptPath, ...scriptArgs], { 
      stdio: 'inherit',
      shell: true 
    });

    tsNode.on('error', () => {
      console.error('Error: No TypeScript runner found.');
      console.error('Please install tsx or ts-node:');
      console.error('  npm install -g tsx');
      console.error('  # or');
      console.error('  npm install -g ts-node');
      process.exit(1);
    });

    tsNode.on('close', (code) => {
      process.exit(code || 0);
    });
  });

  tsx.on('close', (code) => {
    process.exit(code || 0);
  });
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    showVersion();
    return;
  }

  const scriptPath = args[0];
  const scriptArgs = args.slice(1);

  if (!existsSync(scriptPath)) {
    console.error(\`Error: File not found: \${scriptPath}\`);
    process.exit(1);
  }

  const ext = extname(scriptPath);
  if (!['.ts', '.tsx'].includes(ext)) {
    console.error(\`Error: Only TypeScript files (.ts, .tsx) are supported in TINY build\`);
    console.error(\`File: \${scriptPath}\`);
    process.exit(1);
  }

  runTypeScript(scriptPath, scriptArgs);
}

main();
`;

  // Write the tiny version directly as a .cjs file
  const tinyPath = join(distDir, "NTSR-tiny.cjs");
  writeFileSync(tinyPath, tinyEntry, "utf8");
  console.log("📦 Created TINY bundle: dist/NTSR-tiny.cjs");

  // Make the file executable
  try {
    chmodSync(tinyPath, 0o755);
    console.log("🔧 Made file executable");
  } catch (error) {
    console.log("⚠️  Could not make file executable (Windows?)");
  }

  // Create TINY executables with pkg
  console.log("🔄 Creating TINY executables...");

  // Create executables directory
  const execDir = join(distDir, "executables");
  mkdirSync(execDir, { recursive: true });

  try {
    // Build executables
    await runCommand("npx", [
      "pkg",
      tinyPath,
      "--target",
      "node16-win-x64",
      "--output",
      join(execDir, "ntsr-tiny.exe"),
    ]);
    console.log("✅ TINY Windows executable created");

    await runCommand("npx", [
      "pkg",
      tinyPath,
      "--target",
      "node16-linux-x64",
      "--output",
      join(execDir, "ntsr-tiny-linux"),
    ]);
    console.log("✅ TINY Linux executable created");

    await runCommand("npx", [
      "pkg",
      tinyPath,
      "--target",
      "node16-macos-x64",
      "--output",
      join(execDir, "ntsr-tiny-macos"),
    ]);
    console.log("✅ TINY macOS executable created");
  } catch (error) {
    console.log("❌ Failed to create TINY executables:", error.message);
  }

  // Show sizes
  const { statSync } = await import("fs");
  const bundleStats = statSync(tinyPath);
  console.log(
    `✅ TINY build complete! Bundle size: ${Math.round(
      bundleStats.size / 1024
    )}KB`
  );

  try {
    const winStats = statSync(join(execDir, "ntsr-tiny.exe"));
    const linuxStats = statSync(join(execDir, "ntsr-tiny-linux"));
    const macStats = statSync(join(execDir, "ntsr-tiny-macos"));

    console.log("\n📊 TINY executable sizes:");
    console.log(`  Windows: ${Math.round(winStats.size / 1024 / 1024)}MB`);
    console.log(`  Linux: ${Math.round(linuxStats.size / 1024 / 1024)}MB`);
    console.log(`  macOS: ${Math.round(macStats.size / 1024 / 1024)}MB`);
  } catch (error) {
    console.log("Could not read TINY executable sizes");
  }

  console.log("\n🎉 NTSR TINY built successfully!");
  console.log("\n📝 TINY build features:");
  console.log("  ✅ Basic TypeScript execution");
  console.log("  ✅ Help and version commands");
  console.log("  ✅ Uses tsx/ts-node for execution");
  console.log("  ❌ No built-in transpiler");
  console.log("  ❌ No advanced configuration");
  console.log("  ❌ Requires tsx or ts-node to be installed");

  console.log("\nTo test:");
  console.log("  node dist/NTSR-tiny.cjs --version");
  console.log("  dist/executables/ntsr-tiny.exe --version");
} catch (error) {
  console.error("❌ TINY build failed:", error.message);
  process.exit(1);
}
