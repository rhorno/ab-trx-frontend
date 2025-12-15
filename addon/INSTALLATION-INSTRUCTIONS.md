# Installation Instructions - AB Transaction Importer Add-on

Complete step-by-step guide for installing the AB Transaction Importer as a Home Assistant add-on.

## Prerequisites

Before starting, ensure you have:

- ✅ Home Assistant OS or Home Assistant Supervised installation
- ✅ SSH access to your Home Assistant instance OR File editor add-on installed
- ✅ Actual Budget server URL, password, and sync ID
- ✅ Bank account credentials for your profiles

## Step 1: Prepare the Add-on Directory

On your development machine (where the project is located):

1. Open a terminal and navigate to the project root:

   ```bash
   cd /path/to/ab-trx-importer-frontend
   ```

2. Run the setup script to prepare the add-on:

   ```bash
   ./addon/setup.sh
   ```

   This script will:

   - Copy the `backend/` directory into `addon/backend/`
   - Copy the `frontend/` directory into `addon/frontend/`
   - Prepare everything needed for the Docker build

3. Verify the setup:

   ```bash
   ls -la addon/
   ```

   You should see:

   - `backend/` directory
   - `frontend/` directory
   - `config.yaml`
   - `build.yaml`
   - `Dockerfile`
   - `run.sh`
   - Other add-on files

## Step 2: Transfer Add-on to Home Assistant

Choose one of the following methods:

### Method A: Using SCP (SSH)

1. From your development machine:

   ```bash
   scp -r addon/* root@homeassistant.local:/config/addons/ab-trx-importer/
   ```

   Replace `homeassistant.local` with your Home Assistant IP address if needed.

2. If the directory doesn't exist, create it first:

   ```bash
   ssh root@homeassistant.local
   mkdir -p /config/addons/ab-trx-importer
   exit
   ```

   Then run the scp command again.

### Method B: Using Samba Share

1. Enable Samba share in Home Assistant:

   - Go to **Settings** > **Add-ons** > **Samba share**
   - Install and start if not already running

2. On your development machine, mount the share:

   ```bash
   # macOS
   open smb://homeassistant.local/config

   # Linux
   mount -t cifs //homeassistant.local/config /mnt/homeassistant
   ```

3. Copy the `addon/` directory contents to:
   ```
   /config/addons/ab-trx-importer/
   ```

### Method C: Using File Editor Add-on

1. Install File editor add-on in Home Assistant if not already installed

2. In File editor, navigate to `/config/addons/`

3. Create new folder `ab-trx-importer`

4. Upload all files from the `addon/` directory one by one, or:
   - Create files manually and paste contents
   - Use the upload feature for directories

### Method D: Using Git (if you have a repository)

1. SSH into Home Assistant:

   ```bash
   ssh root@homeassistant.local
   ```

2. Clone or pull your repository:
   ```bash
   cd /config/addons
   git clone <your-repo-url> ab-trx-importer
   cd ab-trx-importer
   ./addon/setup.sh
   ```

## Step 3: Verify Files in Home Assistant

SSH into Home Assistant and verify all files are present:

```bash
ssh root@homeassistant.local
cd /config/addons/ab-trx-importer
ls -la
```

You should see:

- `config.yaml`
- `build.yaml`
- `Dockerfile`
- `run.sh`
- `backend/` directory
- `frontend/` directory
- `.dockerignore`
- Other files

## Step 4: Install the Add-on in Home Assistant UI

1. Open Home Assistant in your browser

2. Navigate to **Settings** > **Add-ons** > **Add-on Store**

3. Click the three-dot menu (⋮) in the top right corner

4. Select **Check for updates**

5. Your add-on should appear under **Local add-ons** as **AB Transaction Importer**

6. Click on **AB Transaction Importer**

7. Review the add-on information

8. Click **Install**

9. Wait for the installation to complete (this may take several minutes as it builds the Docker image)

   - The build process will:
     - Download the Debian base image
     - Install Node.js
     - Build the frontend
     - Install dependencies
     - Install Playwright browsers

