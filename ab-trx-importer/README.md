# AB Transaction Importer - Home Assistant Addon

This directory contains the Home Assistant addon configuration files.

## Structure

- `config.yaml` - Addon configuration and metadata
- `Dockerfile` - Container build instructions
- `build.yaml` - Build configuration
- `run.sh` - Startup script
- `prepare-build.sh` - Build preparation script (creates temporary copies of backend/frontend)

## Build Process

The addon references `backend/` and `frontend/` directories from the repository root. During build:

1. Home Assistant's builder clones the repository
2. The builder runs from the `ab-trx-importer/` directory
3. The `prepare-build.sh` script (if run) creates temporary copies of `../backend` and `../frontend` in this directory
4. Docker builds using these copies
5. Temporary copies are gitignored and not committed

**Note:** If Home Assistant's builder doesn't automatically run `prepare-build.sh`, you may need to manually run it before building, or the builder may need to be configured to build from the repository root.

## Files

- Source code (`backend/`, `frontend/`) remains at repository root (no duplication)
- Addon config files are in this directory
- Temporary build copies are gitignored

