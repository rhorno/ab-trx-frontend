# Migration Testing Guide

## Overview

This document provides testing procedures for validating the service-based architecture migration. Test both with mock services and real services to ensure everything works correctly.

---

## Prerequisites

1. Backend dependencies installed: `cd backend && npm install`
2. Frontend dependencies installed: `cd frontend && npm install`
3. Environment variables configured (`.env` file in backend or project root)
4. Profiles configured (`backend/services/configuration/profiles.json`)

---

## Testing with Mock Services

### Setup

Set environment variable to use mock services:

```bash
export USE_MOCK_SERVICES=true
```

### Test 1: Profile Listing Endpoint

**Endpoint:** `GET http://localhost:8000/api/profiles`

**Expected Response:**

```json
{
  "success": true,
  "profiles": [
    {
      "name": "profile-name",
      "bank": "handelsbanken",
      "actualAccountId": "uuid",
      "bankParams": {...}
    }
  ],
  "count": 1
}
```

**Test Command:**

```bash
curl http://localhost:8000/api/profiles
```

**Success Criteria:**

- ✅ Returns 200 status
- ✅ Returns valid JSON with profiles array
- ✅ Each profile has required fields (name, bank, actualAccountId, bankParams)

---

### Test 2: Import Flow with Mock Services

**Endpoint:** `GET http://localhost:8000/api/import?profile=<profile-name>`

**Test Command:**

```bash
curl -N http://localhost:8000/api/import?profile=test-profile
```

**Expected SSE Events (in order):**

1. `{"type":"connected"}`
2. `{"type":"progress","message":"⚠️ Using MOCK services for testing"}`
3. `{"type":"progress","message":"Loading configuration..."}`
4. `{"type":"progress","message":"Connecting to Actual Budget..."}`
5. `{"type":"progress","message":"Connected to Actual Budget"}`
6. `{"type":"progress","message":"Determining date range..."}`
7. `{"type":"progress","message":"Date range: ..."}`
8. `{"type":"progress","message":"Initializing ... integration..."}`
9. `{"type":"auth-status","status":{"status":"pending",...}}`
10. `{"type":"qr-code","data":{...}}` (if QR code generated)
11. `{"type":"progress","message":"Fetching transactions..."}`
12. `{"type":"auth-status","status":{"status":"authenticated",...}}`
13. `{"type":"progress","message":"Fetched X transactions"}`
14. `{"type":"progress","message":"Importing transactions (dry-run)..."}`
15. `{"type":"success","count":X,"message":"Import complete..."}`
16. `{"type":"close","success":true}`

**Success Criteria:**

- ✅ All expected events are received
- ✅ QR code is generated and streamed (mock)
- ✅ Transactions are fetched (mock data)
- ✅ Import completes successfully
- ✅ No errors in the stream

---

### Test 3: Error Handling

**Test Invalid Profile:**

```bash
curl -N http://localhost:8000/api/import?profile=invalid-profile
```

**Expected:**

- ✅ Error event streamed: `{"type":"error","message":"..."}`
- ✅ Close event with success: false
- ✅ Proper cleanup (no hanging processes)

**Test Missing Profile Parameter:**

```bash
curl http://localhost:8000/api/import
```

**Expected:**

- ✅ Returns 400 status
- ✅ Error message: "Profile is required"

---

## Testing with Real Services

### Setup

**Important:** Only test with real services when you have:

- Valid Actual Budget instance configured
- Valid bank credentials
- Test profile configured

**Disable mock services:**

```bash
unset USE_MOCK_SERVICES
# or
export USE_MOCK_SERVICES=false
```

### Test 4: Real Import Flow

**Endpoint:** `GET http://localhost:8000/api/import?profile=<valid-profile>`

**Test Command:**

```bash
curl -N http://localhost:8000/api/import?profile=richard-handelsbanken
```

**Expected Flow:**

1. Configuration loads successfully
2. Actual Budget connects
3. Date range determined
4. Bank integration initializes
5. **QR code appears** (real BankID QR code)
6. User scans QR code with BankID app
7. Authentication completes
8. Transactions fetched from real bank
9. Transactions imported to Actual Budget (dry-run)
10. Success message with transaction count

**Success Criteria:**

- ✅ Real QR code is displayed and updates
- ✅ Authentication completes after scanning
- ✅ Real transactions are fetched
- ✅ Import completes successfully
- ✅ Transaction count is accurate

---

## Frontend Testing

### Test 5: Frontend Integration

1. Start backend: `cd backend && node server.js`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to `http://localhost:5173`
4. Test profile selection (if implemented)
5. Test import flow:
   - Enter profile name
   - Click "Run Import"
   - Verify QR code appears
   - Verify progress messages
   - Verify success message

**Success Criteria:**

- ✅ Frontend connects to backend
- ✅ QR code displays correctly
- ✅ Progress updates in real-time
- ✅ Success/error messages display correctly

---

## Manual Testing Checklist

### Profile Listing

- [ ] `GET /api/profiles` returns all profiles
- [ ] Profile data is correctly formatted
- [ ] Error handling works for missing profiles.json

### Import Flow (Mock)

- [ ] Mock services work correctly
- [ ] All SSE events are received
- [ ] QR code is generated (mock)
- [ ] Transactions are returned (mock data)
- [ ] Import completes successfully

### Import Flow (Real)

- [ ] Real services connect correctly
- [ ] QR code appears and updates
- [ ] Authentication completes
- [ ] Real transactions are fetched
- [ ] Import completes successfully

### Error Handling

- [ ] Invalid profile returns error
- [ ] Missing profile parameter returns 400
- [ ] Network errors are handled gracefully
- [ ] Cleanup happens on errors
- [ ] No hanging processes

### Cleanup

- [ ] Services cleanup correctly
- [ ] No memory leaks
- [ ] No hanging browser processes
- [ ] No hanging API connections

---

## Common Issues and Solutions

### Issue: "Cannot find module" errors

**Solution:** Ensure all dependencies are installed. Services use ES modules, so Node.js must support them.

### Issue: QR code not appearing

**Solution:**

- Check that `setQrToken()` is being called in auth service
- Verify service reference is passed correctly
- Check browser console for errors

### Issue: Authentication timeout

**Solution:**

- Verify bank credentials are correct
- Check network connectivity
- Verify Actual Budget instance is accessible

### Issue: Import fails silently

**Solution:**

- Check backend logs
- Verify profile configuration
- Check Actual Budget connection

---

## Performance Testing

### Test Response Times

**Profile Listing:**

- Expected: < 100ms

**Import Flow (Mock):**

- Expected: < 5 seconds total

**Import Flow (Real):**

- Expected: 30-120 seconds (depends on authentication and transaction count)

---

## Next Steps

After successful testing:

1. Document any issues found
2. Fix critical bugs
3. Proceed to Step 10: Cleanup
4. Update documentation
