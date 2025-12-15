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

# Get configuration values from addon config
ENV_CONTENT=$(bashio::config 'env_content')
PROFILES_JSON=$(bashio::config 'profiles_json')

# Use /data for add-on persistent data
CONFIG_DIR="/data"
APP_ROOT="/app"

# Ensure config directory exists
mkdir -p "${CONFIG_DIR}"

# Write .env file from configuration
ENV_FILE="${CONFIG_DIR}/.env"
if [ -n "${ENV_CONTENT}" ]; then
    bashio::log.info "Writing .env file from configuration"
    echo "${ENV_CONTENT}" > "${ENV_FILE}"
else
    bashio::log.error "env_content is required in addon configuration"
    bashio::log.error "Please configure the .env content in the addon settings"
    exit 1
fi

# Write profiles.json file from configuration
PROFILES_FILE="${CONFIG_DIR}/profiles.json"
if [ -n "${PROFILES_JSON}" ]; then
    bashio::log.info "Writing profiles.json file from configuration"
    echo "${PROFILES_JSON}" > "${PROFILES_FILE}"

    # Validate JSON syntax using Node.js
    if ! node -e "JSON.parse(require('fs').readFileSync('${PROFILES_FILE}', 'utf8'))" > /dev/null 2>&1; then
        bashio::log.error "profiles_json contains invalid JSON"
        exit 1
    fi
else
    bashio::log.error "profiles_json is required in addon configuration"
    bashio::log.error "Please configure the profiles.json content in the addon settings"
    exit 1
fi

# Create symlinks to app root
bashio::log.info "Linking .env to ${APP_ROOT}/.env"
ln -sf "${ENV_FILE}" "${APP_ROOT}/.env"

bashio::log.info "Linking profiles.json to ${APP_ROOT}/backend/services/configuration/profiles.json"
mkdir -p "${APP_ROOT}/backend/services/configuration"
ln -sf "${PROFILES_FILE}" "${APP_ROOT}/backend/services/configuration/profiles.json"

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
