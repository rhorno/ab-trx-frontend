import {
  BankClient,
  DeduplicationConfig,
  DeduplicationResult,
} from "../bank-client.js";
import { Transaction } from "../../../shared/types.js";
import { getLogger } from "../../../shared/logger.js";
import readline from "readline";
import { chromium, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
// Import qrcode-terminal - works in both ES and CommonJS when properly configured
import qrcodeTerminal from "qrcode-terminal";

const LOGIN_URL = "https://secure.handelsbanken.se/logon/se/priv/sv/mbidqr/";
const ACCOUNTS_URL =
  "https://secure.handelsbanken.se/apps/dsb/mb/payments/toandfrommyaccounts.xhtml?CONTROL_ORIGIN=CONTROL_ORIGIN_NO";

/**
 * Interface for Handelsbanken account
 */
interface HandelsbankenAccount {
  accountNumber: string;
  chosenName: string;
  accountName: string;
  system: string;
  status: string;
  accountHolder: string;
}

/**
 * Interface for Handelsbanken transaction
 */
interface HandelsbankenTransaction {
  transactionText: string;
  transactionDate: string;
  ledgerDate: string;
  transactionAmount: string;
  serialNumber: string;
  eventTime: string;
  systemName: string;
  isTransactionDetails: string;
  bankgiroPlusgiroNumber: string;
  showBalance: string;
}

/**
 * Handelsbanken integration using Playwright and BankID QR code login.
 */
export default class HandelsbankenClient extends BankClient {
  private page: Page | null = null;
  private browser: any = null;
  private qrStartToken: string | null = null;
  private deduplicationStats: {
    replaced: number;
    skipped: number;
    errors: string[];
  } = { replaced: 0, skipped: 0, errors: [] };

  /**
   * Create a new HandelsbankenClient
   * @param verbose - Whether to enable verbose logging
   */
  constructor(verbose = false) {
    super("Handelsbanken", verbose);
  }

  /**
   * Log message if verbose mode is enabled
   */
  protected log(message: string): void {
    if (this.verbose) {
      console.log(`[Handelsbanken] ${message}`);
    }
  }

  /**
   * Get deduplication configuration for Handelsbanken
   * @returns Deduplication configuration
   */
  protected getDeduplicationConfig(): DeduplicationConfig {
    // Check if configuration is provided in params
    if (
      this.params.deduplication &&
      typeof this.params.deduplication === "object"
    ) {
      const dedupConfig = this.params.deduplication as any;
      return {
        enabled: dedupConfig.enabled !== false, // Default to true for Handelsbanken
        overlapDays: dedupConfig.overlapDays || 7,
      };
    }

    // Default configuration for Handelsbanken
    return {
      enabled: true,
      overlapDays: 7, // Check 7 days back for preliminary transactions
    };
  }

  /**
   * Handelsbanken-specific deduplication logic
   * Handles preliminary vs finalized transaction replacement
   * @param newTransactions - New transactions from bank
   * @param existingTransactions - Existing transactions from Actual Budget
   * @returns Deduplication result
   */
  protected async deduplicateTransactions(
    newTransactions: Transaction[],
    existingTransactions: Transaction[]
  ): Promise<DeduplicationResult> {
    const result: DeduplicationResult = {
      transactions: [],
      replacedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    // Reset stats
    this.deduplicationStats = { replaced: 0, skipped: 0, errors: [] };

    try {
      for (const newTx of newTransactions) {
        const isPreliminary = this.isPreliminaryTransaction(newTx);
        const existingMatch = this.findMatchingTransaction(
          newTx,
          existingTransactions
        );

        if (existingMatch) {
          const existingIsPreliminary =
            this.isPreliminaryTransaction(existingMatch);

          if (isPreliminary && !existingIsPreliminary) {
            // Skip preliminary if finalized already exists
            result.skippedCount++;
            this.deduplicationStats.skipped++;
            this.log(
              `Skipping preliminary transaction: ${newTx.payee_name} (${newTx.amount})`
            );
          } else if (!isPreliminary && existingIsPreliminary) {
            // Replace preliminary with finalized
            result.transactions.push(newTx);
            result.replacedCount++;
            this.deduplicationStats.replaced++;
            this.log(
              `Replacing preliminary with finalized: ${newTx.payee_name} (${newTx.amount})`
            );
          } else {
            // Same state, skip duplicate
            result.skippedCount++;
            this.deduplicationStats.skipped++;
            this.log(
              `Skipping duplicate transaction: ${newTx.payee_name} (${newTx.amount})`
            );
          }
        } else {
          // No match, include transaction
          result.transactions.push(newTx);
        }
      }
    } catch (error) {
      const errorMsg = `Deduplication error: ${error}`;
      result.errors.push(errorMsg);
      this.deduplicationStats.errors.push(errorMsg);
      this.log(errorMsg);
    }

    return result;
  }

  /**
   * Check if a transaction is preliminary based on Handelsbanken patterns
   * @param transaction - Transaction to check
   * @returns True if preliminary
   */
  private isPreliminaryTransaction(transaction: Transaction): boolean {
    const payeeName = transaction.payee_name || "";
    return payeeName.startsWith("Prel ");
  }

  /**
   * Find matching transaction in existing transactions
   * @param newTx - New transaction to match
   * @param existing - Existing transactions to search
   * @returns Matching transaction or null
   */
  private findMatchingTransaction(
    newTx: Transaction,
    existing: Transaction[]
  ): Transaction | null {
    return (
      existing.find(
        (existing) =>
          existing.date === newTx.date &&
          Math.abs((existing.amount || 0) - (newTx.amount || 0)) < 1 && // Allow for rounding differences
          this.similarPayee(existing.payee_name, newTx.payee_name)
      ) || null
    );
  }

  /**
   * Check if two payee names are similar (handles Handelsbanken truncation)
   * @param payee1 - First payee name
   * @param payee2 - Second payee name
   * @returns True if similar
   */
  private similarPayee(payee1?: string, payee2?: string): boolean {
    if (!payee1 || !payee2) return false;

    // Remove "Prel " prefix for comparison
    const clean1 = payee1.replace(/^Prel /, "");
    const clean2 = payee2.replace(/^Prel /, "");

    // Check if one is a substring of the other (handles truncation)
    return clean1.includes(clean2) || clean2.includes(clean1);
  }

  /**
   * Get deduplication statistics for reporting
   * @returns Deduplication statistics
   */
  getDeduplicationStats(): {
    replaced: number;
    skipped: number;
    errors: string[];
  } {
    return { ...this.deduplicationStats };
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
    this.page = await this.browser.newPage();

    try {
      // Setup API request interception for logging
      if (this.verbose) {
        this.setupApiInterception();
      }

      // Navigate to login page and handle cookie consent
      this.log("Navigating to login page...");

      // Ensure page is not null
      if (!this.page) {
        throw new Error("Browser page is null, cannot continue");
      }

      await this.page.goto(LOGIN_URL);

      // Handle cookie consent modal
      await this.handleCookieConsent();

      // Now prompt for personnummer after cookie consent is handled
      const personnummer = await prompt("Enter your personnummer: ");

      // Step 1: Login
      this.log("Starting login process...");
      const loginSuccess = await this.login(personnummer);
      if (!loginSuccess) {
        throw new Error("Handelsbanken login failed.");
      }

      // Step 2: Get accounts using REST API
      this.log("Fetching accounts using REST API...");
      const accounts = await this.getAccountsViaApi();
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
      const transactions = await this.getTransactionsViaApi(
        selectedAccount,
        startDate,
        endDate
      );
      this.log(`Fetched ${transactions.length} transactions`);

      return transactions;
    } finally {
      if (this.browser) {
        this.log("Closing browser...");
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    }
  }

  /**
   * Setup API request interception to log all API calls
   */
  private setupApiInterception(): void {
    if (!this.page) return;

    this.log("Setting up API request interception for analysis...");

    this.page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("/api/") ||
        url.includes("/json") ||
        url.includes("/rest") ||
        url.includes("/servlet") ||
        (request.method() === "POST" && request.postData())
      ) {
        this.log(`API Request: ${request.method()} ${url}`);
        const postData = request.postData();
        if (postData) {
          try {
            // Try to parse as JSON for better logging
            const jsonData = JSON.parse(postData);
            this.log(`Request data: ${JSON.stringify(jsonData, null, 2)}`);
          } catch {
            // If not JSON, log as is but truncate if too long
            if (postData.length > 500) {
              this.log(`Request data: ${postData.substring(0, 500)}...`);
            } else {
              this.log(`Request data: ${postData}`);
            }
          }
        }
      }
    });

    this.page.on("response", async (response) => {
      const request = response.request();
      const url = request.url();

      if (
        url.includes("/api/") ||
        url.includes("/json") ||
        url.includes("/rest") ||
        url.includes("/servlet") ||
        (request.method() === "POST" && request.postData())
      ) {
        this.log(`API Response: ${response.status()} ${url}`);

        try {
          const contentType = response.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const jsonResponse = await response.json().catch(() => null);
            if (jsonResponse) {
              this.log(
                `Response data: ${JSON.stringify(jsonResponse, null, 2)}`
              );
            }
          }
        } catch (error) {
          this.log(`Could not parse response: ${error}`);
        }
      }
    });
  }

  /**
   * Get accounts via REST API after login
   */
  private async getAccountsViaApi(): Promise<HandelsbankenAccount[]> {
    if (!this.page) throw new Error("Browser not initialized");

    this.log("Fetching accounts via API...");
    try {
      // Get the base URL from the current page to ensure we use absolute URLs
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");

      // Handelsbanken accounts API endpoint with absolute URL
      const accountsApiUrl = `${baseUrl}/rseda/rykk/bu/accounts/v1/myAccounts`;

      this.log(`Making API request to ${accountsApiUrl}`);

      // Define response types for better type checking
      interface ApiAccountData {
        identifier?: {
          value: string;
          valueRaw: string;
        };
        name?: string;
        _links?: any;
        isoCurrencyCode?: string;
        currentBalance?: {
          value: string;
          valueRaw: number;
        };
        availableAmount?: {
          value: string;
          valueRaw: number;
        };
        productSegmentType?: string;
      }

      interface ApiAccountsData {
        agreements?: ApiAccountData[];
      }

      interface ApiSuccessResponse {
        ok: boolean;
        status: number;
        statusText: string;
        contentType: string;
        text: string;
        isJson: boolean;
      }

      interface ApiJsonResponse extends ApiSuccessResponse {
        json: ApiAccountsData;
      }

      interface ApiErrorResponse extends ApiSuccessResponse {
        error: string;
        isJsonParseError?: boolean;
      }

      interface ApiFetchError {
        error: string;
        url: string;
      }

      type ApiResponse =
        | ApiSuccessResponse
        | ApiJsonResponse
        | ApiErrorResponse
        | ApiFetchError;

      // Make the API request
      const response = (await this.page.evaluate(async (url: string) => {
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "application/json, application/problem+json",
              "X-Requested-With": "fetch",
            },
          });

          // Create a detailed response object with status, content type and text
          const contentType = response.headers.get("content-type") || "";
          const text = await response.text();

          const responseObj = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            contentType,
            text: text.length > 1000 ? `${text.substring(0, 1000)}...` : text,
            isJson: contentType.includes("application/json"),
          };

          // Only try to parse as JSON if the content type is correct and it looks like JSON
          if (
            contentType.includes("application/json") &&
            text.trim().startsWith("{")
          ) {
            try {
              const jsonData = JSON.parse(text);
              return { ...responseObj, json: jsonData };
            } catch (e) {
              return {
                ...responseObj,
                error: `Failed to parse JSON: ${e}`,
                isJsonParseError: true,
              };
            }
          }

          // Not JSON or couldn't parse
          return responseObj;
        } catch (error) {
          return {
            error: String(error),
            url,
          };
        }
      }, accountsApiUrl)) as ApiResponse;

      // Save the raw response for debugging

      this.log(
        `Response status: ${
          "status" in response ? response.status : "unknown"
        }, Content-Type: ${
          "contentType" in response ? response.contentType : "unknown"
        }`
      );

      // Process the accounts data from the API response
      const accounts: HandelsbankenAccount[] = [];

      if (
        "json" in response &&
        response.json &&
        response.json.agreements &&
        response.json.agreements.length > 0
      ) {
        this.log(`Found ${response.json.agreements.length} accounts via API`);

        for (const agreement of response.json.agreements) {
          if (agreement.identifier && agreement.name) {
            const accountNumber = agreement.identifier.valueRaw;
            // Extract system and status from links if available, otherwise use defaults
            let system = "INLÅ"; // Default value based on your example
            let status = "N"; // Default value based on your example

            // Try to extract system and status from the transactions link if available
            if (
              agreement._links &&
              agreement._links.transactions &&
              agreement._links.transactions.href
            ) {
              const href = agreement._links.transactions.href;
              const match = href.match(/Konto=([^&]+)/);
              if (match && match[1]) {
                const parts = decodeURIComponent(match[1]).split("~");
                if (parts.length >= 3) {
                  system = parts[1];
                  status = parts[2];
                }
              }
            }

            accounts.push({
              accountNumber,
              chosenName: agreement.name,
              accountName: agreement.name,
              system,
              status,
              accountHolder: "", // We don't have this information from the API
            });
          }
        }
      } else if (
        "text" in response &&
        response.text &&
        response.text.trim().startsWith("{")
      ) {
        // If we have text that looks like JSON, try to parse it anyway
        try {
          const jsonData = JSON.parse(response.text);
          if (jsonData.agreements && jsonData.agreements.length > 0) {
            this.log(
              `Successfully parsed JSON from response text, found ${jsonData.agreements.length} accounts`
            );

            for (const agreement of jsonData.agreements) {
              if (agreement.identifier && agreement.name) {
                const accountNumber = agreement.identifier.valueRaw;
                // Default system and status values
                let system = "INLÅ";
                let status = "N";

                // Try to extract system and status from links if available
                if (
                  agreement._links &&
                  agreement._links.transactions &&
                  agreement._links.transactions.href
                ) {
                  const href = agreement._links.transactions.href;
                  const match = href.match(/Konto=([^&]+)/);
                  if (match && match[1]) {
                    const parts = decodeURIComponent(match[1]).split("~");
                    if (parts.length >= 3) {
                      system = parts[1];
                      status = parts[2];
                    }
                  }
                }

                accounts.push({
                  accountNumber,
                  chosenName: agreement.name,
                  accountName: agreement.name,
                  system,
                  status,
                  accountHolder: "",
                });
              }
            }
          }
        } catch (e) {
          this.log(`Failed to parse accounts response text as JSON: ${e}`);
        }
      }

      if (accounts.length > 0) {
        return accounts;
      } else {
        this.log(
          "No accounts found in API response, falling back to page extraction"
        );
        return await this.getAccounts();
      }
    } catch (error) {
      this.log(`Error in getAccountsViaApi: ${error}`);
      // Fall back to the original method
      return await this.getAccounts();
    }
  }

  /**
   * Get transactions via REST API
   */
  private async getTransactionsViaApi(
    account: HandelsbankenAccount,
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    if (!this.page) throw new Error("Browser not initialized");

    this.log("Fetching transactions via API...");
    try {
      // Prepare the API request payload based on account and date range
      const payload = {
        account: `${account.accountNumber}~${account.system}~${account.status}~${account.chosenName}~J`,
        dateFrom: startDate,
        dateTo: endDate,
        transactionType: "A",
        amountFrom: "",
        amountTo: "",
      };

      // Get the base URL from the current page to ensure we use absolute URLs
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");

      // Handelsbanken transactions API endpoint with absolute URL
      const transactionsApiUrl = `${baseUrl}/bb/seip/servlet/ipko?appName=ipko&appAction=ShowAccountTransactions`;

      this.log(`Making API request to ${transactionsApiUrl}`);

      // Define response types for better type checking
      interface ApiResponseData {
        inlaAccountTransactions?: Array<{
          transactionText: string;
          transactionDate: string;
          ledgerDate: string;
          transactionAmount: string;
          serialNumber: string;
          eventTime: string;
          systemName: string;
          isTransactionDetails: string;
          bankgiroPlusgiroNumber: string;
          showBalance: string;
        }>;
        isCloseAccount?: string;
        customerName?: string;
        accountInformation?: any;
      }

      interface ApiSuccessResponse {
        ok: boolean;
        status: number;
        statusText: string;
        contentType: string | null;
        text: string | null;
        isJson: boolean;
      }

      interface ApiJsonResponse extends ApiSuccessResponse {
        json: ApiResponseData;
      }

      interface ApiErrorResponse extends ApiSuccessResponse {
        error: string;
        isJsonParseError: boolean;
      }

      interface ApiFetchError {
        error: string;
        url: string;
      }

      type ApiResponse =
        | ApiSuccessResponse
        | ApiJsonResponse
        | ApiErrorResponse
        | ApiFetchError;

      // Make the API request
      const response = (await this.page.evaluate(
        async (config: { url: string; data: any }) => {
          try {
            const res = await fetch(config.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/json",
              },
              body: JSON.stringify(config.data),
            });

            // Create a detailed response object with status, content type and text
            const contentType = res.headers.get("content-type") || "";
            const text = await res.text();

            const responseObj = {
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
              contentType,
              text: text.length > 1000 ? `${text.substring(0, 1000)}...` : text,
              isJson: contentType?.includes("application/json") ?? false,
            };

            // Only try to parse as JSON if the content type is correct and it looks like JSON
            if (
              contentType?.includes("application/json") &&
              text?.trim().startsWith("{")
            ) {
              try {
                const jsonData = JSON.parse(text);
                return { ...responseObj, json: jsonData };
              } catch (e) {
                return {
                  ...responseObj,
                  error: `Failed to parse JSON: ${e}`,
                  isJsonParseError: true,
                };
              }
            }

            // Not JSON or couldn't parse
            return responseObj;
          } catch (error) {
            return {
              error: String(error),
              url: config.url,
            };
          }
        },
        { url: transactionsApiUrl, data: payload }
      )) as ApiResponse;

      this.log(
        `Response status: ${
          "status" in response ? response.status : "unknown"
        }, Content-Type: ${
          "contentType" in response ? response.contentType : "unknown"
        }`
      );

      // Check if we got a proper JSON response
      if (
        "json" in response &&
        response.json &&
        response.json.inlaAccountTransactions
      ) {
        this.log(
          `Found ${response.json.inlaAccountTransactions.length} transactions via API`
        );

        const transactions: Transaction[] = [];
        for (const tx of response.json.inlaAccountTransactions) {
          transactions.push({
            date: tx.transactionDate,
            amount: parseFloat(tx.transactionAmount),
            payee_name: tx.transactionText,
            notes: "",
            imported_id: `${tx.transactionDate}-${tx.serialNumber}-${tx.eventTime}`,
          });
        }

        return transactions;
      }

      // If we have text that looks like JSON, try to parse it anyway
      if (
        "text" in response &&
        response.text &&
        response.text.trim().startsWith("{")
      ) {
        try {
          const jsonData = JSON.parse(response.text);
          if (
            jsonData.inlaAccountTransactions &&
            jsonData.inlaAccountTransactions.length > 0
          ) {
            this.log(
              `Successfully parsed JSON from response text, found ${jsonData.inlaAccountTransactions.length} transactions`
            );

            const transactions: Transaction[] = [];
            for (const tx of jsonData.inlaAccountTransactions) {
              transactions.push({
                date: tx.transactionDate,
                amount: parseFloat(tx.transactionAmount),
                payee_name: tx.transactionText,
                notes: "",
                imported_id: `${tx.transactionDate}-${tx.serialNumber}-${tx.eventTime}`,
              });
            }

            return transactions;
          }
        } catch (e) {
          this.log(`Failed to parse response text as JSON: ${e}`);
        }
      }

      // If we received HTML, we need to navigate and extract from the page
      if (
        "text" in response &&
        response.text &&
        response.text.includes("<!DOCTYPE html>")
      ) {
        this.log(
          "Received HTML response instead of JSON. Falling back to page extraction."
        );
        return await this.extractTransactionsFromPage(startDate, endDate);
      }

      this.log(
        "No transactions found in API response or unable to parse response"
      );
      return await this.extractTransactionsFromPage(startDate, endDate);
    } catch (error) {
      this.log(`Error in getTransactionsViaApi: ${error}`);
      // Fall back to the page extraction method
      return await this.extractTransactionsFromPage(startDate, endDate);
    }
  }

  /**
   * Handle cookie consent modal
   */
  private async handleCookieConsent(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    this.log("Checking for cookie consent modal...");

    try {
      // Wait longer for the modal to appear - sometimes it takes a moment to load
      this.log("Waiting for page content to load...");
      await this.page!.waitForTimeout(2000);

      // Get the current URL to track where we are
      const currentUrl = await this.page!.url();
      this.log(`Current URL: ${currentUrl}`);

      // Check if the page contains the cookie consent modal title
      this.log("Looking for cookie consent modal title...");
      const titleSelector = 'h1:has-text("Cookies på Handelsbanken")';
      const hasModal = await this.page!.waitForSelector(titleSelector, {
        timeout: 5000,
      })
        .then(() => true)
        .catch(() => false);

      if (hasModal) {
        this.log("Cookie consent modal detected by title");

        // Try to find the "Godkänn nödvändiga" button - based on the screenshot
        const buttonSelector = 'button:has-text("Godkänn nödvändiga")';
        this.log(`Looking for button with text: ${buttonSelector}`);

        try {
          await this.page!.waitForSelector(buttonSelector, { timeout: 3000 });
          this.log('Found "Godkänn nödvändiga" button');

          // Try clicking with force: true option to bypass any overlay issues
          this.log("Attempting to click button...");
          await this.page!.click(buttonSelector, { force: true });

          this.log('Clicked "Godkänn nödvändiga" button');
          await this.page!.waitForTimeout(2000);

          // Check if modal is still visible
          const modalStillVisible = await this.page!.waitForSelector(
            titleSelector,
            { timeout: 1000 }
          )
            .then(() => true)
            .catch(() => false);

          if (modalStillVisible) {
            this.log("Modal still visible, trying JavaScript click");
            // Try JavaScript click as last resort
            await this.page!.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll("button"));
              const necessaryButton = buttons.find((button) =>
                button.textContent?.includes("Godkänn nödvändiga")
              );
              if (necessaryButton) {
                (necessaryButton as HTMLButtonElement).click();
              }
            });

            await this.page!.waitForTimeout(2000);

            // Check again if modal is still visible after JavaScript click
            const stillVisibleAfterJsClick = await this.page!.waitForSelector(
              titleSelector,
              { timeout: 1000 }
            )
              .then(() => true)
              .catch(() => false);

            if (stillVisibleAfterJsClick) {
              this.log(
                "Modal still visible after JavaScript click, proceeding anyway"
              );
            } else {
              this.log("Modal removed after JavaScript click");
            }
          }
        } catch (error) {
          this.log(`Error finding or clicking button: ${error}`);

          // Try clicking any button that looks like "Godkänn"
          this.log('Trying to find any "Godkänn" button...');
          await this.page!.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const cookieButtons = buttons.filter((b) =>
              b.textContent?.includes("Godkänn")
            );

            if (cookieButtons.length > 0) {
              // Prefer "Godkänn nödvändiga" if available
              const necessaryButton = cookieButtons.find((b) =>
                b.textContent?.includes("nödvändiga")
              );

              if (necessaryButton) {
                (necessaryButton as HTMLButtonElement).click();
              } else if (cookieButtons.length > 0) {
                // Otherwise click the first "Godkänn" button
                (cookieButtons[0] as HTMLButtonElement).click();
              }
            }
          });

          await this.page!.waitForTimeout(2000);
        }
      } else {
        this.log("No cookie consent modal detected by title");

        // Try alternative detection - look for any element containing "Cookies på Handelsbanken"
        const altTitleSelector = 'text="Cookies på Handelsbanken"';
        const hasAltModal = await this.page!.waitForSelector(altTitleSelector, {
          timeout: 2000,
        })
          .then(() => true)
          .catch(() => false);

        if (hasAltModal) {
          this.log("Cookie modal detected by text content");

          // Try to find and click the right button
          await this.page!.evaluate(() => {
            // Get all buttons on the page
            const buttons = Array.from(document.querySelectorAll("button"));

            // Find button with "Godkänn nödvändiga" text
            for (const button of buttons) {
              if (button.textContent?.includes("Godkänn nödvändiga")) {
                (button as HTMLButtonElement).click();
                return;
              }
            }

            // If not found, try buttons near the "Cookies på Handelsbanken" text
            const cookieText = document.evaluate(
              "//*[contains(text(), 'Cookies på Handelsbanken')]",
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;

            if (cookieText) {
              // Try to find nearby buttons
              let element: Element | null = cookieText as Element;
              while (element && element.tagName !== "BODY") {
                const nearbyButtons = element.querySelectorAll("button");
                if (nearbyButtons.length > 0) {
                  // Try to find the right button or click the second one (usually "decline")
                  const necessaryButton = Array.from(nearbyButtons).find((b) =>
                    b.textContent?.includes("nödvändiga")
                  );

                  if (necessaryButton) {
                    (necessaryButton as HTMLButtonElement).click();
                  } else if (nearbyButtons.length > 1) {
                    (nearbyButtons[1] as HTMLButtonElement).click();
                  } else if (nearbyButtons.length === 1) {
                    (nearbyButtons[0] as HTMLButtonElement).click();
                  }
                  return;
                }
                element = element.parentElement;
              }
            }
          });

          await this.page!.waitForTimeout(2000);
        } else {
          this.log("No cookie modal detected by any method");
        }
      }
    } catch (err) {
      this.log(`Error handling cookie consent: ${err}`);
    }
  }

  /**
   * Handle the login flow with BankID QR code
   */
  private async login(personnummer: string): Promise<boolean> {
    if (!this.page) throw new Error("Browser not initialized");

    this.log("Navigating to login page...");
    await this.page.goto(LOGIN_URL);

    while (true) {
      this.log("Waiting for userId input field...");
      await this.page.waitForSelector("input#userId");
      this.log("Filling in personnummer...");
      await this.page.fill("input#userId", personnummer);

      this.log("Clicking login button...");
      try {
        await this.page.click(
          'button[data-test-id="MBIDStartStage__loginButton"]'
        );
      } catch (err) {
        this.log(`Error clicking login button: ${err}`);
        // Try a different approach if the button is obscured
        this.log("Trying alternative click method...");
        await this.page.evaluate(() => {
          const button = document.querySelector(
            'button[data-test-id="MBIDStartStage__loginButton"]'
          );
          if (button) (button as HTMLButtonElement).click();
        });
      }

      // Wait a moment for any animations to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Handle QR auth with our improved method
      this.log("Setting up BankID authentication flow...");
      try {
        // Set up our improved QR code detection methods
        await this.handleBankIdAuthentication();

        // If we get here without errors, consider it a success
        this.log("BankID authentication completed");
        return true;
      } catch (error) {
        this.log(`Error during BankID authentication: ${error}`);

        // Check if we need to retry
        const retry = await prompt("Login failed. Try again? (y/n): ");
        if (retry.toLowerCase() !== "y") return false;

        // Reset for retry
        this.qrStartToken = null;
        await this.page.goto(LOGIN_URL);
        continue;
      }
    }
  }

  /**
   * Extract QR code token from the current page
   */
  private async extractQrCodeFromPage(): Promise<string | null> {
    if (!this.page) return null;

    this.log("Attempting to extract QR code from page...");

    try {
      return await this.page.evaluate(() => {
        // Method 1: Look for qrStartToken in window variables
        if (
          window.hasOwnProperty("qrData") ||
          window.hasOwnProperty("qrStartToken")
        ) {
          // @ts-ignore
          const token = window.qrData || window.qrStartToken;
          if (typeof token === "string" && token.length > 20) {
            console.log(
              `Found qrStartToken in window object: ${token.substring(
                0,
                10
              )}...`
            );
            return token;
          }
        }

        // Method 2: Check if there's a QR token in any script tag
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          const content = script.textContent || "";
          if (content.includes("qrStartToken") || content.includes("qrData")) {
            // Try multiple regex patterns to capture various formats
            const patterns = [
              /"qrStartToken"\s*:\s*"([^"]+)"/,
              /'qrStartToken'\s*:\s*'([^']+)'/,
              /qrStartToken\s*=\s*["']([^"']+)["']/,
              /"qrData"\s*:\s*"([^"]+)"/,
              /'qrData'\s*:\s*'([^']+)'/,
              /qrData\s*=\s*["']([^"']+)["']/,
            ];

            for (const pattern of patterns) {
              const match = content.match(pattern);
              if (match && match[1]) {
                console.log(
                  `Found QR token in script: ${match[1].substring(0, 10)}...`
                );
                return match[1];
              }
            }
          }
        }

        // Method 3: Look for it in the page source using various patterns
        const html = document.documentElement.outerHTML;
        const sourcePatterns = [
          /"qrStartToken"\s*:\s*"([^"]+)"/,
          /'qrStartToken'\s*:\s*'([^']+)'/,
          /qrStartToken\s*=\s*["']([^"']+)["']/,
          /"qrData"\s*:\s*"([^"]+)"/,
          /'qrData'\s*:\s*'([^']+)'/,
          /qrData\s*=\s*["']([^"']+)["']/,
        ];

        for (const pattern of sourcePatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            console.log(
              `Found QR token in page source: ${match[1].substring(0, 10)}...`
            );
            return match[1];
          }
        }

        // Method 4: Look for canvas elements that might be rendering QR codes
        const canvases = document.querySelectorAll("canvas");
        if (canvases.length > 0) {
          console.log(
            `Found ${canvases.length} canvas elements, checking for QR code data`
          );

          // Sometimes QR code data is stored in adjacent elements or data attributes
          for (const canvas of Array.from(canvases)) {
            // Check parent and sibling elements for data attributes
            const parent = canvas.parentElement;
            if (parent) {
              const dataAttrs = parent
                .getAttributeNames()
                .filter((attr) => attr.startsWith("data-"));
              for (const attr of dataAttrs) {
                const value = parent.getAttribute(attr);
                if (value && value.length > 20) {
                  console.log(
                    `Found potential token in canvas parent data attribute: ${value.substring(
                      0,
                      10
                    )}...`
                  );
                  return value;
                }
              }
            }
          }
        }

        // Method 5: Check for src attributes in img tags that might contain the QR data
        const qrImages = document.querySelectorAll(
          'img[src^="data:image/"], img[alt*="QR"], img[alt*="qr"]'
        );
        for (const img of Array.from(qrImages)) {
          // Check if there are any hidden inputs or data attributes nearby
          const parent = img.parentElement;
          if (parent) {
            // Look for hidden inputs
            const inputs = parent.querySelectorAll('input[type="hidden"]');
            for (const input of Array.from(inputs)) {
              const value = (input as HTMLInputElement).value;
              if (value && value.length > 20) {
                console.log(
                  `Found potential token in hidden input: ${value.substring(
                    0,
                    10
                  )}...`
                );
                return value;
              }
            }

            // Check for data attributes that might contain the token
            const dataAttrs = parent
              .getAttributeNames()
              .filter((attr) => attr.startsWith("data-"));
            for (const attr of dataAttrs) {
              const value = parent.getAttribute(attr);
              if (value && value.length > 20) {
                console.log(
                  `Found potential token in img parent data attribute: ${value.substring(
                    0,
                    10
                  )}...`
                );
                return value;
              }
            }
          }
        }

        // Method 6: Look for QR code information in any DOM elements
        // This is more aggressive but might be needed when the QR code is rendered in a non-standard way
        const potentialContainers = document.querySelectorAll(
          '[class*="qr"], [id*="qr"], [data-*="qr"], [class*="bankid"], [id*="bankid"]'
        );

        for (const container of Array.from(potentialContainers)) {
          // Check for data attributes
          const allAttributes = container.getAttributeNames();
          for (const attr of allAttributes) {
            const value = container.getAttribute(attr);
            if (value && value.length > 20) {
              console.log(
                `Found potential token in element attribute: ${value.substring(
                  0,
                  10
                )}...`
              );
              return value;
            }
          }

          // Check text content of the element and its children
          const text = container.textContent || "";
          const matches = text.match(/[A-Za-z0-9+/=]{30,}/);
          if (matches && matches[0]) {
            console.log(
              `Found potential token in text content: ${matches[0].substring(
                0,
                10
              )}...`
            );
            return matches[0];
          }
        }

        // Method 7: As a last resort, check all rendered JSON data on the page
        console.log(
          "Searching for QR token in all page scripts as last resort"
        );
        const allScriptContents = scripts
          .map((s) => s.textContent || "")
          .join(" ");
        const jsonBlocks = allScriptContents.match(/(\{[^{}]*\})/g) || [];

        for (const jsonBlock of jsonBlocks) {
          try {
            const data = JSON.parse(jsonBlock);
            // Recursively search for qrStartToken or qrData in the parsed object
            const findToken = (obj: any): string | null => {
              if (!obj || typeof obj !== "object") return null;

              if (obj.qrStartToken && typeof obj.qrStartToken === "string") {
                return obj.qrStartToken;
              }

              if (obj.qrData && typeof obj.qrData === "string") {
                return obj.qrData;
              }

              for (const key in obj) {
                if (typeof obj[key] === "object") {
                  const result = findToken(obj[key]);
                  if (result) return result;
                }
              }

              return null;
            };

            const token = findToken(data);
            if (token) {
              console.log(
                `Found QR token in JSON data: ${token.substring(0, 10)}...`
              );
              return token;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }

        return null;
      });
    } catch (error) {
      this.log(`Error extracting QR code: ${error}`);
      return null;
    }
  }

  /**
   * Get list of accounts after successful login
   */
  // TODO: Get accounts from network request instead of scraping the page
  private async getAccounts(): Promise<HandelsbankenAccount[]> {
    if (!this.page) throw new Error("Browser not initialized");

    // Wait for the accounts page to load
    this.log("Waiting for accounts page to load...");
    await this.page.waitForSelector('a[href*="account_transactions"]', {
      timeout: 30000,
    });

    // Extract accounts from the page
    this.log("Extracting account information...");
    const accounts = await this.page.evaluate(() => {
      const accountLinks = Array.from(
        document.querySelectorAll('a[href*="account_transactions"]')
      );
      return accountLinks.map((link) => {
        const href = link.getAttribute("href") || "";
        const match = href.match(/account=([^&]+)/);
        const accountId = match ? match[1] : "";
        const [accountNumber, system, status] = accountId.split("~");

        // Get account name from the link text
        const accountName = link.textContent?.trim() || "";

        // Get account holder (assuming it's the user's name)
        const accountHolder = ""; // We don't have this information from the HTML

        return {
          accountNumber,
          chosenName: accountName,
          accountName: "", // We don't have the official account name from the HTML
          system,
          status,
          accountHolder,
        };
      });
    });

    this.log(`Found ${accounts.length} accounts`);
    return accounts;
  }

  /**
   * Let user select an account from the list
   */
  private async selectAccount(
    accounts: HandelsbankenAccount[]
  ): Promise<HandelsbankenAccount> {
    console.log("\nAvailable accounts:");
    accounts.forEach((account, index) => {
      console.log(
        `${index + 1}. ${account.chosenName} (${account.accountNumber})`
      );
    });

    const selection = await prompt(`Select account (1-${accounts.length}): `);
    const index = parseInt(selection, 10) - 1;

    if (isNaN(index) || index < 0 || index >= accounts.length) {
      throw new Error("Invalid account selection.");
    }

    return accounts[index];
  }

  /**
   * Extract transactions from the transactions page as a fallback
   */
  private async extractTransactionsFromPage(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    if (!this.page) throw new Error("Browser not initialized");

    this.log("Extracting transactions from page...");

    try {
      // Get the base URL from the current page
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
      const fullTransactionsUrl = `${baseUrl}/bb/seip/servlet/ipko?appName=ipko&appAction=ShowAccountTransactions`;

      // Make sure we're on the transactions page
      if (!this.page.url().includes("ShowAccountTransactions")) {
        this.log(`Navigating to transactions page: ${fullTransactionsUrl}`);
        await this.page.goto(fullTransactionsUrl);

        // Wait for the page to load
        this.log("Waiting for transactions page to load...");
        await this.page.waitForTimeout(3000);
      }

      // Wait for the date input fields to be available
      this.log("Waiting for date input fields...");
      try {
        const hasDateFields = await this.page
          .waitForSelector('input[name="dateFrom"], input[name="fromDate"]', {
            timeout: 5000,
          })
          .then(() => true)
          .catch(() => false);

        if (hasDateFields) {
          // Find which date input fields are used
          const dateFromSelector = (await this.page.$('input[name="dateFrom"]'))
            ? 'input[name="dateFrom"]'
            : 'input[name="fromDate"]';

          const dateToSelector = (await this.page.$('input[name="dateTo"]'))
            ? 'input[name="dateTo"]'
            : 'input[name="toDate"]';

          // Fill in the date range
          this.log(`Setting date range: ${startDate} to ${endDate}`);
          await this.page.fill(dateFromSelector, startDate);
          await this.page.fill(dateToSelector, endDate);

          // Find and click the search button
          const searchButton = await this.page.$(
            'button[type="submit"], input[type="submit"], button:has-text("Search"), button:has-text("Sök")'
          );
          if (searchButton) {
            this.log("Clicking search button...");
            await searchButton.click();

            // Wait for the results to load
            this.log("Waiting for results to load...");
            await this.page.waitForTimeout(3000);
          } else {
            this.log(
              "Search button not found. Trying to submit the form directly..."
            );
            // Try to submit the form directly
            await this.page.evaluate(() => {
              const form = document.querySelector("form");
              if (form) form.submit();
            });
            await this.page.waitForTimeout(3000);
          }
        } else {
          this.log(
            "Date input fields not found. Looking for transactions in current page view..."
          );
        }
      } catch (error) {
        this.log(`Error with date inputs: ${error}`);
        this.log("Looking for transactions in current page view...");
      }

      // Extract transactions from the table
      this.log("Extracting transactions from table...");
      const transactions = await this.page.evaluate(() => {
        const results: any[] = [];

        // Look for transaction tables - try multiple selectors
        const tables = [
          ...document.querySelectorAll(
            'table.transactions, table.account-transactions, table.statement, table[id*="transaction"]'
          ),
          ...document.querySelectorAll("table"),
        ];

        // Process each table
        for (const table of tables) {
          const rows = table.querySelectorAll("tr");
          if (rows.length <= 1) continue; // Skip tables with only header row or empty

          // Process rows
          for (const row of Array.from(rows)) {
            // Skip header rows
            if (row.querySelector("th")) continue;

            const columns = row.querySelectorAll("td");
            if (columns.length >= 3) {
              // Try to identify which columns contain what data
              // This is challenging because the structure can vary
              let dateCol = 0;
              let descCol = 1;
              let amountCol = 2;

              // Try to infer column positions by checking headers
              const headerRow = table.querySelector("tr th")
                ? table.querySelector("tr")
                : null;
              if (headerRow) {
                const headers = Array.from(
                  headerRow.querySelectorAll("th")
                ).map((h) => (h.textContent || "").toLowerCase());

                for (let i = 0; i < headers.length; i++) {
                  const header = headers[i];
                  if (header.includes("date") || header.includes("datum")) {
                    dateCol = i;
                  } else if (
                    header.includes("description") ||
                    header.includes("text") ||
                    header.includes("beskrivning") ||
                    header.includes("information")
                  ) {
                    descCol = i;
                  } else if (
                    header.includes("amount") ||
                    header.includes("belopp") ||
                    header.includes("sum") ||
                    header.includes("kr") ||
                    header.includes("sek")
                  ) {
                    amountCol = i;
                  }
                }
              }

              // Extract data from columns
              const dateText = columns[dateCol]?.textContent?.trim() || "";
              const descriptionText =
                columns[descCol]?.textContent?.trim() || "";
              const amountText = columns[amountCol]?.textContent?.trim() || "";

              // Parse amount - remove currency symbols and convert commas to periods
              const cleanAmount = amountText
                .replace(/[^\d,.-]/g, "")
                .replace(",", ".");
              let amount = parseFloat(cleanAmount);

              // Determine if it's negative based on text or formatting
              const isNegative =
                amountText.includes("-") ||
                columns[amountCol]?.className?.includes("negative") ||
                columns[amountCol]?.style?.color?.includes("red");

              if (!isNaN(amount) && !amountText.includes("-") && isNegative) {
                amount = -amount;
              }

              // Generate a unique ID
              const uniqueId = `${dateText}-${descriptionText}-${amountText}`;

              if (dateText && (descriptionText || amountText)) {
                results.push({
                  date: dateText,
                  description: descriptionText,
                  amount: isNaN(amount) ? 0 : amount,
                  id: uniqueId,
                });
              }
            }
          }

          // If we found transactions, no need to check other tables
          if (results.length > 0) break;
        }

        // If no transactions found in tables, look for data in other formats
        if (results.length === 0) {
          // Look for list-based layouts
          const transactionItems = document.querySelectorAll(
            '[class*="transaction-item"], [class*="account-transaction"], li[class*="transaction"]'
          );

          for (const item of Array.from(transactionItems)) {
            // Extract date
            const dateEl = item.querySelector(
              '[class*="date"], [data-label*="date"], [data-label*="datum"]'
            );
            const dateText = dateEl?.textContent?.trim() || "";

            // Extract description
            const descEl = item.querySelector(
              '[class*="description"], [class*="text"], [data-label*="beskrivning"]'
            );
            const descriptionText = descEl?.textContent?.trim() || "";

            // Extract amount
            const amountEl = item.querySelector(
              '[class*="amount"], [class*="sum"], [data-label*="belopp"]'
            );
            const amountText = amountEl?.textContent?.trim() || "";

            // Parse amount
            const cleanAmount = amountText
              .replace(/[^\d,.-]/g, "")
              .replace(",", ".");
            const amount = parseFloat(cleanAmount);

            // Generate ID
            const uniqueId = `${dateText}-${descriptionText}-${amountText}`;

            if (dateText && (descriptionText || amountText)) {
              results.push({
                date: dateText,
                description: descriptionText,
                amount: isNaN(amount) ? 0 : amount,
                id: uniqueId,
              });
            }
          }
        }

        return results;
      });

      this.log(`Extracted ${transactions.length} transactions from page`);

      // If we found no transactions, try looking for other ways to get transaction data
      if (transactions.length === 0) {
        this.log(
          "No transactions found in HTML elements, checking for JSON data..."
        );

        // Try to find transactions in any structured data on the page
        const jsonData = await this.extractJsonDataFromPage();

        if (
          jsonData &&
          jsonData.transactions &&
          jsonData.transactions.length > 0
        ) {
          this.log(
            `Found ${jsonData.transactions.length} transactions in JSON data`
          );

          // Convert JSON data to our Transaction format
          return jsonData.transactions.map((tx: any) => ({
            date: tx.date || tx.transactionDate || tx.bookingDate || "",
            amount:
              typeof tx.amount === "number"
                ? tx.amount
                : parseFloat(tx.amount || "0"),
            payee_name: tx.text || tx.description || tx.payee || "",
            notes: tx.additionalInfo || tx.note || "",
            imported_id: tx.id || `${tx.date}-${tx.amount}-${tx.text}`,
          }));
        }
      }

      // Format dates to YYYY-MM-DD
      const formattedTransactions = transactions.map((tx) => {
        // Try to parse the date into a standardized format
        const dateText = tx.date;
        let formattedDate = dateText;

        // Try to detect date format and convert to YYYY-MM-DD
        if (dateText) {
          // Handle common date formats
          const dateParts = dateText.match(
            /(\d{1,4})[\/\.-](\d{1,2})[\/\.-](\d{1,4})/
          );

          if (dateParts) {
            // Determine if year is first or last
            if (dateParts[1].length === 4) {
              // Format is YYYY-MM-DD
              formattedDate = `${dateParts[1]}-${dateParts[2].padStart(
                2,
                "0"
              )}-${dateParts[3].padStart(2, "0")}`;
            } else if (dateParts[3].length === 4) {
              // Format is DD-MM-YYYY
              formattedDate = `${dateParts[3]}-${dateParts[2].padStart(
                2,
                "0"
              )}-${dateParts[1].padStart(2, "0")}`;
            } else {
              // Best guess format
              formattedDate = dateText;
            }
          }
        }

        return {
          date: formattedDate,
          amount: tx.amount,
          payee_name: tx.description,
          notes: "",
          imported_id: tx.id,
        };
      });

      return formattedTransactions;
    } catch (error) {
      this.log(`Error extracting transactions from page: ${error}`);
      throw new Error(`Failed to extract transactions: ${error}`);
    }
  }

  /**
   * Extract JSON data that might contain transactions from the page
   */
  private async extractJsonDataFromPage(): Promise<any> {
    if (!this.page) return null;

    try {
      return await this.page.evaluate(() => {
        // Look for JSON data in script tags
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          const content = script.textContent || "";
          if (content.includes("transaction") || content.includes("account")) {
            try {
              // Try to extract JSON objects
              const matches = content.match(/\{[^{}]*(\{[^{}]*\})*[^{}]*\}/g);
              if (matches) {
                for (const match of matches) {
                  try {
                    const data = JSON.parse(match);
                    if (
                      data &&
                      (data.transactions ||
                        data.accountTransactions ||
                        data.items)
                    ) {
                      return data;
                    }
                  } catch {}
                }
              }
            } catch {}
          }
        }

        // Also look for data attributes that might contain transaction data
        const elements = document.querySelectorAll(
          "[data-transactions], [data-account-data]"
        );
        for (const el of Array.from(elements)) {
          const dataAttr =
            el.getAttribute("data-transactions") ||
            el.getAttribute("data-account-data");
          if (dataAttr) {
            try {
              return JSON.parse(dataAttr);
            } catch {}
          }
        }

        // Also check window objects that might contain transaction data
        try {
          // @ts-ignore
          if (window.appData && window.appData.transactions) {
            // @ts-ignore
            return window.appData;
          }
          // @ts-ignore
          if (window.accountData && window.accountData.transactions) {
            // @ts-ignore
            return window.accountData;
          }
        } catch {}

        return null;
      });
    } catch (error) {
      this.log(`Error extracting JSON data from page: ${error}`);
      return null;
    }
  }

  /**
   * Monitor navigation to detect successful login
   */
  private setupLoginSuccessDetection(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.page) {
        resolve();
        return;
      }

      this.log("Setting up login success detection");

      // Flag to track if we've already resolved
      let hasResolved = false;

      // Setup a timeout to eventually resolve even if we don't detect success
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          this.log("Login detection timeout reached");
          hasResolved = true;
          resolve();
        }
      }, 120000); // 2 minute timeout

      // Listen for navigation events that might indicate successful login
      this.page.on("framenavigated", async (frame) => {
        if (frame.parentFrame() === null) {
          // Main frame only
          const url = frame.url();
          this.log(`Main frame navigated to: ${url}`);

          // Check if the URL indicates a successful login
          if (
            url.includes("/privat") ||
            url.includes("/dashboard") ||
            url.includes("/overview") ||
            url.includes("/account") ||
            url.includes("/welcome") ||
            !url.includes("/login")
          ) {
            // Wait a bit to make sure the page has loaded
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Check for elements that indicate we're logged in
            const isLoggedIn = await this.page
              ?.evaluate(() => {
                // Look for common elements that appear after login
                const logoutLinks =
                  document.querySelectorAll('a[href*="logout"]');
                const accountElements = document.querySelectorAll(
                  '[class*="account"],[class*="balance"],[class*="overview"]'
                );
                const welcomeElements = document.querySelectorAll(
                  '[class*="welcome"],[class*="greeting"]'
                );

                return (
                  logoutLinks.length > 0 ||
                  accountElements.length > 0 ||
                  welcomeElements.length > 0
                );
              })
              .catch(() => false);

            if (isLoggedIn) {
              this.log(
                "Detected successful login based on page navigation and content"
              );
              clearTimeout(timeout);
              if (!hasResolved) {
                hasResolved = true;
                resolve();
              }
            }
          }
        }
      });

      // Also detect successful login by checking periodically
      const checkLoginInterval = setInterval(async () => {
        if (hasResolved) {
          clearInterval(checkLoginInterval);
          return;
        }

        try {
          const isLoggedIn = await this.page
            ?.evaluate(() => {
              // Same checks as above but run periodically
              const logoutLinks =
                document.querySelectorAll('a[href*="logout"]');
              const accountElements = document.querySelectorAll(
                '[class*="account"],[class*="balance"],[class*="overview"]'
              );
              const welcomeElements = document.querySelectorAll(
                '[class*="welcome"],[class*="greeting"]'
              );

              return (
                logoutLinks.length > 0 ||
                accountElements.length > 0 ||
                welcomeElements.length > 0
              );
            })
            .catch(() => false);

          if (isLoggedIn) {
            this.log("Detected successful login through periodic check");
            clearTimeout(timeout);
            clearInterval(checkLoginInterval);
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          }
        } catch (error) {
          // Ignore errors in check
        }
      }, 5000); // Check every 5 seconds
    });
  }

  /**
   * Handle the BankID authentication flow for Handelsbanken
   */
  private async handleBankIdAuthentication(): Promise<void> {
    // Setup QR token detection
    this.setupQrCodeDetection();

    // Wait for the QR login screen - we look both for the mobile QR and desktop QR options
    this.log("Waiting for BankID QR login screen...");
    try {
      await Promise.race([
        this.page?.waitForSelector(
          'a[data-test-id="QrInitiateMobileDeviceLaunch-QrInitiateMobileDeviceLaunchLinkBtn"]',
          { timeout: 10000 }
        ),
        this.page?.waitForSelector(
          '[data-test-id="QrInitiateOtherDeviceLaunch-QrInitiateOtherDeviceLaunchBtn"]',
          { timeout: 10000 }
        ),
        this.page?.waitForSelector('img[src^="data:image/png;base64"]', {
          timeout: 10000,
        }),
        this.page?.waitForSelector('[class*="qr"],[id*="qr"]', {
          timeout: 10000,
        }),
      ]);
      this.log("Found QR login option screen.");
    } catch (error) {
      this.log(
        "Could not find QR login screen through selectors, but continuing anyway."
      );
    }

    // Wait a moment for any scripts to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Set up login success detection (this runs in parallel)
    const loginPromise = this.setupLoginSuccessDetection();

    // Try to find the QR code with multiple attempts
    const qrStartToken = await this.findQrCodeWithMultipleAttempts();

    if (qrStartToken) {
      // Found the QR token, display it
      this.log(
        `Successfully obtained QR token: ${qrStartToken.substring(0, 10)}...`
      );
      await renderQrToken(qrStartToken);
    } else {
      // Could not find the QR token, inform the user
      this.log("Could not find QR code token automatically.");
      console.log("\nUnable to automatically extract QR code.");
      console.log(
        "Please scan the QR code shown in the browser window with your BankID app."
      );
      console.log(
        "If no QR code is visible, look for a button to show the QR code or try an alternative login method.\n"
      );
    }

    // Wait for the login to complete
    this.log("Waiting for BankID authentication to complete...");
    await loginPromise;
    this.log("BankID authentication completed successfully.");
  }

  /**
   * Setup detection of QR codes through response interception
   */
  private setupQrCodeDetection(): void {
    if (!this.page) return;

    this.log("Setting up QR code detection through response interception");

    // Listen for responses that might contain QR token data
    this.page.on("response", async (response: any) => {
      const url = response.url();

      // Look for common API endpoints that might return QR token data
      if (
        url.includes("/api/qr") ||
        url.includes("/bankid") ||
        url.includes("/auth") ||
        url.includes("/login")
      ) {
        try {
          const contentType = response.headers()["content-type"] || "";

          if (contentType.includes("application/json")) {
            const data = await response.json().catch(() => null);

            if (data) {
              // Recursively search for qrStartToken or qrData in the response
              const findToken = (obj: any): string | null => {
                if (!obj || typeof obj !== "object") return null;

                if (obj.qrStartToken && typeof obj.qrStartToken === "string") {
                  return obj.qrStartToken;
                }

                if (obj.qrData && typeof obj.qrData === "string") {
                  return obj.qrData;
                }

                if (
                  obj.token &&
                  typeof obj.token === "string" &&
                  obj.token.length > 20
                ) {
                  return obj.token;
                }

                for (const key in obj) {
                  if (typeof obj[key] === "object") {
                    const result = findToken(obj[key]);
                    if (result) return result;
                  }
                }

                return null;
              };

              const token = findToken(data);
              if (token) {
                this.log(
                  `Found QR token in API response: ${token.substring(0, 10)}...`
                );
                this.qrStartToken = token;
                // Always render the QR code when found in an API response
                await renderQrToken(token);
              }
            }
          }
        } catch (error) {
          // Ignore errors in response handling
        }
      }
    });
  }

  /**
   * Ensures we find the QR code by trying multiple methods and attempts
   */
  private async findQrCodeWithMultipleAttempts(): Promise<string | null> {
    this.log("Trying to find QR code with multiple attempts...");

    // Try extracting the QR code multiple times with different timings
    const delays = [500, 1000, 2000, 3000, 5000];

    for (let i = 0; i < delays.length; i++) {
      // Try first to get it from intercepted responses
      if (this.qrStartToken) {
        this.log(
          `Found qrStartToken from intercepted responses: ${this.qrStartToken.substring(
            0,
            10
          )}...`
        );
        const token = this.qrStartToken;
        // Always render the QR code when found
        await renderQrToken(token);
        return token;
      }

      // Then try to extract it from the page
      const extractedToken = await this.extractQrCodeFromPage();
      if (extractedToken) {
        this.log(
          `Successfully extracted QR code from page on attempt ${i + 1}`
        );
        // Always render the QR code when found
        await renderQrToken(extractedToken);
        return extractedToken;
      }

      this.log(
        `QR code not found on attempt ${i + 1}, waiting ${
          delays[i]
        }ms before next attempt...`
      );

      if (i < delays.length - 1) {
        // Try clicking any "Show QR code" buttons or alternatives
        await this.page?.evaluate(() => {
          // Find and click any buttons that might reveal the QR code
          const potentialButtons = Array.from(
            document.querySelectorAll('button, a, [role="button"]')
          ).filter((el) => {
            const text = (el.textContent || "").toLowerCase();
            return (
              text.includes("qr") ||
              text.includes("visa qr") ||
              text.includes("bankid") ||
              text.includes("mobil") ||
              text.includes("visa kod")
            );
          });

          if (potentialButtons.length > 0) {
            console.log(
              `Found ${potentialButtons.length} potential QR trigger buttons`
            );
            (potentialButtons[0] as HTMLElement).click();
          }
        });

        // Wait for the specified delay
        await new Promise((resolve) => setTimeout(resolve, delays[i]));
      }
    }

    // If we get here, try one last approach - refresh the page and try again
    this.log("Refreshing page for one final attempt...");
    try {
      await this.page?.reload();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await this.extractQrCodeFromPage();
    } catch (error) {
      this.log(`Error during final QR code extraction attempt: ${error}`);
    }

    return null;
  }
}

