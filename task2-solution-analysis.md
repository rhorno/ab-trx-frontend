# Solution Analysis: Task 2 - Minimal Backend API

## Problem Summary

Create a single Express.js endpoint (`POST /api/import`) that:
- Accepts a profile name in the request body
- Executes the CLI tool with the profile (hardcoded dry-run for POC)
- Captures CLI output (stdout and stderr)
- Returns JSON response with success status and output
- Handles errors gracefully without crashing

**Context**:
- CLI tool is at `/Users/richardhorno/dev/ab-trx-importer/`
- CLI command: `npm start -- --profile=<profile> --dry-run`
- CLI is TypeScript, needs build step (handled by `npm start`)
- This is a POC - keep it minimal, no streaming, no timeouts yet

## Research & Best Practices

### child_process.exec() vs spawn()

**exec() Advantages (for POC):**
- Simpler API - single callback with complete output
- Buffers output automatically (no need to manually collect chunks)
- Perfect for short-running commands
- Less code to write and maintain

**spawn() Advantages (for future):**
- Real-time streaming (needed for WebSocket later)
- Better for long-running processes
- More control over process lifecycle
- Can handle interactive processes

**Recommendation for POC**: Use `exec()` - simpler, sufficient for POC needs. Can migrate to `spawn()` when adding streaming.

### CLI Execution Patterns

**Working Directory:**
- Must execute from CLI tool's directory (where `package.json` is)
- Use `cwd` option in `exec()` to set working directory
- Ensures CLI can find its config files (`.env`, `profiles.json`)

**Command Structure:**
- CLI uses: `npm start -- --profile=<profile> --dry-run`
- `npm start` runs: `npm run build && node dist/index.js`
- The `--` passes arguments to the actual CLI
- Need to execute from CLI directory: `/Users/richardhorno/dev/ab-trx-importer/`

**Environment Variables:**
- CLI needs access to `.env` file in its directory
- May need to pass environment variables explicitly
- For POC, can rely on `.env` file being in CLI directory

### Express.js Best Practices

**Async Route Handlers:**
- Use async/await or Promises for child_process operations
- Wrap in try/catch for error handling
- Return consistent JSON responses

**Error Handling:**
- Catch child_process errors (command not found, execution failures)
- Handle non-zero exit codes (CLI errors)
- Return user-friendly error messages
- Don't expose internal errors to frontend

**Request Validation:**
- Validate request body has required fields
- Return 400 for invalid requests
- Sanitize inputs (though minimal for POC)

## Solution Plans

### Plan A: Simple exec() with Basic Error Handling (Recommended for POC)
**Approach:** Use `child_process.exec()` with Promise wrapper, basic try/catch, return simple JSON response

**Timeline:** 30-45 minutes

**Technical Debt Impact:** Low - Appropriate for POC, easy to enhance later

**Pros:**
- Simplest implementation
- Fastest to code and test
- Sufficient for POC needs
- Easy to understand and debug
- No complex async handling needed

**Cons:**
- No real-time output (buffers everything)
- No timeout handling (could hang if CLI hangs)
- No process cancellation
- Limited error detail

**Implementation Steps:**
1. Add `POST /api/import` endpoint to `server.js`
2. Extract `profile` from request body
3. Validate profile exists (basic check)
4. Use `exec()` with Promise wrapper:
   ```javascript
   const { exec } = require('child_process');
   const { promisify } = require('util');
   const execAsync = promisify(exec);
   ```
5. Execute: `npm start -- --profile=${profile} --dry-run`
6. Set `cwd` to CLI directory
7. Wrap in try/catch
8. Return: `{ success: boolean, output: string, error: string }`

**Code Structure:**
```javascript
app.post('/api/import', async (req, res) => {
  try {
    const { profile } = req.body;

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'Profile is required'
      });
    }

    const CLI_DIR = '/Users/richardhorno/dev/ab-trx-importer';
    const command = `npm start -- --profile=${profile} --dry-run`;

    const { stdout, stderr } = await execAsync(command, {
      cwd: CLI_DIR,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    res.json({
      success: true,
      output: stdout,
      error: stderr || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      output: error.stdout || null
    });
  }
});
```

---

### Plan B: Enhanced exec() with Better Error Handling
**Approach:** Same as Plan A but with more detailed error handling, exit code checking, and input validation

**Timeline:** 45-60 minutes

**Technical Debt Impact:** Low - Still appropriate for POC, better error handling

**Pros:**
- Better error messages for debugging
- Handles CLI exit codes properly
- More robust input validation
- Better separation of error types

**Cons:**
- Slightly more code
- Still no timeout or streaming
- More complexity than needed for POC

**Implementation Steps:**
1. Same as Plan A steps 1-4
2. Add input sanitization (prevent command injection)
3. Check exit code explicitly
4. Distinguish between execution errors and CLI errors
5. Return more detailed error information

