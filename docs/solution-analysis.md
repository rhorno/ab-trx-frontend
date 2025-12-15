# Solution Analysis: Home Assistant Addon Repository-Based Updates

## Quick Summary (Private Use)

**Recommended Approach: Plan A - Basic Repository Setup**

For private, single-user deployment, you need:

1. `repository.yaml` at repository root
2. Addon files in `ab-trx-importer/` subdirectory
3. Push to GitHub (private repo works)
4. Add repository URL to Home Assistant
5. **Update workflow:** Bump version → Push → Click "Update" in HA UI

No CI/CD, no container registry, no complexity. Just push code and update through the UI.

---

## Problem Summary

Currently, the Home Assistant addon requires manual copy/paste of files between the local development environment and the Home Assistant server. The goal is to enable a workflow where:

1. Code is pushed to a Git repository
2. Updates are pulled directly through the Home Assistant UI
3. No manual file copying is required

## Research & Best Practices

Home Assistant addons can be distributed through custom repositories. The standard workflow involves:

1. **Repository Structure**: A `repository.yaml` file at the root identifies the repository, with each addon in its own subdirectory
2. **Addon Configuration**: Each addon requires a `config.yaml` file with metadata and optionally a pre-built Docker image reference
3. **Update Mechanism**: Home Assistant checks the repository for version changes in `config.yaml` and makes updates available through the UI
4. **Image Publishing**: Pre-built Docker images (published to container registries) provide faster installation and better user experience than source-based builds

Key findings:

- Home Assistant supports both source-based (build on install) and pre-built image (pull from registry) approaches
- GitHub Container Registry (ghcr.io) is free for public repositories
- GitHub Actions can automate the build and publish process
- Version bumps in `config.yaml` trigger update availability in Home Assistant UI

## Solution Plans

### Plan A: Basic Repository Setup (Source-Based)

**Approach:** Create repository structure and enable manual updates through Home Assistant UI
**Timeline:** 1-2 days
**Technical Debt Impact:** Low - minimal changes, maintains current build process
**Pros:**

- Quick to implement
- No CI/CD complexity
- No container registry required
- Works immediately after setup
- Users build locally (no external dependencies)

**Cons:**

- Slower installation (users build Docker images locally)
- Requires manual version bumps in `config.yaml`
- No automated build validation
- Users need build tools on their Home Assistant instance
- Updates require manual "Update" button click (but no file copying)

**Implementation Steps:**

1. Create `repository.yaml` at repository root with metadata
2. Reorganize addon: Move `/addon/` contents to `/ab-trx-importer/` subdirectory
3. Ensure `config.yaml` has correct structure (remove `image` field for source-based builds)
4. Push repository to GitHub (private repository is fine)
5. Add repository URL to Home Assistant: Settings → Add-ons → Add-on Store → Repositories
6. Install addon from Home Assistant UI (will build locally on your HA instance)
7. **Update workflow:**
   - Make code changes locally
   - Bump version in `config.yaml` (e.g., 1.0.0 → 1.0.1)
   - Commit and push to GitHub
   - In Home Assistant UI: Click "Update" button on the addon
   - Home Assistant will pull latest code and rebuild

**Repository Structure:**

```
repository-root/
├── repository.yaml
└── ab-trx-importer/
    ├── config.yaml
    ├── Dockerfile
    ├── build.yaml
    ├── run.sh
    ├── backend/
    └── frontend/
```

### Plan B: Repository + Automated Builds (Recommended)

**Approach:** Repository structure with GitHub Actions for automated Docker image builds and publishing
**Timeline:** 3-5 days
**Technical Debt Impact:** Low - follows Home Assistant best practices, clean separation
**Pros:**

- Automated builds on code push
- Pre-built images for faster installation
- Build validation before publishing
- Consistent, tested images
- Better user experience (no local builds required)
- Updates available immediately after push

**Cons:**

- Requires GitHub Actions setup
- Requires container registry (GitHub Container Registry recommended)
- More initial setup complexity
- Still requires manual version bumps (can be automated later)

**Implementation Steps:**

1. Complete Plan A steps 1-3 (repository structure)
2. Update `config.yaml` to include `image` field pointing to container registry
3. Create GitHub Actions workflow (`.github/workflows/build.yml`):
   - Trigger on push to main branch or tags
   - Build Docker images for all architectures (amd64, armhf, armv7, aarch64, i386)
   - Publish to GitHub Container Registry (ghcr.io)
   - Tag images with version from `config.yaml`
4. Set up GitHub Container Registry:
   - Enable in repository settings
   - Configure package permissions (public)
5. Test build workflow on push
6. Add repository to Home Assistant
7. Install addon (will pull pre-built images)
8. For updates: Bump version in `config.yaml`, push to GitHub, GitHub Actions builds and publishes, click "Update" in Home Assistant UI

**Additional Files Needed:**

- `.github/workflows/build.yml` - CI/CD workflow
- Updated `config.yaml` with `image: ghcr.io/yourusername/ab-trx-importer/{arch}`

### Plan C: Full CI/CD with Automated Versioning

**Approach:** Complete automation including automated version bumps, release creation, and repository updates
**Timeline:** 1-2 weeks
**Technical Debt Impact:** Low - professional workflow, but adds complexity
**Pros:**

- Fully automated workflow
- Automated version management
- Automated release creation
- Professional-grade deployment
- Minimal manual intervention
- Can integrate semantic versioning

**Cons:**

- Significant setup complexity
- Requires more GitHub Actions workflows
- More moving parts to maintain
- May be overkill for single-developer project
- Requires discipline in commit messages or version management

**Implementation Steps:**

