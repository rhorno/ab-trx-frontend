# Backend Debugging Guide

## Quick Start

### Option 1: VS Code Debugger (Recommended)

1. **Set breakpoints** in your TypeScript files (`.ts` files in `services/` or `.js` files in `api/`)
2. **Press F5** or go to Run & Debug panel
3. **Select** "Debug Backend (tsx)" or "Debug Backend (Mock Services)"
4. **Start debugging** - breakpoints will work in TypeScript files

### Option 2: Node.js Inspector (Chrome DevTools)

1. **Start server with inspector:**

   ```bash
   npm run debug
   # or with mocks:
   npm run debug:mock
   ```

2. **Open Chrome/Edge** and navigate to: `chrome://inspect`

3. **Click "inspect"** under your Node.js process (you should see "ab-trx-importer-frontend" or similar)

4. **Set breakpoints** directly in Chrome DevTools Sources panel

### Option 3: Command Line with Inspector

```bash
# Start with inspector on port 9229
npm run debug

# Or with mocks:
npm run debug:mock

# Then attach VS Code using "Attach to Backend (Inspector)" configuration
# Or open chrome://inspect in Chrome/Edge
```

## Debugging Strategies

### 1. Enhanced Logging

The project uses a simple logger (`services/shared/logger.ts`). To enable verbose logging:

```typescript
import { initializeLogger, getLogger } from "../shared/logger.js";

// Enable verbose mode (shows debug messages)
initializeLogger(true);

const logger = getLogger("MyComponent");
logger.debug("This only shows in verbose mode");
logger.info("This always shows");
logger.error("Errors always show");
```

### 2. Debugging SSE Streams

For debugging Server-Sent Events in `api/routes/import.js`:

- **Set breakpoints** before `res.write()` calls
- **Inspect** the data being sent: `JSON.stringify({ type, message, ... })`
- **Check** `res.headersSent` to understand response state
- **Monitor** client disconnects via `req.on("close")`

### 3. Debugging Service Layer

Services are TypeScript files. Breakpoints work directly:

- **Configuration Service**: `services/configuration/index.ts`
- **Actual Budget Service**: `services/actual-budget/index.ts`
- **Bank Integration Service**: `services/bank-integration/index.ts`

### 4. Debugging Dynamic Imports

Since services are dynamically imported, you can:

- **Set breakpoints** in the import statement
- **Inspect** the imported module: `configModule.configurationService`
- **Check** module exports: `Object.keys(configModule)`

### 5. Environment Variables

Control debugging behavior:

```bash
# Use mock services (faster, no real connections)
USE_MOCK_SERVICES=true npm start

# Enable verbose logging (if implemented)
DEBUG=true npm start

# Development mode
NODE_ENV=development npm start
```

## Common Debugging Scenarios

### Scenario 1: Import Endpoint Not Responding

1. **Check** if server started: `curl http://localhost:8000/api/health`
2. **Set breakpoint** in `server.js` line 22 (`app.get("/api/import")`)
3. **Check** query parameters: `req.query.profile`
4. **Verify** SSE headers are set correctly

### Scenario 2: Service Import Failing

1. **Set breakpoint** at dynamic import: `await import("../../services/...")`
2. **Check** file path is correct (`.ts` extension for tsx)
3. **Verify** exports match: `configModule.configurationService`
4. **Check** console for TypeScript compilation errors

### Scenario 3: SSE Stream Not Closing

1. **Set breakpoint** in error handlers
2. **Check** `res.headersSent` before writing
3. **Verify** `res.end()` is called
4. **Monitor** `req.on("close")` for client disconnects

### Scenario 4: TypeScript Type Errors

1. **Check** terminal output for TypeScript errors
2. **Verify** `tsconfig.json` is correct
3. **Check** import paths use `.ts` extension (for tsx) or `.js` (if compiled)
4. **Run** `npx tsc --noEmit` to check types without compiling

## VS Code Debugging Tips

### Breakpoint Types

- **Line breakpoints**: Click in gutter
- **Conditional breakpoints**: Right-click → "Add Conditional Breakpoint"
- **Logpoints**: Right-click → "Add Logpoint" (no pause, just log)

### Debug Console

- **Evaluate expressions** in current scope
- **Inspect variables**: Hover or use Debug Console
- **Call functions**: Type function name in Debug Console

### Watch Expressions

- **Add watch**: Right-click variable → "Add to Watch"
- **Monitor** values that change during execution

## Chrome DevTools Tips

### Sources Panel

- **Set breakpoints** in loaded files
- **Step through** code: F10 (step over), F11 (step into), Shift+F11 (step out)
- **Inspect** call stack

### Console Panel

- **Evaluate** expressions in current scope
- **Inspect** variables: `$0` (selected element), `$1` (previous)
- **Call** functions from current scope

### Network Panel

- **Monitor** SSE connections: Look for `text/event-stream`
- **Inspect** request/response headers
- **Check** connection status

## Troubleshooting

### Breakpoints Not Hitting

1. **Verify** source maps are enabled: `"sourceMaps": true` in launch.json
2. **Check** file paths match exactly
3. **Restart** debugger after code changes
4. **Verify** tsx is handling TypeScript correctly

### TypeScript Errors in Debugger

1. **Check** `tsconfig.json` settings
2. **Verify** `tsx` is installed: `npm list tsx`
3. **Try** compiling first: `npx tsc` (if using compiled JS)

### Inspector Not Connecting

1. **Check** port 9229 is not in use: `lsof -i :9229`
2. **Verify** `--inspect-brk` flag is correct
3. **Check** firewall settings
4. **Try** `0.0.0.0:9229` instead of `localhost:9229`

### Services Not Loading

1. **Check** import paths use correct extensions (`.ts` for tsx)
2. **Verify** exports match interface definitions
3. **Check** console for import errors
4. **Verify** `package.json` has `"type": "module"`

## Best Practices

1. **Use VS Code debugger** for step-by-step debugging
2. **Use console.log** for quick debugging (remove before commit)
3. **Use logger** for structured logging
4. **Set breakpoints** at service boundaries
5. **Debug** with mocks first (faster iteration)
6. **Test** with real services after mock debugging

## Additional Resources

- [VS Code Debugging](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
- [tsx Documentation](https://github.com/esbuild-kit/tsx)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
