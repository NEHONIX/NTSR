/**
 * Allowed file extensions for transpilation
 */
export const __allowed_ext__ = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

export const __ext_with_comments = __allowed_ext__.map((e) => {
  const comment = [
    "TypeScript",
    "TypeScript JSX",
    "JavaScript",
    "JavaScript JSX",
    "JavaScript (ESM)",
    "JavaScript (CommonJS)",
  ] as const;

  return {
    ext: e,
    comment: comment[__allowed_ext__.indexOf(e)],
  };
});

// remove dot from extension
function removeFirstChar<T extends string>(
  str: T
): T extends `.${infer U}` ? U : T {
  return str.slice(1) as any;
}

export const __allowed_ext_no_dot__ = __allowed_ext__.map(removeFirstChar);
// Type will be something like: ("ts" | "tsx" ...)
export type AllowedExtWithoutDot = (typeof __allowed_ext_no_dot__)[number];
export type AllowedExtWithDot = (typeof __allowed_ext__)[number];
export type Loader =
  | "base64"
  | "binary"
  | "copy"
  | "css"
  | "dataurl"
  | "default"
  | "empty"
  | "file"
  | "js"
  | "json"
  | "jsx"
  | "local-css"
  | "text"
  | "ts"
  | "tsx";
