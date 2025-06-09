#!/usr/bin/env node

import { spawn } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
  rmSync,
  copyFileSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🔨 Building NTSR Standalone Executable...");

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

/**
 * Check if a command exists
 */
function commandExists(command) {
  try {
    const result = spawn("where", [command], { stdio: "pipe", shell: true });
    return new Promise((resolve) => {
      result.on("close", (code) => {
        resolve(code === 0);
      });
    });
  } catch {
    return Promise.resolve(false);
  }
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

  console.log(`📦 Building ${name} v${version}`);

  // Use esbuild to bundle everything into a single CommonJS file with aggressive optimization
  console.log("🔄 Bundling with esbuild (aggressive optimization)...");
  await runCommand("npx", [
    "esbuild",
    "src/index.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node16",
    "--outfile=dist/ntsr-bundle.cjs",
    "--external:esbuild",
    "--external:typescript", // Externalize TypeScript compiler
    "--external:@types/node",
    "--minify",
    "--tree-shaking=true",
    "--drop:console", // Remove console.log statements
    "--drop:debugger",
    "--legal-comments=none",
    "--keep-names=false",
  ]);
  console.log("✅ Bundling complete");

  // Read the bundled file
  const bundledPath = join(distDir, "ntsr-bundle.cjs");
  if (!existsSync(bundledPath)) {
    throw new Error("Bundled file not found" + bundledPath);
  }

  let bundledCode = readFileSync(bundledPath, "utf8");
  console.log("📖 Read bundled code");

  // Remove any existing shebang from the bundled code
  bundledCode = bundledCode.replace(/^#!.*\n/, "");

  // Inject version directly into the code to avoid runtime package.json lookup
  bundledCode = bundledCode.replace(/BUILD_VERSION_PLACEHOLDER/g, version);

  // Create the final executable with proper shebang and suppress warnings
  const finalCode = `#!/usr/bin/env node --no-deprecation

// NTSR - Nehonix TypeScript Runner v${version}
// Built on ${new Date().toISOString()}
// Standalone executable - no external dependencies required

${bundledCode}`;

  // Write the bundled executable
  const outputPath = join(distDir, "NTSR.cjs");
  writeFileSync(outputPath, finalCode, "utf8");
  console.log("📦 Created bundle: dist/NTSR.cjs");

  // Make the file executable on Unix systems
  try {
    chmodSync(outputPath, 0o755);
    console.log("🔧 Made file executable");
  } catch (error) {
    console.log("⚠️  Could not make file executable (Windows?)");
  }

  // Check if pkg is available for creating native executables
  const pkgAvailable = await commandExists("pkg");

  if (pkgAvailable) {
    console.log("🔄 Creating native executables with pkg...");

    // Create package.json for pkg
    const pkgPackageJson = {
      name: name,
      version: version,
      main: "NTSR.cjs",
      bin: "NTSR.cjs",
      author: "NEHONIX",
      pkg: {
        scripts: ["NTSR.cjs"],
        targets: ["node16-win-x64", "node16-linux-x64", "node16-macos-x64"],
        outputPath: "dist/executables",
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
      // Build Windows executable
      await runCommand(
        "npx",
        [
          "pkg",
          outputPath,
          "--target",
          "node16-win-x64",
          "--output",
          join(execDir, "ntsr.exe"),
        ],
        { cwd: distDir }
      );
      console.log("✅ Windows executable created: dist/executables/ntsr.exe");

      // Build Linux executable
      await runCommand(
        "npx",
        [
          "pkg",
          outputPath,
          "--target",
          "node16-linux-x64",
          "--output",
          join(execDir, "ntsr-linux"),
        ],
        { cwd: distDir }
      );
      console.log("✅ Linux executable created: dist/executables/ntsr-linux");

      // Build macOS executable
      await runCommand(
        "npx",
        [
          "pkg",
          outputPath,
          "--target",
          "node16-macos-x64",
          "--output",
          join(execDir, "ntsr-macos"),
        ],
        { cwd: distDir }
      );
      console.log("✅ macOS executable created: dist/executables/ntsr-macos");
    } catch (error) {
      console.log(
        "⚠️  Failed to create some native executables:",
        error.message
      );
    }
  } else {
    console.log(
      "ℹ️  pkg not available. To create native executables, install pkg:"
    );
    console.log("   npm install -g pkg");
    console.log("   Then run this script again.");
  }

  // Verify the build
  const { statSync } = await import("fs");
  const stats = statSync(outputPath);
  console.log(`✅ Build complete! Size: ${Math.round(stats.size / 1024)}KB`);

  console.log("\n🎉 NTSR built successfully!");
  console.log("\nTo test locally:");
  console.log("  node dist/NTSR.cjs --version");
  console.log("  node dist/NTSR.cjs test-script.ts");

  if (pkgAvailable) {
    console.log("\nNative executables available in dist/executables/");
    console.log("  Windows: ntsr.exe");
    console.log("  Linux: ntsr-linux");
    console.log("  macOS: ntsr-macos");
  }
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
