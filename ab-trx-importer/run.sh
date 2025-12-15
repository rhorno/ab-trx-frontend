#!/usr/bin/with-contenv bashio
set -e

# Debug: Log script execution
exec 2>&1  # Ensure stderr goes to stdout for logging

# Function to log errors and exit
error_exit() {
    bashio::log.error "$1"
    exit 1
}

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

# Cleanup function to remove lock file (only on normal exit, not on errors)
cleanup_lock() {
    if [ -f "${LOCK_FILE}" ] && [ "$(cat "${LOCK_FILE}" 2>/dev/null)" = "$$" ]; then
        rm -f "${LOCK_FILE}"
        # Only log if we're not in the middle of an error exit
        if [ "${1}" != "silent" ]; then
            bashio::log.info "Removed lock file"
        fi
    fi
}
# Trap EXIT to clean up lock file, but don't exit the script
trap 'cleanup_lock silent' EXIT

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
# First, get the profiles JSON into a temp file, then process it
TEMP_INPUT="/tmp/profiles_input.json"
TEMP_OUTPUT="/tmp/profiles_output.json"

bashio::log.info "Fetching profiles from configuration..."
if ! bashio::config 'profiles' > "${TEMP_INPUT}" 2>&1; then
    bashio::log.error "Failed to get profiles from configuration"
    exit 1
fi

# Check what we got and clean it up if needed
bashio::log.info "Raw profiles data size: $(wc -c < "${TEMP_INPUT}" 2>/dev/null || echo 0) bytes"
# Log first 200 chars for debugging (but don't log sensitive data in production)
bashio::log.info "Raw profiles data preview (first 200 chars): $(head -c 200 "${TEMP_INPUT}" 2>/dev/null | tr -d '\n' || echo 'N/A')"
bashio::log.info "Profiles fetched, processing with Node.js..."

