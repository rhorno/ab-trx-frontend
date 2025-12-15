/**
 * Import Route Handler
 *
 * Handles the import endpoint using service layer instead of CLI process spawning.
 * Streams progress via Server-Sent Events (SSE).
 */

// Note: For POC, using CommonJS. Services are ES modules, so we'll use dynamic imports.
// In production, this should be converted to TypeScript/ES modules.

// POC: Use mock services if USE_MOCK_SERVICES environment variable is set
const USE_MOCK_SERVICES = process.env.USE_MOCK_SERVICES === "true";
// POC: Use dry-run mode if DRY_RUN environment variable is set (defaults to true when USE_MOCK_SERVICES is true)
const DRY_RUN =
  process.env.DRY_RUN === "true" ||
  (process.env.DRY_RUN === undefined && USE_MOCK_SERVICES);

/**
 * Handle import request with SSE streaming
 * @param {string} profileName - Profile name to use for import
 * @param {Object} res - Express response object (configured for SSE)
 */
async function handleImport(profileName, res) {
  let configService, actualBudgetService, bankIntegrationService;
  let actualBudgetConnected = false;
  let bankInitialized = false;

  try {
    // Dynamic imports for ES modules (compiled to .js in production)
    const configModule = await import("../../services/configuration/index.js");
    configService = configModule.configurationService;

    // Use mock or real services based on environment variable
    if (USE_MOCK_SERVICES) {
      const mockActualBudgetModule = await import(
        "../../services/actual-budget/mock-actual-budget-service.js"
      );
      const mockBankModule = await import(
        "../../services/bank-integration/mock-bank-service.js"
      );
      actualBudgetService = mockActualBudgetModule.mockActualBudgetService;
      bankIntegrationService = mockBankModule.mockBankIntegrationService;

      res.write(
        "data: " +
          JSON.stringify({
            type: "progress",
            message: "⚠️ Using MOCK services for testing",
          }) +
          "\n\n"
      );
    } else {
      const actualBudgetModule = await import(
        "../../services/actual-budget/index.js"
      );
      const bankModule = await import(
        "../../services/bank-integration/index.js"
      );
      actualBudgetService = actualBudgetModule.actualBudgetService;
      bankIntegrationService = bankModule.bankIntegrationService;
    }

    // 1. Load configuration
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Loading configuration...",
        }) +
        "\n\n"
    );

    const config = configService.buildConfig(profileName);

    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: `Configuration loaded for profile: ${profileName}`,
        }) +
        "\n\n"
    );

    // 2. Initialize Actual Budget
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Connecting to Actual Budget...",
        }) +
        "\n\n"
    );

    await actualBudgetService.connect(config.actualBudget, false);
    actualBudgetConnected = true;

    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Connected to Actual Budget",
        }) +
        "\n\n"
    );

    // Get smart start date
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Determining date range...",
        }) +
        "\n\n"
    );

    const startDate = await actualBudgetService.getSmartStartDate(
      config.actualBudget.accountId
    );
    const endDate = new Date().toISOString().split("T")[0]; // Today

    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: `Date range: ${startDate} to ${endDate}`,
        }) +
        "\n\n"
    );

    // 3. Initialize Bank Integration
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: `Initializing ${config.bank.name} integration...`,
        }) +
        "\n\n"
    );

    // Extract bank params (everything except 'name')
    const bankParams = { ...config.bank };
    delete bankParams.name;

    await bankIntegrationService.initialize(config.bank.name, bankParams);
    bankInitialized = true;

    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Bank integration initialized",
        }) +
        "\n\n"
    );

    // 4. Set up authentication status listener
    // This will catch QR codes and auth status updates
    bankIntegrationService.onAuthStatus((status) => {
      // If status includes QR code data, stream it separately
      // Send only the token string - frontend will render the QR code
      if (status.qrCode && status.qrCode.token) {
        res.write(
          "data: " +
            JSON.stringify({
              type: "qr-code",
              data: status.qrCode.token,
            }) +
            "\n\n"
        );
      }

      res.write(
        "data: " +
          JSON.stringify({
            type: "auth-status",
            status: status,
          }) +
          "\n\n"
      );
    });

    // 5. Start authentication
    // Note: In current POC implementation, QR code comes during fetchTransactions
    // The auth status listener above will catch it when it's available
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Starting authentication...",
        }) +
        "\n\n"
    );

    // 6. Fetch transactions (this will trigger authentication and QR code)
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: "Fetching transactions from bank...",
        }) +
        "\n\n"
    );

    const transactions = await bankIntegrationService.fetchTransactions(
      startDate,
      endDate
    );

    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: `Fetched ${transactions.length} transactions`,
        }) +
        "\n\n"
    );

    // 7. Import to Actual Budget
    res.write(
      "data: " +
        JSON.stringify({
          type: "progress",
          message: DRY_RUN
            ? "Importing transactions (dry-run)..."
            : "Importing transactions...",
        }) +
        "\n\n"
    );

    const result = await actualBudgetService.importTransactions(
      transactions,
      DRY_RUN
    );

    res.write(
      "data: " +
        JSON.stringify({
          type: "success",
          count: result.added,
          skipped: result.skipped,
          message: DRY_RUN
            ? `Import complete: ${result.added} transactions would be imported`
            : `Import complete: ${result.added} transactions imported`,
        }) +
        "\n\n"
    );

    // 8. Cleanup
    await bankIntegrationService.cleanup();
    await actualBudgetService.shutdown();

    res.write(
      "data: " +
        JSON.stringify({
          type: "close",
          success: true,
        }) +
        "\n\n"
    );
    res.end();
  } catch (error) {
    // Error handling with cleanup
    const errorMessage = error instanceof Error ? error.message : String(error);

    res.write(
      "data: " +
        JSON.stringify({
          type: "error",
          message: errorMessage,
        }) +
        "\n\n"
    );

    // Cleanup on error
    try {
      if (bankInitialized) {
        await bankIntegrationService.cleanup();
      }
      if (actualBudgetConnected) {
        await actualBudgetService.shutdown();
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    res.write(
      "data: " +
        JSON.stringify({
          type: "close",
          success: false,
          error: errorMessage,
        }) +
        "\n\n"
    );
    res.end();
  }
}

export { handleImport };
