import { __ext_with_comments } from "./__sys__/__allowed_ext__.js";
import { __banner__ } from "./__sys__/__banner__.js";
import { __version__ } from "./__sys__/__version.js";
import { Logger } from "./logger.js";
import { CLIOptions, ParsedArgs } from "./types";

export class CLIParser {
  private static logger: Logger;
  constructor(logger: Logger) {
    CLIParser.logger = logger.createChild("CLIParser");
  }

  /**
   * Parse command line arguments
   */
  static parseArgs(args: string[]): ParsedArgs {
    const options: CLIOptions = {};
    const scriptArgs: string[] = [];
    let scriptPath: string | undefined;
    let foundScript = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (!foundScript) {
        // Parse options before script path
        if (arg === "--help" || arg === "-h") {
          options.help = true;
        } else if (arg === "--version" || arg === "-v") {
          options.version = true;
        } else if (arg === "--verbose") {
          options.verbose = true;
        } else if (arg === "--quiet") {
          options.quiet = true;
        } else if (arg === "--no-color") {
          options.noColor = true;
        } else if (arg === "--minify") {
          options.minify = true;
        } else if (arg === "--sourcemap") {
          options.sourcemap = true;
        } else if (arg === "--force-builtin") {
          options.forceBuiltin = true;
        } else if (arg === "--show-warnings") {
          options.showWarnings = true;
        } else if (arg.startsWith("--target=")) {
          options.target = arg.split("=")[1];
        } else if (arg === "--target" && i + 1 < args.length) {
          options.target = args[++i];
        } else if (arg.startsWith("--format=")) {
          options.format = arg.split("=")[1];
        } else if (arg === "--format" && i + 1 < args.length) {
          options.format = args[++i];
        } else if (!arg.startsWith("-")) {
          // This is the script path
          scriptPath = arg;
          foundScript = true;
        }
      } else {
        // Everything after script path are script arguments
        scriptArgs.push(arg);
      }
    }

    return {
      scriptPath,
      scriptArgs,
      options,
    };
  }

  /**
   * Show help message
   */
  static showHelp(): void {
    console.log(`
${__banner__()}

DISCLAIMER:
  NTSR is primarily designed for the Fortify library ecosystem and optimized
  for fast TypeScript execution. While it can be used for general TypeScript
  development, for production applications consider using:
  • Official Microsoft TypeScript compiler (tsc)
  • Established tools like ts-node, tsx, or bun

  NTSR focuses on speed and simplicity over comprehensive tooling features.

USAGE:
  NTSR <script.ts> [script-arguments...]
  NTSR [options]

EXAMPLES:
  NTSR server.ts
  NTSR app.ts --port 3000
  NTSR script.ts arg1 arg2
  NTSR --target=es2020 --minify script.ts

OPTIONS:
  --help, -h         Show this help message
  --version, -v      Show version information
  --verbose          Enable verbose logging
  --quiet            Suppress all output except errors
  --no-color         Disable colored output
  --show-warnings    Show Node.js deprecation warnings from dependencies
  --target=<target>  Set compilation target (es2015, es2016, ..., es2022, esnext)
  --format=<format>  Set output format (esm, cjs, iife)
  --minify           Minify the output
  --sourcemap        Generate source maps
  --force-builtin    Force use of built-in transpiler (skip external runners)

CONFIGURATION:
  NTSR automatically looks for tsconfig.json in the current directory and
  parent directories, following TypeScript's standard resolution rules.

  • Found tsconfig.json: Uses your compiler options (strict, target, lib, etc.)
  • No tsconfig.json: Uses sensible defaults optimized for modern TypeScript
  • Required options (noEmit, skipLibCheck) are always enforced for performance

SUPPORTED FILE TYPES:
 ${__ext_with_comments.map((e) => `  ${e.ext} - ${e.comment}`).join("\n")}

EXECUTION STRATEGY:
  1. tsx (recommended - best compatibility and full type checking)
  2. ts-node (traditional TypeScript runner with full type checking)
  3. bun (fast JavaScript runtime)
  4. Built-in transpiler (fallback with TypeScript compiler API)

TYPE CHECKING:
  • External runners: Full TypeScript type checking with your tsconfig.json
  • Built-in mode: TypeScript compiler API with precise error reporting
  • Use --force-builtin for strict type validation before execution

INSTALLATION OF EXTERNAL RUNNERS:
  npm install -g tsx ts-node bun

For more information, visit: https://github.com/NEHONIX/NTSR
Part of the Fortify ecosystem: https://github.com/NEHONIX/FortifyJS.git
`);
  }

  private static showBanner(): void {
    console.log(__banner__());
  }
  /**
   * Show version information
   */
  static showVersion(): void {
    CLIParser.showBanner();
    console.log(`
  Built with:
    • TypeScript Compiler API for precise type checking (see: https://github.com/microsoft/TypeScript)

  Designed for the Fortify ecosystem: https://github.com/NEHONIX/FortifyJS.git
  Source code: https://github.com/NEHONIX/NTSR
`);
  }

  /**
   * Validate parsed arguments
   */
  static validateArgs(parsed: ParsedArgs): string | null {
    const { scriptPath, options } = parsed;

    // If help or version requested, no validation needed
    if (options.help || options.version) {
      return null;
    }

    // Script path is required
    if (!scriptPath) {
      return "No script file specified. Use --help for usage information.";
    }

    // Validate target option
    if (options.target) {
      const validTargets = [
        "es2015",
        "es2016",
        "es2017",
        "es2018",
        "es2019",
        "es2020",
        "es2021",
        "es2022",
        "esnext",
      ];
      if (!validTargets.includes(options.target)) {
        return `Invalid target "${
          options.target
        }". Valid targets: ${validTargets.join(", ")}`;
      }
    }

    // Validate format option
    if (options.format) {
      const validFormats = ["esm", "cjs", "iife"];
      if (!validFormats.includes(options.format)) {
        return `Invalid format "${
          options.format
        }". Valid formats: ${validFormats.join(", ")}`;
      }
    }

    return null;
  }
}
