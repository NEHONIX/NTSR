// Simple test to check if tsconfig.json is being read
const numbers: number[] = [1, 2, 3];
const hasEven = numbers.some(n => n % 2 === 0);

async function test(): Promise<string> {
  return Promise.resolve("Hello World");
}

console.log("Has even numbers:", hasEven);
test().then(result => console.log(result));
