# AB Transaction Importer - Home Assistant Addon

This directory contains the Home Assistant addon configuration files.

## Structure

- `config.yaml` - Addon configuration and metadata
- `Dockerfile` - Container build instructions
- `build.yaml` - Build configuration
- `run.sh` - Startup script

## Build Process

The addon references `backend/` and `frontend/` directories from the repository root. During build:

1. Home Assistant's builder clones the repository
2. The builder sets the build context to the repository root
3. Dockerfile uses `backend/` and `frontend/` paths directly (no duplication needed)
4. Docker builds the application from the root-level source directories

## Files

- Source code (`backend/`, `frontend/`) remains at repository root (no duplication)
- Addon config files are in this directory (`ab-trx-importer/`)
- The Dockerfile builds from repository root context, eliminating code duplication