10. You'll see "Installed" when complete

## Step 5: Configure the Add-on

**DO NOT START THE ADD-ON YET** - configuration must be done first.

### 5.1: Create Configuration Directory

The add-on uses `/data` directory for persistent configuration. Find the add-on's data directory:

**Via SSH:**

```bash
# For Home Assistant OS
ls -la /usr/share/hassio/addons/data/

# For Home Assistant Supervised
ls -la /config/addons/data/
```

The directory should be named `ab-trx-importer` or similar.

**Via File Editor:**

- Open File editor add-on
- Navigate to `/usr/share/hassio/addons/data/` or `/config/addons/data/`
- Look for the add-on's data directory

### 5.2: Create .env File

1. Create a new file named `.env` in the add-on's data directory

2. Add your Actual Budget configuration:

   ```env
   ACTUAL_SERVER_URL=https://your-actual-budget-server.com
   ACTUAL_PASSWORD=your-password
   ACTUAL_SYNC_ID=your-sync-id
   ```

3. Optional: Add encryption key if using encrypted sync:

   ```env
   ACTUAL_ENCRYPTION_KEY=your-encryption-key
   ```

4. Optional: Enable debug mode:

   ```env
   DEBUG=true
   ```

5. Save the file

**Example .env file:**

```env
ACTUAL_SERVER_URL=https://actualbudget.com
ACTUAL_PASSWORD=my-secure-password
ACTUAL_SYNC_ID=abc123def456
ACTUAL_ENCRYPTION_KEY=my-encryption-key
DEBUG=false
```

### 5.3: Create profiles.json File

1. Create a new file named `profiles.json` in the same data directory

2. Add your bank profiles:

   ```json
   {
     "profile-name-1": {
       "bank": "handelsbanken",
       "bankParams": {
         "personnummer": "199003155257",
         "accountName": "Lönekonto"
       },
       "actualAccountId": "6a610d1f-4412-4e49-b382-950ed3aceb64"
     },
     "profile-name-2": {
       "bank": "handelsbanken",
       "bankParams": {
         "personnummer": "199701076284",
         "accountName": "Lönekonto"
       },
       "actualAccountId": "78e9e809-23e9-4f85-8255-364347a80561"
     }
   }
   ```

3. Replace with your actual:

   - Profile names
   - Personnummer (Swedish personal number)
   - Account names
   - Actual Budget account IDs

4. Save the file

**Note:** You can reference `profiles.json.example` in the add-on directory for the correct format.

### 5.4: Verify Configuration Files

Check that both files exist and are readable:

```bash
# Via SSH
ls -la /path/to/addon/data/
cat /path/to/addon/data/.env
cat /path/to/addon/data/profiles.json
```

## Step 6: Configure Add-on Options (Optional)

1. In the add-on page, click the **Configuration** tab

2. You can optionally change:

   - `frontend_port`: Port for web interface (default: 5173)
   - `backend_port`: Port for API (default: 8000)

3. Click **Save** if you made changes

## Step 7: Start the Add-on

1. In the add-on page, click **Start**

2. Wait for the add-on to start (check the **Logs** tab)

3. You should see messages like:

   ```
   Starting AB Transaction Importer
   Frontend port: 5173
   Backend port: 8000
   Waiting for backend to start...
   Backend is ready!
   Application started successfully!
   ```

4. If you see errors, check the troubleshooting section below

## Step 8: Access the Web Interface

1. Open your browser

2. Navigate to:

   ```
   http://homeassistant.local:5173
   ```

   Or use your Home Assistant IP:

   ```
   http://192.168.1.100:5173
   ```

3. You should see the AB Transaction Importer interface

4. Select a profile from the dropdown

5. Click **Start Import** to test

## Step 9: Verify Installation

1. **Check Health Endpoint:**

   ```bash
   curl http://localhost:8000/api/health
   ```

   Should return: `{"status":"ok"}`

2. **Check Profiles Endpoint:**

   ```bash
   curl http://localhost:8000/api/profiles
   ```

   Should return your profiles list

