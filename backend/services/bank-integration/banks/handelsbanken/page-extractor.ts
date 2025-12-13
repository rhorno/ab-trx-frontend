/**
 * Service for extracting data from pages when API fails
 */
import { Page } from "playwright";
import { Transaction } from "../../../shared/types.js";
import { HandelsbankenAccount } from "./models.js";
import { getLogger, Logger } from "../../../shared/logger.js";

export class PageExtractor {
  private readonly page: Page;
  private readonly verbose: boolean;
  private logger: Logger;

  /**
   * Creates a new page extractor
   */
  constructor(page: Page, verbose: boolean = false) {
    this.page = page;
    this.verbose = verbose;
    this.logger = getLogger("Handelsbanken.Page");
  }

  /**
   * Log message to both file and console if verbose mode is enabled
   */
  private log(message: string): void {
    this.logger.debug(message);
    if (this.verbose) {
      console.log(`[Handelsbanken Page] ${message}`);
    }
  }

  /**
   * Extract accounts from the page
   */
  public async extractAccounts(): Promise<HandelsbankenAccount[]> {
    // Wait for the accounts page to load
    this.log("Waiting for accounts page to load...");
    await this.page.waitForSelector('a[href*="account_transactions"]', {
      timeout: 30000,
    });

    // Extract accounts from the page
    this.log("Extracting account information...");
    const accounts = await this.page.evaluate(() => {
      const accountLinks = Array.from(
        document.querySelectorAll('a[href*="account_transactions"]')
      );
      return accountLinks.map((link) => {
        const href = link.getAttribute("href") || "";
        const match = href.match(/account=([^&]+)/);
        const accountId = match ? match[1] : "";
        const [accountNumber, system, status] = accountId.split("~");

        // Get account name from the link text
        const accountName = link.textContent?.trim() || "";

        // Get account holder (assuming it's the user's name)
        const accountHolder = ""; // We don't have this information from the HTML

        return {
          accountNumber,
          chosenName: accountName,
          accountName: "", // We don't have the official account name from the HTML
          system,
          status,
          accountHolder,
        };
      });
    });

    this.log(`Found ${accounts.length} accounts`);
    return accounts;
  }

