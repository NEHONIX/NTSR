import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve, extname } from "path";
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
   * Run script with external runner
   */
  private async runWithExternalRunner(
    runner: string,
    scriptPath: string,
    args: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // this.logger.info(`Using external runner: ${runner}`);

      const child = spawn(runner, [scriptPath, ...args], {
        stdio: ["inherit", "inherit", "pipe"], // Capture stderr for error analysis
        shell: true,
      });

      let stderr = "";

      child.stderr?.on("data", (data) => {
        const output = data.toString();
        stderr += output;
        // Show errors in real-time
        process.stderr.write(output);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Check if this looks like a TypeScript error
          const isTypeScriptError = this.isTypeScriptError(stderr);
          const errorMessage = isTypeScriptError
            ? `TypeScript compilation failed`
            : `${runner} exited with code ${code}`;

          reject(new Error(errorMessage));
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to run ${runner}: ${error.message}`));
      });
    });
  }

  /**
   * Check if stderr output indicates TypeScript compilation errors
   */
  private isTypeScriptError(stderr: string): boolean {
    const typeScriptErrorPatterns = [
      /error TS\d+:/i,
      /Type '.+' is not assignable to type/i,
      /Cannot find name/i,
      /Property '.+' does not exist on type/i,
      /Argument of type '.+' is not assignable to parameter/i,
      /Type '.+' has no properties in common with type/i,
      /Cannot find module/i,
      /Duplicate identifier/i,
    ];

    return typeScriptErrorPatterns.some((pattern) => pattern.test(stderr));
  }

  /**
   * Run JavaScript file with Node.js
   */
  private async runJavaScript(jsPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("node", [jsPath, ...args], {
        stdio: "inherit",
        shell: true,
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Script exited with code ${code}`));
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
      // Resolve script path
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
        await this.runJavaScript(resolvedPath, args);
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

      // Always perform type checking first (unless explicitly disabled)
      if (!options.skipTypeCheck) {
        // this.logger.step("Performing type checking");
        try {
          const tsCode = readFileSync(resolvedPath, "utf8");
          const diagnostics = this.transpiler.performTypeCheck(
            tsCode,
            resolvedPath
          );

          // Filter out library-related errors and focus on user code errors
          const userErrors = diagnostics.filter((diagnostic) => {
            const message = ts.flattenDiagnosticMessageText(
              diagnostic.messageText,
              "\n"
            );
            // Skip common library/environment errors that don't indicate real user code issues
            const isLibraryError =
              message.includes("Cannot find global type") ||
              message.includes("Cannot find name 'console'") ||
              message.includes("Cannot find name 'process'") ||
              message.includes("Cannot find type definition file for 'node'") ||
              message.includes("lib.dom.d.ts") ||
              message.includes("lib.es") ||
              message.includes("rootDir") ||
              message.includes("Entry point of type library") ||
              message.includes("Library '") ||
              message.includes("specified in compilerOptions");
            return !isLibraryError;
          });

          if (userErrors.length > 0) {
            this.logger.stepFailed("Type checking failed");
            const errorMessages = userErrors.map(
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
                  return `${resolvedPath}:${line + 1}:${
                    character + 1
                  } - ${message}`;
                }
                return `${resolvedPath} - ${message}`;
              }
            );

            this.logger.typeScriptError(resolvedPath, errorMessages);
            throw new Error(`TypeScript compilation errors found`);
          }

          // this.logger.stepSuccess("Type checking passed");
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("TypeScript compilation errors")
          ) {
            throw error;
          }
          // If type checking fails for other reasons, warn but continue
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

              // For runtime errors, try the next runner
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
      this.logger.info("Using built-in esbuild transpiler");

      const transpileOptions: TranspileOptions = {
        target: (options.target as any) || "es2022",
        format: (options.format as any) || "esm",
        minify: options.minify || false,
        sourcemap: options.sourcemap || false,
      };

      const tempJsPath = await this.transpiler.transpileToTempFile(
        resolvedPath,
        transpileOptions
      );
      this.logger.verbose(`Created temporary file: ${tempJsPath}`);

      await this.runJavaScript(tempJsPath, args);
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
      builtin: true, // esbuild is always available as a dependency
    };
  }
}
