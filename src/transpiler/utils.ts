import { extname } from "path";
import { __allowed_ext__, Loader } from "../__sys__/__allowed_ext__.js";

/**
 * Utility functions for the TypeScript transpiler
 */
export class TranspilerUtils {
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
    if (ext.endsWith(".mjs")) return "js";
    if (ext.endsWith(".cjs")) return "js";
    if (ext.endsWith(".json")) return "json";
    if (ext.endsWith(".css")) return "css";
    if (ext.endsWith(".scss")) return "css";
    if (ext.endsWith(".sass")) return "css";
    if (ext.endsWith(".less")) return "css";
    return "js"; // Default fallback
  }

  /**
   * Check if a file is a TypeScript file that needs transpilation
   */
  static isTypeScriptFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ext === ".ts" || ext === ".tsx";
  }

  /**
   * Check if an import path is relative
   */
  static isRelativeImport(importPath: string): boolean {
    return importPath.startsWith("./") || importPath.startsWith("../");
  }

  /**
   * Check if an import path uses path mapping (like @/...)
   */
  static isPathMappedImport(importPath: string): boolean {
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
   * Check if an import path resolves to a TypeScript file
   */
  static isTypeScriptImport(importPath: string, sourceDir: string): boolean {
    const { resolve } = require("path");
    const { existsSync } = require("fs");
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
}
