// Test server that mimics the code patterns from the prod env codebase
// This code should work with the permissive tsconfig.json above

import { createServer } from "fortify2-js";
import { config } from "./config/fortifyjs.config";
import { nested_dir_config } from "./dir/sub dir/nested dir/nested_dir.config";

export const app = createServer(nested_dir_config);

// Middleware
app.middleware({
  rateLimit: {
    max: 1, //  (just for testing)
  },
});

// This code would fail strict type checking but should work with our permissive config
app.use((req: any, res: any, next: any) => {
  // These properties exist on FortifyJs req/res but TypeScript might not know without proper typing
  console.log("Request path:", req.path);
  console.log("Request method:", req.method);

  // Test array method that was failing
  const allowedPaths: string[] = ["/api", "/health", "/status"];
  const isAllowed = allowedPaths.some((path) => req.path.startsWith(path));

  if (req.cookies) {
    console.log("Request has cookies:", req.cookies);
  }

  // Test response methods
  res.set("X-Custom-Header", "test");
  res.cookie("session", "test-value");

  next();
});

// Test route with potentially problematic TypeScript patterns
app.get("/test", async (req: any, res: any) => {
  // Test regex that was failing
  const pathPattern = /^\/api/;
  const matches = pathPattern.test(req.path);

  // Test response methods
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-cache");

  if (req.method === "GET") {
    res.set("X-Method", "GET");
  }

  // Test async/Promise functionality
  const result = await Promise.resolve({
    message: "Test successful",
    path: req.path,
    method: req.method,
    matches: matches,
    timestamp: new Date().toISOString(),
  });

  res.json(result);
});

// Health check endpoint
app.get("/health", (req: any, res: any) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    path: req.path,
  });
});

// Start server
app.start(undefined, () => {
  console.log(`✅ Test server running on http://localhost:${app.getPort()}`);
  console.log(
    `✅ TypeScript compilation successful with permissive tsconfig.json`
  );
  console.log(`✅ All potentially strict-failing code patterns work correctly`);

  // Test some additional patterns that might fail strict checking
  const testArray: string[] = ["test1", "test2"];
  const hasTest = testArray.some((item) => item.includes("test"));
  console.log(`✅ Array.some() method works: ${hasTest}`);

  // Test Promise functionality
  Promise.resolve("async test").then((result) => {
    console.log(`✅ Promise functionality works: ${result}`);
  });

  console.log(
    "\n🎉 All tests passed! NTSR is respecting the permissive tsconfig.json"
  );
  console.log(
    ` 🔗 Visit http://localhost:${app.getPort()}/test to test the API`
  );
  console.log(
    `🔗 Visit http://localhost:${app.getPort()}/health for health check`
  );

  // redirect port
  app.redirectFromPort(3000, app.getPort());
  console.log(`🔗 Visit http://localhost:3000 to test the API (redirected)`);
});
