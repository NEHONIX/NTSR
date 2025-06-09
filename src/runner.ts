import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve, extname, dirname, join } from "path";
import * as ts from "typescript";
import { TypeScriptTranspiler } from "./transpiler.js";
import { RunnerOptions, TranspileOptions } from "./types/index.js";
import { Logger, LogLevel } from "./logger.js";

export class NTSRRunner {
  private transpiler: TypeScriptTranspiler;
  private logger: Logger;

  constructor(options: RunnerOptions = {}) {
    // Create logger with appropriate level
    let logLevel = LogLevel.INFO;
    if (options.quiet) {
      logLevel = LogLevel.ERROR;
    } else if (options.verbose) {
      logLevel = LogLevel.VERBOSE;
    }

    this.logger = new Logger({
      level: logLevel,
      colors: !options.noColor,
      prefix: "NTSR",
    });

    this.transpiler = new TypeScriptTranspiler(this.logger);
  }

  /**
   * Check if an external runner is available
   */
  private async checkExternalRunner(runner: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(runner, ["--version"], {
        stdio: "ignore",
        shell: true,
      });

      child.on("close", (code) => {
        resolve(code === 0);
      });

      child.on("error", () => {
        resolve(false);
      });
    });
  }

  /**
   * Parse TypeScript diagnostic to determine if it's a compilation error
   */
  private parseTypeScriptDiagnostic(stderr: string): {
    hasTypeScriptErrors: boolean;
    diagnostics: Array<{
      file?: string;
      line?: number;
      character?: number;
      code: number;
      category: ts.DiagnosticCategory;
      message: string;
    }>;
  } {
    const diagnostics: Array<{
      file?: string;
      line?: number;
      character?: number;
      code: number;
      category: ts.DiagnosticCategory;
      message: string;
    }> = [];

    // Use TypeScript's own diagnostic parsing approach
    const lines = stderr.split("\n");
    let hasTypeScriptErrors = false;

    for (const line of lines) {
      // Match TypeScript error format: file(line,char): error TSxxxx: message
      const tsErrorMatch = line.match(
        /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s*(.+)$/
      );
      if (tsErrorMatch) {
        const [, file, lineNum, charNum, severity, code, message] =
          tsErrorMatch;
        const diagnostic = {
          file,
          line: parseInt(lineNum, 10),
          character: parseInt(charNum, 10),
          code: parseInt(code, 10),
          category:
            severity === "error"
              ? ts.DiagnosticCategory.Error
              : ts.DiagnosticCategory.Warning,
          message: message.trim(),
        };

        diagnostics.push(diagnostic);

        if (diagnostic.category === ts.DiagnosticCategory.Error) {
          hasTypeScriptErrors = true;
        }
      }
      // Also match simpler format: error TSxxxx: message
      else {
        const simpleErrorMatch = line.match(
          /^(error|warning)\s+TS(\d+):\s*(.+)$/
        );
        if (simpleErrorMatch) {
          const [, severity, code, message] = simpleErrorMatch;
          const diagnostic = {
            code: parseInt(code, 10),
            category:
              severity === "error"
                ? ts.DiagnosticCategory.Error
                : ts.DiagnosticCategory.Warning,
            message: message.trim(),
          };

          diagnostics.push(diagnostic);

          if (diagnostic.category === ts.DiagnosticCategory.Error) {
            hasTypeScriptErrors = true;
          }
        }
      }
    }

    return { hasTypeScriptErrors, diagnostics };
  }

  /**
   * Filter diagnostics to exclude common library/environment issues
   */
  private filterRelevantDiagnostics(
    diagnostics: ts.Diagnostic[]
  ): ts.Diagnostic[] {
    return diagnostics.filter((diagnostic) => {
      // Use TypeScript's diagnostic categories and codes instead of regex
      const code = diagnostic.code;

      // Common library/environment diagnostic codes to ignore
      const ignoredCodes = new Set([
        2304, // Cannot find name (for globals like 'console', 'process')
        2318, // Cannot find global type
        2307, // Cannot find module (for @types packages)
        2345, // Argument of type is not assignable (often library related)
        6053, // File is a CommonJS module
        6059, // rootDir is expected to contain all source files
        5023, // Unknown compiler option
        5024, // Compiler option requires a value
        1005, // Expected ';'
        1009, // Trailing separator not allowed
      ]);

      if (ignoredCodes.has(code)) {
        return false;
      }

      // Check if diagnostic is related to library files
      if (diagnostic.file) {
        const fileName = diagnostic.file.fileName;

        // Skip diagnostics from library files
        if (
          fileName.includes("node_modules") ||
          fileName.includes("lib.dom.d.ts") ||
          fileName.includes("lib.es") ||
          fileName.endsWith(".d.ts")
        ) {
          return false;
        }
      }

      // Use TypeScript's diagnostic category to filter
      return diagnostic.category === ts.DiagnosticCategory.Error;
    });
  }

  /**
   * Enhanced type checking with better diagnostic filtering
   */
  private performEnhancedTypeCheck(filePath: string): ts.Diagnostic[] {
    try {
      // Use the transpiler's type checking which reads tsconfig.json
      const tsCode = readFileSync(filePath, "utf8");
      const diagnostics = this.transpiler.performTypeCheck(tsCode, filePath);
      return diagnostics;
    } catch (error) {
      this.logger.warn(
        `Enhanced type checking failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Run script with external runner
   */
  private async runWithExternalRunner(
    runner: string,
    scriptPath: string,
    args: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(runner, [scriptPath, ...args], {
        stdio: ["inherit", "inherit", "pipe"],
        shell: true,
      });

      let stderr = "";

      child.stderr?.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Use TypeScript diagnostic parsing instead of regex
          const { hasTypeScriptErrors, diagnostics } =
            this.parseTypeScriptDiagnostic(stderr);

          if (hasTypeScriptErrors) {
            // Log structured diagnostic information
            for (const diagnostic of diagnostics) {
              if (diagnostic.category === ts.DiagnosticCategory.Error) {
                const location =
                  diagnostic.file && diagnostic.line && diagnostic.character
                    ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.character}`
                    : diagnostic.file || "unknown";
                this.logger.error(
                  `TS${diagnostic.code}: ${diagnostic.message} (${location})`
                );
              }
            }
            reject(
              new Error(
                `TypeScript compilation failed with ${
                  diagnostics.filter(
                    (d) => d.category === ts.DiagnosticCategory.Error
                  ).length
                } error(s)`
              )
            );
          } else {
            reject(new Error(`${runner} exited with code ${code}`));
          }
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to run ${runner}: ${error.message}`));
      });
    });
  }

  /**
   * Run JavaScript file with Node.js
   */
  private async runJavaScript(
    jsPath: string,
    args: string[],
    originalPath: string,
    workingDirectory?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up environment for proper module resolution
      const env = { ...process.env };

      if (workingDirectory) {
        // Add the project's node_modules to NODE_PATH for module resolution
        const nodeModulesPath = join(workingDirectory, "node_modules");
        const parentNodeModulesPath = join(
          workingDirectory,
          "..",
          "node_modules"
        );

        // Set NODE_PATH to include both local and parent node_modules
        const existingNodePath = env.NODE_PATH || "";
        const nodePaths: string[] = [nodeModulesPath, parentNodeModulesPath];
        if (existingNodePath) {
          nodePaths.push(existingNodePath);
        }
        env.NODE_PATH = nodePaths.join(
          process.platform === "win32" ? ";" : ":"
        );

        this.logger.verbose(`Set NODE_PATH to: ${env.NODE_PATH}`);
      }

      const child = spawn("node", [jsPath, ...args], {
        stdio: "inherit",
        shell: true,
        cwd: workingDirectory, // Set working directory for proper module resolution
        env, // Use modified environment with NODE_PATH
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`Script exited with code ${code} \n at ${originalPath}`)
          );
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to run script: ${error.message}`));
      });
    });
  }

  /**
   * Main execution method
   */
  async run(
    scriptPath: string,
    args: string[] = [],
    options: RunnerOptions = {}
  ): Promise<void> {
    try {
      const resolvedPath = resolve(scriptPath);

      if (!existsSync(resolvedPath)) {
        this.logger.stepFailed(`Script file not found: ${scriptPath}`);
        this.logger.error(`Could not find file: ${resolvedPath}`);
        this.logger.info("Please check the file path and try again.");
        throw new Error(`Script file not found: ${scriptPath}`);
      }

      const ext = extname(resolvedPath).toLowerCase();

      // If it's already a JavaScript file, run it directly
      if ([".js", ".mjs", ".cjs"].includes(ext)) {
        this.logger.info(`Running JavaScript file directly: ${resolvedPath}`);
        await this.runJavaScript(resolvedPath, args, scriptPath);
        return;
      }

      // Check if it's a supported TypeScript file
      if (![".ts", ".tsx"].includes(ext)) {
        this.logger.stepFailed(`Unsupported file type: ${ext}`);
        this.logger.error(
          `Unsupported file type: ${ext}. Expected .ts, .tsx, .js, .mjs, or .cjs`
        );
        throw new Error(`Unsupported file type: ${ext}`);
      }

      this.logger.info(`Processing TypeScript file: ${resolvedPath}`);

      // Enhanced type checking with better diagnostic filtering
      if (!options.skipTypeCheck) {
        try {
          const diagnostics = this.performEnhancedTypeCheck(resolvedPath);

          if (diagnostics.length > 0) {
            this.logger.stepFailed("Type checking failed");

            const errorMessages = diagnostics.map(
              (diagnostic: ts.Diagnostic) => {
                const message = ts.flattenDiagnosticMessageText(
                  diagnostic.messageText,
                  "\n"
                );

                if (diagnostic.file && diagnostic.start !== undefined) {
                  const { line, character } =
                    diagnostic.file.getLineAndCharacterOfPosition(
                      diagnostic.start
                    );
                  return `TS${diagnostic.code}: ${message} (${
                    diagnostic.file.fileName
                  }:${line + 1}:${character + 1})`;
                }

                return `TS${diagnostic.code}: ${message}`;
              }
            );

            this.logger.typeScriptError(resolvedPath, errorMessages);
            throw new Error(
              `TypeScript compilation errors found: ${diagnostics.length} error(s)`
            );
          }
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("TypeScript compilation errors")
          ) {
            throw error;
          }
          this.logger.warn(
            `Type checking failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      // Try external runners first (unless forced to use builtin)
      if (!options.forceBuiltin) {
        const externalRunners = ["tsx", "ts-node", "bun"];

        for (const runner of externalRunners) {
          if (await this.checkExternalRunner(runner)) {
            try {
              await this.runWithExternalRunner(runner, resolvedPath, args);
              return;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              this.logger.warn(`${runner} failed: ${errorMessage}`);
              continue;
            }
          }
        }
      } else {
        this.logger.info(
          "Skipping external runners (--force-builtin specified)"
        );
      }

      // Fall back to built-in transpilation
      this.logger.verbose("Using built-in esbuild transpiler");

      // Get format from tsconfig.json if available
      const searchPath = dirname(resolve(resolvedPath));
      const tsConfig = this.transpiler
        .getTSConfigReader()
        .findAndReadConfig(searchPath);

      let defaultFormat = "esm";
      if (tsConfig.compilerOptions.module === ts.ModuleKind.CommonJS) {
        defaultFormat = "cjs";
      }

      this.logger.verbose(
        `Detected module format from tsconfig: ${defaultFormat} (module kind: ${tsConfig.compilerOptions.module})`
      );
      this.logger.verbose(
        `Available module kinds: CommonJS=${ts.ModuleKind.CommonJS}, ESNext=${ts.ModuleKind.ESNext}`
      );

      const transpileOptions: TranspileOptions = {
        target: (options.target as any) || "es2022",
        format: (options.format as any) || defaultFormat,
        minify: options.minify || false,
        sourcemap: options.sourcemap || false,
      };

      const tempJsPath = await this.transpiler.transpileToTempFile(
        resolvedPath,
        transpileOptions
      );
      this.logger.verbose(`Created temporary file: ${tempJsPath}`);

      // Run from the original project directory to ensure proper module resolution
      const projectDirectory = dirname(resolvedPath);
      this.logger.verbose(
        `Running from project directory: ${projectDirectory}`
      );

      await this.runJavaScript(tempJsPath, args, scriptPath, projectDirectory);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Clean up temporary files
   */
  cleanup(): void {
    this.transpiler.cleanup();
  }

  /**
   * Get information about available runners
   */
  async getRunnerInfo(): Promise<{
    external: { name: string; available: boolean }[];
    builtin: boolean;
  }> {
    const externalRunners = ["tsx", "ts-node", "bun"];
    const external = await Promise.all(
      externalRunners.map(async (name) => ({
        name,
        available: await this.checkExternalRunner(name),
      }))
    );

    return {
      external,
      builtin: true,
    };
  }
}
