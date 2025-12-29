# AB Transaction Importer Frontend

Frontend application for importing bank transactions into Actual Budget.

## Architecture

This application uses a service-oriented architecture:

- **Frontend**: React + Vite application
- **Backend API**: Express.js REST API with SSE streaming
- **Services**:
  - Configuration Service: Manages profiles and environment variables
  - Bank Integration Service: Handles bank authentication and transaction fetching
  - Actual Budget Service: Handles transaction import to Actual Budget

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Project Structure

```
ab-trx-importer-frontend/
├── ab-trx-importer/             # Home Assistant addon directory (main development directory)
│   ├── backend/                 # Express.js API
│   │   ├── api/                  # API routes
│   │   │   └── routes/
│   │   │       ├── import.js     # Import endpoint (SSE)
│   │   │       └── profiles.js   # Profile listing endpoint
│   │   └── services/             # Business logic services
│   │       ├── configuration/    # Configuration service
│   │       ├── bank-integration/ # Bank integration service
│   │       ├── actual-budget/    # Actual Budget service
│   │       └── shared/           # Shared utilities and types
│   ├── frontend/                 # React app (Vite)
│   ├── Dockerfile                # Addon Dockerfile
│   ├── config.yaml               # Addon configuration
│   └── run.sh                    # Addon startup script
└── README.md
```

**Note:** All development happens directly in the `ab-trx-importer/` directory. The `backend/` and `frontend/` directories are located within the addon directory to ensure the Docker build context works correctly.

## Development Setup

### Prerequisites

- Node.js >= 18.12.0
- npm

### Starting the Application Locally

**Terminal 1 - Backend:**

```bash
cd ab-trx-importer/backend
npm start
# or for development with hot reload:
npm run dev
```

Backend runs on: http://localhost:8000

**Terminal 2 - Frontend:**

```bash
cd ab-trx-importer/frontend
npm run dev
```

Frontend runs on: http://localhost:5173

### Home Assistant Addon

The addon is configured in the `ab-trx-importer/` directory. All development happens directly in this directory. The `backend/` and `frontend/` directories are located within the addon directory to ensure the Docker build context works correctly.

### Testing

- Backend health check: `GET http://localhost:8000/api/health`
- Profile listing: `GET http://localhost:8000/api/profiles`
- Import (SSE): `GET http://localhost:8000/api/import?profile=<name>`
- Frontend: http://localhost:5173

### Mock Services

For testing without real bank/Actual Budget connections:

```bash
export USE_MOCK_SERVICES=true
cd ab-trx-importer/backend && npm start
```

See [MIGRATION-TESTING.md](./MIGRATION-TESTING.md) for detailed testing procedures.

## Migration Status

The application has been migrated from CLI-based to service-oriented architecture. See [MIGRATION-PLAN.md](./MIGRATION-PLAN.md) for details.

## POC Status

This is a minimal POC implementation. See `poc-strategy.md` for the full plan.
