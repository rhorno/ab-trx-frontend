/**
 * Type definitions for Handelsbanken bank integration
 */

/**
 * Interface for Handelsbanken account
 */
export interface HandelsbankenAccount {
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
export interface HandelsbankenTransaction {
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
 * API Response Types
 */

/**
 * Account data in standard API response
 */
export interface ApiAccountData {
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

/**
 * Account data in alternative API response
 */
export interface AlternativeApiAccountData {
  accountNumber: string;
  accountName?: string;
  accountAlias?: string;
  ownerName?: string;
  balance?: number;
  availableBalance?: number;
  currency?: string;
  accountType?: string;
}

/**
 * Combined accounts API response data
 */
export interface ApiAccountsData {
  // Standard API response format
  agreements?: ApiAccountData[];
  // Alternative API response format
  accounts?: AlternativeApiAccountData[];
}

/**
 * Transaction data in standard API response
 */
export interface ApiTransactionData {
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
 * Transaction data in alternative API response
 */
export interface AlternativeApiTransactionData {
  bookingDate?: string;
  transactionDate?: string;
  dateTime?: string;
  amount?: string;
  transactionAmount?: string;
  message?: string;
  description?: string;
  transactionText?: string;
  details?: string;
  text?: string;
  id?: string;
  reference?: string;
  balance?: string;
  currency?: string;
}

/**
 * Combined transactions API response data
 */
export interface ApiTransactionsData {
  // Standard API response format
  inlaAccountTransactions?: ApiTransactionData[];
  isCloseAccount?: string;
  customerName?: string;
  accountInformation?: any;

  // Alternative API response format
  transactions?: AlternativeApiTransactionData[];
  account?: any;
  pagination?: any;
}

export interface ApiSuccessResponse {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string | null;
  text: string | null;
  isJson: boolean;
}

export interface ApiJsonResponse<T> extends ApiSuccessResponse {
  json: T;
}

export interface ApiErrorResponse extends ApiSuccessResponse {
  error: string;
  isJsonParseError?: boolean;
}

export interface ApiFetchError {
  error: string;
  url: string;
}

export type ApiResponse<T> = ApiSuccessResponse | ApiJsonResponse<T> | ApiErrorResponse | ApiFetchError;

/**
 * Constants
 */
export const LOGIN_URL = 'https://secure.handelsbanken.se/logon/se/priv/sv/mbidqr/';
export const ACCOUNTS_URL = 'https://secure.handelsbanken.se/apps/dsb/mb/payments/toandfrommyaccounts.xhtml?CONTROL_ORIGIN=CONTROL_ORIGIN_NO';