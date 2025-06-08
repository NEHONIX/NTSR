import * as ts from "typescript";
import { existsSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { Logger } from "./logger.js";

export interface TSConfigResult {
  compilerOptions: ts.CompilerOptions;
  configPath?: string;
  isDefault: boolean;
}

export class TSConfigReader {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.createChild("TSConfig");
  }

  /**
   * Find and read tsconfig.json following TypeScript's resolution rules
   */
  findAndReadConfig(searchPath: string = process.cwd()): TSConfigResult {
    const configPath = this.findConfigFile(searchPath);
    
    if (configPath) {
      this.logger.verbose(`Found tsconfig.json at: ${configPath}`);
      return this.readConfigFile(configPath);
    }

    this.logger.verbose("No tsconfig.json found, using default compiler options");
    return {
      compilerOptions: this.getDefaultCompilerOptions(),
      isDefault: true,
    };
  }

  /**
   * Find tsconfig.json file following TypeScript's resolution rules
   */
  private findConfigFile(searchPath: string): string | undefined {
    return ts.findConfigFile(searchPath, ts.sys.fileExists, "tsconfig.json");
  }

  /**
   * Read and parse tsconfig.json file
   */
  private readConfigFile(configPath: string): TSConfigResult {
    try {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      
      if (configFile.error) {
        this.logger.warn(`Error reading tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`);
        return {
          compilerOptions: this.getDefaultCompilerOptions(),
          configPath,
          isDefault: true,
        };
      }

      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(configPath)
      );

      if (parsedConfig.errors.length > 0) {
        this.logger.warn("Errors in tsconfig.json:");
        parsedConfig.errors.forEach(error => {
          this.logger.warn(`  ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`);
        });
      }

      // Merge with our required options for NTSR
      const compilerOptions = this.mergeWithRequiredOptions(parsedConfig.options);

      this.logger.verbose(`Loaded compiler options from ${configPath}`);
      return {
        compilerOptions,
        configPath,
        isDefault: false,
      };
    } catch (error) {
      this.logger.warn(`Failed to read tsconfig.json: ${error instanceof Error ? error.message : String(error)}`);
      return {
        compilerOptions: this.getDefaultCompilerOptions(),
        configPath,
        isDefault: true,
      };
    }
  }

  /**
   * Get default compiler options for NTSR
   */
  private getDefaultCompilerOptions(): ts.CompilerOptions {
    return {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      lib: ["ES2022", "DOM"],
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      allowUnusedLabels: false,
      allowUnreachableCode: false,
      skipLibCheck: true, // For performance
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      removeComments: false,
      noEmit: true,
      isolatedModules: false,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    };
  }

  /**
   * Merge user's compiler options with required NTSR options
   */
  private mergeWithRequiredOptions(userOptions: ts.CompilerOptions): ts.CompilerOptions {
    // These options are required for NTSR to work correctly
    const requiredOptions: ts.CompilerOptions = {
      noEmit: true, // We handle emit ourselves
      skipLibCheck: true, // For performance
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    };

    // Merge user options with required options (required options take precedence)
    return {
      ...userOptions,
      ...requiredOptions,
    };
  }

  /**
   * Get a summary of the compiler options for logging
   */
  getOptionsSummary(options: ts.CompilerOptions): string {
    const important = [
      `target: ${ts.ScriptTarget[options.target || ts.ScriptTarget.ES5]}`,
      `module: ${ts.ModuleKind[options.module || ts.ModuleKind.CommonJS]}`,
      `strict: ${options.strict || false}`,
      `skipLibCheck: ${options.skipLibCheck || false}`,
    ];

    return important.join(", ");
  }

  /**
   * Validate that the compiler options are suitable for NTSR
   */
  validateOptions(options: ts.CompilerOptions): string[] {
    const warnings: string[] = [];

    if (options.noEmit === false) {
      warnings.push("noEmit is set to false, but NTSR handles compilation internally");
    }

    if (options.skipLibCheck === false) {
      warnings.push("skipLibCheck is false, which may slow down type checking");
    }

    if (!options.allowSyntheticDefaultImports && !options.esModuleInterop) {
      warnings.push("Consider enabling allowSyntheticDefaultImports or esModuleInterop for better module compatibility");
    }

    return warnings;
  }
}
