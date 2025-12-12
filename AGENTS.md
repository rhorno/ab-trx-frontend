# AGENTS

Authoritative guide for automated agents working in ab-trx-importer-frontend.

## Sources
- [README.md](./README.md) - Project overview and setup
- [poc-strategy.md](./poc-strategy.md) - POC implementation strategy
- [frontend/README.md](./frontend/README.md) - Frontend-specific details

## Scope
This is a monorepo containing:
- `frontend/` - React + Vite application
- `backend/` - Express.js API server

## Non-Negotiable Guardrails
- Node.js >= 18.12.0 required
- Frontend and backend must run in separate terminals
- Backend runs on port 8000, frontend on port 5173
- This is a POC - keep changes minimal and focused

## Pre-Change Checklist
1. Verify Node.js version: `node --version` (must be >= 18.12.0)
2. Check if dependencies are installed in both `frontend/` and `backend/`
3. Ensure no breaking changes to POC scope (see `poc-strategy.md`)

## Development Commands

### Setup
```bash
# Install frontend dependencies
cd frontend && npm install

# Install backend dependencies
cd backend && npm install
```

### Development
```bash
# Terminal 1 - Backend (port 8000)
cd backend && node server.js

# Terminal 2 - Frontend (port 5173)
cd frontend && npm run dev
```

### Build
```bash
# Frontend production build
cd frontend && npm run build

# Preview production build
cd frontend && npm run preview
```

### Linting
```bash
# Frontend linting
cd frontend && npm run lint
```

## Project Structure
- `frontend/` - React app using Vite, ESLint configured
- `backend/` - Express.js server with CORS
- Root level - Documentation and project config

## Implementation Rules
- Frontend: React 19, functional components, ES modules
- Backend: Express.js 5, CommonJS modules
- ESLint: Flat config format, React hooks rules enabled
- Code style: Follow ESLint rules, use modern JavaScript

## Testing Rules
- No test framework configured yet (POC phase)
- **Use browser tools to test the frontend application** after making changes
- Navigate to `http://localhost:5173` when frontend dev server is running
- Test API endpoints: Health check `GET http://localhost:8000/api/health`
- Verify UI interactions, API calls, and error handling through browser testing

## Safety Boundaries
- **Autonomous actions:**
  - Code changes within POC scope
  - Adding dependencies if explicitly requested
  - Running linting and build commands
  - Creating/modifying components and API endpoints

- **Require explicit permission:**
  - Adding test frameworks or major dependencies
  - Changing port numbers or server configuration
  - Modifying project structure significantly
  - Breaking changes to POC architecture

- **Non-destructive operations:**
  - Prefer adding new files over modifying existing ones when possible
  - Keep changes minimal and focused
  - Maintain backward compatibility during POC phase

## Dependency Rules
- Frontend: React 19.x, Vite 7.x, ESLint 9.x (flat config)
- Backend: Express 5.x, CORS 2.x
- Install dependencies in respective directories (`frontend/` or `backend/`)
- Do not create root-level `package.json` unless explicitly needed

## Reference Documentation
- See `poc-strategy.md` for POC scope and deferred features
- Frontend ESLint config: `frontend/eslint.config.js`
- Vite config: `frontend/vite.config.js`

## When In Doubt
- Keep changes minimal and within POC scope
- Prefer simple solutions over complex architectures
- Test manually in browser after changes
- Refer to `poc-strategy.md` for feature prioritization

