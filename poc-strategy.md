# POC Strategy: Minimal Viable Implementation

## Goal
Prove that a frontend can successfully communicate with the CLI tool, trigger an import, and display basic output. Everything else can be added iteratively.

## Core Principle: Start Minimal, Iterate

**POC Scope**: The absolute minimum to prove the architecture works
**Deferred**: Everything that's not essential for the proof

---

## Phase 1: POC - Minimal Viable Implementation

### What We're Proving
1. Frontend can trigger CLI command via backend API
2. Backend can execute CLI and capture output
3. Frontend can display the output
4. Basic deployment structure works

### What We're NOT Doing (Yet)
- ❌ Profile management UI (hardcode profile name)
- ❌ QR code display (skip BankID auth for POC, or show as text)
- ❌ Real-time streaming (simple request/response)
- ❌ Authentication (local network only)
- ❌ Transaction parsing/preview (show raw CLI output)
- ❌ Home Assistant add-on (test locally first)
- ❌ Error handling beyond basics
- ❌ Dry-run vs actual import toggle (just do dry-run)

---

## Granular Task Breakdown

### Task 1: Project Setup
**Goal**: Create basic project structure

**Subtasks**:
1.1. Initialize Node.js project (package.json)
1.2. Create directory structure:
   ```
   /
   ├── frontend/          # React app
   ├── backend/          # Express API
   ├── package.json       # Root (optional, for scripts)
   └── README.md
   ```
1.3. Set up frontend: `npm create vite@latest frontend -- --template react`
1.4. Set up backend: Initialize Express.js in `backend/`
1.5. Add basic dependencies:
   - Frontend: React, Vite (already included)
   - Backend: express, cors

**Success Criteria**: Both frontend and backend can start independently

**Estimated Time**: 30 minutes

---

### Task 2: Minimal Backend API
**Goal**: Single endpoint that executes one CLI command

**Subtasks**:
2.1. Create Express server in `backend/server.js`
2.2. Add single endpoint: `POST /api/import`
   - Accepts: `{ profile: "profile-name" }` in body
   - Hardcode dry-run flag for POC
2.3. Implement CLI execution:
   - Use `child_process.exec()` (simpler than spawn for POC)
   - Execute CLI command (format depends on Task 5 findings):
     - Likely: `npm start -- --profile=<profile> --dry-run` from CLI directory
     - Or: direct command if CLI is in PATH
   - Capture stdout and stderr
   - Return: `{ success: boolean, output: string, error: string }`
2.4. Add CORS middleware (allow frontend to call API)
2.5. Add basic error handling (try/catch)

**Success Criteria**:
- Can POST to `/api/import` with profile name
- Returns CLI output as JSON response
- Handles CLI errors gracefully

**Estimated Time**: 1-2 hours

**Deferred**:
- WebSocket/streaming
- Multiple endpoints
- Input validation (beyond basic)
- Timeout handling
- Process cancellation

---

### Task 3: Minimal Frontend
**Goal**: Single page that can trigger import and show output

**Subtasks**:
3.1. Create single component: `ImportPage.jsx`
3.2. Add hardcoded profile selector (dropdown with one profile, or text input)
3.3. Add "Run Import" button
3.4. On click:
   - Call `POST /api/import` with profile name
   - Show loading state
   - Display response (success/error + output)
3.5. Display output in `<pre>` tag (raw text, no formatting)
3.6. Basic styling (just enough to be readable)

**Success Criteria**:
- Can click button to trigger import
- Shows loading indicator
- Displays CLI output (or error) when complete

**Estimated Time**: 1-2 hours

**Deferred**:
- Profile management
- QR code display
- Transaction parsing/table
- Progress indicators
- Multiple pages/routing
- Advanced UI components

---

### Task 4: Local Development Integration
**Goal**: Frontend and backend work together locally

**Subtasks**:
4.1. Configure Vite proxy (frontend dev server proxies `/api/*` to backend)
4.2. Or: Configure backend CORS to allow frontend origin
4.3. Test end-to-end:
   - Start backend: `cd backend && node server.js`
   - Start frontend: `cd frontend && npm run dev`
   - Trigger import from browser
   - Verify CLI executes and output displays

**Success Criteria**:
- Frontend can successfully call backend API
- CLI tool executes when triggered from browser
- Output appears in frontend

**Estimated Time**: 30 minutes

**Deferred**:
- Production build
- Docker containerization
- Home Assistant add-on

---

### Task 5: CLI Tool Integration
**Goal**: Backend can execute the CLI tool that's already on this computer

**Subtasks**:
5.1. Test CLI manually first:
   - Run CLI command manually: `npm start -- --profile=<profile> --dry-run` (or whatever the actual command is)
   - Verify it works and note the exact command format
   - Check where CLI is located (current directory, PATH, or sibling directory)
5.2. Determine CLI execution method:
   - If CLI is in PATH: use command directly (e.g., `ab-trx-importer`)
   - If CLI is npm script: use `npm start -- --profile=...` from CLI directory
   - If CLI is in sibling directory: use relative path or `cd` to that directory
5.3. Update backend to execute CLI using determined method
5.4. Test that backend can successfully call CLI

**Success Criteria**: Backend can find and execute CLI tool using the same command that works manually

**Estimated Time**: 15-30 minutes (simplified since CLI is already available)

---

