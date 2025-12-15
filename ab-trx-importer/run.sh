#!/usr/bin/with-contenv bashio
set -e

# Lock file to prevent multiple instances (atomic check-and-set)
LOCK_FILE="/tmp/ab-trx-importer.lock"

# Try to create lock file atomically using noclobber
if ! (set -C; echo $$ > "${LOCK_FILE}") 2>/dev/null; then
    # Lock file exists, check if process is still running
    if [ -f "${LOCK_FILE}" ]; then
        OLD_PID=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
        if [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; then
            bashio::log.warning "Another instance is already running (PID: ${OLD_PID})"
            bashio::log.info "Exiting to prevent duplicate instances"
            exit 0
        else
            # Stale lock file - process is not running
            bashio::log.info "Removing stale lock file (PID ${OLD_PID} not running)"
            rm -f "${LOCK_FILE}"
            # Try to acquire lock again
            if ! (set -C; echo $$ > "${LOCK_FILE}") 2>/dev/null; then
                bashio::log.error "Failed to acquire lock file after cleanup - another instance may have started"
                exit 1
            fi
        fi
    else
        bashio::log.error "Lock file check failed unexpectedly"
        exit 1
    fi
fi

# Cleanup function to remove lock file
cleanup_lock() {
    if [ -f "${LOCK_FILE}" ] && [ "$(cat "${LOCK_FILE}" 2>/dev/null)" = "$$" ]; then
        rm -f "${LOCK_FILE}"
        bashio::log.info "Removed lock file on exit"
    fi
}
trap cleanup_lock EXIT

# Get configuration with defaults
FRONTEND_PORT=$(bashio::config 'frontend_port')
BACKEND_PORT=$(bashio::config 'backend_port')

# Use defaults if not set
FRONTEND_PORT=${FRONTEND_PORT:-5173}
BACKEND_PORT=${BACKEND_PORT:-8000}

bashio::log.info "Starting AB Transaction Importer (PID: $$)"
bashio::log.info "Frontend port: ${FRONTEND_PORT}"
bashio::log.info "Backend port: ${BACKEND_PORT}"
bashio::log.info "Script started at: $(date)"

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
bashio::config 'profiles' | node <<EOF > "${PROFILES_FILE}" 2>&1
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

# Check exit code of the pipe
NODE_EXIT_CODE=${PIPESTATUS[1]}
if [ $NODE_EXIT_CODE -ne 0 ]; then
    bashio::log.error "Failed to generate profiles.json from configuration (exit code: ${NODE_EXIT_CODE})"
    if [ -f "${PROFILES_FILE}" ]; then
        bashio::log.error "Error output:"
        cat "${PROFILES_FILE}" || true
    fi
    exit 1
fi

# Check if profiles.json was created and is valid
if [ ! -f "${PROFILES_FILE}" ]; then
    bashio::log.error "profiles.json was not created"
    exit 1
fi

# Validate JSON syntax
if ! node -e "JSON.parse(require('fs').readFileSync('${PROFILES_FILE}', 'utf8'))" > /dev/null 2>&1; then
    bashio::log.error "Failed to create valid profiles.json"
    bashio::log.error "Contents of profiles.json:"
    cat "${PROFILES_FILE}" || true
    exit 1
fi

# Create symlinks to app root
bashio::log.info "Linking .env to ${APP_ROOT}/.env"
ln -sf "${ENV_FILE}" "${APP_ROOT}/.env" || {
    bashio::log.error "Failed to create .env symlink"
    exit 1
}

bashio::log.info "Linking profiles.json to ${APP_ROOT}/backend/services/configuration/profiles.json"
mkdir -p "${APP_ROOT}/backend/services/configuration" || {
    bashio::log.error "Failed to create configuration directory"
    exit 1
}
ln -sf "${PROFILES_FILE}" "${APP_ROOT}/backend/services/configuration/profiles.json" || {
    bashio::log.error "Failed to create profiles.json symlink"
    exit 1
}

# Function to handle shutdown
cleanup() {
    bashio::log.info "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    rm -f "${LOCK_FILE}"
    exit 0
}

trap cleanup SIGTERM SIGINT EXIT

# Check if processes are already running (prevent duplicate starts)
if pgrep -f "node.*server.js" > /dev/null; then
    bashio::log.warning "Backend process already running, skipping start"
    BACKEND_PID=$(pgrep -f "node.*server.js" | head -1)
else
    # Start backend server in background
    cd "${APP_ROOT}/backend" || {
        bashio::log.error "Failed to change to backend directory"
        exit 1
    }
    node server.js &
    BACKEND_PID=$!
    bashio::log.info "Started backend with PID: ${BACKEND_PID}"
fi

# Wait for backend to be ready
bashio::log.info "Waiting for backend to start..."
BACKEND_READY=false
for i in {1..30}; do
    if curl -f http://localhost:${BACKEND_PORT}/api/health > /dev/null 2>&1; then
        bashio::log.info "Backend is ready!"
        BACKEND_READY=true
        break
    fi
    # Check if process is still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        bashio::log.error "Backend process died unexpectedly"
        exit 1
    fi
    sleep 1
done

if [ "${BACKEND_READY}" = "false" ]; then
    bashio::log.error "Backend failed to start after 30 seconds"
    exit 1
fi

# Check if frontend is already running
if pgrep -f "vite.*preview" > /dev/null; then
    bashio::log.warning "Frontend process already running, skipping start"
    FRONTEND_PID=$(pgrep -f "vite.*preview" | head -1)
else
    # Start frontend preview server
    cd "${APP_ROOT}/frontend" || {
        bashio::log.error "Failed to change to frontend directory"
        exit 1
    }
    npx vite preview --host 0.0.0.0 --port ${FRONTEND_PORT} &
    FRONTEND_PID=$!
    bashio::log.info "Started frontend with PID: ${FRONTEND_PID}"
fi

# Wait for frontend to be ready
bashio::log.info "Waiting for frontend to start..."
sleep 3

# Verify frontend is still running
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    bashio::log.error "Frontend process died unexpectedly"
    exit 1
fi

bashio::log.info "Application started successfully!"
bashio::log.info "Frontend: http://localhost:${FRONTEND_PORT}"
bashio::log.info "Backend: http://localhost:${BACKEND_PORT}"

# Wait for processes and handle termination
# Use wait with error handling to prevent script exit on process termination
set +e  # Temporarily disable exit on error for wait
wait $BACKEND_PID $FRONTEND_PID
WAIT_EXIT_CODE=$?
set -e  # Re-enable exit on error

if [ $WAIT_EXIT_CODE -ne 0 ]; then
    bashio::log.warning "One or more processes exited with code: ${WAIT_EXIT_CODE}"
    # Check which process died
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        bashio::log.error "Backend process exited"
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        bashio::log.error "Frontend process exited"
    fi
    exit $WAIT_EXIT_CODE
fi