/**
 * Prompt for user input in the terminal.
 */
function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Render a QR code in the terminal from the qrStartToken value.
 * Uses qrcode-terminal for reliable terminal rendering.
 */
function renderQrToken(token: string): Promise<void> {
  return new Promise<void>((resolve) => {
    // Clear the terminal completely to remove the old QR code
    // Use different methods for different platforms
    if (process.platform === "win32") {
      // For Windows
      process.stdout.write("\x1Bc");
    } else {
      // For Unix-like systems
      process.stdout.write("\x1B[2J\x1B[0f");
    }

    console.log("=".repeat(50));
    console.log(" HANDELSBANKEN BANKID AUTHENTICATION ");
    console.log("=".repeat(50));

    // Show a timestamp to indicate when this QR code was generated
    const now = new Date();
    const timestamp = now.toLocaleTimeString();

    console.log(`QR Code updated at ${timestamp} - Scan with your BankID app`);
    console.log(
      `Token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`
    );

    // Use qrcode-terminal with small: true for visible QR code characters
    qrcodeTerminal.generate(token, { small: true });

    console.log("\nWaiting for BankID authentication...");
    console.log("The QR code will automatically update if it expires.");
    console.log("=".repeat(50));

    // Resolve immediately after rendering
    resolve();
  });
}
