#!/usr/bin/env node

// Suppress Node.js deprecation warnings from dependencies by default
// This can be overridden with --show-warnings flag
let suppressWarnings = true;

function setupWarningHandling(showWarnings: boolean = false) {
  if (!showWarnings && suppressWarnings) {
    process.removeAllListeners("warning");
    process.on("warning", (warning) => {
      // Only suppress deprecation warnings, allow other warnings through
      if (warning.name !== "DeprecationWarning") {
        console.warn(warning.message);
      }
    });
  }
}

import { NTSRRunner } from "./runner.js";
import { CLIParser } from "./cli.js";
import { Logger, LogLevel } from "./logger.js";

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = CLIParser.parseArgs(args);

  // Setup warning handling based on CLI options
  setupWarningHandling(parsed.options.showWarnings);

  // Create logger for main function
  let logLevel = LogLevel.INFO;
  if (parsed.options.quiet) {
    logLevel = LogLevel.ERROR;
  } else if (parsed.options.verbose) {
    logLevel = LogLevel.VERBOSE;
  }

  const logger = new Logger({
    level: logLevel,
    colors: !parsed.options.noColor,
    prefix: "NTSR",
  });

  // Handle help and version (these use plain output, not logger)
  if (parsed.options.help) {
    CLIParser.showHelp();
    return;
  }

  if (parsed.options.version) {
    CLIParser.showVersion();
    return;
  }

  // Validate arguments
  const validationError = CLIParser.validateArgs(parsed);
  if (validationError) {
    logger.error(validationError);
    process.exit(1);
  }

  // Ensure we have a script path
  if (!parsed.scriptPath) {
    logger.error("No script file specified");
    CLIParser.showHelp();
    process.exit(1);
  }

  // Create runner and execute
  const runner = new NTSRRunner(parsed.options);

  try {
    await runner.run(parsed.scriptPath, parsed.scriptArgs, parsed.options);
  } catch (error) {
    // Error already logged by runner
    process.exit(1);
  }
}

/**
 * Handle process termination gracefully
 */
function setupSignalHandlers(): void {
  // Create a basic logger for signal handling (always visible)
  const logger = new Logger({
    level: LogLevel.INFO,
    colors: true,
    prefix: "NTSR",
  });

  const cleanup = () => {
    logger.info("\nReceived termination signal, cleaning up...");
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught Exception: ${error.message}`);
    logger.verbose(error.stack || "No stack trace available");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error(`Unhandled Rejection: ${reason}`);
    logger.verbose(`Promise: ${promise}`);
    process.exit(1);
  });
}

// Run if this is the main module
// Check for both ESM and CommonJS environments
const isMainModule =
  // ESM check
  (typeof import.meta !== "undefined" &&
    import.meta.url === `file://${process.argv[1]}`) ||
  // CommonJS check
  (typeof require !== "undefined" && require.main === module);

if (isMainModule) {
  setupSignalHandlers();
  main().catch((error) => {
    const logger = new Logger({
      level: LogLevel.ERROR,
      colors: true,
      prefix: "NTSR",
    });
    logger.error(
      `Fatal error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}

// Export for programmatic use
export { NTSRRunner } from "./runner.js";
export { TypeScriptTranspiler } from "./transpiler.js";
export { CLIParser } from "./cli.js";
export type { RunnerOptions } from "./types/index";
