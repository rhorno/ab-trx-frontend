# Update Instructions: Pushing Changes to Home Assistant Addon

This guide explains how to update the addon after making code changes. The workflow uses Git and Home Assistant's built-in update mechanism.

## Standard Update Workflow

Use this process every time you want to push changes to your Home Assistant instance:

### 1. Make Your Code Changes

Edit files in the repository as needed:

- `backend/` - Backend code
- `frontend/` - Frontend code
- `run.sh` - Startup script
- `Dockerfile` - Container build
- Any other project files

### 2. (Optional) Create a Safety Checkpoint

Before risky changes, create a commit/tag you can roll back to:

```bash
# From repository root
git add .
git commit -m "addon: stable checkpoint before changes"
git tag v1.0.0-stable   # Use your current version number
git push origin main
git push origin v1.0.0-stable
```

This lets you easily revert if something breaks.

### 3. Bump the Version Number

**IMPORTANT:** Home Assistant only detects updates when the version changes.

Edit `config.yaml`:

```yaml
version: "1.0.1" # Increment from previous version (e.g., 1.0.0 → 1.0.1)
```

**Version Format:**

- Use semantic versioning: `MAJOR.MINOR.PATCH` (e.g., `1.0.0`, `1.0.1`, `1.1.0`, `2.0.0`)
- Always increment the version number, even for small fixes
- The version must be higher than the currently installed version

### 4. Commit and Push

```bash
# From repository root
git add .
git commit -m "addon: update to version 1.0.1"
git push origin main  # or your default branch name
```

**Optional:** Create a git tag for the release:

```bash
git tag v1.0.1
git push origin v1.0.1
```

### 5. Update in Home Assistant

1. Open Home Assistant UI
2. Go to **Settings** → **Add-ons** → **AB Transaction Importer**
3. Click **⋮** (three dots menu) → **Check for updates** (if needed)
4. Click the **Update** button
5. Wait for the update to complete (Home Assistant will rebuild the container)
6. Click **Start** if the addon stopped

**What happens:**

- Home Assistant pulls the latest code from your repository
- Detects the new version in `config.yaml`
- Rebuilds the Docker container with your changes
- Restarts the addon with the new code

---

## Rollback Procedure: Reverting to a Previous Version

If a new version breaks something, follow these steps to roll back:

### Option A: Revert the Bad Commit (Recommended)

1. **Find the commit that broke things:**

```bash
git log --oneline
# Look for the commit that introduced the problem
```

2. **Revert the commit(s):**

```bash
# Revert a single commit
git revert <commit-sha>

# Or revert multiple commits (most recent first)
git revert <newest-bad-commit>
git revert <older-bad-commit>
```

3. **Bump version again** (must be higher than broken version):

Edit `config.yaml`:

```yaml
version: "1.0.2" # Broken was 1.0.1, this reverts to good code
```

4. **Commit and push:**

```bash
git add .
git commit -m "addon: rollback to previous stable code (version 1.0.2)"
git push origin main
```

5. **Update in Home Assistant** (same as step 5 above)

### Option B: Checkout Previous Tag and Re-publish

1. **Checkout the stable tag:**

```bash
git checkout v1.0.0-stable  # or whatever tag you created
```

2. **Create a new branch or merge to main:**

```bash
# Option 1: Create fix branch
git checkout -b fix/rollback-to-stable
git checkout main
git merge fix/rollback-to-stable

# Option 2: Directly update main (if you're sure)
git checkout main
git reset --hard v1.0.0-stable
```

3. **Bump version to a new number:**

Edit `config.yaml`:

```yaml
version: "1.0.3" # Must be higher than broken version
```

4. **Commit and push:**

```bash
git add .
git commit -m "addon: rollback to v1.0.0-stable (version 1.0.3)"
git push origin main --force  # Only if you reset main branch
```

5. **Update in Home Assistant** (same as step 5 above)

---

## Quick Reference: Common Commands

### Check Current Version

```bash
# View version in config.yaml
grep "version:" config.yaml

# Or check installed version in Home Assistant UI
```

### View Git History

```bash
git log --oneline -10  # Last 10 commits
git log --oneline --all --graph  # Visual history
```

### List Tags

```bash
git tag -l
git tag -l "v*"  # List version tags
```

### Check Repository Status

```bash
git status
git diff  # See uncommitted changes
```

---

## Troubleshooting

### Home Assistant Doesn't Show Update Available

1. **Check version was bumped:** Ensure `config.yaml` has a higher version number
2. **Check repository URL:** Verify Home Assistant is pointing to the correct repository
3. **Force refresh:** Click "Check for updates" in Home Assistant
4. **Check git push:** Verify your changes were pushed to the remote repository

### Update Fails in Home Assistant

1. **Check logs:** View addon logs in Home Assistant for error messages
2. **Verify code:** Check that your code changes don't have syntax errors
3. **Check Dockerfile:** Ensure Dockerfile is valid and builds correctly
4. **Rollback:** Use rollback procedure above to revert to last working version

### Build Takes Too Long

- First-time builds are slower (Home Assistant builds the container)
- Subsequent updates are faster (only changed layers rebuild)
- This is normal for source-based addons

---

## Best Practices

1. **Always bump version** before pushing updates
2. **Test locally** when possible (run backend/frontend locally)
3. **Create tags** for stable versions you might need to roll back to
4. **Commit frequently** with clear messages
5. **Keep version numbers** in sync between `config.yaml` and git tags (optional but helpful)

---

## Example: Complete Update Session

```bash
# 1. Make code changes (edit files)

# 2. Check what changed
git status
git diff

# 3. Bump version in config.yaml
# Edit: version: "1.0.0" → version: "1.0.1"

# 4. Commit and push
git add .
git commit -m "addon: fix transaction parsing bug (v1.0.1)"
git tag v1.0.1
git push origin main
git push origin v1.0.1

# 5. Update in Home Assistant UI
# Settings → Add-ons → AB Transaction Importer → Update
```

---

## Notes

- **Private repositories work fine** - Home Assistant can access private GitHub repos if you're logged in
- **No CI/CD needed** - Home Assistant builds the container locally on your instance
- **Configuration is preserved** - Your `.env` and `profiles.json` files are not affected by updates
- **Build happens on HA instance** - First install/update may take a few minutes
