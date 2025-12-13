# End-to-End Testing Guide

## Purpose

This document provides step-by-step instructions for manually testing the AB Transaction Importer frontend application end-to-end. The guide is designed to be executed by both humans and automated agents.

## Prerequisites

Before starting tests, ensure:
- Node.js >= 18.12.0 is installed
- CLI tool exists at `/Users/richardhorno/dev/ab-trx-importer/`
- Both frontend and backend dependencies are installed:
  ```bash
  cd frontend && npm install
  cd ../backend && npm install
  ```

## Test Environment Setup

### Step 1: Start Backend Server

**Terminal 1 - Backend:**
```bash
cd /Users/richardhorno/dev/ab-trx-importer-frontend/backend
node server.js
```

**Expected Output:**
```
Backend server running on http://localhost:8000
```

**Verification:**
- Server starts without errors
- Port 8000 is not already in use
- Health endpoint responds: `curl http://localhost:8000/api/health` should return `{"status":"ok"}`

### Step 2: Start Frontend Server

**Terminal 2 - Frontend:**
```bash
cd /Users/richardhorno/dev/ab-trx-importer-frontend/frontend
npm run dev
```

**Expected Output:**
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

**Verification:**
- Server starts without errors
- Port 5173 is not already in use
- Frontend is accessible: `curl http://localhost:5173` should return HTML

### Step 3: Open Browser

Navigate to: `http://localhost:5173`

**Expected UI:**
- Page title: "AB Transaction Importer"
- Text input field with placeholder "Enter profile name"
- Button labeled "Run Import"
- Button should be disabled (grayed out) initially

---

## Test Scenarios

### Test 1: Invalid Profile - Quick Error Response

**Objective:** Verify that invalid profiles return errors quickly and are displayed correctly.

**Steps:**
1. In the browser, locate the text input field
2. Type: `invalid-profile`
3. Click the "Run Import" button
4. Observe the button state and UI changes

**Expected Behavior:**
- Button text changes to "Running..." immediately
- Button becomes disabled (cannot click again)
- Input field becomes disabled
- Within 5 seconds, an error message appears
- Error message is displayed in a red error box
- Error message contains: "Profile 'invalid-profile' not found" or similar
- Button text returns to "Run Import"
- Button becomes enabled again
- Input field becomes enabled again

**Verification Checklist:**
- [ ] Error appears within 5 seconds
- [ ] Error message is clear and readable
- [ ] Error is displayed in red error box
- [ ] Button state returns to normal after error
- [ ] No crashes or console errors

**Success Criteria:** ✅ Error is displayed quickly and clearly

---

### Test 2: Valid Profile - Timeout Scenario

**Objective:** Verify that valid profiles timeout after 30 seconds with a clear message (CLI requires BankID authentication).

**Steps:**
1. In the browser, clear the input field (if not already empty)
2. Type: `richard-handelsbanken` (or any valid profile from CLI)
3. Click the "Run Import" button
4. Observe the button state and wait for timeout

**Expected Behavior:**
- Button text changes to "Running..." immediately
- Button becomes disabled
- Input field becomes disabled
- Button remains in "Running..." state for approximately 30 seconds
- After 30 seconds, a timeout error appears
- Error message contains: "Command timeout" or "CLI execution took too long"
- Error message explains: "The CLI may be waiting for user interaction (e.g., BankID authentication)"
- Button text returns to "Run Import"
- Button becomes enabled again
- Input field becomes enabled again

**Verification Checklist:**
- [ ] Button shows "Running..." state
- [ ] Timeout occurs after ~30 seconds (not immediately, not indefinitely)
- [ ] Timeout error message is clear and explanatory
- [ ] Error explains why timeout occurred (BankID authentication)
- [ ] Button state returns to normal after timeout
- [ ] No crashes or console errors

**Success Criteria:** ✅ Timeout occurs after 30 seconds with clear explanation

**Note:** This timeout is expected behavior. The CLI requires interactive BankID authentication which cannot be automated in this POC.

---

### Test 3: Empty Profile - Input Validation

**Objective:** Verify that empty or whitespace-only profiles are rejected before API call.

**Steps:**
1. In the browser, ensure input field is empty
2. Observe the button state
3. Try to click the "Run Import" button (if enabled)
4. If button is disabled, type spaces only: `   `
5. Try to click the button again

**Expected Behavior (Option A - Button Disabled):**
- Button is disabled when input is empty
- Button is disabled when input contains only whitespace
- Button cannot be clicked
- No API call is made

**Expected Behavior (Option B - Validation Error):**
- Button is enabled but clicking shows error
- Error message: "Please enter a profile name" or "Profile is required"
- Error appears immediately (no API call)
- Error is displayed in red error box

**Verification Checklist:**
- [ ] Empty input is handled (either disabled button or validation error)
- [ ] Whitespace-only input is handled
- [ ] No API call is made for invalid input
- [ ] Error message is clear if validation error shown

**Success Criteria:** ✅ Invalid input is rejected before API call

