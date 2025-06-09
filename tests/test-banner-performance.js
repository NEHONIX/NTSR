// Performance test for banner optimization
const { performance } = await import("perf_hooks");

// Test the optimized banner
async function testOptimizedBanner() {
  const start = performance.now();

  // Import the optimized banner
  const { __banner__ } = await import("../src/__sys__/__banner__.js");

  // Call the banner function multiple times to test caching
  for (let i = 0; i < 100; i++) {
    __banner__();
  }

  const end = performance.now();
  return end - start;
}

// Test old-style banner (simulated)
function testOldStyleBanner() {
  const start = performance.now();

  // Simulate the old approach with many template literals and color codes
  const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    gray: "\x1b[90m",
  };

  for (let i = 0; i < 100; i++) {
    // Simulate the old banner construction
    const banner = [
      "",
      `${colors.cyan}    ╭═══════════════════════════════════════════════════════════════════════╮${colors.reset}`,
      `${colors.cyan}│${colors.reset}     ${colors.yellow}███╗   ██╗${colors.yellow}████████╗${colors.red}███████╗${colors.magenta}██████╗${colors.reset}      ${colors.cyan}│${colors.reset}`,
      `${colors.cyan}│${colors.reset}           ${colors.magenta}Nehonix TypeScript Runner v1.0.4${colors.reset}                  ${colors.cyan}│${colors.reset}`,
      `${colors.cyan}│${colors.reset}       ${colors.blue}⚡ Lightning-fast TypeScript execution made simple ⚡${colors.reset}       ${colors.cyan}│${colors.reset}`,
      `${colors.cyan}    ╰═══════════════════════════════════════════════════════════════════════╯${colors.reset}`,
      "",
    ].join("\n");
  }

  const end = performance.now();
  return end - start;
}

async function runPerformanceTest() {
  console.log("🚀 Testing banner performance...\n");

  // Test old style
  const oldTime = testOldStyleBanner();
  console.log(`❌ Old style (template literals): ${oldTime.toFixed(2)}ms`);

  // Test optimized version
  const newTime = await testOptimizedBanner();
  console.log(`✅ Optimized (picocolors + caching): ${newTime.toFixed(2)}ms`);

  const improvement = ((oldTime - newTime) / oldTime) * 100;
  console.log(
    `\n🎯 Performance improvement: ${improvement.toFixed(1)}% faster`
  );
  console.log(`⚡ Speed increase: ${(oldTime / newTime).toFixed(1)}x`);
}

runPerformanceTest().catch(console.error);