# Process with Node.js script
bashio::log.info "Running Node.js script to process profiles..."
set +e  # Temporarily disable exit on error to capture exit code
node <<EOF > "${TEMP_OUTPUT}" 2>&1
const fs = require('fs');
try {
  let profilesData = fs.readFileSync('${TEMP_INPUT}', 'utf8');

  // Trim whitespace and newlines that bashio might add
  profilesData = profilesData.trim();

  // Debug: log what we received
  console.error('DEBUG: First 100 chars of input:', profilesData.substring(0, 100));
  console.error('DEBUG: Input length:', profilesData.length);

  let profilesArray;

  // Try to parse as-is first
  try {
    profilesArray = JSON.parse(profilesData);
    // If it parsed successfully, check if it's an array
    if (!Array.isArray(profilesArray)) {
      throw new Error('Parsed JSON is not an array');
    }
  } catch (parseError) {
    // If direct parse failed, try to extract array from the data
    const firstBrace = profilesData.indexOf('[');
    const lastBrace = profilesData.lastIndexOf(']');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      // Extract just the JSON array part
      const jsonPart = profilesData.substring(firstBrace, lastBrace + 1);
      console.error('DEBUG: Extracted JSON part (first 100 chars):', jsonPart.substring(0, 100));
      profilesArray = JSON.parse(jsonPart);
    } else {
      // If no brackets found, maybe it's a different format
      // Try to see if it's a single object or something else
      console.error('DEBUG: No array brackets found, trying alternative parsing...');
      throw new Error(\`Invalid JSON structure: missing array brackets. First 200 chars: \${profilesData.substring(0, 200)}\`);
    }
  }

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
EOF

NODE_EXIT_CODE=$?
set -e  # Re-enable exit on error
bashio::log.info "Node.js script finished with exit code: ${NODE_EXIT_CODE}"

# Show debug output if there was an error
if [ $NODE_EXIT_CODE -ne 0 ]; then
    bashio::log.error "Failed to generate profiles.json from configuration (exit code: ${NODE_EXIT_CODE})"
    if [ -f "${TEMP_OUTPUT}" ]; then
        bashio::log.error "Error output:"
        cat "${TEMP_OUTPUT}" || true
    fi
    if [ -f "${TEMP_INPUT}" ]; then
        bashio::log.error "Input data (first 500 chars):"
        head -c 500 "${TEMP_INPUT}" || true
        bashio::log.error ""
        bashio::log.error "Input data (hex dump of first 200 bytes):"
        head -c 200 "${TEMP_INPUT}" | xxd || head -c 200 "${TEMP_INPUT}" | od -c | head -20 || true
    fi
    rm -f "${TEMP_INPUT}" "${TEMP_OUTPUT}"
    exit 1
fi

# Check if output file was created
if [ ! -f "${TEMP_OUTPUT}" ]; then
    bashio::log.error "Node.js script did not produce output file"
    rm -f "${TEMP_INPUT}"
    exit 1
fi

# Check if the output contains an error
if grep -q "^Error" "${TEMP_OUTPUT}" 2>/dev/null || grep -q "Error building profiles.json" "${TEMP_OUTPUT}" 2>/dev/null; then
    bashio::log.error "Node.js script reported an error:"
    cat "${TEMP_OUTPUT}" || true
    rm -f "${TEMP_INPUT}" "${TEMP_OUTPUT}"
    exit 1
fi

# Move output to final location
mv "${TEMP_OUTPUT}" "${PROFILES_FILE}" || {
    bashio::log.error "Failed to move profiles file to final location"
    rm -f "${TEMP_INPUT}" "${TEMP_OUTPUT}"
    exit 1
}

# Cleanup temp input file
rm -f "${TEMP_INPUT}"
bashio::log.info "Node.js script completed successfully"

# Validate the output JSON file is valid and properly formatted
bashio::log.info "Validating output profiles.json file..."
if ! node -e "
  const fs = require('fs');
  try {
    const content = fs.readFileSync('${PROFILES_FILE}', 'utf8');
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.error('ERROR: Output is not a valid profiles object');
      process.exit(1);
    }
    const profileCount = Object.keys(parsed).length;
    console.log(\`SUCCESS: Valid profiles.json with \${profileCount} profile(s)\`);
  } catch (error) {
    console.error('ERROR: Invalid JSON in output file:', error.message);
    process.exit(1);
  }
" 2>&1; then
    bashio::log.error "Output profiles.json validation failed"
    bashio::log.error "Contents of profiles.json:"
    head -50 "${PROFILES_FILE}" || true
    exit 1
fi
VALIDATION_OUTPUT=$(node -e "const fs = require('fs'); const p = JSON.parse(fs.readFileSync('${PROFILES_FILE}', 'utf8')); console.log(Object.keys(p).length + ' profiles')" 2>&1)
bashio::log.info "Output validation successful: ${VALIDATION_OUTPUT}"

# Check if profiles.json was created and is valid
bashio::log.info "Checking if profiles.json file exists at: ${PROFILES_FILE}"
if [ ! -f "${PROFILES_FILE}" ]; then
    bashio::log.error "profiles.json was not created at ${PROFILES_FILE}"
    ls -la "$(dirname "${PROFILES_FILE}")" || true
    exit 1
fi
bashio::log.info "profiles.json file exists (size: $(stat -c%s "${PROFILES_FILE}" 2>/dev/null || echo 'unknown') bytes)"

bashio::log.info "Validating JSON syntax..."
# Temporarily disable set -e for validation to catch errors properly
set +e
VALIDATION_OUTPUT=$(node -e "JSON.parse(require('fs').readFileSync('${PROFILES_FILE}', 'utf8'))" 2>&1)
VALIDATION_EXIT=$?
set -e

if [ $VALIDATION_EXIT -ne 0 ]; then
    bashio::log.error "Failed to create valid profiles.json (exit code: ${VALIDATION_EXIT})"
    bashio::log.error "Validation error: ${VALIDATION_OUTPUT}"
    bashio::log.error "Contents of profiles.json (first 500 chars):"
    head -c 500 "${PROFILES_FILE}" || true
    exit 1
fi
bashio::log.info "profiles.json validation successful"

# Create symlinks to app root
bashio::log.info "Creating symlinks..."
bashio::log.info "APP_ROOT is: ${APP_ROOT}"
bashio::log.info "ENV_FILE is: ${ENV_FILE}"
bashio::log.info "PROFILES_FILE is: ${PROFILES_FILE}"
bashio::log.info "Linking .env to ${APP_ROOT}/.env"
if ! ln -sf "${ENV_FILE}" "${APP_ROOT}/.env"; then
    bashio::log.error "Failed to create .env symlink"
    exit 1
fi
bashio::log.info ".env symlink created successfully"

bashio::log.info "Linking profiles.json to ${APP_ROOT}/backend/services/configuration/profiles.json"
if ! mkdir -p "${APP_ROOT}/backend/services/configuration"; then
    bashio::log.error "Failed to create configuration directory"
    exit 1
fi
bashio::log.info "Configuration directory created/verified"

if ! ln -sf "${PROFILES_FILE}" "${APP_ROOT}/backend/services/configuration/profiles.json"; then
    bashio::log.error "Failed to create profiles.json symlink"
    exit 1
fi
bashio::log.info "profiles.json symlink created successfully"
bashio::log.info "All configuration files linked, proceeding to start services..."

# Verify APP_ROOT exists before proceeding
if [ ! -d "${APP_ROOT}" ]; then
    bashio::log.error "APP_ROOT directory does not exist: ${APP_ROOT}"
    exit 1
fi
bashio::log.info "APP_ROOT verified: ${APP_ROOT}"

# Function to handle shutdown
cleanup() {
    local exit_code=${1:-0}
    bashio::log.info "Shutting down (exit code: ${exit_code})..."
    if [ -n "${BACKEND_PID}" ] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
        kill "${BACKEND_PID}" 2>/dev/null || true
        wait "${BACKEND_PID}" 2>/dev/null || true
    fi
    if [ -n "${FRONTEND_PID}" ] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
        kill "${FRONTEND_PID}" 2>/dev/null || true
        wait "${FRONTEND_PID}" 2>/dev/null || true
    fi
    cleanup_lock
    exit ${exit_code}
}

# Trap signals
trap 'cleanup 0' SIGTERM SIGINT

# Initialize PIDs to empty (will be set when processes start)
BACKEND_PID=""
FRONTEND_PID=""

bashio::log.info "About to start backend and frontend services..."

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
