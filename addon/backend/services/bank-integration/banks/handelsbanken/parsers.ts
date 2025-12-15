/**
 * Parsers for Handelsbanken API responses
 */
import { Transaction } from "../../../shared/types.js";
import {
  HandelsbankenAccount,
  ApiAccountsData,
  ApiTransactionsData,
  ApiResponse,
} from "./models.js";

export class HandelsbankenParsers {
  /**
   * Parse accounts from API response
   */
  public static parseAccounts(
    response: ApiResponse<ApiAccountsData>
  ): HandelsbankenAccount[] {
    const accounts: HandelsbankenAccount[] = [];

    // First try to parse the standard format
    if ("json" in response && response.json) {
      // Standard API format
      if (response.json.agreements && response.json.agreements.length > 0) {
        console.log(
          `Found ${response.json.agreements.length} accounts via API`
        );
        return this.parseStandardAccountsFormat(response.json);
      }

      // Alternative API format
      if (response.json.accounts && Array.isArray(response.json.accounts)) {
        console.log(`Found ${response.json.accounts.length} accounts via API`);
        return this.parseAlternativeAccountsFormat(response.json);
      }
    }

    // If we have text that looks like JSON, try to parse it anyway
    if (
      "text" in response &&
      response.text &&
      response.text.trim().startsWith("{")
    ) {
      try {
        const jsonData = JSON.parse(response.text);

        // Standard API format
        if (jsonData.agreements && jsonData.agreements.length > 0) {
          console.log(`Found ${jsonData.agreements.length} accounts via API`);
          return this.parseStandardAccountsFormat(jsonData);
        }

        // Alternative API format
        if (jsonData.accounts && Array.isArray(jsonData.accounts)) {
          console.log(`Found ${jsonData.accounts.length} accounts via API`);
          return this.parseAlternativeAccountsFormat(jsonData);
        }
      } catch (e) {
        console.log(`Failed to parse accounts response text as JSON: ${e}`);
      }
    }

    return accounts;
  }

