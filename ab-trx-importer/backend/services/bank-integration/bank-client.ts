import { Transaction } from "../shared/types.js";
import { getLogger, Logger } from "../shared/logger.js";

/**
 * Type for bank-specific parameters
 */
export type BankParams = Record<string, string | number | boolean>;

/**
 * Interface for bank-specific deduplication configuration
 */
export interface DeduplicationConfig {
  enabled: boolean;
  overlapDays: number;
}

/**
 * Result of deduplication process
 */
export interface DeduplicationResult {
  transactions: Transaction[];
  replacedCount: number;
  skippedCount: number;
  errors: string[];
}

/**
 * Abstract base class for all bank integrations.
 * Each bank must implement this interface to fetch transactions.
 */
export abstract class BankClient {
  protected logger: Logger;
  protected verbose: boolean;
  protected params: BankParams;
  protected actualBudgetConnector?: any; // Will be injected by the core system

  /**
   * Create a new bank client with logging capabilities
   * @param bankName - The name of the bank for logging purposes
   * @param verbose - Whether to enable verbose mode
   * @param params - Bank-specific parameters
   */
  constructor(
    bankName: string = "Unknown",
    verbose: boolean = false,
    params: BankParams = {}
  ) {
    this.logger = getLogger(bankName);
    this.verbose = verbose;
    this.params = params;
  }

  /**
   * Set the Actual Budget connector for deduplication purposes
   * @param connector - The Actual Budget connector instance
   */
  setActualBudgetConnector(connector: any): void {
    this.actualBudgetConnector = connector;
  }

  /**
   * Get deduplication configuration for this bank
   * Override in bank implementations to enable deduplication
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
        enabled: dedupConfig.enabled || false,
        overlapDays: dedupConfig.overlapDays || 1,
      };
    }

    return {
      enabled: false,
      overlapDays: 1,
    };
  }

  /**
   * Get existing transactions from Actual Budget for deduplication
   * @param startDate - Start date for query
   * @param endDate - End date for query
   * @returns Promise resolving to existing transactions
   */
  protected async getExistingTransactions(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    if (!this.actualBudgetConnector) {
      this.log("No Actual Budget connector available for deduplication");
      return [];
    }

    try {
      // Use the connector's internal method to get transactions
      await this.actualBudgetConnector.initApi();
      const accountId = this.actualBudgetConnector.accountIdForDeduplication;
      if (!accountId) {
        this.log("No account ID available for deduplication");
        return [];
      }

      const transactions =
        await this.actualBudgetConnector.actualApi.getTransactions(
          accountId,
          startDate,
          endDate
        );
      return transactions || [];
    } catch (error) {
      this.log(
        `Failed to get existing transactions for deduplication: ${error}`
      );
      return [];
    }
  }

  /**
   * Bank-specific deduplication logic
   * Override in bank implementations to provide custom deduplication
   * @param newTransactions - New transactions from bank
   * @param existingTransactions - Existing transactions from Actual Budget
   * @returns Deduplication result
   */
  protected async deduplicateTransactions(
    newTransactions: Transaction[],
    existingTransactions: Transaction[]
  ): Promise<DeduplicationResult> {
    // Default implementation: no deduplication
    return {
      transactions: newTransactions,
      replacedCount: 0,
      skippedCount: 0,
      errors: [],
    };
  }

  /**
   * Fetch transactions for the given date range (inclusive).
   * This method handles deduplication if enabled for the bank.
   * @param startDate - ISO 8601 date string (YYYY-MM-DD)
   * @param endDate - ISO 8601 date string (YYYY-MM-DD)
   * @returns Promise resolving to an array of normalized transactions
   */
  async fetchTransactions(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    // Fetch transactions from bank (implemented by subclasses)
    const bankTransactions = await this.fetchTransactionsFromBank(
      startDate,
      endDate
    );

    // Check if deduplication is enabled
    const dedupConfig = this.getDeduplicationConfig();
    if (!dedupConfig.enabled) {
      return bankTransactions;
    }

    try {
      // Get existing transactions for deduplication
      const overlapStartDate = this.subtractDays(
        startDate,
        dedupConfig.overlapDays
      );
      const existingTransactions = await this.getExistingTransactions(
        overlapStartDate,
        endDate
      );

      // Apply bank-specific deduplication
      const result = await this.deduplicateTransactions(
        bankTransactions,
        existingTransactions
      );

      // Log deduplication results
      if (result.replacedCount > 0 || result.skippedCount > 0) {
        this.log(
          `Deduplication: ${result.replacedCount} replaced, ${result.skippedCount} skipped`
        );
      }

      if (result.errors.length > 0) {
        this.log(`Deduplication errors: ${result.errors.join(", ")}`);
      }

      return result.transactions;
    } catch (error) {
      this.log(
        `Deduplication failed, continuing with all transactions: ${error}`
      );
      return bankTransactions;
    }
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
    // This would be implemented by subclasses to track stats
    return { replaced: 0, skipped: 0, errors: [] };
  }

  /**
   * Fetch transactions from the bank (implemented by subclasses)
   * @param startDate - ISO 8601 date string (YYYY-MM-DD)
   * @param endDate - ISO 8601 date string (YYYY-MM-DD)
   * @returns Promise resolving to an array of normalized transactions
   */
  protected abstract fetchTransactionsFromBank(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]>;

  /**
   * Subtract days from a date string
   * @param dateString - ISO 8601 date string (YYYY-MM-DD)
   * @param days - Number of days to subtract
   * @returns New date string
   */
  protected subtractDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() - days);
    return date.toISOString().split("T")[0];
  }

  /**
   * Log a debug message
   * @param message - The message to log
   */
  protected log(message: string): void {
    this.logger.debug(message);
  }
}