**Code Structure:**
```javascript
app.post('/api/import', async (req, res) => {
  try {
    const { profile } = req.body;

    // Validation
    if (!profile || typeof profile !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Profile must be a non-empty string'
      });
    }

    // Basic sanitization (prevent command injection)
    if (!/^[a-zA-Z0-9_-]+$/.test(profile)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile name format'
      });
    }

    const CLI_DIR = '/Users/richardhorno/dev/ab-trx-importer';
    const command = `npm start -- --profile=${profile} --dry-run`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: CLI_DIR,
        maxBuffer: 10 * 1024 * 1024
      });

      res.json({
        success: true,
        output: stdout,
        error: stderr || null
      });
    } catch (execError) {
      // exec() rejects on non-zero exit code
      // Check if it's a CLI error or execution error
      if (execError.code === 'ENOENT') {
        return res.status(500).json({
          success: false,
          error: 'CLI tool not found. Check CLI_DIR path.'
        });
      }

      // CLI returned error (non-zero exit)
      res.status(500).json({
        success: false,
        error: execError.message,
        output: execError.stdout || null,
        stderr: execError.stderr || null
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});
```

---

### Plan C: spawn() with Streaming (Overkill for POC)
**Approach:** Use `spawn()` instead of `exec()` to prepare for future streaming, but still buffer output for POC

**Timeline:** 60-90 minutes

**Technical Debt Impact:** Medium - Adds complexity not needed for POC, but sets foundation for streaming

**Pros:**
- Foundation for future WebSocket streaming
- More control over process
- Better for long-running operations
- Can add timeout easily later

**Cons:**
- Overkill for POC
- More complex code
- Manual output buffering needed
- Slower to implement and test

**Recommendation:** **Do not use for POC** - This adds unnecessary complexity. Can migrate to spawn() when adding streaming in Iteration 3.

---

## Recommendation

**Use Plan A: Simple exec() with Basic Error Handling**

**Justification:**
1. **POC Principle**: Simplest thing that works
2. **Speed**: Fastest to implement and test
3. **Sufficiency**: Meets all POC requirements
4. **Clarity**: Easy to understand and debug
5. **Migration Path**: Easy to enhance to Plan B or migrate to spawn() later

**When to Consider Plan B:**
- If you encounter issues with error handling during testing
- If you need better debugging information
- Still very simple, just adds validation

**When to Consider Plan C:**
- Only when adding real-time streaming (Iteration 3)
- Not needed for POC

---

## Risk Assessment

### Risk 1: CLI Tool Not Found
**Likelihood:** Low
**Impact:** High (endpoint fails)
**Mitigation:**
- Use absolute path for CLI directory
- Test CLI manually first to verify path
- Return clear error message if CLI not found
- Can add path validation in Plan B

### Risk 2: Command Injection
**Likelihood:** Low (local network only)
**Impact:** Medium (security concern)
**Mitigation:**
- Basic input validation (Plan A: check profile exists)
- Sanitize profile name (Plan B: regex validation)
- For POC, local network reduces risk
- Can enhance validation later

### Risk 3: CLI Hangs/Timeout
**Likelihood:** Medium (CLI may wait for user input)
**Impact:** Medium (request hangs, no response)
**Mitigation:**
- Use dry-run mode (non-interactive)
- Test CLI manually first to ensure it works headless
- For POC, acceptable risk (can add timeout in future)
- Document that timeout handling is deferred

### Risk 4: Large Output Buffer
**Likelihood:** Low
**Impact:** Low
**Mitigation:**
- Set `maxBuffer` option (10MB default, can increase)
- For POC, dry-run output should be small
- Can adjust if needed

### Risk 5: Environment Variables Not Available
**Likelihood:** Low
**Impact:** Medium (CLI fails)
**Mitigation:**
- CLI reads `.env` from its directory
- Ensure CLI directory has `.env` file
- Can pass env vars explicitly if needed
- Test CLI manually first

