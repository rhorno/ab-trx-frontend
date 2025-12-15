# Migration Plan: CLI Tool to Service Architecture

## Overview

This plan outlines the steps to migrate the CLI tool (`ab-trx-importer`) into the service-oriented backend architecture. The migration is designed to be incremental, maintaining functionality at each step.

**Goal:** Transform CLI tool into services that can be called directly by the REST API, eliminating the need to spawn CLI processes.

**Principle:** Migrate incrementally, test after each step, maintain working state.

---

## Migration Strategy

### Phase 1: Preparation (No Breaking Changes)
1. Copy CLI tool code into backend services structure
2. Adapt code to work as services (remove CLI-specific code)
3. Keep CLI tool working in parallel

### Phase 2: Integration (Gradual Replacement)
1. Update REST API to call services directly
2. Test thoroughly
3. Remove CLI process spawning

### Phase 3: Cleanup
1. Remove unused CLI code
2. Update documentation
3. Final testing

---

## Detailed Migration Steps

### Step 1: Create Service Structure

**Goal:** Set up the directory structure for services

**Actions:**
```bash
# Create service directories
mkdir -p backend/services/bank-integration/banks
mkdir -p backend/services/actual-budget
mkdir -p backend/services/configuration
mkdir -p backend/services/shared
```

**Files to Create:**
- `backend/services/bank-integration/index.ts` - Service entry point
- `backend/services/actual-budget/index.ts` - Service entry point
- `backend/services/configuration/index.ts` - Service entry point

**Estimated Time:** 15 minutes

---

### Step 2: Migrate Configuration Service

**Goal:** Extract configuration loading into a service

**Source Files:**
- `ab-trx-importer/src/config/user-config.ts`
- `ab-trx-importer/src/config/profiles.json` (copy to backend)

**Actions:**
1. Copy `user-config.ts` to `backend/services/configuration/config-loader.ts`
2. Remove CLI-specific code (command-line argument parsing)
3. Adapt to return configuration objects directly
4. Keep environment variable loading (.env)
5. Keep profile loading (profiles.json)
6. Export service interface

**Key Changes:**
- Remove `buildConfig(profileName)` CLI wrapper
- Keep `loadProfiles()`, `getGlobalConfig()`
- Add service initialization function
- Return typed configuration objects

**Test:**
- Unit test: Load profiles, validate configuration
- Integration test: Load real profiles.json

**Estimated Time:** 30 minutes

---

### Step 3: Migrate Actual Budget Service

**Goal:** Extract Actual Budget connector into a service

**Source Files:**
- `ab-trx-importer/src/core/actual-budget-connector.ts`
- `ab-trx-importer/src/core/types.ts` (transaction types)
- `ab-trx-importer/src/core/logger.ts`

**Actions:**
1. Copy `actual-budget-connector.ts` to `backend/services/actual-budget/connector.ts`
2. Copy `types.ts` to `backend/services/shared/types.ts`
3. Copy `logger.ts` to `backend/services/shared/logger.ts`
4. Remove CLI-specific console.log statements
5. Use shared logger instead
6. Export service interface with clear methods:
   - `connect(config)` - Initialize connection
   - `getSmartStartDate(accountId)` - Get latest transaction date
   - `importTransactions(transactions, dryRun)` - Import transactions
   - `listAccounts()` - List available accounts
   - `shutdown()` - Cleanup

**Key Changes:**
- Remove verbose console output (use logger)
- Keep all core functionality intact
- Make methods async and return promises
- Add proper error handling

**Test:**
- Unit test: Mock Actual Budget API
- Integration test: Test with real Actual Budget instance (dry-run)
- Test dry-run mode works

**Estimated Time:** 45 minutes

---

### Step 4: Migrate Bank Integration Service

**Goal:** Extract bank client into a service

**Source Files:**
- `ab-trx-importer/src/core/bank-client.ts`
- `ab-trx-importer/src/banks/registry.ts`
- `ab-trx-importer/src/banks/handelsbanken/` (entire directory)

**Actions:**
1. Copy `bank-client.ts` to `backend/services/bank-integration/bank-client.ts`
2. Copy `banks/registry.ts` to `backend/services/bank-integration/registry.ts`
3. Copy entire `banks/handelsbanken/` directory to `backend/services/bank-integration/banks/handelsbanken/`
4. Adapt to service interface:
   - Remove CLI-specific output (QR code terminal display)
   - Return QR code data as object/string for API
   - Use event emitters or callbacks for authentication status
   - Keep all bank-specific logic intact

