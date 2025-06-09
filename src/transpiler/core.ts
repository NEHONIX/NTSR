import { transform } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import ts from "typescript";
import { TranspileOptions } from "../types/index.js";
import { Logger } from "../logger.js";
import { TSConfigReader } from "../tsconfig.js";
import { __transpiler_version__ } from "../__sys__/__version_transpiler.js";
import {
  __allowed_ext__,
  AllowedExtWithDot,
} from "../__sys__/__allowed_ext__.js";

// Import components
import { TypeChecker } from "./type-checker.js";
import { ImportResolver } from "./import-resolver.js";
import { DependencyManager } from "./dependency-manager.js";
import { TempManager } from "./temp-manager.js";
import { TranspilerUtils } from "./utils.js";

/**
 * Main TypeScript transpiler class with architecture
 */
export class TypeScriptTranspiler {
  private logger: Logger;
  private tsConfigReader: TSConfigReader;
  private typeChecker: TypeChecker;
  private importResolver: ImportResolver;
  private dependencyManager: DependencyManager;
  private tempManager: TempManager;

  constructor(logger: Logger) {
    this.logger = logger.createChild("Transpiler");
    this.tsConfigReader = new TSConfigReader(this.logger);

    // Initialize  components
    this.tempManager = new TempManager(this.logger);
    this.typeChecker = new TypeChecker(this.logger, this.tsConfigReader);
    this.importResolver = new ImportResolver(this.logger, this.tsConfigReader);
    this.dependencyManager = new DependencyManager(
      this.logger,
      this.tsConfigReader,
      this.tempManager
    );
  }

  /**
   * Public method to perform type checking
   */
  performTypeCheck(tsCode: string, filename: string): ts.Diagnostic[] {
    return this.typeChecker.performTypeCheck(tsCode, filename);
  }

  /**
   * Transpile TypeScript code to JavaScript using esbuild with enhanced type checking
   */
  async transpileCode(
    tsCode: string,
    filename: string = "nehonix.tsr.input.ts",
    options: TranspileOptions = {}
  ): Promise<string> {
    const {
      target = "es2022",
      format = "esm",
      minify = false,
      sourcemap = false,
    } = options;

    try {
      // Perform enhanced type checking
      this.logger.verbose("Performing enhanced type checking");
      const diagnostics = this.typeChecker.performTypeCheck(tsCode, filename);

      // Only fail on actual errors, not warnings
      const errors = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      );

      if (errors.length > 0) {
        const errorMessages = errors.map((diagnostic) =>
          this.typeChecker.formatDiagnostic(diagnostic, filename)
        );
        this.logger.stepFailed("TypeScript compilation failed");
        throw new Error(
          `TypeScript compilation failed:\n${errorMessages.join("\n")}`
        );
      }

      // Log warnings if any
      const warnings = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Warning
      );
      if (warnings.length > 0) {
        this.logger.warn(`Found ${warnings.length} TypeScript warning(s)`);
        warnings.forEach((warning) => {
          this.logger.warn(
            this.typeChecker.formatDiagnostic(warning, filename)
          );
        });
      }

      // Preprocess imports to handle relative paths and extensions for transpilation
      const preprocessedCode =
        this.importResolver.preprocessImportsForTranspilation(
          tsCode,
          filename,
          format
        );

      this.logger.verbose("Starting esbuild transpilation");

      // Use esbuild for fast transpilation
      const result = await transform(preprocessedCode, {
        loader: TranspilerUtils.getLoader(filename),
        target: target as any,
        format: format as any,
        minify,
        sourcemap,
        keepNames: true,
        treeShaking: false,
      });

