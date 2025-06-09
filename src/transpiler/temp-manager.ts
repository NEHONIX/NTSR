import {
  existsSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmdirSync,
} from "fs";
import { join, dirname, resolve, relative } from "path";
import { tmpdir } from "os";
import { Logger } from "../logger.js";
import { NehoID as ID } from "nehoid";

/** 
 * Manages temporary files and directories for transpilation sessions
 */
export class TempManager {
  private tempFiles: string[] = [];
  private tempDirs: string[] = [];
  private fileMapping: Map<string, string> = new Map(); // Original path -> Temp path mapping
  private currentTempDir: string | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.createChild("TempManager");
  }

  /**
   * Create a unique temporary directory for a transpilation session
   */
  createTempSession(): string {
    const sessionId = ID.generate({ prefix: "nehonix_tsr.dir" });
    const tempDir = join(tmpdir(), sessionId);
    mkdirSync(tempDir, { recursive: true });

    this.currentTempDir = tempDir;
    this.tempDirs.push(tempDir);
    this.fileMapping.clear(); // Clear file mapping for new session

    this.logger.verbose(`Created temp session directory: ${tempDir}`);
    return tempDir;
  }

  /**
   * Get the current temp session directory
   */
  getCurrentTempDir(): string | null {
    return this.currentTempDir;
  }

  /**
   * Add a temp file to tracking
   */
  addTempFile(filePath: string): void {
    this.tempFiles.push(filePath);
  }

  /**
   * Add file mapping
   */
  addFileMapping(originalPath: string, tempPath: string): void {
    this.fileMapping.set(resolve(originalPath), tempPath);
  }

  /**
   * Get mapped temp path for an original file
   */
  getMappedPath(originalPath: string): string | undefined {
    return this.fileMapping.get(resolve(originalPath));
  } 

  /**
   * Calculate the target path for a dependency in the temp directory
   */
  calculateTargetPath(
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
  calculateTranspiledOutputPath(
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

    return join(tempDir, safePath);
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
}