  /**
   * Extract transactions from the page as a fallback
   */
  public async extractTransactions(
    startDate: string,
    endDate: string
  ): Promise<Transaction[]> {
    this.log("Extracting transactions from page...");

    try {
      // Get the base URL from the current page
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
      const fullTransactionsUrl = `${baseUrl}/bb/seip/servlet/ipko?appName=ipko&appAction=ShowAccountTransactions`;

      // Make sure we're on the transactions page
      if (!this.page.url().includes("ShowAccountTransactions")) {
        this.log(`Navigating to transactions page: ${fullTransactionsUrl}`);
        await this.page.goto(fullTransactionsUrl);

        // Wait for the page to load
        this.log("Waiting for transactions page to load...");
        await this.page.waitForTimeout(3000);
      }

      // Wait for the date input fields to be available
      this.log("Waiting for date input fields...");
      try {
        const hasDateFields = await this.page
          .waitForSelector('input[name="dateFrom"], input[name="fromDate"]', {
            timeout: 5000,
          })
          .then(() => true)
          .catch(() => false);

        if (hasDateFields) {
          // Find which date input fields are used
          const dateFromSelector = (await this.page.$('input[name="dateFrom"]'))
            ? 'input[name="dateFrom"]'
            : 'input[name="fromDate"]';

          const dateToSelector = (await this.page.$('input[name="dateTo"]'))
            ? 'input[name="dateTo"]'
            : 'input[name="toDate"]';

          // Fill in the date range
          this.log(`Setting date range: ${startDate} to ${endDate}`);
          await this.page.fill(dateFromSelector, startDate);
          await this.page.fill(dateToSelector, endDate);

          // Find and click the search button
          const searchButton = await this.page.$(
            'button[type="submit"], input[type="submit"], button:has-text("Search"), button:has-text("Sök")'
          );
          if (searchButton) {
            this.log("Clicking search button...");
            await searchButton.click();

            // Wait for the results to load
            this.log("Waiting for results to load...");
            await this.page.waitForTimeout(3000);
          } else {
            this.log(
              "Search button not found. Trying to submit the form directly..."
            );
            // Try to submit the form directly
            await this.page.evaluate(() => {
              const form = document.querySelector("form");
              if (form) form.submit();
            });
            await this.page.waitForTimeout(3000);
          }
        } else {
          this.log(
            "Date input fields not found. Looking for transactions in current page view..."
          );
        }
      } catch (error) {
        this.log(`Error with date inputs: ${error}`);
        this.log("Looking for transactions in current page view...");
      }

      // Extract transactions from the table
      this.log("Extracting transactions from table...");
      const transactions = await this.page.evaluate(() => {
        const results: any[] = [];

        // Look for transaction tables - try multiple selectors
        const tables = [
          ...document.querySelectorAll(
            'table.transactions, table.account-transactions, table.statement, table[id*="transaction"]'
          ),
          ...document.querySelectorAll("table"),
        ];

        // Process each table
        for (const table of tables) {
          const rows = table.querySelectorAll("tr");
          if (rows.length <= 1) continue; // Skip tables with only header row or empty

          // Process rows
          for (const row of Array.from(rows)) {
            // Skip header rows
            if (row.querySelector("th")) continue;

            const columns = row.querySelectorAll("td");
            if (columns.length >= 3) {
              // Try to identify which columns contain what data
              // This is challenging because the structure can vary
              let dateCol = 0;
              let descCol = 1;
              let amountCol = 2;

              // Try to infer column positions by checking headers
              const headerRow = table.querySelector("tr th")
                ? table.querySelector("tr")
                : null;
              if (headerRow) {
                const headers = Array.from(
                  headerRow.querySelectorAll("th")
                ).map((h) => (h.textContent || "").toLowerCase());

                for (let i = 0; i < headers.length; i++) {
                  const header = headers[i];
                  if (header.includes("date") || header.includes("datum")) {
                    dateCol = i;
                  } else if (
                    header.includes("description") ||
                    header.includes("text") ||
                    header.includes("beskrivning") ||
                    header.includes("information")
                  ) {
                    descCol = i;
                  } else if (
                    header.includes("amount") ||
                    header.includes("belopp") ||
                    header.includes("sum") ||
                    header.includes("kr") ||
                    header.includes("sek")
                  ) {
                    amountCol = i;
                  }
                }
              }

              // Extract data from columns
              const dateText = columns[dateCol]?.textContent?.trim() || "";
              const descriptionText =
                columns[descCol]?.textContent?.trim() || "";
              const amountText = columns[amountCol]?.textContent?.trim() || "";

              // Parse amount - remove currency symbols and convert commas to periods
              const cleanAmount = amountText
                .replace(/[^\d,.-]/g, "")
                .replace(",", ".");
              let amount = parseFloat(cleanAmount);

              // Determine if it's negative based on text or formatting
              const isNegative =
                amountText.includes("-") ||
                columns[amountCol]?.className?.includes("negative") ||
                columns[amountCol]?.style?.color?.includes("red");

              if (!isNaN(amount) && !amountText.includes("-") && isNegative) {
                amount = -amount;
              }

              // Generate a unique ID
              const uniqueId = `${dateText}-${descriptionText}-${amountText}`;

              if (dateText && (descriptionText || amountText)) {
                results.push({
                  date: dateText,
                  description: descriptionText,
                  amount: isNaN(amount) ? 0 : amount,
                  id: uniqueId,
                });
              }
            }
          }

          // If we found transactions, no need to check other tables
          if (results.length > 0) break;
        }

        // If no transactions found in tables, look for data in other formats
        if (results.length === 0) {
          // Look for list-based layouts
          const transactionItems = document.querySelectorAll(
            '[class*="transaction-item"], [class*="account-transaction"], li[class*="transaction"]'
          );

          for (const item of Array.from(transactionItems)) {
            // Extract date
            const dateEl = item.querySelector(
              '[class*="date"], [data-label*="date"], [data-label*="datum"]'
            );
            const dateText = dateEl?.textContent?.trim() || "";

            // Extract description
            const descEl = item.querySelector(
              '[class*="description"], [class*="text"], [data-label*="beskrivning"]'
            );
            const descriptionText = descEl?.textContent?.trim() || "";

            // Extract amount
            const amountEl = item.querySelector(
              '[class*="amount"], [class*="sum"], [data-label*="belopp"]'
            );
            const amountText = amountEl?.textContent?.trim() || "";

            // Parse amount
            const cleanAmount = amountText
              .replace(/[^\d,.-]/g, "")
              .replace(",", ".");
            const amount = parseFloat(cleanAmount);

            // Generate ID
            const uniqueId = `${dateText}-${descriptionText}-${amountText}`;

            if (dateText && (descriptionText || amountText)) {
              results.push({
                date: dateText,
                description: descriptionText,
                amount: isNaN(amount) ? 0 : amount,
                id: uniqueId,
              });
            }
          }
        }

        return results;
      });

      this.log(`Extracted ${transactions.length} transactions from page`);

      // If we found no transactions, try looking for other ways to get transaction data
      if (transactions.length === 0) {
        this.log(
          "No transactions found in HTML elements, checking for JSON data..."
        );

        // Try to find transactions in any structured data on the page
        const jsonData = await this.extractJsonDataFromPage();

        if (
          jsonData &&
          jsonData.transactions &&
          jsonData.transactions.length > 0
        ) {
          this.log(
            `Found ${jsonData.transactions.length} transactions in JSON data`
          );

          // Convert JSON data to our Transaction format
          return jsonData.transactions.map((tx: any) => ({
            date: tx.date || tx.transactionDate || tx.bookingDate || "",
            amount:
              typeof tx.amount === "number"
                ? tx.amount
                : parseFloat(tx.amount || "0"),
            payee_name: tx.text || tx.description || tx.payee || "",
            notes: tx.additionalInfo || tx.note || "",
            imported_id: tx.id || `${tx.date}-${tx.amount}-${tx.text}`,
          }));
        }
      }

      // Format dates to YYYY-MM-DD
      const formattedTransactions = transactions.map((tx) => {
        // Try to parse the date into a standardized format
        const dateText = tx.date;
        let formattedDate = dateText;

        // Try to detect date format and convert to YYYY-MM-DD
        if (dateText) {
          // Handle common date formats
          const dateParts = dateText.match(
            /(\d{1,4})[\/\.-](\d{1,2})[\/\.-](\d{1,4})/
          );

          if (dateParts) {
            // Determine if year is first or last
            if (dateParts[1].length === 4) {
              // Format is YYYY-MM-DD
              formattedDate = `${dateParts[1]}-${dateParts[2].padStart(
                2,
                "0"
              )}-${dateParts[3].padStart(2, "0")}`;
            } else if (dateParts[3].length === 4) {
              // Format is DD-MM-YYYY
              formattedDate = `${dateParts[3]}-${dateParts[2].padStart(
                2,
                "0"
              )}-${dateParts[1].padStart(2, "0")}`;
            } else {
              // Best guess format
              formattedDate = dateText;
            }
          }
        }

        return {
          date: formattedDate,
          amount: tx.amount,
          payee_name: tx.description,
          notes: "",
          imported_id: tx.id,
        };
      });

      return formattedTransactions;
    } catch (error) {
      this.log(`Error extracting transactions from page: ${error}`);
      throw new Error(`Failed to extract transactions: ${error}`);
    }
  }

