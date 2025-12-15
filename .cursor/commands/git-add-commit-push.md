# Git Add Commit Push

## Description

Stages all changes in the repository, commits them with a descriptive message, and pushes to the remote repository. This command provides a complete git workflow for saving and sharing changes.

This command is useful when you want to:
- Save all your work (new files, modifications, deletions)
- Create a commit with a clear message describing the changes
- Push changes to the remote repository to share with others or backup your work

## Usage

### Basic Workflow

The standard workflow consists of three steps:

1. **Stage all changes**: Add all modified, new, and deleted files to the staging area
2. **Commit changes**: Create a commit with a descriptive message
3. **Push to remote**: Upload the committed changes to the remote repository

### Command Sequence

```bash
# Stage all changes (including new files, modifications, and deletions)
git add -A

# Commit with a descriptive message
git commit -m "Your commit message here"

# Push to remote (default branch is typically 'main')
git push origin main
```

### Combined Command

For convenience, you can combine all three steps into a single command:

```bash
git add -A && git commit -m "Your commit message here" && git push origin main
```

### Branch-Specific Push

If you're working on a different branch, replace `main` with your branch name:

```bash
git push origin <branch-name>
```

## Parameters

### `git add -A`
- **Purpose**: Stages all changes in the repository
- **Includes**:
  - New files
  - Modified files
  - Deleted files
- **Alternative**: `git add .` (stages all files in current directory and subdirectories, but may not include deletions in parent directories)

### `git commit -m "message"`
- **Purpose**: Creates a commit with the specified message
- **Message**: Should be clear, descriptive, and follow project conventions
- **Best Practice**: Use present tense, imperative mood (e.g., "Add feature" not "Added feature")

### `git push origin <branch>`
- **Purpose**: Pushes committed changes to the remote repository
- **origin**: The default remote repository name
- **branch**: The branch to push to (commonly `main` or `master`)

## Best Practices

### Commit Messages

- **Be Descriptive**: Write clear, concise commit messages that explain what and why
- **Use Present Tense**: Write in imperative mood (e.g., "Fix bug" not "Fixed bug")
- **Keep It Short**: First line should be 50 characters or less
- **Add Details**: Use the body for more detailed explanations if needed
- **Follow Conventions**: Use conventional commit format if your project uses it:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `refactor:` for code refactoring
  - `test:` for test changes
  - `chore:` for maintenance tasks

### Before Committing

1. **Review Changes**: Use `git status` to see what will be committed
2. **Check Differences**: Use `git diff` to review the actual changes
3. **Test Your Code**: Ensure your changes work before committing
4. **Avoid Committing**:
   - Temporary files
   - Build artifacts
   - Sensitive information (passwords, API keys)
   - Files listed in `.gitignore`

### Workflow Safety

- **Verify Remote**: Ensure you're pushing to the correct remote and branch
- **Check Status**: Run `git status` before pushing to see current state
- **Pull First**: If working with others, pull latest changes before pushing:
  ```bash
  git pull origin main
  ```
- **Backup**: Important changes should be committed and pushed regularly

## Examples

### Example 1: Simple Feature Addition

```bash
git add -A
git commit -m "Add support for multiple profiles in Home Assistant addon configuration"
git push origin main
```

### Example 2: Bug Fix

```bash
git add -A
git commit -m "Fix JSON parsing error in profiles configuration"
git push origin main
```

### Example 3: Documentation Update

```bash
git add -A
git commit -m "Update README with new installation instructions"
git push origin main
```

### Example 4: Multiple File Changes

```bash
# Stage all changes
git add -A

# Commit with detailed message
git commit -m "Refactor configuration management

- Updated config.yaml to use profiles array
- Modified run.sh to process multiple profiles
- Improved error handling and validation"

# Push to remote
git push origin main
```

### Example 5: Working on Feature Branch

```bash
# Create and switch to feature branch
git checkout -b feature/new-config

# Make changes, then commit and push
git add -A
git commit -m "Add new configuration option"
git push origin feature/new-config
```

## Troubleshooting

### Error: "Your branch is ahead of 'origin/main'"

**Cause**: You have local commits that haven't been pushed yet.

**Solution**: Run `git push origin main` to push your commits.

### Error: "Updates were rejected because the remote contains work"

**Cause**: The remote repository has commits you don't have locally.

**Solution**: Pull the remote changes first, then push:
```bash
git pull origin main
git push origin main
```

### Error: "Nothing to commit, working tree clean"

**Cause**: All changes are already committed or there are no changes.

**Solution**: Check `git status` to verify. If you want to amend the last commit, use `git commit --amend`.

### Error: "fatal: The current branch has no upstream branch"

**Cause**: The local branch doesn't have a remote tracking branch set up.

**Solution**: Set upstream branch:
```bash
git push -u origin main
```

### Files Not Being Added

**Cause**: Files might be in `.gitignore` or outside the repository.

**Solution**:
- Check `.gitignore` to see if files are excluded
- Verify you're in the correct directory
- Use `git add -f <file>` to force add ignored files (use with caution)

## Agent Instructions

When executing this command as an agent:

1. **Check Current Status**: Run `git status` to see what changes exist
2. **Review Changes**: Use `git diff` to understand what will be committed
3. **Stage Changes**: Use `git add -A` to stage all changes
4. **Create Commit**: Write a clear, descriptive commit message following project conventions
5. **Push Changes**: Push to the correct remote and branch
6. **Verify Success**: Confirm the push was successful

## Agent Process

1. **Pre-flight Checks**:
   - Verify you're in the correct repository directory
   - Check current branch: `git branch`
   - Review status: `git status`

2. **Stage Changes**:
   - Run `git add -A` to stage all changes
   - Verify staged files: `git status`

3. **Create Commit**:
   - Write a descriptive commit message
   - Run `git commit -m "message"`
   - Verify commit was created: `git log -1`

4. **Push to Remote**:
   - Determine correct branch (usually `main`)
   - Run `git push origin <branch>`
   - Verify push success

5. **Post-push Verification**:
   - Check remote status: `git status`
   - Verify changes are on remote (if accessible)

## Codebase Context

This project uses:
- **Default Branch**: `main` (as seen in AGENTS.md)
- **Remote Name**: `origin` (standard git convention)
- **Versioning**: Semantic versioning for tags (see AGENTS.md versioning section)
- **Workflow**: Standard git workflow with commits and pushes to GitHub

The project structure includes:
- Frontend and backend directories
- Home Assistant addon configuration
- Documentation files

Always ensure you're committing from the repository root to include all relevant changes.

## Reference files

- [AGENTS.md](../AGENTS.md) - Project agent guidelines and versioning information
- [README.md](../../README.md) - Project overview and structure
- Git documentation: https://git-scm.com/doc

