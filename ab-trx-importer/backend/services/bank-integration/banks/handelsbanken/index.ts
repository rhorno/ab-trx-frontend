/**
 * Main entry point for Handelsbanken integration
 */
import { BankClient, BankParams } from "../../bank-client.js";
import { Transaction } from "../../../shared/types.js";
import { chromium, Page } from "playwright";
import { HandelsbankenAccount, LOGIN_URL } from "./models.js";
import { AuthService } from "./auth-service.js";
import { HandelsbankenApiService } from "./api-service.js";
import { PageExtractor } from "./page-extractor.js";
import { HandelsbankenParsers } from "./parsers.js";
import { prompt } from "./utils.js";

/**
 * Handelsbanken integration using Playwright and BankID QR code login.
 */
export default class HandelsbankenClient extends BankClient {
  private page: Page | null = null;
  private browser: any = null;
  private authService: AuthService | null = null;
  private apiService: HandelsbankenApiService | null = null;
  private pageExtractor: PageExtractor | null = null;
  private serviceRef: any = null; // POC: Reference to service for QR code notifications

  /**
   * Create a new HandelsbankenClient
   * @param verbose - Whether to enable verbose logging
   * @param params - Bank-specific parameters (personnummer, account)
   */
  constructor(verbose = false, params: BankParams = {}) {
    super("Handelsbanken", verbose, params);
  }

  /**
   * POC: Set service reference for QR code notifications
   * Minimal change to support service layer
   */
  setServiceRef(service: any): void {
    this.serviceRef = service;
  }

  /**
   * Initialize services
   */
  private initServices(page: Page): void {
    this.authService = new AuthService(page, this.verbose);
    this.apiService = new HandelsbankenApiService(page, this.verbose);
    this.pageExtractor = new PageExtractor(page, this.verbose);

    // POC: Pass service ref to auth service for QR code notifications
    if (this.serviceRef && this.authService.setServiceRef) {
      this.authService.setServiceRef(this.serviceRef);
    }

    // Pass authMode to auth service if provided
    if (this.params.authMode && typeof this.params.authMode === "string") {
      const authMode = this.params.authMode as "same-device" | "other-device";
      if (authMode === "same-device" || authMode === "other-device") {
        this.authService.setAuthMode(authMode);
      }
    }
  }

