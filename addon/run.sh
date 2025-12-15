#!/usr/bin/with-contenv bashio
set -e

# Get configuration with defaults
FRONTEND_PORT=$(bashio::config 'frontend_port')
BACKEND_PORT=$(bashio::config 'backend_port')

# Use defaults if not set
FRONTEND_PORT=${FRONTEND_PORT:-5173}
BACKEND_PORT=${BACKEND_PORT:-8000}

bashio::log.info "Starting AB Transaction Importer"
bashio::log.info "Frontend port: ${FRONTEND_PORT}"
bashio::log.info "Backend port: ${BACKEND_PORT}"

# Set environment variables
export NODE_ENV=production
export PORT=${BACKEND_PORT}

# Link config directory to app root for .env and profiles.json
# Use /data for add-on persistent data, or /config if mapped
CONFIG_DIR="/data"
if [ -d "/config/ab-trx-importer" ]; then
    CONFIG_DIR="/config/ab-trx-importer"
fi
APP_ROOT="/app"

# Log which config directory is being used
bashio::log.info "Using configuration directory: ${CONFIG_DIR}"

# Ensure required configuration files exist and create symlinks
ENV_FILE="${CONFIG_DIR}/.env"
PROFILES_FILE="${CONFIG_DIR}/profiles.json"

if [ -f "${ENV_FILE}" ]; then
    bashio::log.info "Found .env at ${ENV_FILE}, linking to ${APP_ROOT}/.env"
    ln -sf "${ENV_FILE}" "${APP_ROOT}/.env"
else
    bashio::log.error "Required configuration file not found: ${ENV_FILE}"
    bashio::log.error "AB Transaction Importer cannot start without a valid .env file."
    exit 1
fi

if [ -f "${PROFILES_FILE}" ]; then
    bashio::log.info "Found profiles.json at ${PROFILES_FILE}, linking to ${APP_ROOT}/backend/services/configuration/profiles.json"
    mkdir -p "${APP_ROOT}/backend/services/configuration"
    ln -sf "${PROFILES_FILE}" "${APP_ROOT}/backend/services/configuration/profiles.json"
else
    bashio::log.error "Required configuration file not found: ${PROFILES_FILE}"
    bashio::log.error "AB Transaction Importer cannot start without a valid profiles.json file."
    exit 1
fi

# Function to handle shutdown
cleanup() {
    bashio::log.info "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Start backend server in background
cd "${APP_ROOT}/backend"
node server.js &
BACKEND_PID=$!

# Wait for backend to be ready
bashio::log.info "Waiting for backend to start..."
for i in {1..30}; do
    if curl -f http://localhost:${BACKEND_PORT}/api/health > /dev/null 2>&1; then
        bashio::log.info "Backend is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        bashio::log.error "Backend failed to start after 30 seconds"
        exit 1
    fi
    sleep 1
done

# Start frontend preview server
cd "${APP_ROOT}/frontend"
npx vite preview --host 0.0.0.0 --port ${FRONTEND_PORT} &
FRONTEND_PID=$!

# Wait for frontend to be ready
bashio::log.info "Waiting for frontend to start..."
sleep 3

bashio::log.info "Application started successfully!"
bashio::log.info "Frontend: http://localhost:${FRONTEND_PORT}"
bashio::log.info "Backend: http://localhost:${BACKEND_PORT}"

# Wait for processes and handle termination
wait $BACKEND_PID $FRONTEND_PID
