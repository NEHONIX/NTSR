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

console.log("🔨 Building NTSR...");

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

  // Use esbuild to bundle everything into a single CommonJS file
  console.log("🔄 Bundling with esbuild...");
  await runCommand("npx", [
    "esbuild",
    "src/index.ts",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node16",
    "--outfile=dist/ntsr-bundle.cjs",
    "--external:esbuild",
  ]);
  console.log("✅ Bundling complete");

  // Read the bundled file
  const bundledPath = join(distDir, "ntsr-bundle.cjs");
  if (!existsSync(bundledPath)) {
    throw new Error("Bundled file not found");
  }

  let bundledCode = readFileSync(bundledPath, "utf8");
  console.log("📖 Read bundled code");

  // Read package.json to get version
  const packageJsonPath = join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;
  console.log(`📦 Embedding version: ${version}`);

  // Remove any existing shebang from the bundled code
  bundledCode = bundledCode.replace(/^#!.*\n/, "");

  // Inject version directly into the code to avoid runtime package.json lookup
  bundledCode = bundledCode.replace(/BUILD_VERSION_PLACEHOLDER/g, version);

  // Create the final executable with proper shebang and suppress warnings
  const finalCode = `#!/usr/bin/env node --no-deprecation

// NTSR - Nehonix TypeScript Runner v${version}
// Built on ${new Date().toISOString()}

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

  // Verify the build
  const { statSync } = await import("fs");
  const stats = statSync(outputPath);
  console.log(`✅ Build complete! Size: ${Math.round(stats.size / 1024)}KB`);

  console.log("\n🎉 NTSR built successfully!");
  console.log("\nTo test locally:");
  console.log("  node dist/NTSR.cjs --version");
  console.log("  node dist/NTSR.cjs test-script.ts");
} catch (error) {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
}
