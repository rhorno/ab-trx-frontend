# AB Transaction Importer - Home Assistant Addon

This directory contains the Home Assistant addon configuration files.

## Structure

- `config.yaml` - Addon configuration and metadata
- `Dockerfile` - Container build instructions
- `build.yaml` - Build configuration
- `run.sh` - Startup script

## Build Process

The addon contains `backend/` and `frontend/` directories within the addon directory. During build:

1. Home Assistant's builder clones the repository
2. The builder sets the build context to the addon directory (`ab-trx-importer/`)
3. Dockerfile uses `backend/` and `frontend/` paths relative to the addon directory
4. Docker builds the application from the addon directory

## Files

- Source code (`backend/`, `frontend/`) is located in this directory (`ab-trx-importer/`)
- Symlinks at the repository root (`../backend` and `../frontend`) allow local development to work as before
- The Dockerfile builds from the addon directory context, ensuring all files are accessible
