// Real TypeScript type checking test

// 1. Basic type error
const message: strins = "Hello"; // Should catch: strins -> string

// 2. Interface property type errors
interface Person {
  name: string;
  age: number;
  active: boolean;
}

const person: Person = {
  name: "John",
  age: "30", // Should catch: string assigned to number
  active: true
};

// 3. Array type errors
const numbers: number[] = [1, 2, "three"]; // Should catch: string in number array

// 4. Function return type errors
function getName(): string {
  return 42; // Should catch: number returned instead of string
}

// 5. Function parameter type errors
function greet(name: string, age: number): void {
  console.log(`Hello ${name}, you are ${age} years old`);
}

greet("Alice", "25"); // Should catch: string passed to number parameter

console.log(message, person, numbers, getName());