### Risk 6: Working Directory Issues
**Likelihood:** Low
**Impact:** Medium (CLI can't find config files)
**Mitigation:**
- Always use `cwd` option pointing to CLI directory
- Use absolute path for CLI directory
- Test that CLI can find `.env` and `profiles.json`

---

## Dependencies & Prerequisites

### Prerequisites
- CLI tool exists at `/Users/richardhorno/dev/ab-trx-importer/`
- CLI tool has `.env` file configured
- CLI tool has at least one profile in `profiles.json`
- Node.js >= 18.12.0 (already verified)

### Dependencies
- `express` (already installed)
- `cors` (already installed)
- Node.js built-in: `child_process`, `util` (no install needed)

**No new dependencies required!**

---

## Implementation Details

### Step-by-Step Execution

**1. Add util import (5 minutes)**
```javascript
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
```

**2. Add CLI directory constant (2 minutes)**
```javascript
const CLI_DIR = '/Users/richardhorno/dev/ab-trx-importer';
```

**3. Add POST endpoint (20 minutes)**
```javascript
app.post('/api/import', async (req, res) => {
  try {
    const { profile } = req.body;

    if (!profile) {
      return res.status(400).json({
        success: false,
        error: 'Profile is required'
      });
    }

    const command = `npm start -- --profile=${profile} --dry-run`;

    const { stdout, stderr } = await execAsync(command, {
      cwd: CLI_DIR,
      maxBuffer: 10 * 1024 * 1024
    });

    res.json({
      success: true,
      output: stdout,
      error: stderr || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      output: error.stdout || null
    });
  }
});
```

**4. Test manually (10 minutes)**
```bash
# Start backend
cd backend && node server.js

# Test endpoint
curl -X POST http://localhost:8000/api/import \
  -H "Content-Type: application/json" \
  -d '{"profile":"your-profile-name"}'
```

**Total Time: ~30-45 minutes**

---

## Success Criteria Validation

✅ **Can POST to `/api/import` with profile name**
- Endpoint accepts POST requests
- Extracts profile from request body
- Returns 400 if profile missing

✅ **Returns CLI output as JSON response**
- Captures stdout from CLI
- Captures stderr from CLI
- Returns JSON with `{ success, output, error }`

✅ **Handles CLI errors gracefully**
- Catches execution errors
- Returns error in JSON response
- Doesn't crash server
- Returns appropriate HTTP status codes

---

## Testing Strategy

### Manual Testing Steps

**1. Test with valid profile:**
```bash
curl -X POST http://localhost:8000/api/import \
  -H "Content-Type: application/json" \
  -d '{"profile":"test-profile"}'
```
Expected: `{ "success": true, "output": "...", "error": null }`

**2. Test with missing profile:**
```bash
curl -X POST http://localhost:8000/api/import \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{ "success": false, "error": "Profile is required" }` (400 status)

**3. Test with invalid profile:**
```bash
curl -X POST http://localhost:8000/api/import \
  -H "Content-Type: application/json" \
  -d '{"profile":"non-existent-profile"}'
```
Expected: `{ "success": false, "error": "..." }` (500 status, CLI error)

**4. Test CLI manually first:**
```bash
cd /Users/richardhorno/dev/ab-trx-importer
npm start -- --profile=test-profile --dry-run
```
Verify this works before testing API endpoint.

---

## Edge Cases & Considerations

### Edge Case 1: Profile Name with Special Characters
**Handling:** For POC, basic validation. Plan B adds regex validation.

### Edge Case 2: CLI Output Contains JSON
**Handling:** Return as string in `output` field. Frontend can parse if needed.

### Edge Case 3: CLI Requires Interactive Input
**Handling:** Use `--dry-run` flag (non-interactive). Test manually first.

### Edge Case 4: Very Long CLI Output
**Handling:** `maxBuffer` set to 10MB. Should be sufficient for dry-run output.

### Edge Case 5: CLI Build Fails
**Handling:** `npm start` includes build step. If build fails, error will be in stderr.

---

## Next Steps After Task 2

Once Task 2 is complete:
1. **Task 3**: Create frontend component to call `/api/import`
2. **Task 4**: Connect frontend and backend (CORS already configured)
3. **Task 5**: Verify CLI integration works end-to-end

---

## Alternative Considerations

### Why Not Use spawn()?
- **POC Principle**: Simpler is better
- **No Streaming Needed**: POC doesn't need real-time updates
- **More Code**: spawn() requires manual output buffering
- **Future Migration**: Easy to switch to spawn() when adding WebSocket

### Why Not Add Timeout Now?
- **POC Principle**: Defer non-essential features
- **Dry-run is Fast**: Should complete quickly
- **Can Add Later**: Easy to add timeout when needed
- **Testing First**: See if timeout is actually needed

### Why Not Validate Profile Exists?
- **POC Principle**: Minimal validation
- **CLI Will Error**: CLI will return error if profile doesn't exist
- **Can Add Later**: Easy to add profile validation endpoint later
- **Simpler for POC**: Less code, faster to implement

---

## Conclusion

**Plan A (Simple exec() with Basic Error Handling) is the clear winner for POC:**

- ✅ Fastest to implement (30-45 minutes)
- ✅ Simplest code (easy to understand)
- ✅ Meets all POC requirements
- ✅ No new dependencies needed
- ✅ Easy to enhance later (Plan B or migrate to spawn())

**Key Principle**: For a POC, the simplest thing that works is the best thing. We can always add validation, better error handling, and streaming later when we know what we actually need.

**Implementation Priority:**
1. Get basic endpoint working (Plan A)
2. Test with real CLI tool
3. Enhance error handling if needed (Plan B)
4. Add streaming when needed (spawn() in Iteration 3)

