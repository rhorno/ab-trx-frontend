/**
 * Mock Actual Budget Service
 *
 * POC: Simple mock implementation for testing without Actual Budget instance.
 * Returns test data that simulates Actual Budget behavior.
 */

import type {
  ActualBudgetService,
  ActualBudgetConfig,
  ImportResult,
} from "../shared/interfaces.js";
import { Transaction } from "../shared/types.js";

/**
 * Mock Actual Budget Service Implementation
 *
 * Returns predictable test data for development and testing.
 */
export class MockActualBudgetService implements ActualBudgetService {
  private isConnected: boolean = false;
  private mockLatestDate: string | null = null;
  private mockAccounts: Array<{
    id: string;
    name: string;
    closed: boolean;
    offbudget: boolean;
  }> = [];

  /**
   * Initialize mock connection
   */
  async connect(config: ActualBudgetConfig, verbose?: boolean): Promise<void> {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    this.isConnected = true;

    // Generate mock accounts
    this.mockAccounts = [
      {
        id: config.accountId || "mock-account-1",
        name: "Mock Account",
        closed: false,
        offbudget: false,
      },
      {
        id: "mock-account-2",
        name: "Mock Savings",
        closed: false,
        offbudget: false,
      },
    ];

    // Set mock latest transaction date (30 days ago)
    const date = new Date();
    date.setDate(date.getDate() - 30);
    this.mockLatestDate = date.toISOString().split("T")[0];
  }

  /**
   * Get mock smart start date
   */
  async getSmartStartDate(accountId?: string): Promise<string | null> {
    if (!this.isConnected) {
      throw new Error("Service not connected. Call connect() first.");
    }

    // Simulate query delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Return mock date (1 day before latest transaction for safety margin)
    if (this.mockLatestDate) {
      const date = new Date(this.mockLatestDate);
      date.setDate(date.getDate() - 1);
      return date.toISOString().split("T")[0];
    }

    return null;
  }

  /**
   * Mock import transactions
   */
  async importTransactions(
    transactions: Transaction[],
    dryRun: boolean = false
  ): Promise<ImportResult> {
    if (!this.isConnected) {
      throw new Error("Service not connected. Call connect() first.");
    }

    // Simulate import delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (dryRun) {
      return {
        added: transactions.length,
        skipped: 0,
        errors: [],
      };
    }

    // Simulate some duplicates
    const skipped = Math.floor(transactions.length * 0.1); // 10% duplicates
    const added = transactions.length - skipped;

    return {
      added: added,
      skipped: skipped,
      errors: [],
    };
  }

  /**
   * List mock accounts
   */
  async listAccounts(): Promise<
    { id: string; name: string; closed: boolean; offbudget: boolean }[]
  > {
    if (!this.isConnected) {
      throw new Error("Service not connected. Call connect() first.");
    }

    // Simulate query delay
    await new Promise((resolve) => setTimeout(resolve, 200));

    return [...this.mockAccounts];
  }

  /**
   * Mock shutdown
   */
  async shutdown(): Promise<void> {
    this.isConnected = false;
    this.mockAccounts = [];
    this.mockLatestDate = null;
  }
}

// Export singleton instance
export const mockActualBudgetService = new MockActualBudgetService();
