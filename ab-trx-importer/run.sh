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

# Validate required fields
if [ -z "${ACTUAL_SERVER_URL}" ] || [ -z "${ACTUAL_PASSWORD}" ] || [ -z "${ACTUAL_SYNC_ID}" ]; then
    bashio::log.error "Required Actual Budget configuration missing"
    bashio::log.error "Please configure actual_server_url, actual_password, and actual_sync_id"
    exit 1
fi

# Get profiles array count
PROFILES_COUNT=$(bashio::config 'profiles | length')
if [ "${PROFILES_COUNT}" -eq 0 ]; then
    bashio::log.error "At least one profile is required"
    bashio::log.error "Please configure at least one profile in the profiles array"
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

# Build and write profiles.json from profiles array
PROFILES_FILE="${CONFIG_DIR}/profiles.json"
bashio::log.info "Building profiles.json file from ${PROFILES_COUNT} profile(s)"

# Get profiles array from bashio and pipe to Node.js
bashio::config 'profiles' | node <<EOF > "${PROFILES_FILE}"
// Read profiles from stdin (passed as JSON)
let profilesData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  profilesData += chunk;
});
process.stdin.on('end', () => {
  try {
    const profilesArray = JSON.parse(profilesData);
    const profilesObject = {};

    profilesArray.forEach((profile, index) => {
      // Validate required fields
      if (!profile.profile_name || !profile.bank || !profile.actual_account_id) {
        console.error(\`Profile at index \${index} is missing required fields (profile_name, bank, actual_account_id)\`);
        process.exit(1);
      }

      // Build bankParams based on bank type
      const bankParams = {};
      if (profile.bank === 'handelsbanken') {
        if (profile.personnummer) bankParams.personnummer = profile.personnummer;
        if (profile.account_name) bankParams.accountName = profile.account_name;
      }

      profilesObject[profile.profile_name] = {
        bank: profile.bank,
        bankParams: bankParams,
        actualAccountId: profile.actual_account_id
      };
    });

    console.log(JSON.stringify(profilesObject, null, 2));
  } catch (error) {
    console.error('Error building profiles.json:', error.message);
    process.exit(1);
  }
});
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
