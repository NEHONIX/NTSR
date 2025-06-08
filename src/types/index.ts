export interface CLIOptions {
  help?: boolean;
  version?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  target?: string;
  format?: string;
  minify?: boolean;
  sourcemap?: boolean;
  forceBuiltin?: boolean;
  showWarnings?: boolean;
  skipTypeCheck?: boolean;
}

export interface ParsedArgs {
  scriptPath?: string;
  scriptArgs: string[];
  options: CLIOptions;
}

export interface RunnerOptions extends CLIOptions {
  cwd?: string;
}

export interface TranspileOptions {
  target?:
    | "es2015"
    | "es2016"
    | "es2017"
    | "es2018"
    | "es2019"
    | "es2020"
    | "es2021"
    | "es2022"
    | "esnext";
  format?: "esm" | "cjs" | "iife";
  minify?: boolean;
  sourcemap?: boolean;
}
