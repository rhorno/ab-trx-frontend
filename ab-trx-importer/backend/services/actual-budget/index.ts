/**
 * Actual Budget Service
 * Entry point for Actual Budget service
 *
 * This service handles all interactions with the Actual Budget instance.
 */

import {
  ApiBasedActualBudgetConnector,
  ActualBudgetConfig,
  ImportResult,
} from "./connector.js";
import { Transaction } from "../shared/types.js";
import type { ActualBudgetService as IActualBudgetService } from "../shared/interfaces.js";

/**
 * Actual Budget Service Implementation
 */
export class ActualBudgetService implements IActualBudgetService {
  private connector: ApiBasedActualBudgetConnector | null = null;
  private verbose: boolean = false;

  /**
   * Initialize connection to Actual Budget
   * @param config - Actual Budget configuration
   * @param verbose - Enable verbose logging
   */
  async connect(
    config: ActualBudgetConfig,
    verbose: boolean = false
  ): Promise<void> {
    this.verbose = verbose;
    this.connector = new ApiBasedActualBudgetConnector(config, verbose);
    // Connection is lazy - initialized on first operation
  }

  /**
   * Get smart start date for fetching new transactions
   * @param accountId - Account ID (optional, uses connector's accountId if not provided)
   */
  async getSmartStartDate(accountId?: string): Promise<string | null> {
    if (!this.connector) {
      throw new Error("Service not connected. Call connect() first.");
    }
    return await this.connector.getSmartStartDate();
  }

  /**
   * Import transactions into Actual Budget
   * @param transactions - Array of transactions to import
   * @param dryRun - If true, validate but don't import
   */
  async importTransactions(
    transactions: Transaction[],
    dryRun: boolean = false
  ): Promise<ImportResult> {
    if (!this.connector) {
      throw new Error("Service not connected. Call connect() first.");
    }
    return await this.connector.importTransactions(transactions, dryRun);
  }

  /**
   * List all available accounts in the budget
   */
  async listAccounts(): Promise<
    { id: string; name: string; closed: boolean; offbudget: boolean }[]
  > {
    if (!this.connector) {
      throw new Error("Service not connected. Call connect() first.");
    }
    return await this.connector.listAccounts();
  }

  /**
   * Shutdown the connection and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.connector) {
      await this.connector.shutdown();
      this.connector = null;
    }
  }
}

// Export singleton instance
export const actualBudgetService = new ActualBudgetService();

// Export types
export type { ActualBudgetConfig, ImportResult };
export type { Transaction } from "../shared/types.js";
