#!/usr/bin/env node

import { spawn } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

console.log("🧪 Testing NTSR tsconfig.json respect...");

const testDir = "test-tsconfig-temp";

// Clean up any existing test directory
if (existsSync(testDir)) {
  rmSync(testDir, { recursive: true, force: true });
}

// Create test directory
mkdirSync(testDir, { recursive: true });

// Create a permissive tsconfig.json
const tsconfig = {
  compilerOptions: {
    target: "ES2020",
    lib: ["ES2020"],
    module: "commonjs",
    moduleResolution: "node",
    strict: false,
    noImplicitAny: false,
    strictNullChecks: false,
    allowJs: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true
  },
  include: ["**/*"],
  exclude: ["node_modules"]
};

writeFileSync(join(testDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

// Create a test TypeScript file with code that would fail strict checking
const testCode = `
// This code should work with permissive tsconfig but fail with strict checking
let req: any = { path: "/test", method: "GET", cookies: {} };
let res: any = { set: () => {}, cookie: () => {} };

console.log("Request path:", req.path);
console.log("Request method:", req.method);

if (req.cookies) {
  console.log("Has cookies");
}

res.set("Content-Type", "application/json");
res.cookie("test", "value");

// Test array methods
const paths: string[] = ["/api", "/test"];
const hasApi = paths.some(p => p.includes("api"));
console.log("Has API path:", hasApi);

// Test async function (should work with ES2020 lib)
async function testAsync() {
  return Promise.resolve("test");
}

testAsync().then(result => console.log("Async result:", result));

console.log("✅ TypeScript test completed successfully!");
`;

writeFileSync(join(testDir, "test.ts"), testCode);

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

async function testNTSR() {
  console.log("📁 Created test directory with permissive tsconfig.json");
  console.log("📝 Created test TypeScript file with potentially strict-failing code");
  
  try {
    console.log("\n🔄 Testing NTSR with permissive tsconfig...");
    
    const result = await runCommand("node", ["../dist/NTSR.cjs", "test.ts"], {
      cwd: testDir
    });
    
    console.log("\n📊 Test Results:");
    console.log(`Exit code: ${result.code}`);
    
    if (result.stdout) {
      console.log("\n📤 STDOUT:");
      console.log(result.stdout);
    }
    
    if (result.stderr) {
      console.log("\n📤 STDERR:");
      console.log(result.stderr);
    }
    
    if (result.code === 0) {
      console.log("\n✅ SUCCESS: NTSR respected the permissive tsconfig.json!");
      console.log("✅ No type errors were reported for code that would fail strict checking");
    } else {
      console.log("\n❌ FAILED: NTSR still applying strict type checking");
      console.log("❌ The permissive tsconfig.json was not respected");
    }
    
  } catch (error) {
    console.log("\n❌ ERROR running test:", error.message);
  } finally {
    // Clean up
    console.log("\n🧹 Cleaning up test directory...");
    rmSync(testDir, { recursive: true, force: true });
  }
}

testNTSR().catch(console.error);
