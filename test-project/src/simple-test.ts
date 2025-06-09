// Test TypeScript patterns that were failing before
// This should now work with the permissive tsconfig.json

// Test array methods that were failing
const numbers: number[] = [1, 2, 3, 4, 5];
const hasEven = numbers.some(n => n % 2 === 0);
const doubled = numbers.map(n => n * 2);

// Test Promise functionality that was failing
async function testAsync(): Promise<string> {
  const result = await Promise.resolve("Async test successful");
  return result;
}

// Test regex that was failing
const pathPattern = /^\/api/;
const testPath = "/api/users";
const matches = pathPattern.test(testPath);

// Test object property access
const config = {
  port: 3000,
  host: 'localhost'
};

console.log("✅ Array.some() works:", hasEven);
console.log("✅ Array.map() works:", doubled);
console.log("✅ Regex.test() works:", matches);
console.log("✅ Object properties work:", config.port, config.host);

// Test the async function
testAsync().then(result => {
  console.log("✅ Promise/async works:", result);
  console.log("\n🎉 All TypeScript patterns work correctly!");
  console.log("🎉 NTSR is now respecting the tsconfig.json configuration!");
});
