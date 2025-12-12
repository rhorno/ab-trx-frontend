# AB Transaction Importer Frontend

Frontend application for the AB Transaction Importer CLI tool.

## Project Structure

```
ab-trx-importer-frontend/
├── frontend/          # React app (Vite)
├── backend/          # Express.js API
└── README.md
```

## Development Setup

### Prerequisites
- Node.js >= 18.12.0
- npm

### Starting the Application

**Terminal 1 - Backend:**
```bash
cd backend
node server.js
```
Backend runs on: http://localhost:8000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on: http://localhost:5173

### Testing

- Backend health check: http://localhost:8000/api/health
- Frontend: http://localhost:5173

## POC Status

This is a minimal POC implementation. See `poc-strategy.md` for the full plan.

