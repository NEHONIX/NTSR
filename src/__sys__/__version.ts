// Version will be injected at build time by the build script
// This avoids runtime file system lookups and works in all environments

// BUILD_VERSION_PLACEHOLDER will be replaced by the build script
const BUILD_VERSION = "BUILD_VERSION_PLACEHOLDER";

const version = (): string => {
  //this will be replaced by the build script
  return BUILD_VERSION;
};

const v = version();
export { v as __version__ };
export default v;
