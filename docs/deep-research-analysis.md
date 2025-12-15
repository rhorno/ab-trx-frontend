# Research Analysis: Frontend Application for CLI Tool on Home Assistant OS

## Executive Summary

This research analyzes the best approach for creating a frontend application that wraps the `ab-trx-importer` CLI tool, to be deployed on Home Assistant Green hardware running Home Assistant OS. The application must render profiles, display QR codes for BankID authentication, trigger imports, and show transaction outputs—all accessible only on the local network.

The recommended architecture follows a three-tier pattern: (1) a React-based frontend for the user interface, (2) a Node.js/Express backend API that wraps CLI commands via child processes, and (3) deployment as a Home Assistant add-on (Docker container) that packages both frontend and backend together. This approach provides seamless integration with Home Assistant OS, maintains security through local network isolation, and enables real-time communication for progress updates and QR code display.

Key findings indicate that Home Assistant add-ons are the standard deployment method for custom applications, requiring specific file structures (config.json, Dockerfile, run.sh). For real-time CLI output streaming, WebSocket or Server-Sent Events (SSE) are preferred over polling. React with modern hooks patterns (or React Query) provides optimal state management for API interactions, while Express.js serves both the API and static frontend build files.

## 1. Architecture Patterns for CLI-to-Web Interfaces

### 1.1 Three-Tier Architecture Pattern

The most effective pattern for wrapping CLI tools in web interfaces follows a three-tier architecture:

- **Frontend Layer**: Web-based UI (React/Vue.js) that provides user interaction
- **Backend API Layer**: Node.js server (Express.js) that acts as intermediary
- **CLI Integration Layer**: Child process execution of CLI commands with output capture

This pattern separates concerns, allows independent scaling, and maintains security boundaries. The backend API exposes RESTful endpoints that the frontend calls, while internally executing CLI commands using Node.js's `child_process` module. ([developers.home-assistant.io](https://developers.home-assistant.io/docs/frontend/development))

### 1.2 CLI Command Execution Patterns

**Child Process Execution**:

- Use `child_process.spawn()` for long-running processes with real-time output streaming
- Use `child_process.exec()` for short commands with complete output capture
- Implement proper error handling, timeouts, and output buffering
- Capture both stdout and stderr streams separately

**Best Practices**:

- Set appropriate timeouts to prevent hanging processes
- Validate and sanitize all inputs before passing to CLI commands
- Implement process cleanup on errors or cancellation
- Use streaming for real-time progress updates rather than waiting for completion

### 1.3 API Design Patterns

**RESTful Endpoint Structure**:

- `GET /api/profiles` - List all profiles
- `GET /api/accounts` - List Actual Budget accounts
- `POST /api/import` - Trigger import with profile parameter
- `GET /api/import/status/:id` - Get import status
- `GET /api/import/output/:id` - Stream import output
- `WS /api/import/stream/:id` - WebSocket for real-time updates

**Error Handling**:

- Return consistent error response format
- Include error codes and user-friendly messages
- Log detailed errors server-side while exposing safe messages to frontend
- Handle CLI-specific errors (authentication failures, network issues, validation errors)

## 2. Home Assistant OS Add-on Development

### 2.1 Add-on Structure and Requirements

Home Assistant add-ons are Docker containers that extend Home Assistant functionality. The standard structure includes:

**Required Files**:

- `config.json` - Add-on metadata and configuration schema
- `Dockerfile` - Container definition with dependencies
- `run.sh` - Startup script executed when add-on starts
- Application code (backend and frontend)

**config.json Structure**:

```json
{
  "name": "AB Transaction Importer",
  "version": "1.0.0",
  "slug": "ab_trx_importer",
  "description": "Frontend for AB Transaction Importer CLI tool",
  "arch": ["armhf", "armv7", "aarch64", "amd64", "i386"],
  "startup": "application",
  "boot": "auto",
  "ports": {
    "8000/tcp": 8000
  },
  "options": {},
  "schema": {}
}
```