### Task 6: Basic Error Handling
**Goal**: Don't crash on common errors

**Subtasks**:
6.1. Handle CLI not found error
6.2. Handle CLI execution failure (non-zero exit code)
6.3. Handle network errors in frontend
6.4. Display user-friendly error messages

**Success Criteria**: Application handles errors gracefully without crashing

**Estimated Time**: 30 minutes

**Deferred**:
- Comprehensive error types
- Error logging
- Retry logic
- Timeout handling

---

## POC Success Criteria

**The POC is complete when**:
1. ✅ Frontend page loads in browser
2. ✅ User can enter/select a profile name
3. ✅ User clicks "Run Import" button
4. ✅ Backend receives request and executes CLI tool
5. ✅ CLI tool runs (dry-run mode)
6. ✅ Output is captured and returned to frontend
7. ✅ Frontend displays the output (raw text is fine)
8. ✅ Works end-to-end without crashes

**That's it.** Everything else is iteration.

---

## Post-POC Iteration Plan

Once POC works, iterate in this order:

### Iteration 1: Make It Usable
- Parse CLI output to extract key information
- Display transactions in a table (not raw text)
- Add basic styling/UI polish
- Handle QR code display (if BankID auth needed)

### Iteration 2: Profile Management
- List profiles endpoint
- Profile selection UI (not hardcoded)
- Display profile details

### Iteration 3: Real-time Updates
- WebSocket for streaming output
- Progress indicators
- Live QR code updates

### Iteration 4: Production Ready
- Production build process
- Docker containerization
- Home Assistant add-on structure
- Authentication
- Error handling improvements

### Iteration 5: Advanced Features
- Transaction preview/editing
- Import history
- Multiple bank support
- Configuration management

---

## Technical Simplifications for POC

### Backend Simplifications
- ✅ Use `exec()` instead of `spawn()` (simpler, no streaming needed)
- ✅ Single endpoint (no RESTful structure yet)
- ✅ No authentication
- ✅ No input validation (beyond basic)
- ✅ Use CLI command directly (already available on computer)
- ✅ Return raw CLI output (no parsing)

### Frontend Simplifications
- ✅ Single page (no routing)
- ✅ Single component (no component hierarchy)
- ✅ Hardcoded profile (or simple text input)
- ✅ Raw text output display (no formatting)
- ✅ Basic fetch API (no React Query, no custom hooks)
- ✅ Minimal styling (inline styles or basic CSS)

### Deployment Simplifications
- ✅ Local development only (no Docker, no add-on)
- ✅ Manual start (no process managers)
- ✅ No production build (dev mode is fine)

---

## File Structure (POC)

```
ab-trx-importer-frontend/
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Single component
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js       # Proxy to backend
├── backend/
│   ├── server.js            # Single file, minimal Express
│   └── package.json
└── README.md                # Setup instructions
```

**That's it.** No complex structure needed for POC.

---

## Dependencies (POC Only)

### Frontend
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.x",
    "vite": "^5.x"
  }
}
```

### Backend
```json
{
  "dependencies": {
    "express": "^4.x",
    "cors": "^2.x"
  }
}
```

**Total**: 5 packages. That's all we need for POC.

---

## Development Workflow (POC)

**Pre-flight Check** (do this first):
- Test CLI manually: Run the CLI command that will be used in the backend
- Verify it works and note the output format
- This helps understand what the backend needs to capture

**Development**:
1. **Terminal 1**: `cd backend && node server.js` (runs on port 8000)
2. **Terminal 2**: `cd frontend && npm run dev` (runs on port 5173)
3. **Browser**: Open `http://localhost:5173`
4. **Test**: Enter profile name, click button, see output

**No build step, no Docker, no complexity.**

---

## Risk Mitigation

### Potential Issues & Solutions

**Issue**: CLI tool path not found
- **Solution**: Since CLI is already on computer, use same command that works manually
- **POC Fix**: Test CLI manually first, then use exact same command in backend

**Issue**: CLI requires interactive input
- **Solution**: Ensure dry-run mode works non-interactively
- **POC Fix**: Test CLI manually first, ensure it works headless

**Issue**: CORS errors
- **Solution**: Configure CORS middleware properly
- **POC Fix**: Use Vite proxy instead of CORS if needed

**Issue**: CLI output format unclear
- **Solution**: Display raw output first, parse later
- **POC Fix**: Show everything, user can see what CLI returns

---

## Time Estimate

**Total POC Time**: 4-6 hours

- Task 1: 30 min
- Task 2: 1-2 hours
- Task 3: 1-2 hours
- Task 4: 30 min
- Task 5: 15-30 min
- Task 6: 30 min

**Buffer**: 1-2 hours for debugging/unexpected issues

**Total**: ~1 day of focused work to prove the concept

---

## Next Steps After POC

1. **Validate**: Does the architecture work? Can we trigger CLI from browser?
2. **Decide**: Is this the right approach? Any blockers?
3. **Iterate**: Add one feature at a time, always keeping it working
4. **Reference**: Use research document as roadmap for future features

---

## Key Principles

1. **Do the simplest thing that works**
2. **Prove the concept before optimizing**
3. **One feature at a time**
4. **Always keep it working** (don't break the POC while adding features)
5. **Defer everything non-essential**

This POC proves the core architecture. Everything else is incremental improvement.

