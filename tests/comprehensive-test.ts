/**
 * Comprehensive TypeScript Error Test File
 * This file contains various types of TypeScript errors to test the transpiler
 */

// 1. BASIC TYPE ERRORS
const str: string = 123; // Error: number not assignable to string
const num: number = "hello"; // Error: string not assignable to number
const bool: boolean = "true"; // Error: string not assignable to boolean
const arr: number[] = ["a", "b", "c"]; // Error: string[] not assignable to number[]

// 2. TYPOS IN TYPE NAMES
const message: strign = "hello"; // Error: Cannot find name 'strign'
const count: numbr = 42; // Error: Cannot find name 'numbr'
const flag: bolean = true; // Error: Cannot find name 'bolean'

// 3. INTERFACE VIOLATIONS
interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

const user1: User = {
  id: "123", // Error: string not assignable to number
  name: "John",
  email: "john@example.com",
  active: true,
};

const user2: User = {
  id: 1,
  name: "Jane",
  // missing email property // Error: Property 'email' is missing
  active: false,
};

const user3: User = {
  id: 2,
  name: "Bob",
  email: "bob@example.com",
  active: "yes", // Error: string not assignable to boolean
  extra: "property", // Error: Object literal may only specify known properties
};

// 4. FUNCTION PARAMETER ERRORS
function greet(name: string, age: number): string {
  return `Hello ${name}, you are ${age} years old`;
}

greet(123, "25"); // Error: Argument types don't match parameters
greet("Alice"); // Error: Expected 2 arguments, but got 1
greet("Bob", 30, "extra"); // Error: Expected 2 arguments, but got 3

// 5. FUNCTION RETURN TYPE ERRORS
function getName(): string {
  return 42; // Error: number not assignable to string
}

function getAge(): number {
  return "25"; // Error: string not assignable to number
}

function getUser(): User {
  return {
    id: 1,
    name: "Test",
    // missing required properties
  }; // Error: missing properties
}

// 6. ARRAY TYPE ERRORS
const numbers: number[] = [1, 2, "three", 4]; // Error: string in number array
const strings: string[] = ["a", "b", 3, "d"]; // Error: number in string array

// 7. OBJECT PROPERTY ACCESS ERRORS
const person = { name: "John", age: 30 };
console.log(person.naem); // Error: Property 'naem' does not exist (typo)
console.log(person.height); // Error: Property 'height' does not exist

// 8. COMPLEX TYPE ERRORS
type Status = "pending" | "approved" | "rejected";
const currentStatus: Status = "unknown"; // Error: not assignable to union type

type ApiResponse<T> = {
  data: T;
  status: number;
  message: string;
};

const response: ApiResponse<User> = {
  data: {
    id: "invalid", // Error: string not assignable to number
    name: "Test",
    email: "test@example.com",
    active: true,
  },
  status: "200", // Error: string not assignable to number
  message: "Success",
};

// 9. CLASS ERRORS
class Animal {
  constructor(public name: string, public age: number) {}

  speak(): string {
    return "Some sound";
  }
}

class Dog extends Animal {
  constructor(name: string, age: number, public breed: string) {
    super(name, age);
  }

  speak(): number {
    // Error: return type mismatch with parent
    return 42;
  }
}

const dog = new Dog("Buddy", "5", "Golden Retriever"); // Error: string not assignable to number

// 10. GENERIC TYPE ERRORS
function identity<T>(arg: T): T {
  return arg;
}

const result1: string = identity<string>(123); // Error: number not assignable to string
const result2: number = identity<number>("hello"); // Error: string not assignable to number

// 11. PROMISE/ASYNC ERRORS
async function fetchData(): Promise<string> {
  return 42; // Error: number not assignable to Promise<string>
}

async function processData() {
  const data: number = await fetchData(); // Error: string not assignable to number
}

// 12. DESTRUCTURING ERRORS
const userInfo = { id: 1, username: "john", email: "john@test.com" };
const { id, name } = userInfo; // Error: Property 'name' does not exist

// 13. OPTIONAL PROPERTY ERRORS
interface Config {
  host: string;
  port?: number;
  ssl: boolean;
}

const config: Config = {
  host: "localhost",
  port: "3000", // Error: string not assignable to number
  ssl: "true", // Error: string not assignable to boolean
};

// 14. ENUM ERRORS
enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

const favoriteColor: Color = "purple"; // Error: string not assignable to Color enum

// 15. TUPLE TYPE ERRORS
const coordinates: [number, number] = [10, "20"]; // Error: string not assignable to number
const point: [string, number, boolean] = ["A", 10]; // Error: missing third element

// 16. NEVER TYPE ERRORS
function throwError(message: string): never {
  throw new Error(message);
  return "unreachable"; // Error: unreachable code
}

// 17. MAPPED TYPE ERRORS
type Partial<T> = {
  [P in keyof T]?: T[P];
};

const partialUser: Partial<User> = {
  id: "invalid", // Error: string not assignable to number
  invalidProp: "test", // Error: unknown property
};

// 18. CONDITIONAL TYPE ERRORS
type IsString<T> = T extends string ? true : false;
const test1: IsString<string> = false; // Error: false not assignable to true
const test2: IsString<number> = true; // Error: true not assignable to false

// 19. UTILITY TYPE ERRORS
const userKeys: keyof User = "invalidKey"; // Error: string not assignable to keyof User
const userPick: Pick<User, "name" | "age"> = {
  // Error: 'age' does not exist in User
  name: "Test",
  age: 25,
};

// 20. NAMESPACE ERRORS
namespace Utils {
  export function format(value: string): string {
    return value.toUpperCase();
  }
}

Utils.format(123); // Error: number not assignable to string parameter
Utils.invalidFunction(); // Error: Property 'invalidFunction' does not exist

// 21. MODULE DECLARATION ERRORS
declare module "fake-module" {
  export function doSomething(param: string): number;
}

import { doSomething } from "fake-module";
const result: string = doSomething("test"); // Error: number not assignable to string

// 22. INDEX SIGNATURE ERRORS
interface Dictionary {
  [key: string]: number;
}

const dict: Dictionary = {
  a: 1,
  b: "two", // Error: string not assignable to number
  c: 3,
};

// 23. ADVANCED GENERIC ERRORS
interface Container<T extends string | number> {
  value: T;
}

const container1: Container<boolean> = {
  // Error: boolean doesn't extend string | number
  value: true,
};

// 24. DISCRIMINATED UNION ERRORS
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number };

const shape: Shape = {
  kind: "triangle", // Error: 'triangle' not assignable to union
  sides: 3,
};

// 25. RECURSIVE TYPE ERRORS
interface TreeNode {
  value: number;
  children?: TreeNode[];
}

const tree: TreeNode = {
  value: "root", // Error: string not assignable to number
  children: [
    {
      value: 1,
      children: "invalid", // Error: string not assignable to TreeNode[]
    },
  ],
};

console.log("Test file with multiple TypeScript errors");
