import pc from "picocolors";

export enum LogLevel {
  QUIET = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  VERBOSE = 4,
}

export interface LoggerOptions {
  level: LogLevel;
  colors: boolean;
  prefix: string;
}

export class Logger {
  private options: LoggerOptions;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: LogLevel.INFO,
      colors: true,
      prefix: "NTSR",
      ...options,
    };
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.options.level = level;
  }

  /**
   * Enable or disable colors
   */
  setColors(enabled: boolean): void {
    this.options.colors = enabled;
  }

  /**
   * Set the prefix for log messages
   */
  setPrefix(prefix: string): void {
    this.options.prefix = prefix;
  }

  /**
   * Log an info message
   */
  info(message: string): void {
    if (this.options.level >= LogLevel.INFO) {
      const formatted = this.formatMessage("INFO", message, pc.blue);
      console.log(formatted);
    }
  }

  /**
   * Log a success message
   */
  success(message: string): void {
    if (this.options.level >= LogLevel.INFO) {
      const formatted = this.formatMessage("SUCCESS", message, pc.green);
      console.log(formatted);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string): void {
    if (this.options.level >= LogLevel.WARN) {
      const formatted = this.formatMessage("WARN", message, pc.yellow);
      console.warn(formatted);
    }
  }

  /**
   * Log an error message
   */
  error(message: string): void {
    if (this.options.level >= LogLevel.ERROR) {
      const formatted = this.formatMessage("ERROR", message, pc.red);
      console.error(formatted);
    }
  }

  /**
   * Log a verbose/debug message
   */
  verbose(message: string): void {
    if (this.options.level >= LogLevel.VERBOSE) {
      const formatted = this.formatMessage("VERBOSE", message, pc.gray);
      console.log(formatted);
    }
  }

  /**
   * Log TypeScript compilation errors with syntax highlighting
   */
  typeScriptError(filename: string, errors: string[]): void {
    if (this.options.level >= LogLevel.ERROR) {
      const header = this.formatMessage(
        "TYPE ERROR",
        `TypeScript compilation failed for ${filename}:`,
        pc.red
      );
      console.error(header);

      errors.forEach((error) => {
        const highlighted = this.highlightTypeScriptError(error);
        console.error(`  ${highlighted}`);
      });
    }
  }

  /**
   * Log a plain message without formatting (for help text, etc.)
   */
  plain(message: string): void {
    console.log(message);
  }

  /**
   * Format a log message with colors and prefix
   */
  private formatMessage(
    level: string,
    message: string,
    colorFn: (text: string) => string
  ): string {
    if (!this.options.colors) {
      return `[${this.options.prefix} ${level}] ${message}`;
    }

    const prefix = pc.bold(`[${this.options.prefix}]`);
    const levelText = colorFn(level);
    return `${prefix} ${levelText} ${message}`;
  }

  /**
   * Highlight TypeScript error messages
   */
  private highlightTypeScriptError(error: string): string {
    if (!this.options.colors) {
      return error;
    }

    // Highlight file paths and line numbers
    let highlighted = error.replace(
      /([^:]+):(\d+):(\d+)/g,
      `${pc.cyan("$1")}:${pc.yellow("$2")}:${pc.yellow("$3")}`
    );

    // Highlight error messages
    highlighted = highlighted.replace(/- (.+)/g, `- ${pc.red("$1")}`);

    // Highlight type names
    highlighted = highlighted.replace(/'([^']+)'/g, `'${pc.magenta("$1")}'`);

    // Highlight keywords
    highlighted = highlighted.replace(
      /\b(Type|Cannot|is not assignable to|Argument of type|Property)\b/g,
      pc.bold("$1")
    );

    return highlighted;
  }

  /**
   * Create a logger instance for a specific component
   */
  createChild(prefix: string): Logger {
    return new Logger({
      ...this.options,
      prefix: `${this.options.prefix}:${prefix}`,
    });
  }

  /**
   * Log a step in a process with a spinner-like indicator
   */
  step(message: string): void {
    if (this.options.level >= LogLevel.INFO) {
      const indicator = this.options.colors ? pc.blue("🔄") : ">";
      const formatted = `${indicator} ${message}`;
      console.log(formatted);
    }
  }

  /**
   * Log a completed step
   */
  stepComplete(message: string): void {
    if (this.options.level >= LogLevel.INFO) {
      const indicator = this.options.colors ? pc.green("✅") : "✓";
      const formatted = `${indicator} ${message}`;
      console.log(formatted);
    }
  }

  /**
   * Log a failed step
   */
  stepFailed(message: string): void {
    if (this.options.level >= LogLevel.ERROR) {
      const indicator = this.options.colors ? pc.red("❌") : "✗";
      const formatted = `${indicator} ${message}`;
      console.error(formatted);
    }
  }

  /**
   * Log a successful step
   */
  stepSuccess(message: string): void {
    if (this.options.level >= LogLevel.INFO) {
      const indicator = this.options.colors ? pc.green("✅") : "✓";
      const formatted = `${indicator} ${message}`;
      console.log(formatted);
    }
  }
}