---

### Test 4: Network Error - Backend Unavailable

**Objective:** Verify that network errors are handled gracefully when backend is unavailable.

**Steps:**
1. In the browser, ensure backend is still running (from Terminal 1)
2. Type: `test-profile` in the input field
3. **Stop the backend server** (Ctrl+C in Terminal 1)
4. Click the "Run Import" button
5. Observe the error handling

**Expected Behavior:**
- Button text changes to "Running..."
- Button becomes disabled
- After a few seconds, a network error appears
- Error message contains: "Network error" or "Failed to fetch" or similar
- Error is displayed in red error box
- Button text returns to "Run Import"
- Button becomes enabled again

**Verification Checklist:**
- [ ] Network error is detected
- [ ] Error message is clear and user-friendly
- [ ] Error is displayed in red error box
- [ ] Button state returns to normal
- [ ] No crashes or console errors
- [ ] Application remains functional

**Success Criteria:** ✅ Network errors are handled gracefully

**Cleanup:**
- Restart backend server after this test:
  ```bash
  cd /Users/richardhorno/dev/ab-trx-importer-frontend/backend
  node server.js
  ```

---

### Test 5: Loading State - Button and Input Behavior

**Objective:** Verify that loading states work correctly and prevent duplicate requests.

**Steps:**
1. In the browser, type: `test-profile` in the input field
2. Click the "Run Import" button
3. **Immediately try to click the button again** (while it shows "Running...")
4. Try to type in the input field while loading
5. Wait for response (error or timeout)

**Expected Behavior:**
- Button text changes to "Running..." immediately
- Button becomes disabled (cannot click again)
- Input field becomes disabled (cannot type)
- Attempting to click disabled button has no effect
- Attempting to type in disabled input has no effect
- Only one API request is made (check browser Network tab)
- After response, button and input become enabled again

**Verification Checklist:**
- [ ] Button is disabled during loading
- [ ] Input is disabled during loading
- [ ] Button cannot be clicked multiple times
- [ ] Only one API request is made
- [ ] UI returns to normal state after response

**Success Criteria:** ✅ Loading states prevent duplicate requests

---

### Test 6: Output Display - Error and Success Messages

**Objective:** Verify that output and error messages are displayed correctly.

**Steps:**
1. Run Test 1 (Invalid Profile) again
2. Observe where the error is displayed
3. Check the format and styling

**Expected Behavior:**
- Error messages appear in a red error box
- Error box has clear styling (red text, light red background)
- Error message is readable and not truncated
- If output is also returned, it appears in a `<pre>` tag below
- Output is in a gray box with monospace font
- Output is scrollable if long

**Verification Checklist:**
- [ ] Errors are displayed in red error box
- [ ] Error text is readable
- [ ] Output (if any) is displayed in `<pre>` tag
- [ ] Output is properly formatted (preserves line breaks)
- [ ] Long output is scrollable

**Success Criteria:** ✅ Output and errors are displayed clearly

---

### Test 7: Enter Key Support - Keyboard Shortcut

**Objective:** Verify that Enter key triggers import when input has focus.

**Steps:**
1. In the browser, click in the input field
2. Type: `test-profile`
3. Press Enter key (do not click button)
4. Observe if import is triggered

**Expected Behavior:**
- Enter key triggers the import
- Button shows "Running..." state
- API call is made
- Same behavior as clicking button

**Verification Checklist:**
- [ ] Enter key triggers import
- [ ] Works only when input has focus
- [ ] Works only when profile is not empty
- [ ] Works only when not already loading

**Success Criteria:** ✅ Enter key provides keyboard shortcut

---

## POC Success Criteria Validation

After completing all test scenarios, verify the following POC success criteria:

### ✅ Criterion 1: Frontend page loads in browser
- [ ] Page loads at http://localhost:5173
- [ ] No console errors on page load
- [ ] UI elements are visible and functional

### ✅ Criterion 2: User can enter/select a profile name
- [ ] Input field accepts text
- [ ] Input field is visible and accessible
- [ ] User can type profile names

### ✅ Criterion 3: User clicks "Run Import" button
- [ ] Button is visible and clickable
- [ ] Button responds to clicks
- [ ] Button triggers API call

### ✅ Criterion 4: Backend receives request and executes CLI tool
- [ ] Backend logs show request received
- [ ] CLI process starts (check backend terminal)
- [ ] CLI command is executed

### ✅ Criterion 5: CLI tool runs (dry-run mode)
- [ ] CLI executes with `--dry-run` flag
- [ ] CLI output is captured
- [ ] CLI errors are captured

### ✅ Criterion 6: Output is captured and returned to frontend
- [ ] Backend returns JSON response
- [ ] Response contains `success`, `output`, `error` fields
- [ ] Frontend receives response

### ✅ Criterion 7: Frontend displays the output (raw text is fine)
- [ ] Output appears in UI
- [ ] Output is in `<pre>` tag
- [ ] Output is readable (raw text format is acceptable)

