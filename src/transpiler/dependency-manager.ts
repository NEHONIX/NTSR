import { dirname, resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";
import ts from "typescript";
import { Logger } from "../logger.js";
import { TSConfigReader } from "../tsconfig.js";
import { TranspilerUtils } from "./utils.js";
import { TempManager } from "./temp-manager.js";

export interface DependencyInfo {
  resolvedPath: string;
  needsTranspilation: boolean;
}

/**
 * Manages dependency analysis and resolution for TypeScript transpilation
 */
export class DependencyManager {
  private logger: Logger;
  private tsConfigReader: TSConfigReader;
  private tempManager: TempManager;

  constructor(
    logger: Logger,
    tsConfigReader: TSConfigReader,
    tempManager: TempManager
  ) {
    this.logger = logger.createChild("DependencyManager");
    this.tsConfigReader = tsConfigReader;
    this.tempManager = tempManager;
  }

  /**
   * Extract dependencies from TypeScript source code using AST
   */
  extractDependencies(
    tsCode: string,
    containingFile: string,
    compilerOptions: ts.CompilerOptions
  ): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];
    const moduleResolutionCache = ts.createModuleResolutionCache(
      dirname(containingFile),
      (fileName) => fileName,
      compilerOptions
    );

    try {
      // Create source file
      const sourceFile = ts.createSourceFile(
        containingFile,
        tsCode,
        ts.ScriptTarget.Latest,
        true
      );

      // Visit all nodes to find import/export declarations
      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const moduleSpecifier = node.moduleSpecifier;
          if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
            this.resolveDependency(
              moduleSpecifier.text,
              containingFile,
              compilerOptions,
              moduleResolutionCache,
              dependencies
            );
          }
        }

        // Handle dynamic imports
        if (ts.isCallExpression(node)) {
          if (
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length > 0 &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            this.resolveDependency(
              node.arguments[0].text,
              containingFile,
              compilerOptions,
              moduleResolutionCache,
              dependencies
            );
          }
        }

        // Handle require calls
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require" &&
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          this.resolveDependency(
            node.arguments[0].text,
            containingFile,
            compilerOptions,
            moduleResolutionCache,
            dependencies
          );
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch (error) {
      this.logger.warn(
        `Failed to extract dependencies from ${containingFile}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return dependencies;
  }

  /**
   * Resolve a single dependency using TypeScript's module resolution
   */
  private resolveDependency(
    moduleName: string,
    containingFile: string,
    compilerOptions: ts.CompilerOptions,
    moduleResolutionCache: ts.ModuleResolutionCache,
    dependencies: DependencyInfo[]
  ): void {
    // Process relative imports and path-mapped imports (like @/...)
    if (
      !TranspilerUtils.isRelativeImport(moduleName) &&
      !TranspilerUtils.isPathMappedImport(moduleName)
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
        const needsTranspilation =
          TranspilerUtils.isTypeScriptFile(resolvedPath);

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
   * Copy dependency files that don't need transpilation
   */
  async copyDependencyFile(
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
    const targetPath = this.tempManager.calculateTargetPath(
      filePath,
      sourceFileDir,
      tempDir
    );

    // Ensure target directory exists
    const targetDir = dirname(targetPath);
    mkdirSync(targetDir, { recursive: true });

    // Copy the file
    copyFileSync(resolvedPath, targetPath);
    this.tempManager.addTempFile(targetPath);
    this.tempManager.addFileMapping(resolvedPath, targetPath);

    this.logger.verbose(`Copied dependency: ${resolvedPath} -> ${targetPath}`);
  }

  /**
   * Process dependencies for a transpiled file
   */
  async transpileDependencies(
    sourceFilePath: string,
    tempDir: string,
    options: any, // TranspileOptions type would be imported from main module
    processedFiles: Set<string>,
    baseDir: string,
    transpileCallback?: (
      filePath: string,
      tempDir: string,
      options: any,
      processedFiles: Set<string>,
      mainFileDir?: string
    ) => Promise<string>
  ): Promise<void> {
    try {
      // Get TypeScript compiler options for dependency resolution
      const searchPath = dirname(resolve(sourceFilePath));
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
      const program = ts.createProgram([sourceFilePath], compilerOptions);
      const sourceFile = program.getSourceFile(sourceFilePath);

      if (!sourceFile) {
        this.logger.warn(`Could not create source file for: ${sourceFilePath}`);
        return;
      }

      // Extract dependencies using AST analysis
      const dependencies = this.extractDependenciesFromSourceFile(
        sourceFile,
        sourceFilePath,
        compilerOptions
      );

      this.logger.verbose(
        `Found ${dependencies.length} dependencies for ${sourceFilePath}`
      );

      // Process each dependency
      for (const dep of dependencies) {
        if (!processedFiles.has(dep.resolvedPath)) {
          if (dep.needsTranspilation) {
            // Transpile TypeScript/TSX files using callback
            if (transpileCallback) {
              await transpileCallback(
                dep.resolvedPath,
                tempDir,
                options,
                processedFiles,
                baseDir
              );
            } else {
              this.logger.verbose(
                `Dependency ${dep.resolvedPath} needs transpilation but no callback provided`
              );
            }
          } else {
            // Copy non-TypeScript dependencies
            await this.copyDependencyFile(
              dep.resolvedPath,
              tempDir,
              sourceFilePath,
              processedFiles
            );
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to process dependencies for ${sourceFilePath}: ${
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
  ): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];
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
    dependencies: DependencyInfo[]
  ): void {
    // Process relative imports and path-mapped imports (like @/...)
    if (
      !TranspilerUtils.isRelativeImport(moduleName) &&
      !TranspilerUtils.isPathMappedImport(moduleName)
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
        const needsTranspilation =
          TranspilerUtils.isTypeScriptFile(resolvedPath);

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
}
