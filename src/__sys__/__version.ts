import fs from "fs";

const dir = "package.json";
const version = (): string => {
  try {
    if (!fs.existsSync(dir)) {
      throw new Error(`File not found: ${dir}`);
    }
    const pkg = JSON.parse(fs.readFileSync(dir, "utf8")); 
    return pkg.version;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};
const v = version();
export { v as __version__ };
export default v;

