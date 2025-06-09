#!/usr/bin/env node

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🧪 Testing NTSR version command from different directories...");

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "pipe",
      shell: true,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function testVersionCommand() {
  const ntsrPath = join(__dirname, "..", "dist", "NTSR.cjs");

  console.log(`Testing with NTSR at: ${ntsrPath}`);

  // Test 1: From project directory
  console.log("\n📁 Test 1: From project directory");
  try {
    const result1 = await runCommand("node", [ntsrPath, "--version"], {
      cwd: __dirname,
    });
    if (result1.code === 0 && result1.stdout.includes("v1.0.2")) {
      console.log("✅ SUCCESS: Version command works from project directory");
    } else {
      console.log("❌ FAILED: Version command failed from project directory");
      console.log("stdout:", result1.stdout);
      console.log("stderr:", result1.stderr);
    }
  } catch (error) {
    console.log("❌ ERROR:", error.message);
  }

  // Test 2: From temp directory
  console.log("\n📁 Test 2: From temp directory");
  const tempDir = join(__dirname, "temp-test");
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  try {
    const result2 = await runCommand("node", [ntsrPath, "--version"], {
      cwd: tempDir,
    });
    if (result2.code === 0 && result2.stdout.includes("v1.0.2")) {
      console.log("✅ SUCCESS: Version command works from temp directory");
    } else {
      console.log("❌ FAILED: Version command failed from temp directory");
      console.log("stdout:", result2.stdout);
      console.log("stderr:", result2.stderr);
    }
  } catch (error) {
    console.log("❌ ERROR:", error.message);
  }

  // Test 3: From system temp directory
  console.log("\n📁 Test 3: From system temp directory");
  try {
    const result3 = await runCommand("node", [ntsrPath, "--version"], {
      cwd: process.env.TEMP || "/tmp",
    });
    if (result3.code === 0 && result3.stdout.includes("v1.0.2")) {
      console.log(
        "✅ SUCCESS: Version command works from system temp directory"
      );
    } else {
      console.log(
        "❌ FAILED: Version command failed from system temp directory"
      );
      console.log("stdout:", result3.stdout);
      console.log("stderr:", result3.stderr);
    }
  } catch (error) {
    console.log("❌ ERROR:", error.message);
  }

  console.log("\n🎉 Version command testing complete!");
}

testVersionCommand().catch(console.error);
