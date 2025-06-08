import { transform } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import ts from "typescript";
import { TranspileOptions } from "./types/index.js";
import { Logger } from "./logger.js";
import { TSConfigReader } from "./tsconfig.js";
import { NehoID as ID } from "nehoid";

export class TypeScriptTranspiler {
  private tempFiles: string[] = [];
  private logger: Logger;
  private tsConfigReader: TSConfigReader;

  constructor(logger: Logger) {
    this.logger = logger.createChild("Transpiler");
    this.tsConfigReader = new TSConfigReader(this.logger);
  }

  /**
   * Public method to perform type checking
   */
  performTypeCheck(tsCode: string, filename: string): ts.Diagnostic[] {
    return this.typeCheck(tsCode, filename);
  }

  /**
   * Perform TypeScript type checking using the official compiler API approach
   */
  private typeCheck(tsCode: string, filename: string): ts.Diagnostic[] {
    try {
      this.logger.verbose("Starting TypeScript type checking");

      // Read tsconfig.json or use defaults
      const tsConfig = this.tsConfigReader.findAndReadConfig();

      if (tsConfig.configPath) {
        this.logger.verbose(`Using tsconfig.json from: ${tsConfig.configPath}`);
      } else {
        this.logger.verbose(
          "Using default compiler options (no tsconfig.json found)"
        );
      }

      // Log compiler options summary
      const optionsSummary = this.tsConfigReader.getOptionsSummary(
        tsConfig.compilerOptions
      );
      this.logger.verbose(`Compiler options: ${optionsSummary}`);

      // Validate options and show warnings
      const warnings = this.tsConfigReader.validateOptions(
        tsConfig.compilerOptions
      );
      warnings.forEach((warning) => this.logger.warn(warning));

      // Create a temporary file for type checking
      const tempFileName = filename.replace(/\\/g, "/"); // Normalize path

      this.logger.verbose(`Type checking file: ${tempFileName}`);

      // Create program using the official API
      const program = ts.createProgram(
        [tempFileName],
        tsConfig.compilerOptions,
        {
          getSourceFile: (fileName) => {
            if (fileName === tempFileName) {
              return ts.createSourceFile(
                fileName,
                tsCode,
                tsConfig.compilerOptions.target || ts.ScriptTarget.ES2022,
                true
              );
            }
            // For other files (like lib.d.ts), return undefined to skip
            return undefined;
          },
          writeFile: () => {}, // No-op
          getCurrentDirectory: () => process.cwd(),
          getDirectories: () => [],
          fileExists: (fileName) => fileName === tempFileName,
          readFile: (fileName) =>
            fileName === tempFileName ? tsCode : undefined,
          getCanonicalFileName: (fileName) => fileName,
          useCaseSensitiveFileNames: () => true,
          getNewLine: () => "\n",
          getDefaultLibFileName: () => "lib.d.ts",
        }
      );

      // Get pre-emit diagnostics (includes both syntactic and semantic)
      const allDiagnostics = ts.getPreEmitDiagnostics(program);

      if (allDiagnostics.length > 0) {
        this.logger.verbose(
          `Found ${allDiagnostics.length} type checking diagnostic(s)`
        );
      } else {
        this.logger.verbose("Type checking completed successfully");
      }

      return [...allDiagnostics];
    } catch (error) {
      this.logger.warn(
        `TypeScript type checking failed for ${filename}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to basic regex checking
      return this.checkCommonTypeErrors(tsCode, filename);
    }
  }

  /**
   * Check for common type errors using regex patterns
   */
  private checkCommonTypeErrors(
    tsCode: string,
    _filename: string
  ): ts.Diagnostic[] {
    const errors: ts.Diagnostic[] = [];
    const lines = tsCode.split("\n");

    // First, collect all defined types and interfaces
    const definedTypes = new Set<string>();
    const knownTypes = [
      "string",
      "number",
      "boolean",
      "object",
      "any",
      "void",
      "undefined",
      "null",
      "Array",
      "Promise",
      "Date",
      "RegExp",
      "Error",
    ];

    // Add built-in types
    knownTypes.forEach((type) => definedTypes.add(type));

    // Find interface and type definitions
    lines.forEach((line) => {
      const interfaceMatch = line.match(/interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (interfaceMatch) {
        definedTypes.add(interfaceMatch[1]);
      }

      const typeMatch = line.match(/type\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (typeMatch) {
        definedTypes.add(typeMatch[1]);
      }

      const enumMatch = line.match(/enum\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (enumMatch) {
        definedTypes.add(enumMatch[1]);
      }

      const classMatch = line.match(/class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (classMatch) {
        definedTypes.add(classMatch[1]);
      }
    });

    // Now check for unknown type annotations
    lines.forEach((line, index) => {
      // Check for type annotations in variable declarations
      const typeAnnotationMatch = line.match(
        /:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[=;,)]/
      );
      if (typeAnnotationMatch) {
        const typeName = typeAnnotationMatch[1];

        if (!definedTypes.has(typeName)) {
          // This might be a typo in a type name
          const suggestions = Array.from(definedTypes).filter(
            (t) => this.levenshteinDistance(typeName, t) <= 2
          );
          let message = `Cannot find name '${typeName}'.`;
          if (suggestions.length > 0) {
            message += ` Did you mean '${suggestions[0]}'?`;
          }

          errors.push({
            file: undefined,
            start: index * (line.length + 1) + line.indexOf(typeName),
            length: typeName.length,
            messageText: message,
            category: ts.DiagnosticCategory.Error,
            code: 2552,
          } as ts.Diagnostic);
        }
      }
    });

    return errors;
  }

  /**
   * Calculate Levenshtein distance for type suggestions
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Transpile TypeScript code to JavaScript using esbuild
   */
  async transpileCode(
    tsCode: string,
    filename: string = "input.ts",
    options: TranspileOptions = {}
  ): Promise<string> {
    const {
      target = "es2022",
      format = "esm",
      minify = false,
      sourcemap = false,
    } = options;

    try {
      // First, perform type checking (with fallback to regex on errors)
      // this.logger.step("Performing type checking");
      const diagnostics = this.typeCheck(tsCode, filename);

      // Filter out library-related errors and focus on user code errors
      const userErrors = diagnostics.filter((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n"
        );
        // Only skip specific library errors, but keep user code errors
        const isLibraryError =
          message.includes("Cannot find name 'console'") ||
          message.includes("Cannot find name 'process'") ||
          message.includes("Cannot find global type") ||
          message.includes("lib.d.ts");
        return !isLibraryError;
      });

      if (userErrors.length > 0) {
        const errorMessages = userErrors.map((diagnostic) => {
          const message = ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n"
          );
          if (diagnostic.file && diagnostic.start !== undefined) {
            const { line, character } =
              diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            return `${filename}:${line + 1}:${character + 1} - ${message}`;
          }
          return `${filename} - ${message}`;
        });

        this.logger.stepFailed("Type checking failed");
        this.logger.typeScriptError(filename, errorMessages);
        throw new Error(
          `TypeScript compilation errors:\n${errorMessages.join("\n")}`
        );
      }

      this.logger.stepComplete("Type checking passed");

      // If type checking passes, proceed with transpilation
      this.logger.step("Transpiling with esbuild");
      const result = await transform(tsCode, {
        loader: filename.endsWith(".tsx") ? "tsx" : "ts",
        target,
        format,
        minify,
        sourcemap,
        platform: "node",
        keepNames: true,
        treeShaking: false,
      });

      this.logger.stepComplete("Transpilation completed");
      this.logger.verbose(
        `Generated ${result.code.length} bytes of JavaScript`
      );

      return result.code;
    } catch (error) {
      this.logger.stepFailed("Transpilation failed");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`TypeScript transpilation failed: ${errorMessage}`);
      // throw new Error(`TypeScript transpilation failed: ${errorMessage}`);
      // process.exit();
      throw error;
    }
  }

  /**
   * Transpile a TypeScript file and return the JavaScript code
   */
  async transpileFile(
    filePath: string,
    options: TranspileOptions = {}
  ): Promise<string> {
    try {
      const tsCode = readFileSync(filePath, "utf8");
      return await this.transpileCode(tsCode, filePath, options);
    } catch (error) {
      throw new Error(
        `Failed to transpile file ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Transpile TypeScript file and write to a temporary JavaScript file
   */
  async transpileToTempFile(
    filePath: string,
    options: TranspileOptions = {}
  ): Promise<string> {
    const jsCode = await this.transpileFile(filePath, options);
    const tempPath = join(
      tmpdir(),
      `${ID.generate({ prefix: "nehonix_tsr" })}.mjs`
    );

    writeFileSync(tempPath, jsCode, "utf8");
    this.tempFiles.push(tempPath);

    return tempPath;
  }

  /**
   * Get list of temporary files created
   */
  getTempFiles(): string[] {
    return [...this.tempFiles];
  }

  /**
   * Clean up temporary files
   */
  cleanup(): void {
    const { unlinkSync, existsSync } = require("fs");

    if (this.tempFiles.length > 0) {
      this.logger.verbose(
        `Cleaning up ${this.tempFiles.length} temporary file(s)`
      );
    }

    for (const tempFile of this.tempFiles) {
      try {
        if (existsSync(tempFile)) {
          unlinkSync(tempFile);
          this.logger.verbose(`Cleaned up temp file: ${tempFile}`);
        }
      } catch (error) {
        // Ignore cleanup errors but log them
        this.logger.warn(
          `Failed to cleanup temp file ${tempFile}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.tempFiles = [];
  }

  /**
   * Check if esbuild supports a given file extension
   */
  static isSupportedFile(filePath: string): boolean {
    const supportedExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
    return supportedExtensions.some((ext) =>
      filePath.toLowerCase().endsWith(ext)
    );
  }

  /**
   * Get the appropriate loader for a file
   */
  static getLoader(filePath: string): "ts" | "tsx" | "js" | "jsx" {
    const ext = filePath.toLowerCase();

    if (ext.endsWith(".tsx")) return "tsx";
    if (ext.endsWith(".ts")) return "ts";
    if (ext.endsWith(".jsx")) return "jsx";
    return "js";
  }
}
