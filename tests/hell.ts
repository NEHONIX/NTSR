/**
 * This file is used to test the TypeScript transpiler.
 */

const message: string = "Hello, World!";
// const message: string = "Hello, World!"; //should display err (works)
const message2: string = "Hello, World!"; //fixed the type error
console.log(message);
console.log(message2);
 
// complex type checking
interface Person {
  name: string;
  age: number;
}

const person: Person = {
  name: "John",
  age: 30,
};

const person2: Person = {
  name: "John",
  age: "30", // should display type err
};

console.log(person);
console.log(person2);

// more extremelly complex type
type DeepObject = Parameters<
  (a: { a: { b: { c: string } } }, b: string) => void
>[0];

const deepObject: DeepObject = {
  a: { b: { c: "hello" } },
};

const deepObject2: DeepObject = {
  a: { b: { c: 123 } }, // should display type err
};

console.log(deepObject);
console.log(deepObject2);
