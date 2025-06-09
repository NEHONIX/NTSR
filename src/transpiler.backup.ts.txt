import { transform } from "esbuild";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  copyFileSync,
} from "fs";
import { join, dirname, resolve, relative, extname, basename } from "path";
import { tmpdir } from "os";
import ts from "typescript";
import { TranspileOptions } from "./types/index.js";
import { Logger } from "./logger.js";
import { TSConfigReader } from "./tsconfig.js";
import { NehoID as ID } from "nehoid";
import { __transpiler_version__ } from "./__sys__/__version_transpiler.js";
import { __allowed_ext__, Loader } from "./__sys__/__allowed_ext__.js";

export class TypeScriptTranspiler {
  private tempFiles: string[] = [];
  private tempDirs: string[] = [];
  private logger: Logger;
  private tsConfigReader: TSConfigReader;
  private compilerHost: ts.CompilerHost | null = null;
  private currentTempDir: string | null = null;
  private fileMapping: Map<string, string> = new Map(); // Original path -> Temp path mapping

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
   * Create a comprehensive compiler host for better TypeScript integration
   */
  private createCompilerHost(
    compilerOptions: ts.CompilerOptions,
    sourceFiles: Map<string, string>
  ): ts.CompilerHost {
    const host = ts.createCompilerHost(compilerOptions);

    // Override methods to provide our source files and handle module resolution
    const originalGetSourceFile = host.getSourceFile;

    host.getSourceFile = (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    ) => {
      // Check if this is one of our source files
      if (sourceFiles.has(fileName)) {
        const sourceText = sourceFiles.get(fileName)!;
        return ts.createSourceFile(fileName, sourceText, languageVersion, true);
      }

      // For library files and other dependencies, use the original implementation
      return originalGetSourceFile.call(
        host,
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile
      );
    };

    // Override file existence check
    const originalFileExists = host.fileExists;
    host.fileExists = (fileName) => {
      if (sourceFiles.has(fileName)) {
        return true;
      }
      return originalFileExists.call(host, fileName);
    };

    // Override read file
    const originalReadFile = host.readFile;
    host.readFile = (fileName) => {
      if (sourceFiles.has(fileName)) {
        return sourceFiles.get(fileName);
      }
      return originalReadFile.call(host, fileName);
    };

    return host;
  }

