/**
 * Bank Integration Service
 * Entry point for bank integration service
 *
 * This service handles all bank-specific operations including
 * authentication and transaction fetching.
 *
 * POC Implementation: Minimal wrapper around existing bank client code.
 * For POC, authentication is integrated into fetchTransactions flow.
 */

import { banks, BankDefinition } from "./registry.js";
import { BankParams } from "./bank-client.js";
import { Transaction } from "../shared/types.js";
import type {
  BankIntegrationService,
  QRCodeData,
  AuthStatus,
} from "../shared/interfaces.js";
import { generateQrCodeData } from "./banks/handelsbanken/utils.js";

/**
 * Bank Integration Service Implementation
 *
 * Minimal POC implementation that wraps existing bank client code.
 * Authentication happens as part of fetchTransactions for simplicity.
 */
export class BankIntegrationServiceImpl implements BankIntegrationService {
  private bankClient: any = null;
  private bankName: string = "";
  private authStatusCallbacks: Array<(status: AuthStatus) => void> = [];
  private currentQrToken: string | null = null;
  private currentAutoStartToken: string | null = null;
  private qrCodePromise: {
    resolve: (value: QRCodeData) => void;
    reject: (error: Error) => void;
  } | null = null;

  /**
   * Initialize bank client based on bank name and parameters
   */
  async initialize(bankName: string, params: BankParams): Promise<void> {
    this.bankName = bankName;

    const bankDef = banks.find((b: BankDefinition) => b.name === bankName);
    if (!bankDef) {
      throw new Error(`Bank integration not found: ${bankName}`);
    }

    // For POC, handle handelsbanken directly
    if (bankName === "handelsbanken") {
      const HandelsbankenClient = (
        await import("./banks/handelsbanken/index.js")
      ).default;
      this.bankClient = new HandelsbankenClient(false, params);
    } else {
      throw new Error(`Bank ${bankName} not yet implemented in service layer`);
    }
  }

  /**
   * Start authentication and return QR code data
   *
   * POC: In current implementation, authentication is part of fetchTransactions.
   * This method waits for QR code to be available during the fetch flow.
   */
  async authenticate(): Promise<QRCodeData> {
    if (!this.bankClient) {
      throw new Error("Bank client not initialized. Call initialize() first.");
    }

    // If QR token already available, return it
    if (this.currentQrToken) {
      return generateQrCodeData(this.currentQrToken);
    }

    // Wait for QR code to be set (will be set during fetchTransactions)
    return new Promise<QRCodeData>((resolve, reject) => {
      this.qrCodePromise = { resolve, reject };
      // Timeout after 30 seconds
      const currentPromise = this.qrCodePromise;
      setTimeout(() => {
        if (this.qrCodePromise === currentPromise) {
          this.qrCodePromise = null;
          reject(new Error("QR code timeout - authentication not started"));
        }
      }, 30000);
    });
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
   * Set QR token (called internally when QR code is detected)
   * POC: This is called by the bank client when QR code is available
   */
  setQrToken(token: string): void {
    this.currentQrToken = token;
    const qrData = generateQrCodeData(token);

    // Resolve any pending authenticate() calls
    if (this.qrCodePromise) {
      this.qrCodePromise.resolve(qrData);
      this.qrCodePromise = null;
    }

    // Notify callbacks with QR code data
    // Include QR code data in the status for API layer to stream
    this.notifyAuthStatus({
      status: "pending",
      message: "QR code available - scan with BankID app",
      timestamp: new Date().toISOString(),
      qrCode: qrData, // Include QR code data in status
    });
  }

  /**
   * Set auto-start token (called internally when app-to-app token is detected)
   * POC: This is called by the bank client when autoStartToken is available
   * @param token - The autoStartToken from BankID
   * @param sessionId - Optional session ID for auth callback tracking
   */
  setAutoStartToken(token: string, sessionId?: string | null): void {
    this.currentAutoStartToken = token;

    // Notify callbacks with auto-start token
    // Include autoStartToken and sessionId in the status for API layer to stream
    const status = {
      status: "pending",
      message: "BankID app-to-app token available",
      timestamp: new Date().toISOString(),
      autoStartToken: token, // Include autoStartToken in status
      sessionId: sessionId || undefined, // Include sessionId if provided
    };
    this.notifyAuthStatus(status);
  }

  /**
   * Notify authentication error (called internally when QR expires or auth fails)
   * POC: This is called by the bank client when authentication encounters an error
   */
  notifyAuthError(message: string): void {
    this.notifyAuthStatus({
      status: "expired",
      message: message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current auto-start token (for testing/debugging)
   */
  getAutoStartToken(): string | null {
    return this.currentAutoStartToken;
  }

  /**
   * Fetch transactions from the bank
   *
   * POC: This wraps the existing bank client's fetchTransactions method.
   * Authentication happens as part of this flow. QR codes are exposed via
   * setQrToken() which is called by the bank client during authentication.
   */
  async fetchTransactions(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    if (!this.bankClient) {
      throw new Error("Bank client not initialized. Call initialize() first.");
    }

    // Notify that we're starting
    this.notifyAuthStatus({
      status: "pending",
      message: "Starting authentication...",
      timestamp: new Date().toISOString(),
    });

    try {
      // POC: Inject service reference so bank client can notify us of QR codes
      // This is a minimal change - we'll add a method to set QR token
      if (this.bankClient.setServiceRef) {
        this.bankClient.setServiceRef(this);
      }

      const transactions = await this.bankClient.fetchTransactions(
        startDate,
        endDate
      );

      this.notifyAuthStatus({
        status: "authenticated",
        message: "Authentication successful",
        timestamp: new Date().toISOString(),
      });

      return transactions;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("authentication") ||
        errorMessage.includes("login") ||
        errorMessage.includes("BankID")
      ) {
        this.notifyAuthStatus({
          status: "failed",
          message: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }

      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.bankClient && typeof this.bankClient.cleanup === "function") {
      await this.bankClient.cleanup();
    }
    this.bankClient = null;
    this.authStatusCallbacks = [];
    this.currentQrToken = null;
    this.currentAutoStartToken = null;
    this.qrCodePromise = null;
  }
}

// Export singleton instance
export const bankIntegrationService = new BankIntegrationServiceImpl();

// Export types
export type { BankParams };
export type { Transaction } from "../shared/types.js";
