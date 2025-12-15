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
ACTUAL_SERVER_URL=$(bashio::config 'actual_server_url')
ACTUAL_PASSWORD=$(bashio::config 'actual_password')
ACTUAL_SYNC_ID=$(bashio::config 'actual_sync_id')
ACTUAL_ENCRYPTION_KEY=$(bashio::config 'actual_encryption_key')
DEBUG=$(bashio::config 'debug')
USE_MOCK_SERVICES=$(bashio::config 'use_mock_services')

PROFILE_NAME=$(bashio::config 'profile_name')
BANK=$(bashio::config 'bank')
ACTUAL_ACCOUNT_ID=$(bashio::config 'actual_account_id')
PERSONNUMMER=$(bashio::config 'personnummer')
ACCOUNT_NAME=$(bashio::config 'account_name')

# Validate required fields
if [ -z "${ACTUAL_SERVER_URL}" ] || [ -z "${ACTUAL_PASSWORD}" ] || [ -z "${ACTUAL_SYNC_ID}" ]; then
    bashio::log.error "Required Actual Budget configuration missing"
    bashio::log.error "Please configure actual_server_url, actual_password, and actual_sync_id"
    exit 1
fi

if [ -z "${PROFILE_NAME}" ] || [ -z "${BANK}" ] || [ -z "${ACTUAL_ACCOUNT_ID}" ]; then
    bashio::log.error "Required profile configuration missing"
    bashio::log.error "Please configure profile_name, bank, and actual_account_id"
    exit 1
fi

# Use /data for add-on persistent data
CONFIG_DIR="/data"
APP_ROOT="/app"

# Ensure config directory exists
mkdir -p "${CONFIG_DIR}"

# Build and write .env file from individual configuration fields
ENV_FILE="${CONFIG_DIR}/.env"
bashio::log.info "Building .env file from configuration"
{
    echo "# Actual Budget Configuration"
    echo "ACTUAL_SERVER_URL=${ACTUAL_SERVER_URL}"
    echo "ACTUAL_PASSWORD=${ACTUAL_PASSWORD}"
    echo "ACTUAL_SYNC_ID=${ACTUAL_SYNC_ID}"

    if [ -n "${ACTUAL_ENCRYPTION_KEY}" ]; then
        echo "ACTUAL_ENCRYPTION_KEY=${ACTUAL_ENCRYPTION_KEY}"
    fi

    if [ "${DEBUG}" = "true" ]; then
        echo "DEBUG=true"
    fi

    if [ "${USE_MOCK_SERVICES}" = "true" ]; then
        echo "USE_MOCK_SERVICES=true"
    fi
} > "${ENV_FILE}"

# Build and write profiles.json from individual configuration fields
PROFILES_FILE="${CONFIG_DIR}/profiles.json"
bashio::log.info "Building profiles.json file from configuration"

# Build the complete profiles.json using Node.js for proper JSON escaping
PROFILE_NAME="${PROFILE_NAME}" BANK="${BANK}" ACTUAL_ACCOUNT_ID="${ACTUAL_ACCOUNT_ID}" PERSONNUMMER="${PERSONNUMMER}" ACCOUNT_NAME="${ACCOUNT_NAME}" node <<EOF > "${PROFILES_FILE}"
const profileName = process.env.PROFILE_NAME;
const bank = process.env.BANK;
const actualAccountId = process.env.ACTUAL_ACCOUNT_ID;
const personnummer = process.env.PERSONNUMMER;
const accountName = process.env.ACCOUNT_NAME;

// Build bankParams based on bank type
const bankParams = {};
if (bank === 'handelsbanken') {
  if (personnummer) bankParams.personnummer = personnummer;
  if (accountName) bankParams.accountName = accountName;
}

const profile = {
  [profileName]: {
    bank: bank,
    bankParams: bankParams,
    actualAccountId: actualAccountId
  }
};

console.log(JSON.stringify(profile, null, 2));
EOF

# Validate JSON syntax
if ! node -e "JSON.parse(require('fs').readFileSync('${PROFILES_FILE}', 'utf8'))" > /dev/null 2>&1; then
    bashio::log.error "Failed to create valid profiles.json"
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