  /**
   * Filter diagnostics to only include relevant user code errors
   */
  private filterRelevantDiagnostics(
    diagnostics: ts.Diagnostic[],
    userFileName: string
  ): ts.Diagnostic[] {
    return diagnostics.filter((diagnostic) => {
      // Only include errors and warnings, skip suggestions and messages
      if (
        diagnostic.category !== ts.DiagnosticCategory.Error &&
        diagnostic.category !== ts.DiagnosticCategory.Warning
      ) {
        return false;
      }

      // Skip diagnostics from library files
      if (diagnostic.file) {
        const fileName = diagnostic.file.fileName;
        if (
          fileName.includes("node_modules") ||
          fileName.includes("lib.") ||
          fileName.endsWith(".d.ts")
        ) {
          return false;
        }

        // Only include diagnostics from our target file
        if (fileName !== userFileName) {
          return false;
        }
      }

      // Filter out common environment-related diagnostic codes
      const ignoredCodes = new Set([
        2304, // Cannot find name (for globals like 'console', 'process')
        2318, // Cannot find global type
        2307, // Cannot find module (for @types packages)
        6133, // Variable is declared but its value is never read
        6196, // 'name' is declared but never used
        7016, // Could not find a declaration file for module
        7017, // Element implicitly has an 'any' type (in noImplicitAny mode)
        2580, // Cannot find name 'require' (in ESM context)
        2792, // Cannot find module or its corresponding type declarations
        5023, // Unknown compiler option
        5024, // Compiler option requires a value
        6053, // File is a CommonJS module
        6059, // rootDir is expected to contain all source files
      ]);

      if (ignoredCodes.has(diagnostic.code)) {
        return false;
      }

      // For errors, be more permissive and only show severe type errors
      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        const criticalErrorCodes = new Set([
          1002, // Unterminated string literal
          1003, // Identifier expected
          1005, // Expected ';'
          1009, // Trailing comma not allowed
          1128, // Declaration or statement expected
          2322, // Type is not assignable to type
          2339, // Property does not exist on type
          2345, // Argument of type is not assignable to parameter
          2355, // A function whose declared type is not 'void' must return a value
          2365, // Operator cannot be applied to types
          2532, // Object is possibly 'undefined'
          2540, // Cannot assign to read-only property
          2551, // Property does not exist on type (with suggestion)
          2552, // Cannot find name
          2554, // Expected arguments, but got
          2571, // Object is of type 'unknown'
        ]);

        return criticalErrorCodes.has(diagnostic.code);
      }

      return true;
    });
  }

  /**
   * Preprocess TypeScript code to resolve relative imports with proper extensions
   */
  private preprocessImports(
    tsCode: string,
    filename: string,
    format: string = "esm"
  ): string {
    const sourceDir = dirname(resolve(filename));

    // Regular expressions to match import/export statements
    const importRegex =
      /(?:import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"`]([^'"`]+)['"`]|export\s+(?:\{[^}]*\}\s+from\s+)?['"`]([^'"`]+)['"`])/g;
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

    let processedCode = tsCode;

    // Process import/export statements
    processedCode = processedCode.replace(
      importRegex,
      (match, importPath1, importPath2) => {
        const importPath = importPath1 || importPath2;
        if (!importPath) return match;

        // Only process relative imports
        if (importPath.startsWith("./") || importPath.startsWith("../")) {
          const resolvedPath = this.resolveRelativeImport(
            importPath,
            sourceDir,
            format
          );
          if (resolvedPath) {
            return match.replace(importPath, resolvedPath);
          }
        }

        return match;
      }
    );

    // Process require statements
    processedCode = processedCode.replace(
      requireRegex,
      (match, requirePath) => {
        if (!requirePath) return match;

        // Only process relative requires
        if (requirePath.startsWith("./") || requirePath.startsWith("../")) {
          const resolvedPath = this.resolveRelativeImport(
            requirePath,
            sourceDir,
            format
          );
          if (resolvedPath) {
            return match.replace(requirePath, resolvedPath);
          }
        }

        return match;
      }
    );

    return processedCode;
  }

  /**
   * Enhanced resolve relative import with better file resolution
   */
  private resolveRelativeImport(
    importPath: string,
    sourceDir: string,
    format: string = "esm"
  ): string | null {
    // If the import already has an extension, check if it exists
    if (importPath.includes(".") && !importPath.endsWith(".")) {
      const fullPath = resolve(sourceDir, importPath);
      if (existsSync(fullPath)) {
        return importPath;
      }
    }

    // Try different extensions based on the source file type
    const sourceExtensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".json",
      ".mjs",
      ".cjs",
    ];

    // First, try with exact extensions
    for (const ext of sourceExtensions) {
      const pathWithExt = importPath + ext;
      const fullPath = resolve(sourceDir, pathWithExt);

      if (existsSync(fullPath)) {
        // For TypeScript files that will be transpiled, adjust the extension
        if ((ext === ".ts" || ext === ".tsx") && format !== "esm") {
          const targetExt = format === "cjs" ? ".cjs" : ".mjs";
          const adjustedPath = importPath + targetExt;
          this.logger.verbose(
            `Resolved ${importPath} -> ${adjustedPath} (${ext} file found, will be transpiled)`
          );
          return adjustedPath;
        }

        this.logger.verbose(`Resolved ${importPath} -> ${pathWithExt}`);
        return pathWithExt;
      }
    }

    // Try index files
    for (const ext of sourceExtensions) {
      const indexPath = importPath + "/index" + ext;
      const fullPath = resolve(sourceDir, indexPath);

      if (existsSync(fullPath)) {
        // For TypeScript index files that will be transpiled, adjust the extension
        if ((ext === ".ts" || ext === ".tsx") && format !== "esm") {
          const targetExt = format === "cjs" ? ".cjs" : ".mjs";
          const adjustedIndexPath = importPath + "/index" + targetExt;
          this.logger.verbose(
            `Resolved ${importPath} -> ${adjustedIndexPath} (${indexPath} file found, will be transpiled)`
          );
          return adjustedIndexPath;
        }

        this.logger.verbose(`Resolved ${importPath} -> ${indexPath}`);
        return indexPath;
      }
    }

    // If nothing found, return the original path and let Node.js handle it
    this.logger.verbose(`Could not resolve relative import: ${importPath}`);
    return null;
  }

  /**
   * Check if an import path is relative
   */
  private isRelativeImport(importPath: string): boolean {
    return importPath.startsWith("./") || importPath.startsWith("../");
  }

  /**
   * Check if an import path uses path mapping (like @/...)
   */
  private isPathMappedImport(importPath: string): boolean {
    // Common path mapping patterns
    return (
      importPath.startsWith("@/") ||
      importPath.startsWith("~/") ||
      importPath.startsWith("#/") ||
      // Check for other common alias patterns
      (/^[a-zA-Z][a-zA-Z0-9]*\//.test(importPath) &&
        !importPath.includes("node_modules"))
    );
  }

  /**
   * Resolve a path-mapped import using TypeScript's module resolution
   */
  private resolvePathMappedImport(
    importPath: string,
    containingFile: string
  ): string | null {
    try {
      // Get TypeScript compiler options with path mapping
      const searchPath = dirname(resolve(containingFile));
      const tsConfig = this.tsConfigReader.findAndReadConfig(searchPath);

      const compilerOptions: ts.CompilerOptions = {
        ...tsConfig.compilerOptions,
        noEmit: true,
        skipLibCheck: true,
      };

      // Use TypeScript's module resolution to resolve the path-mapped import
      const resolution = ts.resolveModuleName(
        importPath,
        containingFile,
        compilerOptions,
        ts.sys
      );

      if (
        resolution.resolvedModule &&
        resolution.resolvedModule.resolvedFileName
      ) {
        return resolution.resolvedModule.resolvedFileName;
      }

      return null;
    } catch (error) {
      this.logger.verbose(
        `Failed to resolve path-mapped import ${importPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  /**
   * Preprocess imports to ensure correct extensions for transpiled files
   */
  private preprocessImportsForTranspilation(
    tsCode: string,
    filename: string,
    format: string = "esm"
  ): string {
    const sourceDir = dirname(resolve(filename));

    // Regular expressions to match import/export statements and require calls
    const importExportRegex = /(?:import|export).*?from\s+['"`]([^'"`]+)['"`]/g;
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

    let processedCode = tsCode;

    // Process import/export statements
    processedCode = processedCode.replace(
      importExportRegex,
      (match, importPath) => {
        if (!importPath) {
          return match;
        }

        // Handle relative imports
        if (this.isRelativeImport(importPath)) {
          if (this.isTypeScriptImport(importPath, sourceDir)) {
            const targetExt =
              format === "cjs" ? ".cjs" : format === "esm" ? ".mjs" : ".js";
            const newImportPath = importPath + targetExt;
            const updatedMatch = match.replace(importPath, newImportPath);
            this.logger.verbose(
              `Rewriting relative import: ${importPath} -> ${newImportPath}`
            );
            return updatedMatch;
          }
        }

        // Handle path-mapped imports (like @/...)
        else if (this.isPathMappedImport(importPath)) {
          const resolvedPath = this.resolvePathMappedImport(
            importPath,
            filename
          );
          if (resolvedPath && this.isTypeScriptFile(resolvedPath)) {
            // Convert the resolved absolute path back to a relative path from the source file
            const sourceDir = dirname(resolve(filename));
            const relativePath = relative(sourceDir, resolvedPath);

            // Normalize path separators for cross-platform compatibility
            const normalizedRelativePath = relativePath.replace(/\\/g, "/");

            // Ensure it starts with ./ if it's not already relative
            const relativeImportPath = normalizedRelativePath.startsWith(".")
              ? normalizedRelativePath
              : "./" + normalizedRelativePath;

            // Remove the original extension and add the target extension
            const pathWithoutExt = relativeImportPath.replace(
              /\.(ts|tsx)$/,
              ""
            );
            const targetExt =
              format === "cjs" ? ".cjs" : format === "esm" ? ".mjs" : ".js";
            const newImportPath = pathWithoutExt + targetExt;

            const updatedMatch = match.replace(importPath, newImportPath);
            this.logger.verbose(
              `Rewriting path-mapped import: ${importPath} -> ${newImportPath} (resolved via ${resolvedPath})`
            );
            return updatedMatch;
          }
        }

        return match;
      }
    );

    // Process require statements
    processedCode = processedCode.replace(
      requireRegex,
      (match, requirePath) => {
        if (!requirePath) {
          return match;
        }

        // Handle relative requires
        if (this.isRelativeImport(requirePath)) {
          if (this.isTypeScriptImport(requirePath, sourceDir)) {
            const targetExt =
              format === "cjs" ? ".cjs" : format === "esm" ? ".mjs" : ".js";
            const newRequirePath = requirePath + targetExt;
            const updatedMatch = match.replace(requirePath, newRequirePath);
            this.logger.verbose(
              `Rewriting relative require: ${requirePath} -> ${newRequirePath}`
            );
            return updatedMatch;
          }
        }

        // Handle path-mapped requires (like @/...)
        else if (this.isPathMappedImport(requirePath)) {
          const resolvedPath = this.resolvePathMappedImport(
            requirePath,
            filename
          );
          if (resolvedPath && this.isTypeScriptFile(resolvedPath)) {
            // Convert the resolved absolute path back to a relative path from the source file
            const sourceDir = dirname(resolve(filename));
            const relativePath = relative(sourceDir, resolvedPath);

            // Normalize path separators for cross-platform compatibility
            const normalizedRelativePath = relativePath.replace(/\\/g, "/");

            // Ensure it starts with ./ if it's not already relative
            const relativeRequirePath = normalizedRelativePath.startsWith(".")
              ? normalizedRelativePath
              : "./" + normalizedRelativePath;

            // Remove the original extension and add the target extension
            const pathWithoutExt = relativeRequirePath.replace(
              /\.(ts|tsx)$/,
              ""
            );
            const targetExt =
              format === "cjs" ? ".cjs" : format === "esm" ? ".mjs" : ".js";
            const newRequirePath = pathWithoutExt + targetExt;

            const updatedMatch = match.replace(requirePath, newRequirePath);
            this.logger.verbose(
              `Rewriting path-mapped require: ${requirePath} -> ${newRequirePath} (resolved via ${resolvedPath})`
            );
            return updatedMatch;
          }
        }

        return match;
      }
    );

    return processedCode;
  }

  /**
   * Copy dependency files that don't need transpilation
   */
  private async copyDependencyFile(
    filePath: string,
    tempDir: string,
    sourceFile: string,
    processedFiles: Set<string>
  ): Promise<void> {
    const resolvedPath = resolve(filePath);

    if (processedFiles.has(resolvedPath)) {
      return;
    }

    processedFiles.add(resolvedPath);

    // Calculate relative path structure to maintain directory hierarchy
    const sourceFileDir = dirname(resolve(sourceFile));
    const targetPath = this.calculateTargetPath(
      filePath,
      sourceFileDir,
      tempDir
    );

    // Ensure target directory exists
    const targetDir = dirname(targetPath);
    mkdirSync(targetDir, { recursive: true });

    // Copy the file
    copyFileSync(resolvedPath, targetPath);
    this.tempFiles.push(targetPath);
    this.fileMapping.set(resolvedPath, targetPath);

    this.logger.verbose(`Copied dependency: ${resolvedPath} -> ${targetPath}`);
  }

  /**
   * Calculate the target path for a dependency in the temp directory
   */
  private calculateTargetPath(
    filePath: string,
    sourceDir: string,
    tempDir: string
  ): string {
    const resolvedFilePath = resolve(filePath);
    const resolvedSourceDir = resolve(sourceDir);

    // Get relative path from source directory
    const relativePath = relative(resolvedSourceDir, resolvedFilePath);

    // Join with temp directory
    return resolve(tempDir, relativePath);
  }

  /**
   * Calculate output path for transpiled files
   */
  private calculateTranspiledOutputPath(
    filePath: string,
    baseSourceDir: string,
    tempDir: string,
    format: string
  ): string {
    const resolvedFilePath = resolve(filePath);
    const resolvedBaseDir = resolve(baseSourceDir);

    // Get relative path and change extension
    let relativePath = relative(resolvedBaseDir, resolvedFilePath);

    // Handle case where files are not in a subdirectory of baseSourceDir
    // This can happen when baseSourceDir is not actually a parent of filePath
    if (
      relativePath.startsWith("..") ||
      require("path").isAbsolute(relativePath)
    ) {
      // Just use the filename if the file is outside the base directory
      const parsedFile = require("path").parse(resolvedFilePath);
      relativePath = parsedFile.name + parsedFile.ext;
    }

    // Change extension based on format
    const parsedPath = require("path").parse(relativePath);
    const newExt =
      format === "cjs" ? ".cjs" : format === "esm" ? ".mjs" : ".js";

    // Ensure we don't create invalid paths on Windows
    const safePath = parsedPath.dir
      ? join(parsedPath.dir, parsedPath.name + newExt)
      : parsedPath.name + newExt;
    const outputPath = join(tempDir, safePath);

    return outputPath;
  }

  /**
   * Get the main file for the current temp session
   */
  private getTempSessionMainFile(): string | null {
    // This would be set when starting a transpilation session
    return this.currentTempDir ? this.currentTempDir : null;
  }

  /**
   * Enhanced TypeScript type checking using proper compiler API
   */
  private typeCheck(tsCode: string, filename: string): ts.Diagnostic[] {
    try {
      this.logger.verbose("Starting enhanced TypeScript type checking");

      // Read tsconfig.json or use enhanced defaults
      // Start search from the directory containing the TypeScript file
      const searchPath = dirname(resolve(filename));
      const tsConfig = this.tsConfigReader.findAndReadConfig(searchPath);

      // Use user's compiler options with minimal overrides
      const compilerOptions: ts.CompilerOptions = {
        ...tsConfig.compilerOptions,
        // Only override essential options for NTSR to work
        noEmit: true, // Always true - we handle emit ourselves
        skipLibCheck: true, // Always true for performance
        // Preserve user's strictness settings, only provide defaults if not set
        allowSyntheticDefaultImports:
          tsConfig.compilerOptions.allowSyntheticDefaultImports ?? true,
        esModuleInterop: tsConfig.compilerOptions.esModuleInterop ?? true,
      };

      if (tsConfig.configPath) {
        this.logger.verbose(`Using tsconfig.json from: ${tsConfig.configPath}`);
      } else {
        this.logger.verbose("Using enhanced default compiler options");
      }

      // Normalize filename
      const normalizedFilename = resolve(filename);

      // Create source file map
      const sourceFiles = new Map<string, string>();
      sourceFiles.set(normalizedFilename, tsCode);

      // Create enhanced compiler host
      const host = this.createCompilerHost(compilerOptions, sourceFiles);

      // Create program
      const program = ts.createProgram(
        [normalizedFilename],
        compilerOptions,
        host
      );

      // Get all diagnostics
      const syntacticDiagnostics = program.getSyntacticDiagnostics();
      const semanticDiagnostics = program.getSemanticDiagnostics();
      const globalDiagnostics = program.getGlobalDiagnostics();
      const configFileParsingDiagnostics =
        program.getConfigFileParsingDiagnostics();

      // Combine all diagnostics
      const allDiagnostics = [
        ...syntacticDiagnostics,
        ...semanticDiagnostics,
        ...globalDiagnostics,
        ...configFileParsingDiagnostics,
      ];

      // Filter to only relevant diagnostics
      const relevantDiagnostics = this.filterRelevantDiagnostics(
        allDiagnostics,
        normalizedFilename
      );

      if (relevantDiagnostics.length > 0) {
        this.logger.verbose(
          `Found ${relevantDiagnostics.length} relevant diagnostic(s) out of ${allDiagnostics.length} total`
        );

        // Log diagnostic breakdown for debugging
        const errorCount = relevantDiagnostics.filter(
          (d) => d.category === ts.DiagnosticCategory.Error
        ).length;
        const warningCount = relevantDiagnostics.filter(
          (d) => d.category === ts.DiagnosticCategory.Warning
        ).length;

        if (errorCount > 0) {
          this.logger.verbose(
            `Errors: ${errorCount}, Warnings: ${warningCount}`
          );
        }
      } else {
        this.logger.verbose(
          "Type checking completed successfully - no relevant issues found"
        );
      }

      return relevantDiagnostics;
    } catch (error) {
      this.logger.warn(
        `Enhanced TypeScript type checking failed for ${filename}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Return empty array instead of falling back to regex
      return [];
    }
  }

  /**
   * Get diagnostic message with proper formatting
   */
  private formatDiagnostic(
    diagnostic: ts.Diagnostic,
    filename: string
  ): string {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n"
    );

    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start
      );
      const category =
        diagnostic.category === ts.DiagnosticCategory.Error
          ? "error"
          : "warning";
      return `${filename}:${line + 1}:${character + 1} - ${category} TS${
        diagnostic.code
      }: ${message}`;
    }

    const category =
      diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning";
    return `${filename} - ${category} TS${diagnostic.code}: ${message}`;
  }

  /**
   * Transpile TypeScript code to JavaScript using esbuild with enhanced type checking
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
      // Perform enhanced type checking
      this.logger.verbose("Performing enhanced type checking");
      const diagnostics = this.typeCheck(tsCode, filename);

      // Only fail on actual errors, not warnings
      const errors = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Error
      );

      if (errors.length > 0) {
        const errorMessages = errors.map((diagnostic) =>
          this.formatDiagnostic(diagnostic, filename)
        );

        this.logger.stepFailed("Type checking failed");
        this.logger.typeScriptError(filename, errorMessages);
        throw new Error(
          `TypeScript compilation errors (${
            errors.length
          }):\n${errorMessages.join("\n")}`
        );
      }

      // Log warnings but don't fail
      const warnings = diagnostics.filter(
        (d) => d.category === ts.DiagnosticCategory.Warning
      );
      if (warnings.length > 0) {
        this.logger.verbose(
          `Found ${warnings.length} warning(s) - continuing with transpilation`
        );
        warnings.forEach((warning) => {
          this.logger.warn(this.formatDiagnostic(warning, filename));
        });
      }

      this.logger.verbose("Type checking passed");

      // Proceed with transpilation using esbuild
      this.logger.verbose("Transpiling with esbuild");

      // Pre-process imports to ensure correct extensions for transpiled files
      const processedCode = this.preprocessImportsForTranspilation(
        tsCode,
        filename,
        format
      );

      const result = await transform(processedCode, {
        loader: TypeScriptTranspiler.getLoader(filename),
        target,
        format,
        minify,
        sourcemap,
        platform: "node",
        keepNames: true,
        treeShaking: false,
        // Add some esbuild-specific options to handle edge cases
        logLevel: "silent", // We handle our own logging
      });

      this.logger.verbose("Transpilation completed");
      this.logger.verbose(
        `Generated ${result.code.length} bytes of JavaScript`
      );

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
    const sessionId = ID.generate({ prefix: "nehonix_tsr.dir" });
    const tempDir = join(tmpdir(), sessionId);
    mkdirSync(tempDir, { recursive: true });

    this.currentTempDir = tempDir;
    this.tempDirs.push(tempDir);

    // Clear file mapping for new session
    this.fileMapping.clear();

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
      return this.fileMapping.get(resolvedPath) || resolvedPath;
    }

    processedFiles.add(resolvedPath);

    // Read and transpile the main file
    const tsCode = readFileSync(resolvedPath, "utf8");
    const jsCode = await this.transpileCode(tsCode, resolvedPath, options);

    // Calculate output path maintaining directory structure relative to main file
    // Use the main file's directory as the base for relative path calculation
    const baseDir = mainFileDir || dirname(resolvedPath);
    const outputPath = this.calculateTranspiledOutputPath(
      resolvedPath,
      baseDir,
      tempDir,
      options.format || "esm"
    );

    // Ensure the directory exists
    const outputDir = dirname(outputPath);
    mkdirSync(outputDir, { recursive: true });

    // Write the transpiled file with debug info
    const debugComment = `// Generated by NTSR from: ${resolvedPath}\n// Session directory: ${tempDir}\n\n`;
    const enhancedJsCode = debugComment + jsCode;

    writeFileSync(outputPath, enhancedJsCode, "utf8");
    this.tempFiles.push(outputPath);
    this.fileMapping.set(resolvedPath, outputPath);

    // Process dependencies, passing the main file directory
    await this.transpileDependencies(
      resolvedPath,
      tempDir,
      options,
      processedFiles,
      baseDir
    );

    this.logger.verbose(`Transpiled ${resolvedPath} -> ${outputPath}`);

    return outputPath;
  }

  /**
   * Use TypeScript's native module resolution to find dependencies
   */
  private async transpileDependencies(
    filePath: string,
    tempDir: string,
    options: TranspileOptions,
    processedFiles: Set<string>,
    mainFileDir?: string
  ): Promise<void> {
    try {
      // Get TypeScript compiler options
      const searchPath = dirname(resolve(filePath));
      const tsConfig = this.tsConfigReader.findAndReadConfig(searchPath);

      const compilerOptions: ts.CompilerOptions = {
        ...tsConfig.compilerOptions,
        noEmit: true,
        skipLibCheck: true,
        allowSyntheticDefaultImports:
          tsConfig.compilerOptions.allowSyntheticDefaultImports ?? true,
        esModuleInterop: tsConfig.compilerOptions.esModuleInterop ?? true,
      };

      // Create a TypeScript program to analyze dependencies
      const program = ts.createProgram([filePath], compilerOptions);
      const sourceFile = program.getSourceFile(filePath);

      if (!sourceFile) {
        this.logger.warn(`Could not create source file for: ${filePath}`);
        return;
      }

      // Use TypeScript's module resolution to find dependencies
      const dependencies = this.extractDependenciesFromSourceFile(
        sourceFile,
        filePath,
        compilerOptions
      );

      // Process each resolved dependency
      for (const dep of dependencies) {
        if (!processedFiles.has(dep.resolvedPath)) {
          if (dep.needsTranspilation) {
            // Transpile TypeScript/TSX files, passing the main file directory
            await this.transpileFileWithDependencies(
              dep.resolvedPath,
              tempDir,
              options,
              processedFiles,
              mainFileDir || dirname(filePath)
            );
          } else {
            // Copy non-TypeScript files as-is
            await this.copyDependencyFile(
              dep.resolvedPath,
              tempDir,
              filePath,
              processedFiles
            );
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to analyze dependencies for ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Extract dependencies from a TypeScript source file using the compiler API
   */
  private extractDependenciesFromSourceFile(
    sourceFile: ts.SourceFile,
    containingFile: string,
    compilerOptions: ts.CompilerOptions
  ): Array<{ resolvedPath: string; needsTranspilation: boolean }> {
    const dependencies: Array<{
      resolvedPath: string;
      needsTranspilation: boolean;
    }> = [];
    const moduleResolutionCache = ts.createModuleResolutionCache(
      dirname(containingFile),
      (fileName) => fileName,
      compilerOptions
    );

    // Visit all nodes in the source file to find import/export declarations
    const visit = (node: ts.Node) => {
      // Handle import declarations
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const moduleName = node.moduleSpecifier.text;
        this.resolveAndAddDependency(
          moduleName,
          containingFile,
          compilerOptions,
          moduleResolutionCache,
          dependencies
        );
      }

      // Handle export declarations with from clause
      else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const moduleName = node.moduleSpecifier.text;
        this.resolveAndAddDependency(
          moduleName,
          containingFile,
          compilerOptions,
          moduleResolutionCache,
          dependencies
        );
      }

      // Handle dynamic imports
      else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        if (
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const moduleName = node.arguments[0].text;
          this.resolveAndAddDependency(
            moduleName,
            containingFile,
            compilerOptions,
            moduleResolutionCache,
            dependencies
          );
        }
      }

      // Handle require calls
      else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const moduleName = node.arguments[0].text;
        this.resolveAndAddDependency(
          moduleName,
          containingFile,
          compilerOptions,
          moduleResolutionCache,
          dependencies
        );
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return dependencies;
  }

  /**
   * Resolve a module using TypeScript's module resolution and add to dependencies if it's a local import
   */
  private resolveAndAddDependency(
    moduleName: string,
    containingFile: string,
    compilerOptions: ts.CompilerOptions,
    moduleResolutionCache: ts.ModuleResolutionCache,
    dependencies: Array<{ resolvedPath: string; needsTranspilation: boolean }>
  ): void {
    // Process relative imports and path-mapped imports (like @/...)
    if (
      !this.isRelativeImport(moduleName) &&
      !this.isPathMappedImport(moduleName)
    ) {
      return;
    }

    try {
      const resolution = ts.resolveModuleName(
        moduleName,
        containingFile,
        compilerOptions,
        ts.sys,
        moduleResolutionCache
      );

      if (
        resolution.resolvedModule &&
        resolution.resolvedModule.resolvedFileName
      ) {
        const resolvedPath = resolution.resolvedModule.resolvedFileName;
        const needsTranspilation = this.isTypeScriptFile(resolvedPath);

        dependencies.push({ resolvedPath, needsTranspilation });
        this.logger.verbose(
          `Resolved dependency: ${moduleName} -> ${resolvedPath}`
        );
      } else {
        this.logger.verbose(
          `Could not resolve module: ${moduleName} from ${containingFile}`
        );
      }
    } catch (error) {
      this.logger.verbose(
        `Error resolving module ${moduleName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if a file is a TypeScript file that needs transpilation
   */
  private isTypeScriptFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ext === ".ts" || ext === ".tsx";
  }

  /**
   * Check if an import path resolves to a TypeScript file
   */
  private isTypeScriptImport(importPath: string, sourceDir: string): boolean {
    const extensions = [".ts", ".tsx"];

    // Try with different TypeScript extensions
    for (const ext of extensions) {
      const pathWithExt = resolve(sourceDir, importPath + ext);
      if (existsSync(pathWithExt)) {
        return true;
      }
    }

    // Try index files
    for (const ext of extensions) {
      const indexPath = resolve(sourceDir, importPath, "index" + ext);
      if (existsSync(indexPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get list of temporary files created
   */
  getTempFiles(): string[] {
    return [...this.tempFiles];
  }

  /**
   * Enhanced cleanup with better temp directory management
   */
  cleanup(): void {
    // Clean up individual temp files
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
        this.logger.warn(
          `Failed to cleanup temp file ${tempFile}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Clean up temp directories
    for (const tempDir of this.tempDirs) {
      try {
        if (existsSync(tempDir)) {
          this.cleanupDirectory(tempDir);
          this.logger.verbose(`Cleaned up temp directory: ${tempDir}`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to cleanup temp directory ${tempDir}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    this.tempFiles = [];
    this.tempDirs = [];
    this.fileMapping.clear();
    this.currentTempDir = null;
  }

  /**
   * Recursively clean up a directory
   */
  private cleanupDirectory(dirPath: string): void {
    const { readdirSync, statSync, rmdirSync } = require("fs");

    try {
      const files = readdirSync(dirPath);

      for (const file of files) {
        const fullPath = join(dirPath, file);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          this.cleanupDirectory(fullPath);
        } else {
          unlinkSync(fullPath);
        }
      }

      rmdirSync(dirPath);
    } catch (error) {
      this.logger.warn(
        `Error cleaning directory ${dirPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if esbuild supports a given file extension
   */
  static isSupportedFile(filePath: string): boolean {
    const supportedExtensions = __allowed_ext__;
    return supportedExtensions.some((ext) =>
      filePath.toLowerCase().endsWith(ext)
    );
  }

  /**
   * Get the appropriate loader for a file
   */
  static getLoader(filePath: string): Loader {
    const ext = filePath.toLowerCase();
    if (ext.endsWith(".tsx")) return "tsx";
    if (ext.endsWith(".ts")) return "ts";
    if (ext.endsWith(".jsx")) return "jsx";
    if (ext.endsWith(".js")) return "js";
    if (ext.endsWith(".bin")) return "binary";
    if (ext.endsWith(".css")) return "css";
    if (ext.endsWith(".text")) return "text";
    return "js";
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
    supportedExtensions: string[];
    esbuildAvailable: boolean;
    typescriptVersion: string;
  } {
    return {
      version: __transpiler_version__,
      supportedExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      esbuildAvailable: true,
      typescriptVersion: ts.version,
    };
  }
}