  /**
   * Parse the standard API format for accounts
   */
  private static parseStandardAccountsFormat(
    data: any
  ): HandelsbankenAccount[] {
    const accounts: HandelsbankenAccount[] = [];

    for (const agreement of data.agreements) {
      if (agreement.identifier && agreement.name) {
        console.log(`Parsing standard account format for ${agreement.name}`);
        console.log(JSON.stringify(agreement, null, 2));
        // agreement = {
        //   "_links": {
        //     "athena_transactions": {
        //       "href": "/accounts_and_cards/account_transactions?account=840716451~INLÅ~N&from=startPage",
        //       "type": "text/html"
        //     },
        //     "transactions": {
        //       "href": "#!/modules/espresso_accounts_and_cards_account_transactions?url=/bb/seip/servlet/UASipko?appName=ipko&appAction=GetAccountTransactions&Konto=840716451%7EINL%C5%7EN&spiNav=1",
        //       "type": "text/html"
        //     }
        //   },
        //   "agreementOwnerSegmentType": "private",
        //   "availableAmount": {
        //     "value": "13 810,93",
        //     "valueRaw": 13810.93
        //   },
        //   "currentBalance": {
        //     "value": "13 810,93",
        //     "valueRaw": 13810.93
        //   },
        //   "identifier": {
        //     "value": "840 716 451",
        //     "valueRaw": "840716451"
        //   },
        //   "isoCurrencyCode": "SEK",
        //   "name": "Lönekonto",
        //   "notifications": [],
        //   "productSegmentType": "account"
        // }
        const accountNumber = agreement.identifier.valueRaw;
        // Extract system and status from links if available, otherwise use defaults
        let system = "INLÅ"; // Default value
        let status = "N"; // Default value

        // Try to extract system and status from links (prefer athena_transactions as it's simpler/unencoded)
        try {
          if (agreement._links) {
            // First try athena_transactions link (simpler format: account=840716451~INLÅ~N)
            if (
              agreement._links.athena_transactions &&
              agreement._links.athena_transactions.href
            ) {
              const href = agreement._links.athena_transactions.href;
              const match = href.match(/account=([^&]+)/);
              if (match && match[1]) {
                const parts = match[1].split("~");
                if (parts.length >= 3) {
                  system = parts[1];
                  status = parts[2];
                }
              }
            }

            // Fall back to transactions link if athena_transactions didn't work
            if (system === "INLÅ" && status === "N") {
              if (
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
            }
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.log(
            `Warning: Failed to extract system/status from links for account ${accountNumber}: ${errorMessage}. Using defaults.`
          );
          // Continue with default values already set above
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

    console.log(`Parsed ${accounts.length} accounts`);
    console.log(JSON.stringify(accounts, null, 2));
    return accounts;
  }

  /**
   * Parse the alternative API format for accounts
   */
  private static parseAlternativeAccountsFormat(
    data: any
  ): HandelsbankenAccount[] {
    const accounts: HandelsbankenAccount[] = [];

    for (const account of data.accounts) {
      // Extract necessary account information
      if (account.accountNumber) {
        accounts.push({
          accountNumber: account.accountNumber,
          chosenName:
            account.accountAlias ||
            account.accountName ||
            account.accountNumber,
          accountName:
            account.accountName ||
            account.accountAlias ||
            account.accountNumber,
          system: "INLÅ", // Default value for alternative API
          status: "N", // Default value for alternative API
          accountHolder: account.ownerName || "",
        });
      }
    }

    return accounts;
  }

  /**
   * Parse transactions from API response
   */
  public static parseTransactions(
    response: ApiResponse<ApiTransactionsData>
  ): Transaction[] {
    const transactions: Transaction[] = [];

    // First try to parse the standard format
    if ("json" in response && response.json) {
      // Standard API format
      if (response.json.inlaAccountTransactions) {
        return this.parseStandardTransactionsFormat(response.json);
      }

      // Alternative API format
      if (
        response.json.transactions &&
        Array.isArray(response.json.transactions)
      ) {
        return this.parseAlternativeTransactionsFormat(response.json);
      }
    }

    // If we have text that looks like JSON, try to parse it anyway
    if (
      "text" in response &&
      response.text &&
      response.text.trim().startsWith("{")
    ) {
      try {
        const jsonData = JSON.parse(response.text);

        // Standard API format
        if (jsonData.inlaAccountTransactions) {
          return this.parseStandardTransactionsFormat(jsonData);
        }

        // Alternative API format
        if (jsonData.transactions && Array.isArray(jsonData.transactions)) {
          return this.parseAlternativeTransactionsFormat(jsonData);
        }
      } catch (e) {
        console.log(`Failed to parse transactions response text as JSON: ${e}`);
      }
    }

    return transactions;
  }

  /**
   * Parse the standard API format for transactions
   */
  private static parseStandardTransactionsFormat(data: any): Transaction[] {
    const transactions: Transaction[] = [];

    for (const tx of data.inlaAccountTransactions) {
      transactions.push({
        date: tx.transactionDate,
        amount: this.convertAmountToCents(tx.transactionAmount),
        payee_name: tx.transactionText,
        notes: "",
        imported_id: `${tx.transactionDate}-${tx.serialNumber}-${tx.eventTime}`,
      });
    }

    return transactions;
  }

  /**
   * Parse the alternative API format for transactions
   */
  private static parseAlternativeTransactionsFormat(data: any): Transaction[] {
    const transactions: Transaction[] = [];

    for (const tx of data.transactions) {
      transactions.push({
        date: tx.bookingDate || tx.transactionDate || tx.dateTime,
        // Ensure amount is correctly converted to a number and handle both positive/negative
        amount: this.convertAmountToCents(
          tx.amount || tx.transactionAmount || "0"
        ),
        payee_name: tx.message || tx.description || tx.transactionText || "",
        notes: tx.details || tx.text || "",
        // Create a unique transaction ID from available fields
        imported_id: `${tx.bookingDate || tx.transactionDate || tx.dateTime}-${
          tx.id || tx.reference || Math.random().toString(36).substring(2, 10)
        }`,
      });
    }

    return transactions;
  }

  /**
   * Convert amount from string/number to integer cents
   * @param amount - Amount as string or number (e.g., "1422.30" or 1422.30)
   * @returns Amount in cents as integer (e.g., 142230)
   */
  private static convertAmountToCents(amount: string | number): number {
    if (typeof amount === "string") {
      const numericAmount = parseFloat(amount);
      return Math.round(numericAmount * 100);
    } else if (typeof amount === "number") {
      return Math.round(amount * 100);
    } else {
      return 0;
    }
  }
}