  /**
   * Fetch transactions from the bank (internal method)
   * @param startDate - ISO 8601 date string (YYYY-MM-DD)
   * @param endDate - ISO 8601 date string (YYYY-MM-DD)
   * @returns Promise resolving to an array of normalized transactions
   */
  protected async fetchTransactionsFromBank(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    this.log("Launching browser...");
    this.browser = await chromium.launch({
      headless: !this.verbose, // Show browser in verbose mode
      slowMo: this.verbose ? 100 : 0, // Slow down operations in verbose mode
    });

    // Create browser context with mobile emulation
    // IMPORTANT: Configure mobile emulation BEFORE creating any pages
    // This ensures Handelsbanken detects us as mobile and shows app-to-app option
    const context = await this.browser.newContext({
      viewport: { width: 375, height: 667 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    });

    // Initialize page and services
    const page = await context.newPage();
    this.page = page;
    this.initServices(page);

    try {
      // Navigate to a blank page first to ensure mobile emulation is active
      // This ensures Handelsbanken detects mobile user agent from the start
      this.log("Initializing mobile emulation...");
      await page.goto("about:blank");

      // Setup API request interception for logging and authentication detection
      if (this.apiService) {
        this.apiService.setupApiInterception();
      }

      // Navigate to login page and handle cookie consent
      this.log("Navigating to login page...");
      await page.goto(LOGIN_URL);

      // Ensure services are initialized
      if (!this.authService || !this.apiService || !this.pageExtractor) {
        throw new Error("Services not initialized, cannot continue");
      }

      // Handle cookie consent modal
      await this.authService.handleCookieConsent();

      // Get personnummer from params or prompt
      let personnummer: string;
      if (
        this.params.personnummer &&
        typeof this.params.personnummer === "string"
      ) {
        personnummer = this.params.personnummer;
        this.log("Using personnummer from parameters");
      } else {
        personnummer = await prompt("Skriv in ditt personnummer: ");
      }

      // Step 1: Login
      this.log("Starting login process...");
      const loginSuccess = await this.authService.login(personnummer);
      if (!loginSuccess) {
        throw new Error("Handelsbanken login failed.");
      }

      // Wait for authentication to fully complete and page to load
      this.log("Waiting for authentication to complete...");
      const isAuthenticated = await this.apiService.waitForAuthentication(
        60000
      );
      if (!isAuthenticated) {
        this.log(
          "Warning: Could not confirm authentication completion. Will attempt to continue anyway."
        );
      } else {
        this.log("Authentication complete, proceeding to fetch data.");
      }

      // Step 2: Get accounts using REST API
      this.log("Fetching accounts using REST API...");
      let accounts: HandelsbankenAccount[] = [];
      try {
        const accountsResponse = await this.apiService.fetchAccounts();
        accounts = HandelsbankenParsers.parseAccounts(accountsResponse);
      } catch (error) {
        this.log(`Error fetching accounts via API: ${error}`);
        // Fallback to page extraction
        accounts = await this.pageExtractor.extractAccounts();
      }

      if (accounts.length === 0) {
        throw new Error("No accounts found.");
      }

      // Step 3: Let user select account
      const selectedAccount = await this.selectAccount(accounts);
      this.log(
        `Selected account: ${selectedAccount.chosenName} (${selectedAccount.accountNumber})`
      );

      // Step 4: Fetch transactions for selected account using REST API
      this.log(
        `Fetching transactions for date range: ${startDate} to ${endDate}`
      );
      let transactions: Transaction[] = [];

      try {
        const transactionsResponse = await this.apiService.fetchTransactions(
          selectedAccount,
          startDate,
          endDate
        );

        transactions =
          HandelsbankenParsers.parseTransactions(transactionsResponse);

        // If API returned no transactions, try page extraction as fallback
        if (transactions.length === 0) {
          this.log("No transactions returned from API, trying page extraction");
          transactions = await this.pageExtractor.extractTransactions(
            startDate,
            endDate
          );
        }
      } catch (error) {
        this.log(`Error fetching transactions via API: ${error}`);
        // Fallback to page extraction
        transactions = await this.pageExtractor.extractTransactions(
          startDate,
          endDate
        );
      }

      this.log(`Fetched ${transactions.length} transactions`);

      // Save transactions to a file for future development/testing
      if (this.apiService) {
        await this.apiService.saveTransactionsToFile(
          transactions,
          selectedAccount,
          startDate,
          endDate
        );
      }

      return transactions;
    } finally {
      if (this.browser) {
        this.log("Closing browser...");
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.authService = null;
        this.apiService = null;
        this.pageExtractor = null;
      }
    }
  }

  /**
   * Select account based on configuration (non-interactive)
   */
  private async selectAccount(
    accounts: HandelsbankenAccount[]
  ): Promise<HandelsbankenAccount> {
    // Account name must be provided in configuration
    if (
      !this.params.accountName ||
      typeof this.params.accountName !== "string"
    ) {
      throw new Error(
        "Account name must be specified in configuration (bank.accountName)"
      );
    }

    const targetAccountName = this.params.accountName.toLowerCase();

    // Find matching account (case-insensitive)
    const account = accounts.find(
      (a) =>
        a.chosenName?.toLowerCase() === targetAccountName ||
        a.accountName?.toLowerCase() === targetAccountName ||
        a.accountNumber === this.params.accountName // Exact match for account number
    );

    if (account) {
      this.log(
        `Found matching account: ${account.chosenName} (${account.accountNumber})`
      );
      return account;
    }

    // No match found - provide helpful error message
    const availableAccounts = accounts
      .map((a) => `${a.chosenName}, ${a.accountName}, (${a.accountNumber})`)
      .join(", ");
    throw new Error(
      `Account "${this.params.accountName}" not found. ` +
        `Available accounts: ${availableAccounts}. ` +
        `Please check the bank.accountName setting in your configuration.`
    );
  }

  /**
   * Fetch transactions for the given date range.
   * This method now uses the new deduplication architecture.
   * @param startDate - ISO 8601 date string (YYYY-MM-DD)
   * @param endDate - ISO 8601 date string (YYYY-MM-DD)
   */
  async fetchTransactions(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    // Use the new architecture with deduplication support
    return super.fetchTransactions(startDate, endDate);
  }
}