The `arch` field specifies supported architectures (Home Assistant Green uses aarch64). The `ports` field exposes the web interface port. ([developers.home-assistant.io](https://developers.home-assistant.io/docs/add-ons/tutorial/))

### 2.2 Dockerfile Best Practices

**Base Image Selection**:

- Use Home Assistant's base images for compatibility
- Include Node.js runtime (Home Assistant OS uses Alpine Linux, so `node:alpine` base)
- Install necessary system dependencies (for QR code generation, if needed)

**Optimization**:

- Multi-stage builds: separate build stage for frontend compilation
- Copy only necessary files to reduce image size
- Use `.dockerignore` to exclude development files
- Set appropriate working directory and user permissions

**Example Structure**:

```dockerfile
ARG BUILD_FROM
FROM $BUILD_FROM

ENV LANG C.UTF-8

# Install Node.js
RUN apk add --no-cache nodejs npm

# Copy application
COPY . /app
WORKDIR /app

# Install dependencies
RUN npm install --production

# Expose port
EXPOSE 8000

# Start script
CMD ["/run.sh"]
```

### 2.3 Supervisor Integration (bashio)

Home Assistant add-ons use the Supervisor API via `bashio` for configuration management:

- Access add-on options via `bashio::config`
- Log messages via `bashio::log`
- Handle service discovery and networking
- Manage persistent storage volumes

The `run.sh` script should use `#!/usr/bin/with-contenv bashio` shebang to enable bashio functionality.

### 2.4 Deployment and Access

**Installation Process**:

1. Place add-on directory in Home Assistant's `addons` folder (or use local add-on repository)
2. Install via Home Assistant UI: Settings > Add-ons > Add-on Store
3. Configure any required options
4. Start the add-on

**Network Access**:

- Add-on runs in isolated Docker network
- Exposed ports are accessible from Home Assistant host
- Access via `http://homeassistant.local:8000` or `http://<HA-IP>:8000`
- Only accessible on local network (no external exposure by default)

## 3. Frontend Technology Stack

### 3.1 Framework Selection: React

**React Advantages**:

- Component-based architecture suits profile management and transaction display
- Strong ecosystem for QR code libraries, state management, and API integration
- Can be built as standalone SPA (Single Page Application)
- Efficient rendering for dynamic transaction lists

**Alternative Considerations**:

- **Vue.js**: Lighter weight, good for simpler interfaces
- **Preact**: Minimal React alternative, suitable for resource-constrained environments
- **Vanilla JS**: Overhead may be unnecessary, but React provides better developer experience

For this use case, React provides the best balance of features, ecosystem support, and development efficiency. ([developers.home-assistant.io](https://developers.home-assistant.io/docs/frontend/development))

### 3.2 Build Tool: Vite

**Vite Advantages**:

- Fast development server with HMR (Hot Module Replacement)
- Optimized production builds
- Native ES modules support
- Smaller bundle sizes compared to Create React App
- Better suited for modern React development

**Production Build**:

- Outputs static files to `dist/` directory
- Backend serves these static files via Express.js `express.static()`
- No separate web server needed for frontend

### 3.3 State Management Patterns

**React Hooks Approach**:

- Use `useState` for local component state
- Use `useEffect` for API calls and side effects
- Custom hooks for reusable API logic (e.g., `useProfiles`, `useImport`)
- Context API for global state (user preferences, theme)

**React Query (TanStack Query) Alternative**:

- Provides caching, background refetching, and optimistic updates
- Reduces boilerplate for API interactions
- Handles loading and error states automatically
- Excellent for frequently-updated data (import status, transaction lists)

**Recommendation**: Start with custom hooks and Context API. Add React Query if caching and advanced data synchronization become important.

### 3.4 Component Architecture

**Recommended Structure**:

```
src/
  components/
    ProfileList.tsx       # Display all profiles
    ProfileForm.tsx       # Create/edit profile
    ImportTrigger.tsx    # Import button and options
    QRCodeDisplay.tsx    # QR code rendering
    TransactionPreview.tsx # Transaction table
    StatusIndicator.tsx  # Progress/status display
  hooks/
    useProfiles.ts       # Profile API interactions
    useImport.ts         # Import execution
    useAccounts.ts       # Account listing
  services/
    api.ts               # API client (fetch/axios)
  App.tsx
  main.tsx
```

**Component Design Principles**:

- Separation of concerns: presentation vs. logic
- Reusable components for common UI patterns
- Controlled inputs for all forms
- Derived state during rendering (avoid unnecessary effects)

## 4. Backend API Design

### 4.1 Express.js Server Structure

**Server Responsibilities**:

- Serve static frontend build files
- Expose RESTful API endpoints
- Execute CLI commands via child processes
- Stream real-time output to frontend
- Handle authentication and authorization

**Basic Structure**:

```javascript
const express = require("express");
const { spawn } = require("child_process");
const path = require("path");

const app = express();

// API routes
app.use("/api", apiRoutes);

// Serve static frontend
app.use(express.static(path.join(__dirname, "dist")));

// Fallback to index.html for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist/index.html"));
});
```

### 4.2 CLI Command Wrapper Implementation

**Command Execution Pattern**:

```javascript
function executeCLI(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn("node", ["cli-entry.js", ...args], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
      // Emit to WebSocket if real-time updates needed
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    // Timeout handling
    if (options.timeout) {
      setTimeout(() => {
        process.kill();
        reject(new Error("Command timeout"));
      }, options.timeout);
    }
  });
}
```

**Best Practices**:

- Validate all inputs before execution
- Set appropriate timeouts (imports may take several minutes)
- Handle process cancellation (user cancels import)
- Parse CLI output into structured JSON when possible
- Log all commands for debugging

### 4.3 Real-time Communication

**WebSocket Implementation**:

- Use `ws` library for WebSocket server
- Create connection per import operation
- Stream CLI stdout/stderr in real-time
- Send structured messages: `{ type: 'progress', data: {...} }`
- Handle connection cleanup on completion/error

**Server-Sent Events (SSE) Alternative**:

- Simpler implementation (HTTP-based)
- One-way communication (server to client)
- Automatic reconnection support
- Suitable if bidirectional communication not needed

**Recommendation**: Use WebSocket for real-time import progress and QR code updates. SSE is simpler but WebSocket provides more flexibility for future features.

### 4.4 QR Code Handling

**QR Code Generation**:

- CLI tool outputs QR code as text/ANSI art or data URL
- Backend captures QR code data from CLI output
- Parse and extract QR code image/data
- Send to frontend via WebSocket or API response

**Frontend Display**:

- Use `qrcode.react` or `react-qr-code` library
- Display QR code in modal or dedicated component
- Auto-refresh if QR code expires and new one generated
- Provide clear instructions for user (scan with BankID app)

## 5. Security Considerations

### 5.1 Local Network Security

**Network Isolation**:

- Application only binds to local network interface (not 0.0.0.0)
- Home Assistant OS firewall prevents external access by default
- No port forwarding or external exposure needed

**Authentication Options**:

- **Simple Token Authentication**: Generate API token, store in localStorage
- **Home Assistant Integration**: Leverage Home Assistant's authentication system
- **Basic Auth**: Simple username/password for local network use
- **No Auth**: Acceptable for trusted local network (less secure but simpler)

**Recommendation**: Implement simple token-based authentication. For enhanced security, integrate with Home Assistant's auth system if possible.

### 5.2 Input Validation and Sanitization

**CLI Parameter Validation**:

- Validate profile names against allowed characters
- Sanitize all user inputs before passing to CLI
- Prevent command injection attacks
- Validate file paths and prevent directory traversal

**API Input Validation**:

- Use validation middleware (e.g., `express-validator`)
- Validate request bodies and query parameters
- Return clear error messages for invalid inputs
- Rate limiting for API endpoints

### 5.3 Sensitive Data Handling

**Configuration Storage**:

- Store `.env` and `profiles.json` in persistent volume
- Never expose sensitive data in API responses
- Encrypt sensitive data at rest (if required)
- Use environment variables for secrets

**Bank Credentials**:

- Never log or expose bank credentials
- Store securely in profiles.json (encrypted if possible)
- Clear sensitive data from memory after use
- Follow bank API security guidelines

## 6. Deployment Strategy

### 6.1 Development Workflow

**Local Development**:

1. Develop frontend and backend separately
2. Frontend: `npm run dev` (Vite dev server on port 5173)
3. Backend: `npm run dev` (Express with nodemon on port 8000)
4. Frontend proxies API requests to backend
5. Test CLI integration locally

**Add-on Development**:

1. Build frontend: `npm run build` → `dist/` directory
2. Copy `dist/` into add-on directory
3. Test add-on locally using Docker
4. Deploy to Home Assistant for testing

### 6.2 Production Build Process

**Frontend Build**:

```bash
npm run build  # Vite builds to dist/
```

**Add-on Packaging**:

- Include built frontend in Docker image
- Backend serves static files from `/app/dist`
- Single container contains both frontend and backend
- No separate build step needed on Home Assistant device

### 6.3 Update Strategy

**Version Management**:

- Version add-on in `config.json`
- Use semantic versioning
- Update mechanism via Home Assistant Supervisor
- Backup configuration before updates

**Rollback Plan**:

- Keep previous add-on version available
- Test updates in development first
- Document breaking changes
- Provide migration scripts if needed

## 7. Key Features Implementation

### 7.1 Profile Management

**API Endpoints**:

- `GET /api/profiles` - Read profiles.json, return structured data
- `POST /api/profiles` - Create new profile (validate, write to profiles.json)
- `PUT /api/profiles/:name` - Update existing profile
- `DELETE /api/profiles/:name` - Remove profile

**Frontend Components**:

- Profile list with bank type, account name, Actual Budget account
- Profile form with dynamic fields based on bank type
- Validation for required fields
- Account selector (fetches from Actual Budget API)

### 7.2 Import Workflow

**User Flow**:

1. Select profile from dropdown
2. Choose dry-run or actual import
3. Click "Start Import" button
4. Backend spawns CLI process
5. WebSocket connection established for real-time updates
6. QR code displayed when BankID auth required
7. Progress updates shown (connecting, fetching, importing)
8. Transaction preview displayed (dry-run) or success message (import)

**State Management**:

- Track import status: idle, running, completed, error
- Store import output and transaction data
- Handle cancellation (kill CLI process)
- Display error messages clearly

### 7.3 Transaction Preview

**Display Format**:

- Table with columns: Date, Amount, Payee, Category, Notes
- Sortable and filterable
- Show transaction count
- Highlight potential duplicates
- Export to CSV option (optional)

**Data Source**:

- Dry-run mode: CLI outputs transaction data
- Parse CLI output into structured JSON
- Display in React table component
- Format amounts and dates appropriately

## Best Practices Summary

### Architecture

- Use three-tier architecture: Frontend → Backend API → CLI Tool
- Package as Home Assistant add-on for seamless integration
- Serve frontend as static files from Express backend
- Use WebSocket for real-time CLI output streaming

### Technology Stack

- **Frontend**: React + Vite for modern, efficient development
- **Backend**: Node.js + Express.js for API and static file serving
- **State Management**: React hooks + Context API (add React Query if needed)
- **Real-time**: WebSocket for bidirectional communication

### Security

- Implement token-based authentication for API access
- Validate and sanitize all inputs before CLI execution
- Store sensitive data in persistent volumes, never expose in API
- Bind to local network only, no external exposure

### Development

- Develop frontend and backend separately with hot reload
- Test add-on locally with Docker before deployment
- Use semantic versioning for add-on releases
- Implement comprehensive error handling and logging

### User Experience

- Provide clear progress indicators for long-running imports
- Display QR codes prominently with instructions
- Show transaction previews before actual import
- Handle errors gracefully with user-friendly messages

## Key Findings

1. **Home Assistant Add-ons are Standard**: The recommended deployment method is a Home Assistant add-on (Docker container), which provides isolation, easy management, and integration with Home Assistant OS. ([developers.home-assistant.io](https://developers.home-assistant.io/docs/add-ons/tutorial/))

2. **React + Express Architecture**: React for frontend with Express.js backend serving both API and static files is the most practical approach. This allows single-container deployment while maintaining separation of concerns.

3. **Real-time Communication Essential**: WebSocket or SSE is necessary for displaying QR codes and import progress in real-time, as CLI operations can take several minutes and require user interaction.

4. **Child Process Management Critical**: Proper handling of Node.js child processes (spawn, error handling, timeouts, cleanup) is essential for reliable CLI integration.

5. **Local Network Security Acceptable**: For trusted local network environments, simple authentication is sufficient. More complex auth can be added later if needed.

6. **Single Container Deployment**: Packaging frontend build and backend in one Docker container simplifies deployment and eliminates network configuration complexity.

7. **Profile Management via API**: Reading/writing profiles.json via API endpoints provides better UX than direct file editing, with validation and error handling.

## Sources

- [Home Assistant Developer Documentation - Frontend Development](https://developers.home-assistant.io/docs/frontend/development) - Official Home Assistant frontend development guidelines and best practices
- [Home Assistant Developer Documentation - Add-on Tutorial](https://developers.home-assistant.io/docs/add-ons/tutorial/) - Comprehensive guide to creating Home Assistant add-ons
- [Home Assistant Developer Documentation - Development Environment](https://developers.home-assistant.io/docs/development_environment) - Setup and development workflow for Home Assistant development
- Node.js Official Documentation - child_process module patterns and best practices for CLI integration
- Express.js Best Practices - RESTful API design and static file serving patterns
- React Official Documentation - Modern hooks patterns and component architecture
- WebSocket Protocol Specifications - Real-time bidirectional communication patterns
