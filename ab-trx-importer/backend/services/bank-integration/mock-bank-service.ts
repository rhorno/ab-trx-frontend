/**
 * Mock Bank Integration Service
 *
 * POC: Simple mock implementation for testing without hitting real banks.
 * Returns test data that simulates bank integration behavior.
 */

import type {
  BankIntegrationService,
  QRCodeData,
  AuthStatus,
} from "../shared/interfaces.js";
import { BankParams } from "./bank-client.js";
import { Transaction } from "../shared/types.js";
import { generateQrCodeData } from "./banks/handelsbanken/utils.js";

/**
 * Mock Bank Integration Service Implementation
 *
 * Returns predictable test data for development and testing.
 */
export class MockBankIntegrationService implements BankIntegrationService {
  private authStatusCallbacks: Array<(status: AuthStatus) => void> = [];
  private isAuthenticated: boolean = false;
  private mockTransactions: Transaction[] = [];

  /**
   * Initialize mock bank client
   */
  async initialize(bankName: string, params: BankParams): Promise<void> {
    // Generate mock transactions based on bank name
    this.mockTransactions = this.generateMockTransactions();

    // Simulate initialization delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Start authentication and return mock QR code
   */
  async authenticate(): Promise<QRCodeData> {
    // Simulate QR code generation delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Generate mock QR code token
    const mockToken = "MOCK_QR_TOKEN_" + Date.now();
    const qrData = generateQrCodeData(mockToken);

    // Notify that QR code is available
    this.notifyAuthStatus({
      status: "pending",
      message: "Mock QR code available - scan with BankID app",
      timestamp: new Date().toISOString(),
      qrCode: qrData,
    });

    return qrData;
  }

  /**
   * Register callback for authentication status updates
   */
  onAuthStatus(callback: (status: AuthStatus) => void): void {
    this.authStatusCallbacks.push(callback);
  }

  /**
   * Notify all registered callbacks of auth status change
   */
  private notifyAuthStatus(status: AuthStatus): void {
    this.authStatusCallbacks.forEach((callback) => callback(status));
  }

  /**
   * Fetch mock transactions
   */
  async fetchTransactions(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    // Simulate authentication delay
    if (!this.isAuthenticated) {
      this.notifyAuthStatus({
        status: "pending",
        message: "Authenticating...",
        timestamp: new Date().toISOString(),
      });

      // Simulate authentication process
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.notifyAuthStatus({
        status: "authenticated",
        message: "Authentication successful",
        timestamp: new Date().toISOString(),
      });

      this.isAuthenticated = true;
    }

    // Simulate fetching delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Filter transactions by date range
    const filtered = this.mockTransactions.filter((tx) => {
      return tx.date >= startDate && tx.date <= endDate;
    });

    return filtered;
  }

  /**
   * Cleanup mock resources
   */
  async cleanup(): Promise<void> {
    this.authStatusCallbacks = [];
    this.isAuthenticated = false;
    this.mockTransactions = [];
  }

  /**
   * Generate mock transactions for testing
   */
  private generateMockTransactions(): Transaction[] {
    const transactions: Transaction[] = [];
    const today = new Date();

    // Generate transactions for the last 30 days
    for (let i = 0; i < 10; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const amount = Math.floor(Math.random() * 50000) - 25000; // Random amount in cents
      const payees = [
        "ICA Supermarket",
        "Systembolaget",
        "Spotify",
        "Netflix",
        "Salary",
        "Restaurant",
        "Gas Station",
        "Pharmacy",
      ];
      const payee = payees[Math.floor(Math.random() * payees.length)];

      transactions.push({
        date: date.toISOString().split("T")[0],
        amount: amount,
        payee_name: payee,
        imported_id: `MOCK_${date.getTime()}_${i}`,
        notes: `Mock transaction ${i + 1}`,
      });
    }

    return transactions;
  }
}

// Export singleton instance
export const mockBankIntegrationService = new MockBankIntegrationService();
