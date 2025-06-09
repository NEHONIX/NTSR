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

console.log("🔨 Building NTSR Ultra-Compact Executable...");

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

  // Read package.json to get version and info
  const packageJsonPath = join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;
  const name = packageJson.name;

  console.log(`📦 Building ${name} v${version} (Ultra-Compact)`);

  // Create a minimal version that only includes essential functionality
  console.log("🔄 Creating minimal bundle...");

  // First, create a minimal entry point
  const minimalEntry = `
// Minimal NTSR entry point
import { CLIParser } from "./cli.js";
import { NTSRRunner } from "./runner.js";

async function main() {
  const args = process.argv.slice(2);
  const parsed = CLIParser.parseArgs(args);

  if (parsed.options.help) {
    CLIParser.showHelp();
    return;
  }

  if (parsed.options.version) {
    CLIParser.showVersion();
    return;
  }

  if (!parsed.scriptPath) {
    console.error("No script file specified. Use --help for usage information.");
    process.exit(1);
  }

  const runner = new NTSRRunner(parsed.options);
  try {
    await runner.run(parsed.scriptPath, parsed.scriptArgs, parsed.options);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
`;

  writeFileSync(join(__dirname, "src", "minimal.ts"), minimalEntry);

  // Use esbuild with maximum compression
  await runCommand("npx", [
    "esbuild",
    "src/minimal.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node16",
    "--outfile=dist/ntsr-minimal.cjs",
    "--external:typescript", // Don't bundle TypeScript compiler
    "--external:esbuild",
    "--minify",
    "--tree-shaking=true",
    "--drop:console",
    "--drop:debugger",
    "--legal-comments=none",
    "--keep-names=false",
    "--mangle-props=^_",
  ]);
  console.log("✅ Minimal bundling complete");

  // Read the bundled file
  const bundledPath = join(distDir, "ntsr-minimal.cjs");
  if (!existsSync(bundledPath)) {
    throw new Error("Bundled file not found");
  }

  let bundledCode = readFileSync(bundledPath, "utf8");
  console.log("📖 Read minimal bundled code");

  // Remove any existing shebang from the bundled code
  bundledCode = bundledCode.replace(/^#!.*\n/, "");

  // Inject version directly into the code
  bundledCode = bundledCode.replace(/BUILD_VERSION_PLACEHOLDER/g, version);

  // Create the final executable with proper shebang
  const finalCode = `#!/usr/bin/env node
// NTSR v${version} - Ultra-Compact
${bundledCode}`;

  // Write the bundled executable
  const outputPath = join(distDir, "NTSR-small.cjs");
  writeFileSync(outputPath, finalCode, "utf8");
  console.log("📦 Created compact bundle: dist/NTSR-small.cjs");

  // Make the file executable on Unix systems
  try {
    chmodSync(outputPath, 0o755);
    console.log("🔧 Made file executable");
  } catch (error) {
    console.log("⚠️  Could not make file executable (Windows?)");
  }

  // Create ultra-compact executables with pkg
  console.log("🔄 Creating ultra-compact executables...");

  // Create package.json for pkg with compression options
  const pkgPackageJson = {
    name: name,
    version: version,
    main: "NTSR-small.cjs",
    bin: "NTSR-small.cjs",
    pkg: {
      scripts: ["NTSR-small.cjs"],
      targets: ["node16-win-x64", "node16-linux-x64", "node16-macos-x64"],
      outputPath: "dist/executables",
      options: ["--compress", "--no-bytecode"],
    },
  };

  writeFileSync(
    join(distDir, "package.json"),
    JSON.stringify(pkgPackageJson, null, 2)
  );

  // Create executables directory
  const execDir = join(distDir, "executables");
  mkdirSync(execDir, { recursive: true });

  try {
    // Build Windows executable with compression
    await runCommand(
      "npx",
      [
        "pkg",
        outputPath,
        "--target",
        "node16-win-x64",
        "--output",
        join(execDir, "ntsr-small.exe"),
        "--compress",
        "Brotli",
      ],
      { cwd: distDir }
    );
    console.log("✅ Compact Windows executable created");

    // Build Linux executable with compression
    await runCommand(
      "npx",
      [
        "pkg",
        outputPath,
        "--target",
        "node16-linux-x64",
        "--output",
        join(execDir, "ntsr-small-linux"),
        "--compress",
        "Brotli",
      ],
      { cwd: distDir }
    );
    console.log("✅ Compact Linux executable created");

    // Build macOS executable with compression
    await runCommand(
      "npx",
      [
        "pkg",
        outputPath,
        "--target",
        "node16-macos-x64",
        "--output",
        join(execDir, "ntsr-small-macos"),
        "--compress",
        "Brotli",
      ],
      { cwd: distDir }
    );
    console.log("✅ Compact macOS executable created");
  } catch (error) {
    console.log(
      "⚠️  Some compression options may not be available:",
      error.message
    );
    console.log("🔄 Trying without compression flags...");

    // Fallback without compression flags
    await runCommand(
      "npx",
      [
        "pkg",
        outputPath,
        "--target",
        "node16-win-x64",
        "--output",
        join(execDir, "ntsr-small.exe"),
      ],
      { cwd: distDir }
    );
    await runCommand(
      "npx",
      [
        "pkg",
        outputPath,
        "--target",
        "node16-linux-x64",
        "--output",
        join(execDir, "ntsr-small-linux"),
      ],
      { cwd: distDir }
    );
    await runCommand(
      "npx",
      [
        "pkg",
        outputPath,
        "--target",
        "node16-macos-x64",
        "--output",
        join(execDir, "ntsr-small-macos"),
      ],
      { cwd: distDir }
    );
  }

  // Verify the build and show size comparison
  const { statSync } = await import("fs");
  const stats = statSync(outputPath);
  console.log(
    `✅ Compact build complete! Bundle size: ${Math.round(stats.size / 1024)}KB`
  );

  // Show executable sizes
  try {
    const winStats = statSync(join(execDir, "ntsr-small.exe"));
    const linuxStats = statSync(join(execDir, "ntsr-small-linux"));
    const macStats = statSync(join(execDir, "ntsr-small-macos"));

    console.log("\n📊 Executable sizes:");
    console.log(`  Windows: ${Math.round(winStats.size / 1024 / 1024)}MB`);
    console.log(`  Linux: ${Math.round(linuxStats.size / 1024 / 1024)}MB`);
    console.log(`  macOS: ${Math.round(macStats.size / 1024 / 1024)}MB`);
  } catch (error) {
    console.log("Could not read executable sizes");
  }

  console.log("\n🎉 Ultra-compact NTSR built successfully!");
  console.log("\nTo test:");
  console.log("  node dist/NTSR-small.cjs --version");
  console.log("  dist/executables/ntsr-small.exe --version");

  // Clean up temporary file
  try {
    rmSync(join(__dirname, "src", "minimal.ts"));
  } catch {}
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