3. **Test Web Interface:**
   - Open the web interface
   - Verify profiles are listed
   - Try starting an import (you can cancel it)

## Troubleshooting

### Add-on Won't Install

**Problem:** Installation fails or hangs

**Solutions:**

- Check available disk space: `df -h`
- Check logs in Home Assistant: **Settings** > **System** > **Logs**
- Verify all files were copied correctly
- Try rebuilding: **Uninstall** then **Install** again

### Add-on Won't Start

**Problem:** Add-on fails to start

**Solutions:**

1. Check the **Logs** tab in the add-on page
2. Verify `.env` file exists and has correct format
3. Verify `profiles.json` exists and is valid JSON
4. Check for port conflicts:
   ```bash
   netstat -tuln | grep -E '5173|8000'
   ```

### Configuration Not Found

**Problem:** "Configuration file not found" errors

**Solutions:**

1. Verify files are in the correct location (add-on's data directory)
2. Check file permissions:
   ```bash
   chmod 644 /path/to/addon/data/.env
   chmod 644 /path/to/addon/data/profiles.json
   ```
3. Verify file format (no syntax errors)
4. Check that the add-on can access `/data` directory

### Frontend Can't Connect to Backend

**Problem:** Frontend loads but shows connection errors

**Solutions:**

1. Verify backend is running (check logs)
2. Check backend health: `curl http://localhost:8000/api/health`
3. Verify ports match configuration
4. Check firewall rules if accessing from another device

### Playwright Browser Errors

**Problem:** Browser automation fails

**Solutions:**

1. Check logs for specific Playwright errors
2. Verify Playwright was installed during build (check build logs)
3. For headless mode issues, check Playwright documentation
4. Ensure Debian-based base image is used (not Alpine)

### Port Already in Use

**Problem:** Port conflict errors

**Solutions:**

1. Change ports in add-on configuration
2. Find what's using the port:
   ```bash
   lsof -i :5173
   lsof -i :8000
   ```
3. Stop conflicting services or change add-on ports

## Updating the Add-on

When you need to update to a newer version:

1. **On development machine:**

   ```bash
   cd /path/to/ab-trx-importer-frontend
   git pull  # or update your code
   ./addon/setup.sh
   ```

2. **Copy updated files to Home Assistant** (same as Step 2)

3. **In Home Assistant:**
   - Go to add-on page
   - Click **Update** (if available) or **Uninstall** then **Install**
   - Your configuration files (`.env` and `profiles.json`) are preserved

## Removing the Add-on

1. In Home Assistant, go to the add-on page
2. Click **Stop** (if running)
3. Click **Uninstall**
4. Optionally remove configuration:
   ```bash
   rm -rf /usr/share/hassio/addons/data/ab-trx-importer
   # or
   rm -rf /config/addons/data/ab-trx-importer
   ```
5. Optionally remove add-on files:
   ```bash
   rm -rf /config/addons/ab-trx-importer
   ```

## Next Steps

After successful installation:

1. ✅ Test the import functionality
2. ✅ Set up automation if desired (Home Assistant automations)
3. ✅ Schedule regular imports (cron job or Home Assistant automation)
4. ✅ Monitor logs for any issues

## Support

If you encounter issues:

1. Check the **Logs** tab in the add-on page
2. Review this installation guide
3. Check the main README.md for additional information
4. Verify all prerequisites are met
5. Check Home Assistant system logs

## Quick Reference

**Add-on Location:**

- Files: `/config/addons/ab-trx-importer/`
- Data: `/usr/share/hassio/addons/data/ab-trx-importer/` or `/config/addons/data/ab-trx-importer/`

**Default Ports:**

- Frontend: `5173`
- Backend: `8000`

**Configuration Files:**

- `.env` - Actual Budget credentials
- `profiles.json` - Bank account profiles

**Access URLs:**

- Frontend: `http://homeassistant.local:5173`
- Backend API: `http://homeassistant.local:8000/api/health`
