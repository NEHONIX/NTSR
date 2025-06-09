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
const rootDir = dirname(__dirname); // Go up one level from scripts folder

console.log("🔨 Building NTSR with NEXE (Ultra-Compact)...");

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
  const distDir = join(rootDir, "dist");
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
    console.log("🧹 Cleaned previous build");
  }

  // Ensure dist directory exists
  mkdirSync(distDir, { recursive: true });
  console.log("📁 Created dist directory");

  // Read package.json to get version
  const packageJsonPath = join(rootDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;

  console.log(`📦 Building NTSR v${version} with NEXE`);

  // Create a super minimal version for nexe
  const nexeEntry = `#!/usr/bin/env node

// NTSR NEXE v${version} - Ultra-compact TypeScript runner
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

  NEXE BUILD - Ultra-compact executable
  Basic TypeScript execution with minimal footprint
\`);
}

function showHelp() {
  console.log(\`
NTSR NEXE v\${VERSION} - Ultra-compact TypeScript runner

USAGE:
  ntsr <script.ts> [script-arguments...]
  ntsr [options]

OPTIONS:
  --help, -h         Show this help message
  --version, -v      Show version information

EXAMPLES:
  ntsr server.ts
  ntsr app.ts --port 3000

NOTE: This is the NEXE build optimized for minimal size.
Requires tsx or ts-node to be installed globally.
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
      console.error('Please install tsx or ts-node globally:');
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
    console.error(\`Error: Only TypeScript files (.ts, .tsx) are supported\`);
    console.error(\`File: \${scriptPath}\`);
    process.exit(1);
  }

  runTypeScript(scriptPath, scriptArgs);
}

main();
`;

  // Write the nexe version
  const nexePath = join(distDir, "NTSR-nexe.js");
  writeFileSync(nexePath, nexeEntry, "utf8");
  console.log("📦 Created NEXE source: dist/NTSR-nexe.js");

  // Create executables directory
  const execDir = join(distDir, "executables");
  mkdirSync(execDir, { recursive: true });

  // Build with nexe for different platforms
  console.log("🔄 Creating NEXE executables...");

  try {
    // Windows
    await runCommand("npx", [
      "nexe",
      nexePath,
      "--target",
      "windows-x64-16.20.0",
      "--output",
      join(execDir, "ntsr-nexe.exe"),
      "--build",
    ]);
    console.log("✅ NEXE Windows executable created");

    // Linux
    await runCommand("npx", [
      "nexe",
      nexePath,
      "--target",
      "linux-x64-16.20.0",
      "--output",
      join(execDir, "ntsr-nexe-linux"),
      "--build",
    ]);
    console.log("✅ NEXE Linux executable created");

    // macOS
    await runCommand("npx", [
      "nexe",
      nexePath,
      "--target",
      "mac-x64-16.20.0",
      "--output",
      join(execDir, "ntsr-nexe-macos"),
      "--build",
    ]);
    console.log("✅ NEXE macOS executable created");
  } catch (error) {
    console.log("❌ Some NEXE builds failed:", error.message);
    console.log(
      "This is normal - nexe may not support all platforms on this system"
    );
  }

  // Show sizes
  const { statSync } = await import("fs");
  const sourceStats = statSync(nexePath);
  console.log(
    `✅ NEXE build complete! Source size: ${Math.round(
      sourceStats.size / 1024
    )}KB`
  );

  try {
    const files = ["ntsr-nexe.exe", "ntsr-nexe-linux", "ntsr-nexe-macos"];
    console.log("\n📊 NEXE executable sizes:");

    for (const file of files) {
      try {
        const filePath = join(execDir, file);
        if (existsSync(filePath)) {
          const stats = statSync(filePath);
          console.log(`  ${file}: ${Math.round(stats.size / 1024 / 1024)}MB`);
        }
      } catch (e) {
        console.log(`  ${file}: Not created`);
      }
    }
  } catch (error) {
    console.log("Could not read NEXE executable sizes");
  }

  console.log("\n🎉 NTSR NEXE built successfully!");
  console.log("\n📝 NEXE build features:");
  console.log("  ✅ Ultra-compact executables");
  console.log("  ✅ Basic TypeScript execution");
  console.log("  ✅ Help and version commands");
  console.log("  ✅ Uses tsx/ts-node for execution");
  console.log("  ❌ Requires tsx or ts-node to be installed");

  console.log("\nTo test:");
  console.log("  node dist/NTSR-nexe.js --version");
  if (existsSync(join(execDir, "ntsr-nexe.exe"))) {
    console.log("  dist/executables/ntsr-nexe.exe --version");
  }
} catch (error) {
  console.error("❌ NEXE build failed:", error.message);
  process.exit(1);
}