  /**
   * Extract JSON data that might contain transactions from the page
   */
  private async extractJsonDataFromPage(): Promise<any> {
    try {
      return await this.page.evaluate(() => {
        // Look for JSON data in script tags
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          const content = script.textContent || "";
          if (content.includes("transaction") || content.includes("account")) {
            try {
              // Try to extract JSON objects
              const matches = content.match(/\{[^{}]*(\{[^{}]*\})*[^{}]*\}/g);
              if (matches) {
                for (const match of matches) {
                  try {
                    const data = JSON.parse(match);
                    if (
                      data &&
                      (data.transactions ||
                        data.accountTransactions ||
                        data.items)
                    ) {
                      return data;
                    }
                  } catch {}
                }
              }
            } catch {}
          }
        }

        // Also look for data attributes that might contain transaction data
        const elements = document.querySelectorAll(
          "[data-transactions], [data-account-data]"
        );
        for (const el of Array.from(elements)) {
          const dataAttr =
            el.getAttribute("data-transactions") ||
            el.getAttribute("data-account-data");
          if (dataAttr) {
            try {
              return JSON.parse(dataAttr);
            } catch {}
          }
        }

        // Also check window objects that might contain transaction data
        try {
          // @ts-ignore
          if (window.appData && window.appData.transactions) {
            // @ts-ignore
            return window.appData;
          }
          // @ts-ignore
          if (window.accountData && window.accountData.transactions) {
            // @ts-ignore
            return window.accountData;
          }
        } catch {}

        return null;
      });
    } catch (error) {
      this.log(`Error extracting JSON data from page: ${error}`);
      return null;
    }
  }
}
