import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getLogger, Logger } from "../shared/logger.js";
import { Transaction, validateAndCleanTransactions } from "../shared/types.js";

// Import the Actual Budget API with its types
import * as actualApi from "@actual-app/api";
import type { ImportTransactionEntity } from "@actual-app/api/@types/loot-core/src/types/models/import-transaction.js";

/**
 * Import result interface
 */
export interface ImportResult {
  added: number;
  skipped: number;
  errors?: any[];
}

/**
 * Interface for importing transactions into Actual Budget.
 */
export interface ActualBudgetConnector {
  /**
   * Import transaction objects directly into Actual Budget.
   * @param transactions - Array of transaction objects
   * @param dryRun - If true, validate but don't import
   */
  importTransactions(
    transactions: Transaction[],
    dryRun?: boolean
  ): Promise<ImportResult>;

  /**
   * Get the latest transaction date from the account.
   * Returns the date minus 1 day safety margin, or null if no transactions exist.
   */
  // TODO: This will create duplicateds when we import transactions with 1 day safety margin. We must make sure that they are identified as duplicates. Actual budget has support for checking for duplicates, but we must research on how toimplement it so that it actually works.
  getLatestTransactionDate(): Promise<string | null>;
}

/**
 * Configuration interface for Actual Budget connector
 */
export interface ActualBudgetConfig {
  serverUrl: string;
  password?: string;
  syncId: string;
  accountId: string;
  encryptionKey?: string;
}

/**
 * Actual Budget connector implementation that uses the Actual Budget API.
 */
export class ApiBasedActualBudgetConnector implements ActualBudgetConnector {
  private serverURL: string;
  private serverPassword: string;
  private syncId: string;
  private encryptionKey?: string;
  private accountId?: string;
  private logger: Logger;
  private verbose: boolean;
  private apiInitialized: boolean = false;
  private cacheDir: string;

  /**
   * Create a new API-based connector.
   */
  constructor(config: ActualBudgetConfig, verbose = false) {
    this.serverURL = config.serverUrl;
    this.serverPassword = config.password || "";
    this.syncId = config.syncId;
    this.encryptionKey = config.encryptionKey;
    this.accountId = config.accountId;
    this.verbose = verbose;
    this.logger = getLogger("ActualBudget.API");
    this.cacheDir = path.join(os.tmpdir(), "ab-trx-importer-cache");
  }

  /**
   * Get the actual API instance for bank deduplication
   * @returns The actual API instance
   */
  get actualApi(): any {
    return actualApi;
  }

  /**
   * Get the account ID for bank deduplication
   * @returns The account ID
   */
  get accountIdForDeduplication(): string | undefined {
    return this.accountId;
  }