1. Complete Plan B steps 1-4
2. Add automated version bumping:
   - GitHub Action that reads `config.yaml`, increments version
   - Or use commit message conventions (e.g., `[major]`, `[minor]`, `[patch]`)
   - Or use semantic-release or similar tool
3. Add automated release creation:
   - Create GitHub release on version bump
   - Generate changelog from commits
4. Add automated repository update:
   - Use `hassio-addons/repository-updater` GitHub Action
   - Automatically updates repository metadata
5. Add branch protection and PR workflows (optional)
6. Set up notification system for build failures (optional)

## Recommendation

**Recommended: Plan A (Basic Repository Setup) - For Private Use**

For private, single-user deployment, Plan A is the optimal choice:

- Eliminates manual file copying (primary goal achieved)
- Minimal setup complexity
- No CI/CD overhead
- Works with private GitHub repositories
- Simple workflow: push code → bump version → update in Home Assistant UI
- Builds happen on your Home Assistant instance (acceptable for private use)

Plan B and Plan C add unnecessary complexity for a private setup. The build time on your Home Assistant instance is acceptable when it's just for you.

## Risk Assessment

### Key Risks

1. **Repository Structure Changes**

   - **Risk:** Breaking existing local development workflow
   - **Mitigation:** Keep `/addon/` directory for local development, create separate repository structure. Use symlinks or build scripts to sync between structures.

2. **Container Registry Costs**

   - **Risk:** Unexpected costs from image storage/bandwidth
   - **Mitigation:** Use GitHub Container Registry (free for public repos) or Docker Hub free tier. Monitor usage.

3. **CI/CD Build Failures**

   - **Risk:** Broken builds prevent updates
   - **Mitigation:** Add build status badges, email notifications, test builds before merging.

4. **Version Management Discipline**

   - **Risk:** Forgetting to bump version = no updates visible to users
   - **Mitigation:** Add GitHub Action to remind/validate version bumps, or automate (Plan C).

5. **Multi-Architecture Build Complexity**

   - **Risk:** Building for 5 architectures (amd64, armhf, armv7, aarch64, i386) is complex
   - **Mitigation:** Use Home Assistant's official builder or Docker buildx with matrix strategy. Start with amd64 only if needed, add others incrementally.

6. **GitHub Actions Rate Limits**
   - **Risk:** Hitting GitHub Actions usage limits
   - **Mitigation:** Use workflow_dispatch for manual triggers, optimize workflows to run only on tags/releases for production builds.

## Dependencies & Prerequisites

### Required

- GitHub account (private repository works fine)
- Home Assistant instance with Supervisor (for addon support)
- Git installed locally

### Optional (for Plan B/C)

- GitHub Container Registry access (automatic with GitHub account)
- Docker Hub account (alternative to GHCR)
- GitHub Actions minutes (2,000 free/month for private repos, unlimited for public)

### Current Codebase Status

- ✅ Addon structure exists in `/addon/` directory
- ✅ `config.yaml` and `config.json` files present
- ✅ `Dockerfile` and `build.yaml` configured
- ✅ Multi-architecture support in `build.yaml`
- ⚠️ Need to reorganize for repository structure
- ⚠️ Need to add `repository.yaml` at root
- ✅ Source-based build (no image publishing needed for private use)

## Implementation Notes

### Repository Structure Decision

The current `/addon/` directory contains the addon files. For repository-based distribution, you have two options:

**Option 1: Separate Repository**

- Create new repository specifically for the addon
- Move `/addon/` contents to new repo
- Keep main project separate
- **Pros:** Clean separation, focused repository
- **Cons:** Two repositories to manage

**Option 2: Monorepo with Addon Subdirectory**

- Add `repository.yaml` at root of current repository
- Move `/addon/` contents to `/ab-trx-importer/` subdirectory
- Keep everything in one repository
- **Pros:** Single repository, easier to maintain
- **Cons:** Repository contains non-addon code (may confuse users)

**Recommendation:** Option 2 (monorepo) is the best choice for private use. Keep everything in one repository - simpler to maintain and no need for separate repos.

### Version Management Strategy

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Update version in both `config.yaml` and `config.json` (keep in sync)
- Consider using git tags for releases
- For Plan B: Manual version bumps are acceptable
- For Plan C: Automate with semantic-release or similar

### Image Naming Convention

For GitHub Container Registry:

```
ghcr.io/yourusername/ab-trx-importer/amd64:1.0.0
ghcr.io/yourusername/ab-trx-importer/armhf:1.0.0
ghcr.io/yourusername/ab-trx-importer/armv7:1.0.0
ghcr.io/yourusername/ab-trx-importer/aarch64:1.0.0
ghcr.io/yourusername/ab-trx-importer/i386:1.0.0
```

In `config.yaml`:

```yaml
image: ghcr.io/yourusername/ab-trx-importer/{arch}
```

## Next Steps (Simplified for Private Use)

1. **Set up Repository Structure:**
   - Create `repository.yaml` at repository root
   - Move `/addon/` contents to `/ab-trx-importer/` subdirectory
   - Ensure `config.yaml` doesn't have `image` field (source-based build)
2. **Push to GitHub** (private repo is fine)
3. **Add Repository to Home Assistant:**
   - Settings → Add-ons → Add-on Store → Repositories
   - Add your GitHub repository URL
4. **Install Addon** from Home Assistant UI
5. **Test Update Workflow:**
   - Make a small change
   - Bump version in `config.yaml`
   - Push to GitHub
   - Click "Update" in Home Assistant UI
   - Verify update works

## References

- [Home Assistant Addon Repository Documentation](https://developers.home-assistant.io/docs/add-ons/repository)
- [Home Assistant Addon Publishing Guide](https://developers.home-assistant.io/docs/add-ons/publishing)
- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Home Assistant Addon Builder](https://github.com/home-assistant/builder)
