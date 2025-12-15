#!/bin/bash
# Build preparation script
# This script temporarily copies backend/frontend into the addon directory
# for Docker build (these copies are gitignored and not committed)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ADDON_DIR="${SCRIPT_DIR}"

echo "Preparing build environment..."
echo "Repository root: ${REPO_ROOT}"
echo "Addon directory: ${ADDON_DIR}"

# Remove existing copies if they exist
if [ -d "${ADDON_DIR}/backend" ]; then
    rm -rf "${ADDON_DIR}/backend"
fi
if [ -d "${ADDON_DIR}/frontend" ]; then
    rm -rf "${ADDON_DIR}/frontend"
fi

# Copy backend and frontend (temporary, for build only)
echo "Copying backend and frontend for build..."
cp -r "${REPO_ROOT}/backend" "${ADDON_DIR}/backend"
cp -r "${REPO_ROOT}/frontend" "${ADDON_DIR}/frontend"

# Remove node_modules and dist to keep copies small (will be installed during build)
rm -rf "${ADDON_DIR}/backend/node_modules" "${ADDON_DIR}/backend/dist" 2>/dev/null || true
rm -rf "${ADDON_DIR}/frontend/node_modules" "${ADDON_DIR}/frontend/dist" 2>/dev/null || true

echo "Build environment prepared."

