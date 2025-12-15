ARG BUILD_FROM
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js 20.x (LTS) and system dependencies for Playwright
RUN \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        nodejs \
        curl \
        ca-certificates \
        libglib2.0-0 \
        libnss3 \
        libnspr4 \
        libdbus-1-3 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libx11-6 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libxcb1 \
        libxkbcommon0 \
        libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install backend dependencies (including dev for TypeScript build)
WORKDIR /app/backend
RUN npm ci

# Copy backend source code and TypeScript config
WORKDIR /app
COPY backend/tsconfig.json ./backend/
COPY backend/services/ ./backend/services/
COPY backend/api/ ./backend/api/

# Build TypeScript to JavaScript
WORKDIR /app/backend
RUN npm run build

# Replace TypeScript source with compiled JavaScript
# TypeScript compiles services/ to dist/services/, keep api/ as-is (already JS)
RUN rm -rf services && mv dist/services services && rm -rf dist

# Copy frontend source code
WORKDIR /app
COPY frontend/ ./frontend/

# Install frontend dependencies and build
WORKDIR /app/frontend
RUN npm ci && npm run build

# Install Playwright browsers
WORKDIR /app/backend
RUN npx playwright install chromium

# Copy backend server.js (not compiled, stays as JS)
WORKDIR /app
COPY backend/server.js ./backend/

# Create service directory for s6-overlay
RUN mkdir -p /etc/services.d/ab-trx-importer

# Copy run script as service
COPY run.sh /etc/services.d/ab-trx-importer/run
RUN chmod a+x /etc/services.d/ab-trx-importer/run

# Create config directory mount point
RUN mkdir -p /config

# Expose ports
EXPOSE 8000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Use s6-overlay init system (required for Home Assistant addons)
ENTRYPOINT ["/init"]
