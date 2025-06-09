// Test file to demonstrate path mapping support
import { app } from "@/server2";
import { config } from "./config/fortifyjs.config";

console.log("🎉 Path mapping test!");
console.log("✅ Successfully imported from @/server2");
console.log("✅ Successfully imported from ./config/fortifyjs.config");

// Test the imported modules
if (app) {
  console.log("✅ App object is available");
}

if (config) {
  console.log("✅ Config object is available");
}

console.log("🚀 All path mappings working correctly!");
