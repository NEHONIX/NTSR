import { dirname, resolve, relative } from "path";
import { existsSync } from "fs";
import ts from "typescript";
import { Logger } from "../logger.js";
import { TSConfigReader } from "../tsconfig.js";
import { TranspilerUtils } from "./utils.js";
 
/**
 * Handles import resolution and preprocessing for TypeScript transpilation
 */
export class ImportResolver {
  private logger: Logger;
  private tsConfigReader: TSConfigReader;

  constructor(logger: Logger, tsConfigReader: TSConfigReader) {
    this.logger = logger.createChild("ImportResolver");
    this.tsConfigReader = tsConfigReader;
  }

  /**
   * Preprocess TypeScript code to resolve relative imports with proper extensions
   */
  preprocessImports(
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
   * Resolve a path-mapped import using TypeScript's module resolution
   */
  resolvePathMappedImport(
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
  preprocessImportsForTranspilation(
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
        if (TranspilerUtils.isRelativeImport(importPath)) {
          if (TranspilerUtils.isTypeScriptImport(importPath, sourceDir)) {
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
        else if (TranspilerUtils.isPathMappedImport(importPath)) {
          const resolvedPath = this.resolvePathMappedImport(
            importPath,
            filename
          );
          if (resolvedPath && TranspilerUtils.isTypeScriptFile(resolvedPath)) {
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

    // Process require statements with similar logic
    processedCode = processedCode.replace(
      requireRegex,
      (match, requirePath) => {
        if (!requirePath) {
          return match;
        }

        // Handle relative requires
        if (TranspilerUtils.isRelativeImport(requirePath)) {
          if (TranspilerUtils.isTypeScriptImport(requirePath, sourceDir)) {
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
        else if (TranspilerUtils.isPathMappedImport(requirePath)) {
          const resolvedPath = this.resolvePathMappedImport(
            requirePath,
            filename
          );
          if (resolvedPath && TranspilerUtils.isTypeScriptFile(resolvedPath)) {
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
}
