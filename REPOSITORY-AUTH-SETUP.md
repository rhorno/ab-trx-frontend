# Repository Authentication Setup for Home Assistant

## Problem

Home Assistant can't access your private Codeberg repository because it requires authentication.

Error: `fatal: could not read Username for 'https://codeberg.org': No such device or address`

## Solutions

### Option 1: Make Repository Public (Easiest)

If this is just for personal use, making the repository public is the simplest solution:

1. Go to your Codeberg repository: https://codeberg.org/rhorno/ab-trx-importer-frontend
2. Go to **Settings** → **General**
3. Scroll down to **Repository Visibility**
4. Change from **Private** to **Public**
5. Save changes
6. Try adding the repository in Home Assistant again

**Note:** Even if public, only people who know the exact URL can find it. It won't appear in Codeberg's public repository list unless you explicitly make it discoverable.

### Option 2: Use SSH Authentication (Keep Private)

If you want to keep the repository private, use SSH authentication:

#### Step 1: Generate SSH Key on Home Assistant

SSH into your Home Assistant instance and run:

```bash
ssh-keygen -t ed25519 -C "home-assistant"
# Press Enter to accept default location
# Press Enter twice for no passphrase (or set one if preferred)
```

#### Step 2: Get the Public Key

```bash
cat ~/.ssh/id_ed25519.pub
# Copy the entire output
```

#### Step 3: Add SSH Key to Codeberg

1. Go to https://codeberg.org/user/settings/keys
2. Click **Add SSH Key**
3. Paste your public key
4. Give it a title like "Home Assistant"
5. Click **Add Key**

#### Step 4: Update repository.yaml to Use SSH URL

Update `repository.yaml`:

```yaml
name: AB Transaction Importer Repository
url: [email protected]:rhorno/ab-trx-importer-frontend.git
maintainer: Your Name <your.email@example.com>
```

**Important:** The `git@` part is literal - it's the SSH username for Git, not an email address. Don't replace it with your email. The format is:

- `git@` = SSH user (always use this)
- `codeberg.org` = Codeberg domain
- `rhorno` = your Codeberg username
- `ab-trx-importer-frontend` = your repository name

#### Step 5: Test SSH Connection

From Home Assistant SSH:

```bash
ssh -T [email protected]
# Should see: "Hi rhorno! You've successfully authenticated..."
```

#### Step 6: Add Repository in Home Assistant

Use the SSH URL in Home Assistant: `[email protected]:rhorno/ab-trx-importer-frontend.git`

**Note:** The `git@` is literal text - it's the SSH username, not an email address. The full URL format is:

```
git@codeberg.org:username/repository.git
```

For your repository, it's: `[email protected]:rhorno/ab-trx-importer-frontend.git`

### Option 3: Use Access Token (Alternative)

Codeberg also supports access tokens, but SSH is generally easier for Home Assistant.

## Recommendation

For personal use, **Option 1 (Make Public)** is the simplest. The repository won't be easily discoverable even if public.

If you need it private, **Option 2 (SSH)** is the recommended approach.
