// Correct TypeScript file - should run without errors

interface Person {
  name: string;
  age: number;
  active: boolean;
}

const person: Person = {
  name: "John",
  age: 30, // Correct: number
  active: true
};

const numbers: number[] = [1, 2, 3]; // Correct: all numbers

function getName(): string {
  return "John Doe"; // Correct: string returned
} 

function greet(name: string, age: number): void { 
  console.log(`Hello ${name}, you are ${age} years old`);
}

greet("Alice", 25); // Correct: string and number

console.log("✅ All types are correct!");
console.log("Person:", person);
console.log("Numbers:", numbers);
console.log("Name:", getName());