  /**
   * Clear the cache directory to force a fresh download.
   * This is useful when migration issues occur.
   */
  private clearCache(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        this.log("Clearing corrupted cache directory...");
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        this.log("Cache directory cleared successfully");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Warning: Could not clear cache directory: ${errorMessage}`
      );
    }
  }

  /**
   * Initialize the Actual Budget API.
   */
  private async initApi(): Promise<void> {
    if (this.apiInitialized) {
      return;
    }

    try {
      this.log("Initializing Actual Budget API connection...");

      // Ensure cache directory exists
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      await actualApi.init({
        serverURL: this.serverURL,
        password: this.serverPassword,
        dataDir: this.cacheDir,
      });
      this.apiInitialized = true;
      this.log("Actual Budget API initialized successfully");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to initialize Actual Budget API: ${errorMessage}`
      );
      throw new Error(`Failed to connect to Actual Budget: ${errorMessage}`);
    }
  }

  private log(message: string): void {
    this.logger.debug(message);
  }

  /**
   * Check if an error is a server error that might be resolved by updating @actual-app/api
   */
  private isServerError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorString =
      error instanceof Error ? error.toString() : String(error);

    const serverErrorPatterns = [
      "out-of-sync-migrations",
      "Database is out of sync",
      "migration",
      "file-has-reset",
      "version mismatch",
      "incompatible version",
      "schema mismatch",
    ];

    return serverErrorPatterns.some(
      (pattern) =>
        errorMessage.includes(pattern) || errorString.includes(pattern)
    );
  }

  /**
   * Display helpful message about updating @actual-app/api when server errors occur
   */
  private showUpdateMessage(): void {
    this.logger.error("⚠️  Server Error Detected");
    this.logger.error(
      "💡 This error is most likely caused by a version mismatch."
    );
    this.logger.error(
      "   Your @actual-app/api version may be outdated compared to"
    );
    this.logger.error("   your Actual Budget server version.");
    this.logger.error("📋 To fix this:");
    this.logger.error("   1. Update @actual-app/api to the latest version:");
    this.logger.error("      npm install @actual-app/api@latest");
    this.logger.error("   2. Then run the import command again");
  }

  /**
   * Convert our Transaction interface to ImportTransactionEntity for the API
   */
  private convertToImportTransactionEntity(
    transaction: Transaction,
    accountId: string
  ): ImportTransactionEntity {
    const entity: ImportTransactionEntity = {
      account: accountId,
      date: transaction.date,
    };

    // Add optional fields only if they exist
    if (transaction.amount !== undefined) entity.amount = transaction.amount;
    if (transaction.payee !== undefined) entity.payee = transaction.payee;
    if (transaction.payee_name !== undefined)
      entity.payee_name = transaction.payee_name;
    if (transaction.imported_payee !== undefined)
      entity.imported_payee = transaction.imported_payee;
    if (transaction.category !== undefined)
      entity.category = transaction.category;
    if (transaction.notes !== undefined) entity.notes = transaction.notes;
    if (transaction.imported_id !== undefined)
      entity.imported_id = transaction.imported_id;
    if (transaction.transfer_id !== undefined)
      entity.transfer_id = transaction.transfer_id;
    if (transaction.cleared !== undefined) entity.cleared = transaction.cleared;

    // Convert subtransactions with proper type validation
    if (transaction.subtransactions && transaction.subtransactions.length > 0) {
      entity.subtransactions = transaction.subtransactions
        .filter((sub) => sub.amount !== undefined) // Only include subtransactions with amount
        .map((sub) => ({
          amount: sub.amount!,
          ...(sub.category && { category: sub.category }),
          ...(sub.notes && { notes: sub.notes }),
        }));
    }

    return entity;
  }

  /**
   * Gracefully shutdown the Actual Budget API connection.
   */
  private async shutdownApi(): Promise<void> {
    if (!this.apiInitialized) {
      return;
    }

    try {
      await actualApi.shutdown();
      this.apiInitialized = false;
      this.log("Connection closed successfully");
    } catch (shutdownError: any) {
      // Handle known Actual Budget API shutdown issues
      if (
        shutdownError.message?.includes("timestamp") ||
        shutdownError.message?.includes("_fullSync") ||
        shutdownError.message?.includes("Cannot read properties of undefined")
      ) {
        this.log(
          "Connection closed successfully (API cleanup completed despite minor sync issues)"
        );
        this.apiInitialized = false;
      } else {
        this.logger.error("Error shutting down Actual Budget API");
        throw shutdownError;
      }
    }
  }

  /**
   * Download the budget if not already downloaded, with automatic retry for migration issues.
   */
  private async ensureBudgetDownloaded(): Promise<void> {
    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        this.log(
          `Downloading budget with sync ID: ${this.syncId}${
            attempt > 0 ? ` (retry ${attempt})` : ""
          }`
        );
        if (this.encryptionKey) {
          await actualApi.downloadBudget(this.syncId, {
            password: this.encryptionKey,
          });
        } else {
          await actualApi.downloadBudget(this.syncId);
        }
        this.log("Budget downloaded successfully");
        return;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Check if this is a migration-related or file-reset error
        const errorString =
          error instanceof Error ? error.toString() : String(error);
        if (
          errorMessage.includes("out-of-sync-migrations") ||
          errorMessage.includes("Database is out of sync with migrations") ||
          errorMessage.includes("Error: out-of-sync-migrations") ||
          errorMessage.includes("migration") ||
          errorMessage.includes("file-has-reset") ||
          errorString.includes("out-of-sync-migrations") ||
          errorString.includes("file-has-reset")
        ) {
          if (attempt === 0) {
            const errorType =
              errorMessage.includes("file-has-reset") ||
              errorString.includes("file-has-reset")
                ? "Budget file reset"
                : "Migration issue";
            this.logger.error(
              `${errorType} detected, clearing cache and retrying...`
            );
            this.logger.info(
              `⚠️  ${errorType} detected. Clearing cache and retrying...`
            );

            // Shutdown API if initialized, clear cache, and retry
            if (this.apiInitialized) {
              try {
                await actualApi.shutdown();
                this.apiInitialized = false;
              } catch {
                // Ignore shutdown errors during cleanup
                this.apiInitialized = false;
              }
            }

            this.clearCache();

            // Re-initialize API with fresh cache
            await this.initApi();

            attempt++;
            continue;
          } else {
            // Second attempt failed, show update message if it's a server error
            if (this.isServerError(error)) {
              this.showUpdateMessage();
            }

            const errorType =
              errorMessage.includes("file-has-reset") ||
              errorString.includes("file-has-reset")
                ? "Budget file reset"
                : "Migration issue";
            this.logger.error(
              `${errorType} persists after cache clear: ${errorMessage}`
            );
            throw new Error(
              `${errorType} could not be resolved automatically. ${
                this.isServerError(error)
                  ? "See update instructions above."
                  : "Please check your Actual Budget server status and try again."
              } Error: ${errorMessage}`
            );
          }
        } else {
          // Non-migration error - check if it's a server error
          if (this.isServerError(error)) {
            this.showUpdateMessage();
          }

          this.logger.error(`Failed to download budget: ${errorMessage}`);
          throw new Error(
            `Failed to download budget: ${errorMessage}${
              this.isServerError(error) ? " See update instructions above." : ""
            }`
          );
        }
      }
    }
  }

  /**
   * Validate that the account exists in Actual Budget.
   */
  private async validateAccount(): Promise<void> {
    if (!this.accountId) {
      throw new Error("Account ID is required for account validation");
    }

    try {
      this.log("Validating account...");
      await this.ensureBudgetDownloaded();

      const accounts = await actualApi.getAccounts();
      const account = accounts.find((a) => a.id === this.accountId);

      if (!account) {
        throw new Error(
          `Account with ID ${this.accountId} not found in budget`
        );
      }

      this.log(`Account validated: ${account.name} (${account.id})`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Show update message if it's a server error
      if (this.isServerError(error)) {
        this.showUpdateMessage();
      }

      this.logger.error(`Account validation failed: ${errorMessage}`);
      throw new Error(
        `Account validation failed: ${errorMessage}${
          this.isServerError(error) ? " See update instructions above." : ""
        }`
      );
    }
  }

  /**
   * List all available budgets on the server.
   */
  async listBudgets(): Promise<{ id: string; name: string }[]> {
    try {
      await this.initApi();

      this.log("Fetching available budgets...");
      const budgets = await actualApi.getBudgets();
      this.log(`Found ${budgets.length} budgets`);

      return budgets
        .map((budget) => ({
          id: budget.cloudFileId ?? budget.id ?? "",
          name: budget.name,
        }))
        .filter((budget) => budget.id !== "");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list budgets: ${errorMessage}`);
      throw new Error(`Failed to list budgets: ${errorMessage}`);
    }
  }

  /**
   * List all accounts in the configured budget.
   */
  async listAccounts(): Promise<
    { id: string; name: string; closed: boolean; offbudget: boolean }[]
  > {
    try {
      await this.initApi();
      await this.ensureBudgetDownloaded();

      this.log("Fetching accounts...");
      const accounts = await actualApi.getAccounts();
      this.log(`Found ${accounts.length} accounts`);

      return accounts.map((account) => ({
        id: account.id,
        name: account.name,
        closed: account.closed || false,
        offbudget: account.offbudget || false,
      }));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to list accounts: ${errorMessage}`);
      throw new Error(`Failed to list accounts: ${errorMessage}`);
    } finally {
      await this.shutdownApi();
    }
  }

  /**
   * Import transaction objects directly into Actual Budget.
   * @param transactions - Array of transaction objects
   * @param dryRun - If true, validate but don't import (returns preview)
   */
  async importTransactions(
    transactions: Transaction[],
    dryRun: boolean = false
  ): Promise<ImportResult> {
    if (!this.accountId) {
      throw new Error("Account ID is required for transaction import");
    }

    if (!transactions || transactions.length === 0) {
      throw new Error("No transaction data provided for import");
    }

    try {
      // Initialize API and validate account
      await this.initApi();
      await this.validateAccount();

      // Validate and clean transactions to ensure only supported fields
      this.log("Validating and cleaning transactions...");
      const cleanTransactions = validateAndCleanTransactions(transactions);
      this.log(
        `Validated ${cleanTransactions.length} transactions (removed any unsupported fields)`
      );

      // Convert to ImportTransactionEntity format required by the API
      const importEntities = cleanTransactions.map((tx) =>
        this.convertToImportTransactionEntity(tx, this.accountId!)
      );

      // Handle dry-run mode
      if (dryRun) {
        this.log("DRY RUN: Validating transactions (not importing)...");
        this.logger.info(
          `DRY RUN: Would import ${importEntities.length} transactions`
        );
        // Return preview result without actually importing
        return {
          added: importEntities.length,
          skipped: 0,
          errors: [],
        };
      }

      // Debug: Log transaction objects
      this.log(`Importing ${importEntities.length} transactions...`);
      if (this.verbose) {
        this.log("Transaction preview (first 3):");
        importEntities.slice(0, 3).forEach((tx, index) => {
          this.log(
            `  Transaction ${index + 1}: ${tx.date} - ${tx.payee_name} - ${
              tx.amount
            }`
          );
        });
      }

      // Import clean transactions directly using the API
      this.log("Importing transactions...");
      const result = await actualApi.importTransactions(
        this.accountId,
        importEntities
      );

      this.logger.info("Import completed successfully");
      this.logger.info(`Added: ${result.added} transactions`);
      this.logger.info(
        `Skipped: ${
          result.errors ? result.errors.length : 0
        } transactions (duplicates)`
      );

      // Return import result
      return {
        added: result.added,
        skipped: result.errors ? result.errors.length : 0,
        errors: result.errors,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Transaction import failed: ${errorMessage}`);
      throw new Error(`Transaction import failed: ${errorMessage}`);
    } finally {
      await this.shutdownApi();
    }
  }

  /**
   * Get smart start date for fetching new transactions.
   * This method provides a user-friendly interface for smart date detection.
   * Returns the latest transaction date minus 1 day safety margin.
   * Throws an error with helpful message if no transactions are found.
   */
  async getSmartStartDate(): Promise<string> {
    const latestDate = await this.getLatestTransactionDate();

    if (latestDate) {
      this.log(
        `Smart date detection found latest transaction, using start date: ${latestDate}`
      );
      return latestDate;
    } else {
      // No transactions found - provide clear error message
      throw new Error(
        "No transactions found in your Actual Budget account. " +
          "Please create a starting balance transaction first, then run the import again. " +
          "You can create a starting balance by adding a transaction manually in Actual Budget."
      );
    }
  }

  /**
   * Get the latest transaction date from the account with incremental querying.
   * Uses an incremental approach: starts with 10 days back, then 20, 30, etc.
   * If no transactions found within 60 days, queries all transactions.
   * Returns the date minus 1 day safety margin, or null if no transactions exist.
   */
  async getLatestTransactionDate(): Promise<string | null> {
    if (!this.accountId) {
      throw new Error("Account ID is required for transaction date query");
    }

    try {
      await this.initApi();
      await this.validateAccount();

      this.log(
        "Searching for latest transaction date using incremental approach..."
      );

      // Try incremental approach: 10, 20, 30, 40, 50, 60 days back
      for (let daysBack = 10; daysBack <= 60; daysBack += 10) {
        this.log(`Checking transactions from ${daysBack} days back...`);

        const cutoffDate = this.subtractDays(new Date(), daysBack);
        const cutoffDateString = this.formatDate(cutoffDate);
        const todayString = this.formatDate(new Date());
        const transactions = await actualApi.getTransactions(
          this.accountId,
          cutoffDateString,
          todayString
        );

        if (transactions && transactions.length > 0) {
          const latestDate = this.findLatestTransactionDate(transactions);
          if (latestDate) {
            const safeDate = this.subtractDays(new Date(latestDate), 1);
            const safeDateString = this.formatDate(safeDate);
            this.log(
              `Found latest transaction on ${latestDate}, using safe start date: ${safeDateString}`
            );
            return safeDateString;
          }
        }
      }

      // If we get here, no transactions found in 60 days - try all transactions
      this.log(
        "No transactions found in last 60 days, querying all transactions..."
      );
      // For all transactions, query from a very old date to today
      const veryOldDate = this.formatDate(
        this.subtractDays(new Date(), 365 * 5)
      ); // 5 years back
      const todayString = this.formatDate(new Date());
      const allTransactions = await actualApi.getTransactions(
        this.accountId,
        veryOldDate,
        todayString
      );

      if (allTransactions && allTransactions.length > 0) {
        const latestDate = this.findLatestTransactionDate(allTransactions);
        if (latestDate) {
          const safeDate = this.subtractDays(new Date(latestDate), 1);
          const safeDateString = this.formatDate(safeDate);
          this.log(
            `Found latest transaction on ${latestDate}, using safe start date: ${safeDateString}`
          );
          return safeDateString;
        }
      }

      // No transactions found at all
      this.log("No transactions found in account");
      return null;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Show update message if it's a server error
      if (this.isServerError(error)) {
        this.showUpdateMessage();
      }

      this.logger.error(
        `Failed to query latest transaction date: ${errorMessage}`
      );
      throw new Error(
        `Failed to query latest transaction date: ${errorMessage}${
          this.isServerError(error) ? " See update instructions above." : ""
        }`
      );
    } finally {
      await this.shutdownApi();
    }
  }

  /**
   * Find the latest transaction date from an array of transactions.
   * @param transactions - Array of transactions
   * @returns Latest date string in YYYY-MM-DD format, or null if no valid dates
   */
  private findLatestTransactionDate(transactions: any[]): string | null {
    if (!transactions || transactions.length === 0) {
      return null;
    }

    let latestDate: Date | null = null;

    for (const transaction of transactions) {
      if (transaction.date) {
        const transactionDate = new Date(transaction.date);
        if (!isNaN(transactionDate.getTime())) {
          if (!latestDate || transactionDate > latestDate) {
            latestDate = transactionDate;
          }
        }
      }
    }

    return latestDate ? this.formatDate(latestDate) : null;
  }

  /**
   * Subtract days from a date and return new Date object.
   * @param date - Source date
   * @param days - Number of days to subtract
   * @returns New Date object
   */
  private subtractDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }

  /**
   * Format a Date object to YYYY-MM-DD string.
   * @param date - Date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  /**
   * Public method to shutdown the API connection.
   * Useful for cleanup after list operations.
   */
  async shutdown(): Promise<void> {
    await this.shutdownApi();
  }
}