      return result.code;
    } catch (error) {
      this.logger.stepFailed("Transpilation failed");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`TypeScript transpilation failed: ${errorMessage}`);
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
   * Enhanced transpile to temp file with better session management
   */
  async transpileToTempFile(
    filePath: string,
    options: TranspileOptions = {}
  ): Promise<string> {
    // Create a unique temporary directory for this transpilation session
    const tempDir = this.tempManager.createTempSession();

    try {
      // Transpile the main file and its dependencies
      const mainFileDir = dirname(resolve(filePath));
      const mainTempPath = await this.transpileFileWithDependencies(
        filePath,
        tempDir,
        options,
        new Set(), // Track processed files to avoid circular dependencies
        mainFileDir
      );

      this.logger.verbose(`Created transpilation session in: ${tempDir}`);
      this.logger.verbose(`Main file: ${mainTempPath}`);

      return mainTempPath;
    } catch (error) {
      this.logger.error(
        `Transpilation session failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Enhanced transpile method with better temp file management
   */
  private async transpileFileWithDependencies(
    filePath: string,
    tempDir: string,
    options: TranspileOptions,
    processedFiles: Set<string>,
    mainFileDir?: string
  ): Promise<string> {
    const resolvedPath = resolve(filePath);

    // Avoid processing the same file twice
    if (processedFiles.has(resolvedPath)) {
      return this.tempManager.getMappedPath(resolvedPath) || resolvedPath;
    }

    processedFiles.add(resolvedPath);

    // Read and transpile the main file
    const tsCode = readFileSync(resolvedPath, "utf8");
    const jsCode = await this.transpileCode(tsCode, resolvedPath, options);

    // Calculate output path maintaining directory structure relative to main file
    // Use the main file's directory as the base for relative path calculation
    const baseDir = mainFileDir || dirname(resolvedPath);
    const outputPath = this.tempManager.calculateTranspiledOutputPath(
      resolvedPath,
      baseDir,
      tempDir,
      options.format || "esm"
    );

    // Ensure the directory exists
    const outputDir = dirname(outputPath);
    mkdirSync(outputDir, { recursive: true });

    // Write the transpiled file with debug info
    const debugComment = `// Generated by Nehonix TSR from: ${resolvedPath}\n// Session directory: ${tempDir}\n\n`;
    const enhancedJsCode = debugComment + jsCode;

    writeFileSync(outputPath, enhancedJsCode, "utf8");
    this.tempManager.addTempFile(outputPath);
    this.tempManager.addFileMapping(resolvedPath, outputPath);

    // Process dependencies, passing the main file directory and a callback for transpilation
    await this.dependencyManager.transpileDependencies(
      resolvedPath,
      tempDir,
      options,
      processedFiles,
      baseDir,
      // Callback for transpiling TypeScript dependencies
      async (filePath, tempDir, options, processedFiles, mainFileDir) => {
        return await this.transpileFileWithDependencies(
          filePath,
          tempDir,
          options,
          processedFiles,
          mainFileDir
        );
      }
    );

    this.logger.verbose(`Transpiled ${resolvedPath} -> ${outputPath}`);

    return outputPath;
  }

  /**
   * Get list of temporary files created
   */
  getTempFiles(): string[] {
    return this.tempManager.getTempFiles();
  }

  /**
   * Enhanced cleanup with better temp directory management
   */
  cleanup(): void {
    this.tempManager.cleanup();
  }

  /**
   * Get access to the TSConfigReader instance
   */
  getTSConfigReader() {
    return this.tsConfigReader;
  }

  /**
   * Get detailed information about the transpiler and its capabilities
   */
  getInfo(): {
    version: string;
    supportedExtensions: readonly AllowedExtWithDot[];
    esbuildAvailable: boolean;
    typescriptVersion: string;
  } {
    return {
      version: __transpiler_version__,
      supportedExtensions: __allowed_ext__,
      esbuildAvailable: true,
      typescriptVersion: ts.version,
    };
  }

  /**
   * Static utility methods for convenience
   */
  static isSupportedFile = TranspilerUtils.isSupportedFile;
  static getLoader = TranspilerUtils.getLoader;
}
