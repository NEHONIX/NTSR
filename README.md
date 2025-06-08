# NTSR - Nehonix TypeScript Runner

<div align="center">

[![npm version](https://badge.fury.io/js/ntsr.svg)](https://badge.fury.io/js/ntsr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

**Professional TypeScript execution with zero configuration**  
_Built for the Fortify ecosystem - optimized for speed and simplicity_

</div>

---

## Key Features

- **Zero Configuration** - Run TypeScript files instantly, no setup required
- **Real Type Checking** - Full TypeScript compiler API integration with precise error reporting
- **Smart Execution Strategy** - Automatically uses tsx → ts-node → bun → built-in transpiler
- **Professional Output** - Colorized logs, progress indicators, and detailed error messages
- **High Performance** - Optimized for quick execution with intelligent caching
- **TSConfig Integration** - Automatically finds and uses your project's TypeScript configuration
- **Cross-Platform Support** - Works seamlessly on Windows, macOS, and Linux
- **Lightweight Architecture** - Minimal dependencies, maximum performance
- **Developer Experience** - Verbose logging, helpful error messages, and clean output

## Quick Start

```bash
# Install globally
npm install -g ntsr

# Run any TypeScript file instantly
ntsr server.ts
ntsr app.ts --port 3000
ntsr script.ts arg1 arg2

# With enhanced logging
ntsr --verbose complex-app.ts
```

## Installation

### Global Installation (Recommended)

```bash
npm install -g ntsr
```

### Local Installation

```bash
npm install ntsr
npx ntsr script.ts
```

### Enhanced Compatibility (Optional)

Install external runners for maximum compatibility:

```bash
npm install -g tsx ts-node
```

## Usage

### Basic Usage

```bash
ntsr script.ts
```

### With Script Arguments

```bash
ntsr server.ts --port 3000 --env production
ntsr test.ts --verbose --timeout 5000
```

### NTSR Options

```bash
# Verbose logging with detailed execution steps
ntsr --verbose app.ts

# Quiet mode (errors only)
ntsr --quiet app.ts

# Force built-in transpiler (skip external runners)
# Display all TypeScript errors
ntsr --force-builtin script.ts

# Show Node.js deprecation warnings from dependencies
ntsr --show-warnings app.ts

# Disable colored output
ntsr --no-color script.ts

# Set compilation target
ntsr --target=es2020 modern-app.ts

# Generate source maps
ntsr --sourcemap debug-app.ts
```

## Examples

### HTTP Server Implementation

```typescript
// server.ts
import { createServer } from "http";

const port = parseInt(process.argv[2]) || 3000;

const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      message: "Hello from TypeScript!",
      timestamp: new Date().toISOString(),
    })
  );
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
```

```bash
ntsr server.ts 8080
```

### Command Line Interface with Type Safety

```typescript
// cli.ts
interface AppConfig {
  name: string;
  version: string;
  environment: "development" | "production";
}

const config: AppConfig = {
  name: process.argv[2] || "my-app",
  version: "1.0.0",
  environment: (process.argv[3] as AppConfig["environment"]) || "development",
};

console.log(`${config.name} v${config.version} (${config.environment})`);
```

```bash
ntsr cli.ts my-awesome-app production
```

### Advanced Implementation with External Dependencies

```typescript
// advanced.ts
import { readFile } from "fs/promises";
import { join } from "path";

interface User {
  id: number;
  name: string;
  email: string;
}

async function loadUsers(): Promise<User[]> {
  try {
    const data = await readFile(join(__dirname, "users.json"), "utf-8");
    return JSON.parse(data) as User[];
  } catch (error) {
    console.error("Failed to load users:", error);
    return [];
  }
}

async function main() {
  const users = await loadUsers();
  console.log(`Found ${users.length} users`);
  users.forEach((user) => {
    console.log(`- ${user.name} (${user.email})`);
  });
}

main().catch(console.error);
```

```bash
ntsr --verbose advanced.ts
```

## Architecture

### Execution Flow

1. **Built-in Transpilation**: NTSR includes a fast TypeScript-to-JavaScript transpiler
2. **External Runner Detection**: Falls back to tsx, ts-node, or bun if available
3. **Intelligent Caching**: Uses temporary files for compiled output
4. **Automatic Cleanup**: Removes temporary files after execution

### Supported TypeScript Features

- Interfaces and types
- Enums
- Generic types
- Import/export statements
- Decorators (basic support)
- Modern ES features

## Troubleshooting

### Script File Not Found

Ensure the file path is correct and the file exists in the specified location.

### Compilation Errors

NTSR will automatically attempt external runners when compilation fails. For improved compatibility, install tsx:

```bash
npm install -g tsx
```

### Windows Path Issues

Use forward slashes or properly escape backslashes in file paths:

```bash
ntsr src/app.ts        # Recommended
ntsr src\\app.ts       # Alternative
ntsr src\app.ts        # May cause issues
```

## Development

### Setup

```bash
# Clone and setup
git clone https://github.com/NEHONIX/NTSR
cd NTSR
npm install
```

### Build Process

```bash
# Build
npm run build

# Test
npm run test

# Local testing
node dist/NTSR.cjs test-script.ts
```

## Contributing

We welcome contributions to improve NTSR. Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add comprehensive tests
5. Submit a pull request

## License

This project is licensed under the MIT License. See the LICENSE file for complete details.

## Related Projects

- [fortify2-js](https://github.com/NEHONIX/FortifyJS.git) - Advanced JavaScript/TypeScript utilities
- [tsx](https://github.com/esbuild-kit/tsx) - Alternative TypeScript execution environment
- [ts-node](https://github.com/TypeStrong/ts-node) - TypeScript execution and REPL environment
