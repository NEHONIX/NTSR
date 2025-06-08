// Strict TypeScript errors that should definitely be caught

// 1. Undefined variable
console.log(undefinedVariable);

// 2. Wrong method call
const str = "hello";
str.nonExistentMethod();
 
// 3. Import error
import { NonExistentModule } from "./does-not-exist";

// 4. Syntax error in type
interface BadInterface {
  name: string;
  age: number;
  invalid syntax here
}

console.log("This should not run due to TypeScript errors");
