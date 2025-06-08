// TypeScript compilation errors that should be caught at compile time

interface User {
  name: string;
  age: number;
} 

// Type error: string assigned to number
const user: User = {
  name: "John",
  age: "thirty" // This should cause a TypeScript compilation error
};

// Type error: calling non-existent method
const message: string = "hello";
message.nonExistentMethod(); // This should cause a TypeScript compilation error

// Type error: wrong parameter type
function greet(name: string): void {
  console.log(`Hello ${name}`);
}

greet(123); // This should cause a TypeScript compilation error

console.log("User:", user);
