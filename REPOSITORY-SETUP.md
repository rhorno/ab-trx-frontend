# Repository Setup Complete

The addon has been configured for repository-based updates. Here's what was done and what you need to do next.

## What Was Done

✅ **Repository structure created:**

- `repository.yaml` at repository root
- `addon/` directory with all addon files (now tracked in git)
- `config.yaml` updated (removed `image` field for source-based builds)
- `.gitignore` updated to track addon source files

✅ **Documentation created:**

- `ab-trx-importer/INSTALLATION.md` - Repository-based installation guide
- `ab-trx-importer/UPDATE-INSTRUCTIONS.md` - Complete update workflow with rollback procedures

## Next Steps

### 1. Update `repository.yaml`

Edit `repository.yaml` at the repository root and replace placeholders:

```yaml
name: AB Transaction Importer Repository
url: https://codeberg.org/YOUR_USERNAME/YOUR_REPO_NAME
maintainer: Your Name <your.email@example.com>
```

Replace:

- `YOUR_USERNAME` with your GitHub username
- `YOUR_REPO_NAME` with your repository name
- `Your Name <your.email@example.com>` with your actual name and email

### 2. Push to GitHub

```bash
# From repository root
git add .
git commit -m "Setup repository structure for Home Assistant addon"
git push origin main
```

### 3. Add Repository to Home Assistant

1. Open Home Assistant UI
2. Go to **Settings** → **Add-ons** → **Add-on Store**
3. Click **⋮** (three dots) → **Repositories**
4. Click **Add** and enter your repository URL
5. Click **Add** to save

### 4. Install the Addon

1. In **Add-on Store**, click **⋮** → **Check for updates**
2. Find **AB Transaction Importer**
3. Click **Install**
4. Wait for installation (first build takes a few minutes)

### 5. Configure

Before starting, create configuration files:

- `/config/addon_configs/ab-trx-importer/.env` (copy from `addon/env.example`)
- `/config/addon_configs/ab-trx-importer/profiles.json` (copy from `addon/profiles.json.example`)

See `ab-trx-importer/INSTALLATION.md` for detailed configuration steps.

## Updating the Addon

**See `ab-trx-importer/UPDATE-INSTRUCTIONS.md` for the complete workflow.**

Quick process:

1. Make code changes
2. Bump version in `addon/config.yaml`
3. Commit and push: `git add . && git commit -m "..." && git push`
4. In Home Assistant: Click **Update** on the addon

## Repository Structure

```
repository-root/
├── repository.yaml          # Repository metadata (update with your info)
├── addon/                   # Addon directory
│   ├── config.yaml         # Addon configuration
│   ├── Dockerfile         # Container build file
│   ├── build.yaml         # Build configuration
│   ├── run.sh             # Startup script
│   ├── backend/           # Backend code
│   ├── frontend/          # Frontend code
│   ├── INSTALLATION.md    # Installation guide
│   └── UPDATE-INSTRUCTIONS.md  # Update workflow guide
└── ... (other project files)
```

## Notes

- **Private repositories work fine** - Home Assistant can access private GitHub repos
- **Source-based builds** - Home Assistant builds the container locally (no CI/CD needed)
- **Version bumps required** - Home Assistant only detects updates when version in `config.yaml` changes
- **Configuration preserved** - Your `.env` and `profiles.json` are not affected by updates

## Troubleshooting

If Home Assistant doesn't see the addon:

1. Verify `repository.yaml` exists at repository root
2. Verify `addon/config.yaml` exists
3. Check repository URL is correct in Home Assistant
4. Click "Check for updates" in Home Assistant

For more help, see:

- `ab-trx-importer/INSTALLATION.md` - Installation details
- `ab-trx-importer/UPDATE-INSTRUCTIONS.md` - Update workflow and rollback procedures
