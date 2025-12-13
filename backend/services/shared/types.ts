/**
 * Represents a normalized bank transaction for import into Actual Budget.
 * This interface matches the Actual Budget API transaction object format exactly.
 * Only contains fields that are officially supported by the Actual Budget API.
 */
export interface Transaction {
  /**
   * Unique identifier (UUID) - optional, will be generated if not provided
   */
  id?: string;

  /**
   * Account ID where the transaction belongs (required for API calls, but optional in interface for flexibility)
   */
  account?: string;

  /**
   * ISO 8601 date string (YYYY-MM-DD) - required
   */
  date: string;

  /**
   * Amount in cents as integer (positive for credit, negative for debit) - optional
   */
  amount?: number;

  /**
   * Payee ID - optional, used when payee already exists
   */
  payee?: string;

  /**
   * The counterparty or merchant name - optional, used for creating new payees
   * Only available in create requests. If this matches an existing payee, that payee will be used.
   */
  payee_name?: string;

  /**
   * Raw description from import, allowing user to see original value - optional
   */
  imported_payee?: string;

  /**
   * Category ID - optional
   */
  category?: string;

  /**
   * Additional details or memo - optional
   */
  notes?: string;

  /**
   * Unique transaction identifier for deduplication (corresponds to Actual Budget's imported_id) - optional
   * A unique id usually given by the bank, if importing. Use this to avoid duplicate transactions.
   */
  imported_id?: string;

  /**
   * Transfer ID - if a transfer, the id of the corresponding transaction in the other account - optional
   */
  transfer_id?: string;

  /**
   * A flag indicating if the transaction has cleared or not - optional
   */
  cleared?: boolean;

  /**
   * An array of subtransactions for a split transaction - optional
   */
  subtransactions?: Transaction[];
}

/**
 * Official Actual Budget API supported transaction fields.
 * Any field not in this list will be removed during validation.
 */
const SUPPORTED_TRANSACTION_FIELDS = new Set([
  'id',
  'account',
  'date',
  'amount',
  'payee',
  'payee_name',
  'imported_payee',
  'category',
  'notes',
  'imported_id',
  'transfer_id',
  'cleared',
  'subtransactions'
]);

/**
 * Validates and cleans a transaction object to ensure it only contains
 * fields supported by the Actual Budget API.
 *
 * @param transaction - Raw transaction object that may contain unsupported fields
 * @returns Clean transaction object with only supported fields
 * @throws Error if transaction is missing required fields
 */
export function validateAndCleanTransaction(transaction: any): Transaction {
  if (!transaction || typeof transaction !== 'object') {
    throw new Error('Transaction must be an object');
  }

  // Check required fields
  if (!transaction.date || typeof transaction.date !== 'string') {
    throw new Error('Transaction must have a valid date field (string in YYYY-MM-DD format)');
  }

  // Create clean transaction with only supported fields
  const cleanTransaction: Partial<Transaction> = {};

  for (const [key, value] of Object.entries(transaction)) {
    if (SUPPORTED_TRANSACTION_FIELDS.has(key)) {
      (cleanTransaction as any)[key] = value;
    }
  }

  // Ensure required field exists
  if (!cleanTransaction.date) {
    throw new Error('Cleaned transaction is missing required date field');
  }

  return cleanTransaction as Transaction;
}

/**
 * Validates and cleans an array of transactions.
 *
 * @param transactions - Array of raw transaction objects
 * @returns Array of clean transaction objects with only supported fields
 */
export function validateAndCleanTransactions(transactions: any[]): Transaction[] {
  if (!Array.isArray(transactions)) {
    throw new Error('Transactions must be an array');
  }

  return transactions.map((tx, index) => {
    try {
      return validateAndCleanTransaction(tx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Transaction validation failed at index ${index}: ${message}`);
    }
  });
}

/**
 * Represents a bank account
 */
export interface BankAccount {
  /**
   * Account identifier
   */
  id: string;
  /**
   * Account name
   */
  name: string;
  /**
   * Account number or other identifier
   */
  accountNumber?: string;
  /**
   * Current balance
   */
  balance?: number;
  /**
   * Account type
   */
  type?: string;
}