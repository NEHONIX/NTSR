# NTSR Test Project

This test project verifies that NTSR properly respects the user's `tsconfig.json` configuration.

## Test Setup

- **Permissive tsconfig.json**: Configured with `strict: false` and other relaxed settings
- **Test code**: Contains patterns that would fail strict TypeScript checking but should work with permissive settings
- **Real-world simulation**: Mimics the code patterns from your user-service project

## Code Patterns Being Tested

1. **Any types**: `req: any`, `res: any` - should not trigger `noImplicitAny` errors
2. **Property access**: `req.path`, `req.method`, `req.cookies` - should not trigger strict property access errors
3. **Array methods**: `array.some()` - should work without strict type checking
4. **Response methods**: `res.set()`, `res.cookie()` - should work with any types
5. **Async/Promise**: Should work with ES2020 lib configuration
6. **Regex methods**: `pattern.test()` - should work without strict checking

## How to Test

### Using Local NTSR Build
```bash
cd test-project
npm run dev
```

### Using Global NTSR (after publishing)
```bash
cd test-project
npm run dev:global
```

## Expected Results

✅ **SUCCESS**: If NTSR respects tsconfig.json:
- No TypeScript compilation errors
- Server starts successfully
- All console messages show "✅ Test passed"

❌ **FAILURE**: If NTSR ignores tsconfig.json:
- TypeScript compilation errors about implicit any, strict null checks, etc.
- Server fails to start
- Error messages about property access on unknown types

## Test Scenarios

This project tests the exact same error patterns you encountered:
- `Property 'path' does not exist on type 'unknown'`
- `Property 'some' does not exist on type 'string[]'`
- `Property 'cookies' does not exist on type 'unknown'`
- `Property 'set' does not exist on type 'unknown'`
- `An async function or method must return a 'Promise'`

If NTSR is working correctly, none of these errors should appear because our tsconfig.json is configured to be permissive.
