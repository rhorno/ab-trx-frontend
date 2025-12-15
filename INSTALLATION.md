# Installation Guide

## Prerequisites

- Home Assistant OS or Home Assistant Supervised
- GitHub repository with the addon code (private or public)
- Repository URL (e.g., `https://github.com/yourusername/ab-trx-importer-frontend`)

## Installation Steps

### 1. Add Repository to Home Assistant

1. Open Home Assistant UI
2. Go to **Settings** → **Add-ons** → **Add-on Store**
3. Click **⋮** (three dots menu) in the top right
4. Select **Repositories**
5. Click **Add** and enter your repository URL:
   ```
   https://github.com/yourusername/ab-trx-importer-frontend
   ```
6. Click **Add** to save

**Note:** For private repositories, ensure your Home Assistant instance has access (GitHub authentication may be required).

### 2. Install the Addon

1. In the **Add-on Store**, click **⋮** (three dots) → **Check for updates**
2. Find **AB Transaction Importer** in the list
3. Click on it to open the addon page
4. Click **Install**
5. Wait for installation to complete (Home Assistant will build the Docker container - this may take a few minutes)

**What happens:**

- Home Assistant pulls the code from your repository
- Builds the Docker container using the `Dockerfile`
- Installs the addon

### 3. Configure

Before starting, create configuration files in the add-on's data directory.

**For Home Assistant OS 16.3, the data directory is:**

```
/config/addon_configs/ab-trx-importer/
```

**Via File Editor:**

1. Open **File editor** add-on
2. Navigate to `/config/addon_configs/ab-trx-importer/`
3. Create `.env` file (copy from `env.example` in the repository root)
4. Create `profiles.json` file (copy from `profiles.json.example` in the repository root)

**Via SSH:**

```bash
# Navigate to the addon data directory
cd /config/addon_configs/ab-trx-importer/

# Create .env (you'll need to copy content from repository)
# The env.example file is in your repository root
nano .env
# Paste and edit the content from env.example

# Create profiles.json (you'll need to copy content from repository)
# The profiles.json.example file is in your repository root
nano profiles.json
# Paste and edit the content from profiles.json.example
```

**Note:** If `/config/addon_configs/ab-trx-importer/` doesn't exist yet, create it first:

```bash
mkdir -p /config/addon_configs/ab-trx-importer/
```

### 4. Start Add-on

1. In the add-on page, click **Start**
2. Check logs to verify it started successfully
3. Access web interface at `http://homeassistant.local:5173`

## Update Process

**See [UPDATE-INSTRUCTIONS.md](./UPDATE-INSTRUCTIONS.md) for detailed update workflow.**

Quick summary:

1. Make code changes in your repository
2. Bump version in `config.yaml`
3. Commit and push to GitHub
4. In Home Assistant: **Settings** → **Add-ons** → **AB Transaction Importer** → **Update**

Configuration files are automatically preserved during updates.

## Removal

1. Stop the add-on
2. Click **Uninstall**
3. Optionally delete data directory to remove configuration
