/**
 * Service Interfaces
 *
 * This file defines TypeScript interfaces for all services in the application.
 * These interfaces provide clear contracts for service implementations and
 * enable better type safety and documentation.
 */

import { UserConfig, Profile } from "../configuration/config-loader.js";
import { Transaction } from "./types.js";
import { ActualBudgetConfig, ImportResult } from "../actual-budget/connector.js";
import { BankParams } from "../bank-integration/bank-client.js";

/**
 * QR Code data structure for authentication
 */
export interface QRCodeData {
  token: string;
  asciiArt: string;
  timestamp: string;
}

/**
 * Authentication status for bank integrations
 */
export interface AuthStatus {
  status: "pending" | "authenticated" | "failed" | "expired";
  message?: string;
  timestamp?: string;
  qrCode?: QRCodeData; // POC: Include QR code data in status for streaming
}

/**
 * Configuration Service Interface
 *
 * Manages all configuration including environment variables, profiles, and application settings.
 */
export interface ConfigurationService {
  /**
   * Initialize the configuration service
   * @param bankRegistry - Bank registry for validation (optional, can be set later)
   */
  initialize(bankRegistry?: Array<{ name: string }>): void;

  /**
   * Load all profiles from profiles.json
   * @returns Collection of all profiles
   */
  loadAllProfiles(): { [profileName: string]: Profile };

  /**
   * Load a specific profile by name
   * @param profileName - Name of the profile to load
   * @returns Profile configuration
   * @throws Error if profile not found
   */
  loadProfile(profileName: string): Profile;

  /**
   * Build complete configuration from profile name
   * Combines global .env settings with profile-specific settings
   * @param profileName - Name of the profile
   * @returns Complete user configuration
   * @throws Error if profile not found or configuration invalid
   */
  buildConfig(profileName: string): UserConfig;

  /**
   * Get global Actual Budget configuration (for commands that don't need profiles)
   * @returns Global Actual Budget configuration from .env
   * @throws Error if required environment variables are missing
   */
  getGlobalConfig(): Pick<UserConfig, "actualBudget">;
}

/**
 * Actual Budget Service Interface
 *
 * Handles all interactions with the Actual Budget instance.
 */
export interface ActualBudgetService {
  /**
   * Initialize connection to Actual Budget
   * @param config - Actual Budget configuration
   * @param verbose - Enable verbose logging
   */
  connect(config: ActualBudgetConfig, verbose?: boolean): Promise<void>;

  /**
   * Get smart start date for fetching new transactions
   * Returns the latest transaction date minus 1 day safety margin, or null if no transactions exist.
   * @param accountId - Account ID (optional, uses connector's accountId if not provided)
   * @returns Start date in YYYY-MM-DD format, or null if no transactions found
   * @throws Error if account validation fails or query fails
   */
  getSmartStartDate(accountId?: string): Promise<string | null>;

  /**
   * Import transactions into Actual Budget
   * @param transactions - Array of transactions to import
   * @param dryRun - If true, validate but don't import (returns preview)
   * @returns Import result with counts of added and skipped transactions
   * @throws Error if import fails
   */
  importTransactions(
    transactions: Transaction[],
    dryRun?: boolean
  ): Promise<ImportResult>;

  /**
   * List all available accounts in the budget
   * @returns Array of account objects with id, name, closed, and offbudget flags
   * @throws Error if connection fails or accounts cannot be retrieved
   */
  listAccounts(): Promise<
    { id: string; name: string; closed: boolean; offbudget: boolean }[]
  >;

  /**
   * Shutdown the connection and cleanup resources
   */
  shutdown(): Promise<void>;
}

/**
 * Bank Integration Service Interface
 *
 * Handles all bank-specific operations including authentication and transaction fetching.
 */
export interface BankIntegrationService {
  /**
   * Initialize bank client based on bank name and parameters
   * @param bankName - Name of the bank (e.g., "handelsbanken")
   * @param params - Bank-specific parameters (e.g., personnummer, accountName)
   */
  initialize(bankName: string, params: BankParams): Promise<void>;

  /**
   * Start authentication process and return QR code data
   * For banks that use QR code authentication (e.g., Handelsbanken BankID)
   * @returns QR code data including token and ASCII art representation
   * @throws Error if authentication initialization fails
   */
  authenticate(): Promise<QRCodeData>;

  /**
   * Register a callback for authentication status updates
   * The callback will be called when authentication status changes:
   * - "pending": Waiting for user to scan QR code
   * - "authenticated": User successfully authenticated
   * - "failed": Authentication failed
   * - "expired": QR code expired, new one needed
   * @param callback - Function to call when auth status changes
   */
  onAuthStatus(callback: (status: AuthStatus) => void): void;

  /**
   * Fetch transactions from the bank
   * @param startDate - Start date in YYYY-MM-DD format
   * @param endDate - End date in YYYY-MM-DD format
   * @returns Array of transactions in standardized format
   * @throws Error if fetch fails or authentication required
   */
  fetchTransactions(startDate: string, endDate: string): Promise<Transaction[]>;

  /**
   * Cleanup resources (close browser, cleanup connections)
   * Should be called after operations are complete
   */
  cleanup(): Promise<void>;
}

/**
 * Type exports for convenience
 */
export type {
  UserConfig,
  Profile,
  Transaction,
  ActualBudgetConfig,
  ImportResult,
  BankParams,
};

