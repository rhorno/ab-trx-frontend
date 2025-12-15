#!/bin/bash
# Setup script to prepare add-on directory for building
# This script should be run from the project root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ADDON_DIR="${SCRIPT_DIR}"

echo "Setting up add-on directory for building..."
echo "Project root: ${PROJECT_ROOT}"
echo "Add-on directory: ${ADDON_DIR}"

# Create symlinks or copies of backend and frontend directories
# We'll use copies to ensure the build is self-contained

if [ -d "${ADDON_DIR}/backend" ]; then
    echo "Removing existing backend directory..."
    rm -rf "${ADDON_DIR}/backend"
fi

if [ -d "${ADDON_DIR}/frontend" ]; then
    echo "Removing existing frontend directory..."
    rm -rf "${ADDON_DIR}/frontend"
fi

echo "Copying backend directory..."
cp -r "${PROJECT_ROOT}/backend" "${ADDON_DIR}/backend"

echo "Copying frontend directory..."
cp -r "${PROJECT_ROOT}/frontend" "${ADDON_DIR}/frontend"

echo "Setup complete! The add-on directory is ready for building."
echo ""
echo "Next steps:"
echo "1. Copy the addon/ directory to your Home Assistant instance"
echo "2. Place it in /config/addons/ab-trx-importer/"
echo "3. Install and start the add-on from Home Assistant UI"