**Key Changes:**
- Replace `qrcode-terminal` with QR code data return
- Add event emitter for authentication status updates
- Keep Playwright browser automation
- Keep all authentication flows
- Export service interface:
   - `initialize(bankName, params)` - Initialize bank client
   - `authenticate()` - Start authentication, return QR code
   - `onAuthStatus(callback)` - Listen for auth status changes
   - `fetchTransactions(startDate, endDate)` - Fetch transactions
   - `cleanup()` - Close browser, cleanup resources

**Special Considerations:**
- **QR Code Display:** Instead of terminal output, return QR code data that frontend can display
- **Authentication Flow:** Use event emitters or callbacks to notify API layer of auth status
- **Mocking:** Create mock implementation for testing

**Test:**
- Unit test: Mock Playwright, test transaction parsing
- Integration test: Test with real bank (careful - don't spam)
- Mock test: Test with mock bank implementation

**Estimated Time:** 1-2 hours (most complex)

---

### Step 5: Create Service Interfaces

**Goal:** Define clear interfaces for all services

**Actions:**
1. Create `backend/services/shared/interfaces.ts`
2. Define TypeScript interfaces for each service
3. Document method signatures and return types

**Interfaces to Define:**
```typescript
// Configuration Service
interface ConfigurationService {
  loadProfile(profileName: string): Promise<ProfileConfig>;
  loadAllProfiles(): Promise<ProfileConfig[]>;
  getGlobalConfig(): GlobalConfig;
}

// Actual Budget Service
interface ActualBudgetService {
  connect(config: ActualBudgetConfig): Promise<void>;
  getSmartStartDate(accountId: string): Promise<string | null>;
  importTransactions(transactions: Transaction[], dryRun: boolean): Promise<ImportResult>;
  listAccounts(): Promise<Account[]>;
  shutdown(): Promise<void>;
}

// Bank Integration Service
interface BankIntegrationService {
  initialize(bankName: string, params: BankParams): Promise<void>;
  authenticate(): Promise<QRCodeData>;
  onAuthStatus(callback: (status: AuthStatus) => void): void;
  fetchTransactions(startDate: string, endDate: string): Promise<Transaction[]>;
  cleanup(): Promise<void>;
}
```

**Estimated Time:** 30 minutes

---

### Step 6: Update REST API to Use Services

**Goal:** Replace CLI process spawning with direct service calls

**Current Implementation:**
- `backend/server.js` spawns CLI process
- Captures stdout/stderr
- Streams output via SSE

**New Implementation:**
- `backend/api/routes/import.ts` calls services directly
- Orchestrates: Config → Bank → Actual Budget
- Streams progress via SSE
- Handles errors properly

**Actions:**
1. Create `backend/api/routes/import.ts`
2. Import services
3. Implement import flow:
   ```typescript
   async function handleImport(profileName: string, res: Response) {
     // 1. Load configuration
     const config = await configService.loadProfile(profileName);

     // 2. Initialize Actual Budget
     await actualBudgetService.connect(config.actualBudget);
     const startDate = await actualBudgetService.getSmartStartDate(config.actualBudget.accountId);

     // 3. Initialize Bank Integration
     await bankService.initialize(config.bank.name, config.bank.params);

     // 4. Handle authentication (stream QR code)
     const qrCode = await bankService.authenticate();
     res.write(`data: ${JSON.stringify({ type: 'qr-code', data: qrCode })}\n\n`);

     // 5. Wait for authentication (listen to events)
     bankService.onAuthStatus((status) => {
       res.write(`data: ${JSON.stringify({ type: 'auth-status', status })}\n\n`);
     });

     // 6. Fetch transactions
     const transactions = await bankService.fetchTransactions(startDate, endDate);
     res.write(`data: ${JSON.stringify({ type: 'progress', message: `Fetched ${transactions.length} transactions` })}\n\n`);

     // 7. Import to Actual Budget
     const result = await actualBudgetService.importTransactions(transactions, true); // dry-run
     res.write(`data: ${JSON.stringify({ type: 'success', count: result.count })}\n\n`);

     // 8. Cleanup
     await bankService.cleanup();
     await actualBudgetService.shutdown();
   }
   ```
4. Update `backend/server.js` to use new route
5. Remove CLI process spawning code

**Key Changes:**
- Replace `spawn('npm', ...)` with service calls
- Stream progress events instead of stdout/stderr
- Better error handling with typed errors
- Proper cleanup on errors

**Test:**
- Test full import flow
- Test error handling
- Test SSE streaming
- Test with invalid profiles
- Test authentication flow

**Estimated Time:** 2-3 hours

---

### Step 7: Add Profile Listing Endpoint

**Goal:** Add endpoint to list available profiles

**Actions:**
1. Create `backend/api/routes/profiles.ts`
2. Call `configService.loadAllProfiles()`
3. Return profile list with details
4. Update frontend to use this endpoint

**Estimated Time:** 30 minutes

---

### Step 8: Add Mock Implementations

**Goal:** Create mock services for testing

**Actions:**
1. Create `backend/services/bank-integration/mock-bank-service.ts`
2. Create `backend/services/actual-budget/mock-actual-budget-service.ts`
3. Implement mock versions that return test data
4. Add configuration to switch between real and mock

**Benefits:**
- Test without hitting real banks
- Test without Actual Budget instance
- Faster development cycles

**Estimated Time:** 1 hour

---

### Step 9: Testing & Validation

**Goal:** Ensure everything works correctly

**Test Checklist:**
- [ ] Profile listing works
- [ ] Import flow works end-to-end
- [ ] QR code display works
- [ ] Authentication flow works
- [ ] Transaction import works (dry-run)
- [ ] Error handling works
- [ ] SSE streaming works
- [ ] Cleanup works (no hanging processes)
- [ ] Mock services work for testing

**Estimated Time:** 2-3 hours

---

### Step 10: Cleanup

**Goal:** Remove unused code and update documentation

**Actions:**
1. Remove CLI-specific code that's no longer needed
2. Update README.md with new architecture
3. Update AGENTS.md with new structure
4. Remove hardcoded CLI_DIR path
5. Clean up any temporary files

**Estimated Time:** 30 minutes

---

## Migration Checklist

### Preparation
- [ ] Step 1: Create service structure
- [ ] Step 2: Migrate Configuration Service
- [ ] Step 3: Migrate Actual Budget Service
- [ ] Step 4: Migrate Bank Integration Service
- [ ] Step 5: Create service interfaces

### Integration
- [ ] Step 6: Update REST API to use services
- [ ] Step 7: Add profile listing endpoint
- [ ] Step 8: Add mock implementations

### Validation
- [ ] Step 9: Testing & validation
- [ ] Step 10: Cleanup

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:**
- Keep CLI tool working during migration
- Test each service independently before integration
- Use feature flags to switch between CLI and services

### Risk 2: Authentication Flow Complexity
**Mitigation:**
- Start with simple event emitter pattern
- Test authentication flow thoroughly
- Document authentication state machine

### Risk 3: QR Code Display
**Mitigation:**
- Extract QR code data from terminal library
- Return as string/object that frontend can render
- Test QR code display early

### Risk 4: Service Dependencies
**Mitigation:**
- Use dependency injection for services
- Create service factory functions
- Test services in isolation

---

## Estimated Total Time

**Minimum:** 8-10 hours
**Realistic:** 12-15 hours (including testing and debugging)

**Breakdown:**
- Service migration: 4-5 hours
- API integration: 2-3 hours
- Testing: 2-3 hours
- Mock implementations: 1 hour
- Cleanup: 30 minutes

---

## Success Criteria

Migration is complete when:
1. ✅ All services are extracted and working
2. ✅ REST API uses services directly (no CLI spawning)
3. ✅ Full import flow works end-to-end
4. ✅ QR code display works
5. ✅ Authentication flow works
6. ✅ Error handling works
7. ✅ Mock services available for testing
8. ✅ All tests pass
9. ✅ Documentation updated
10. ✅ No CLI dependency in backend

---

## Next Steps After Migration

1. **Add More Banks:** Use registry pattern to add new bank integrations
2. **Add Import History:** Store import history in database
3. **Add Configuration UI:** Allow users to manage profiles via UI
4. **Add Authentication:** Secure API endpoints
5. **Add Monitoring:** Add logging and monitoring for services
6. **Optimize:** Performance optimizations based on usage

---

## Notes

- **Incremental Migration:** Each step should leave the system in a working state
- **Test Frequently:** Test after each major step
- **Keep CLI Working:** Don't break CLI tool until migration is complete
- **Document Changes:** Update documentation as you go
- **Ask for Help:** If stuck, document the issue and ask for guidance

