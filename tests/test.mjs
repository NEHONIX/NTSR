#!/usr/bin/env node

import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class NTSRTester {
  constructor() {
    this.testFiles = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message) {
    console.log(`[TEST] ${message}`);
  }

  error(message) {
    console.error(`[ERROR] ${message}`);
  }

  success(message) {
    console.log(`✅ ${message}`);
    this.passed++;
  }

  fail(message) {
    console.error(`❌ ${message}`);
    this.failed++;
  }

  // Create a test file
  createTestFile(filename, content) {
    const testDir = join(__dirname, "test-files");
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    const filePath = join(testDir, filename);
    writeFileSync(filePath, content, "utf8");
    this.testFiles.push(filePath);
    return filePath;
  }

  // Clean up test files
  cleanup() {
    for (const file of this.testFiles) {
      try {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    this.testFiles = [];
  }

  // Run NTSR command and capture output
  async runNTSR(args, expectSuccess = true) {
    return new Promise((resolve) => {
      const ntsrPath = join(__dirname, "dist", "NTSR.cjs");
      const child = spawn("node", [ntsrPath, ...args], {
        stdio: "pipe",
        shell: true,
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
        resolve({
          code,
          stdout,
          stderr,
          success: expectSuccess ? code === 0 : code !== 0,
        });
      });

      child.on("error", (error) => {
        resolve({
          code: -1,
          stdout,
          stderr: stderr + error.message,
          success: false,
        });
      });
    });
  }

  // Test basic TypeScript functionality
  async testBasicTypeScript() {
    this.log("Testing basic TypeScript execution...");

    const testScript = this.createTestFile(
      "basic.ts",
      `
interface Config {
  name: string;
  version: string;
}

const config: Config = {
  name: "test-app",
  version: "1.0.0"
};

console.log(\`Hello from \${config.name} v\${config.version}\`);
`
    );

    const result = await this.runNTSR([testScript]);

    if (
      result.success &&
      result.stdout.includes("Hello from test-app v1.0.0")
    ) {
      this.success("Basic TypeScript execution works");
    } else {
      this.fail(
        `Basic TypeScript execution failed. Code: ${result.code}, Output: ${result.stdout}, Error: ${result.stderr}`
      );
    }
  }

  // Test advanced TypeScript features
  async testAdvancedTypeScript() {
    this.log("Testing advanced TypeScript features...");

    const testScript = this.createTestFile(
      "advanced.ts",
      `
enum Status {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed"
}

interface Task<T> {
  id: number;
  data: T;
  status: Status;
}

class TaskManager<T> {
  private tasks: Task<T>[] = [];

  addTask(data: T): Task<T> {
    const task: Task<T> = {
      id: this.tasks.length + 1,
      data,
      status: Status.PENDING
    };
    this.tasks.push(task);
    return task;
  }

  getTasks(): Task<T>[] {
    return this.tasks;
  }
}

const manager = new TaskManager<string>();
manager.addTask("Test task 1");
manager.addTask("Test task 2");

console.log(\`Created \${manager.getTasks().length} tasks\`);
console.log(\`First task status: \${manager.getTasks()[0].status}\`);
`
    );

    const result = await this.runNTSR([testScript]);

    if (
      result.success &&
      result.stdout.includes("Created 2 tasks") &&
      result.stdout.includes("First task status: pending")
    ) {
      this.success("Advanced TypeScript features work");
    } else {
      this.fail(
        `Advanced TypeScript test failed. Output: ${result.stdout}, Error: ${result.stderr}`
      );
    }
  }

  // Test with command line arguments
  async testWithArguments() {
    this.log("Testing with command line arguments...");

    const testScript = this.createTestFile(
      "args.ts",
      `
const args: string[] = process.argv.slice(2);
console.log('Arguments received:', args.join(', '));
console.log('First arg:', args[0] || 'none');
console.log('Second arg:', args[1] || 'none');
`
    );

    const result = await this.runNTSR([testScript, "hello", "world"]);

    if (
      result.success &&
      result.stdout.includes("Arguments received: hello, world") &&
      result.stdout.includes("First arg: hello") &&
      result.stdout.includes("Second arg: world")
    ) {
      this.success("Command line arguments work");
    } else {
      this.fail(
        `Arguments test failed. Output: ${result.stdout}, Error: ${result.stderr}`
      );
    }
  }

  // Test error handling
  async testErrorHandling() {
    this.log("Testing error handling...");

    // Test with non-existent file
    const result1 = await this.runNTSR(["non-existent-file.ts"], false);

    if (
      !result1.success &&
      (result1.stderr.includes("Script file not found") ||
        result1.stderr.includes("NTSR Error"))
    ) {
      this.success("Non-existent file error handling works");
    } else {
      this.fail(
        `Error handling failed for non-existent file. Code: ${result1.code}, Error: ${result1.stderr}`
      );
    }
  }

  // Test help and version
  async testHelpAndVersion() {
    this.log("Testing help and version commands...");

    // Test version
    const versionResult = await this.runNTSR(["--version"]);
    if (versionResult.success && versionResult.stdout.includes("NTSR v1.0.0")) {
      this.success("Version command works");
    } else {
      this.fail(`Version command failed. Output: ${versionResult.stdout}`);
    }

    // Test help
    const helpResult = await this.runNTSR(["--help"]);
    if (
      helpResult.success &&
      helpResult.stdout.includes("NTSR - Nehonix TypeScript Runner")
    ) {
      this.success("Help command works");
    } else {
      this.fail(`Help command failed. Output: ${helpResult.stdout}`);
    }
  }

  // Test JavaScript file execution
  async testJavaScriptExecution() {
    this.log("Testing JavaScript file execution...");

    const testScript = this.createTestFile(
      "test.js",
      `
console.log('JavaScript execution works!');
console.log('Process args:', process.argv.slice(2).join(' '));
`
    );

    const result = await this.runNTSR([testScript, "test", "args"]);

    if (
      result.success &&
      result.stdout.includes("JavaScript execution works!") &&
      result.stdout.includes("Process args: test args")
    ) {
      this.success("JavaScript file execution works");
    } else {
      this.fail(
        `JavaScript execution failed. Output: ${result.stdout}, Error: ${result.stderr}`
      );
    }
  }

  // Run all tests
  async runAllTests() {
    console.log("🧪 Starting NTSR tests...\n");

    // Check if NTSR is built
    const ntsrPath = join(__dirname, "dist", "NTSR.cjs");
    if (!existsSync(ntsrPath)) {
      this.error('NTSR not built. Run "npm run build" first.');
      return false;
    }

    try {
      await this.testHelpAndVersion();
      await this.testBasicTypeScript();
      await this.testAdvancedTypeScript();
      await this.testWithArguments();
      await this.testJavaScriptExecution();
      await this.testErrorHandling();

      console.log("\n📊 Test Results:");
      console.log(`✅ Passed: ${this.passed}`);
      console.log(`❌ Failed: ${this.failed}`);
      console.log(`📈 Total: ${this.passed + this.failed}`);

      if (this.failed === 0) {
        console.log("\n🎉 All tests passed!");
        return true;
      } else {
        console.log("\n💥 Some tests failed!");
        return false;
      }
    } catch (error) {
      this.error(`Test execution failed: ${error.message}`);
      return false;
    } finally {
      this.cleanup();
    }
  }
}

// Main execution
async function main() {
  const tester = new NTSRTester();
  const success = await tester.runAllTests();
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal test error:", error);
  process.exit(1);
});
