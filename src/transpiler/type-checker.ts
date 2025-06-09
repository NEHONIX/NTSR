import { dirname, resolve } from "path";
import ts from "typescript";
import { Logger } from "../logger.js";
import { TSConfigReader } from "../tsconfig.js";
 
/**
 * Enhanced TypeScript type checking functionality
 */  
export class TypeChecker {
  private logger: Logger;
  private tsConfigReader: TSConfigReader;
  private compilerHost: ts.CompilerHost | null = null;

  constructor(logger: Logger, tsConfigReader: TSConfigReader) {
    this.logger = logger.createChild("TypeChecker");
    this.tsConfigReader = tsConfigReader;
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
   * Get diagnostic message with proper formatting
   */
  formatDiagnostic(diagnostic: ts.Diagnostic, filename: string): string {
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
   * Enhanced TypeScript type checking using proper compiler API
   */
  performTypeCheck(tsCode: string, filename: string): ts.Diagnostic[] {
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
}