### ✅ Criterion 8: Works end-to-end without crashes
- [ ] No application crashes
- [ ] No browser console errors
- [ ] No backend server crashes
- [ ] Application remains functional after errors

---

## Browser Console Verification

During testing, check browser console (F12 → Console tab) for:

**Expected:**
- No red error messages
- Vite HMR messages (normal)
- React DevTools warning (can be ignored)

**Unexpected (indicates issues):**
- Network errors (unless testing network error scenario)
- JavaScript errors
- Failed API requests (unless testing error scenarios)

---

## Network Tab Verification

During testing, check browser Network tab (F12 → Network tab) for:

**Expected API Requests:**
- `POST http://localhost:5173/api/import` (proxied to backend)
- Status: 200 (success) or 400/500 (expected errors)
- Response time: < 5s for invalid profiles, ~30s for valid profiles (timeout)

**Verify:**
- Requests are made to `/api/import` (not directly to port 8000)
- Proxy is working (requests go through Vite dev server)
- Responses are JSON format
- No CORS errors

---

## Known Expected Behaviors

### Timeout for Valid Profiles
**Expected:** Valid profiles will timeout after 30 seconds because the CLI requires BankID authentication (QR code scan), which cannot be automated.

**This is NOT a bug** - it's expected behavior for the POC. The timeout message should explain this clearly.

### Invalid Profiles Return Quickly
**Expected:** Invalid profiles return errors within 5 seconds because the CLI validates the profile and exits immediately.

### No Real-Time Updates
**Expected:** Output only appears after the CLI completes or times out. Real-time streaming is deferred to Iteration 3.

---

## Troubleshooting

### Issue: Backend won't start
**Solution:**
- Check if port 8000 is already in use: `lsof -i :8000`
- Kill existing process if needed
- Verify Node.js version: `node --version` (must be >= 18.12.0)

### Issue: Frontend won't start
**Solution:**
- Check if port 5173 is already in use: `lsof -i :5173`
- Kill existing process if needed
- Verify dependencies installed: `cd frontend && npm install`

### Issue: API calls fail with CORS error
**Solution:**
- Verify Vite proxy is configured in `frontend/vite.config.js`
- Restart frontend dev server after proxy configuration
- Check that requests go to `/api/import` (not `http://localhost:8000/api/import`)

### Issue: CLI not found errors
**Solution:**
- Verify CLI directory path in `backend/server.js`: `/Users/richardhorno/dev/ab-trx-importer`
- Verify CLI has `package.json` and can run manually
- Check CLI has `.env` file configured

### Issue: Timeout not working
**Solution:**
- Verify backend uses `spawn` with timeout (not `exec`)
- Check timeout is set to 30000ms (30 seconds)
- Verify process is killed on timeout

---

## Test Execution Summary Template

After completing tests, document results:

```markdown
## Test Execution Summary

**Date:** [Date]
**Tester:** [Human/Agent]
**Environment:** [OS, Node version, Browser]

### Test Results

| Test | Status | Notes |
|------|--------|-------|
| Test 1: Invalid Profile | ✅/❌ | [Notes] |
| Test 2: Valid Profile Timeout | ✅/❌ | [Notes] |
| Test 3: Empty Profile | ✅/❌ | [Notes] |
| Test 4: Network Error | ✅/❌ | [Notes] |
| Test 5: Loading State | ✅/❌ | [Notes] |
| Test 6: Output Display | ✅/❌ | [Notes] |
| Test 7: Enter Key | ✅/❌ | [Notes] |

### POC Success Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1. Frontend loads | ✅/❌ | [Notes] |
| 2. User can enter profile | ✅/❌ | [Notes] |
| 3. User can click button | ✅/❌ | [Notes] |
| 4. Backend receives request | ✅/❌ | [Notes] |
| 5. CLI tool runs | ✅/❌ | [Notes] |
| 6. Output captured | ✅/❌ | [Notes] |
| 7. Frontend displays output | ✅/❌ | [Notes] |
| 8. No crashes | ✅/❌ | [Notes] |

### Issues Found

- [List any issues found during testing]

### Recommendations

- [List any recommendations for improvements]
```

---

## Agent Execution Instructions

For automated agents executing these tests:

1. **Start Servers:**
   - Use `run_terminal_cmd` to start backend in background
   - Use `run_terminal_cmd` to start frontend in background
   - Wait for both to be ready (check health endpoints)

2. **Browser Testing:**
   - Use browser tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`)
   - Use `browser_console_messages` to check for errors
   - Use `browser_network_requests` to verify API calls

3. **Verification:**
   - Check each expected behavior item
   - Document results in test summary
   - Note any deviations from expected behavior

4. **Cleanup:**
   - Stop background processes after testing
   - Document any issues found

---

## Maintenance

This guide should be updated when:
- New features are added
- Test scenarios change
- Known behaviors change
- Troubleshooting steps need updates

Keep this guide synchronized with the actual application behavior.

