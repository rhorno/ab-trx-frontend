/**
 * API service for Handelsbanken integration
 */
import { Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import {
  ApiResponse,
  ApiAccountsData,
  ApiTransactionsData,
  HandelsbankenAccount,
} from "./models.js";
import { getLogger, Logger } from "../../../shared/logger.js";

/**
 * Service for handling API requests to Handelsbanken
 */
export class HandelsbankenApiService {
  private readonly page: Page;
  private readonly verbose: boolean;
  private logger: Logger;
  private authenticationComplete: boolean = false;
  private capturedAccountsResponse: ApiResponse<ApiAccountsData> | null = null;

  /**
   * Creates a new API service instance
   */
  constructor(page: Page, verbose: boolean = false) {
    this.page = page;
    this.verbose = verbose;
    this.logger = getLogger("Handelsbanken.API");
  }

  /**
   * Log message to both file and console if verbose mode is enabled
   */
  private log(message: string): void {
    this.logger.debug(message);
    if (this.verbose) {
      console.log(`[Handelsbanken API] ${message}`);
    }
  }

  /**
   * Setup API request interception to log all API calls and capture authentication
   */
  public setupApiInterception(): void {
    if (!this.page) return;

    this.log("Setting up API request interception for analysis...");

    // Listen for requests
    this.page.on("request", (request) => {
      const url = request.url();
      if (
        url.includes("/api/") ||
        url.includes("/json") ||
        url.includes("/rest") ||
        url.includes("/servlet") ||
        (request.method() === "POST" && request.postData())
      ) {
        this.log(`API Request: ${request.method()} ${url}`);
        const postData = request.postData();
        if (postData) {
          try {
            // Try to parse as JSON for better logging
            const jsonData = JSON.parse(postData);
            this.log(`Request data: ${JSON.stringify(jsonData, null, 2)}`);
          } catch {
            // If not JSON, log as is but truncate if too long
            if (postData.length > 500) {
              this.log(`Request data: ${postData.substring(0, 500)}...`);
            } else {
              this.log(`Request data: ${postData}`);
            }
          }
        }
      }
    });

    // Listen for responses, especially for authentication detection
    this.page.on("response", async (response) => {
      const request = response.request();
      const url = request.url();

      // Check if this is accounts request which indicates successful authentication
      const isAccountsRequest =
        url.includes("/accounts/v1/myAccounts") ||
        url.includes("/accountsummary/accounts");

      if (isAccountsRequest) {
        this.log(`Detected accounts API response: ${response.status()} ${url}`);
        this.authenticationComplete = true;

        try {
          const contentType = response.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const jsonResponse = await response.json().catch(() => null);
            if (jsonResponse) {
              // Save the accounts response for later use
              this.capturedAccountsResponse = {
                ok: response.ok(),
                status: response.status(),
                statusText: response.statusText(),
                contentType,
                text: JSON.stringify(jsonResponse),
                isJson: true,
                json: jsonResponse,
              };
              this.log(
                "Successfully captured accounts response from page navigation"
              );
            }
          } else {
            // Try to get the text response
            const text = await response.text().catch(() => null);
            if (text) {
              this.capturedAccountsResponse = {
                ok: response.ok(),
                status: response.status(),
                statusText: response.statusText(),
                contentType,
                text,
                isJson: false,
              };
              this.log(
                "Captured accounts response (non-JSON) from page navigation"
              );
            }
          }
        } catch (error) {
          this.log(`Could not capture accounts response: ${error}`);
        }
      }

      if (
        url.includes("/api/") ||
        url.includes("/json") ||
        url.includes("/rest") ||
        url.includes("/servlet") ||
        (request.method() === "POST" && request.postData())
      ) {
        this.log(`API Response: ${response.status()} ${url}`);

        try {
          const contentType = response.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const jsonResponse = await response.json().catch(() => null);
            if (jsonResponse) {
              this.log(
                `Response data: ${JSON.stringify(jsonResponse, null, 2)}`
              );
            }
          }
        } catch (error) {
          this.log(`Could not parse response: ${error}`);
        }
      }
    });
  }

  /**
   * Wait for authentication to be complete by detecting account-related API requests
   */
  public async waitForAuthentication(
    timeoutMs: number = 30000
  ): Promise<boolean> {
    if (this.authenticationComplete) {
      this.log("Authentication already detected as complete");
      return true;
    }

    this.log(`Waiting up to ${timeoutMs}ms for authentication to complete...`);

    // Set a timeout for the maximum wait time
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.authenticationComplete) {
        this.log(
          `Authentication complete detected after ${Date.now() - startTime}ms`
        );
        return true;
      }

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Also check for known authenticated URLs
      const currentUrl = await this.page.url();
      if (
        currentUrl.includes("/private/") ||
        currentUrl.includes("/dashboard") ||
        currentUrl.includes("/overview")
      ) {
        this.log(`Detected authenticated URL: ${currentUrl}`);
        this.authenticationComplete = true;
        return true;
      }
    }

    this.log("Timed out waiting for authentication to complete");
    return false;
  }

  /**
   * Fetch accounts from the API, using captured response if available
   */
  public async fetchAccounts(): Promise<ApiResponse<ApiAccountsData>> {
    // First wait to ensure authentication is complete
    await this.waitForAuthentication();

    // If we already captured the accounts response during navigation, use it
    if (this.capturedAccountsResponse) {
      this.log("Using accounts response captured during page navigation");
      return this.capturedAccountsResponse;
    }

    try {
      // Get the base URL from the current page to ensure we use absolute URLs
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");

      // Handelsbanken accounts API endpoint with absolute URL
      const accountsApiUrl = `${baseUrl}/rseda/rykk/bu/accounts/v1/myAccounts`;

      this.log(`Making API request to ${accountsApiUrl}`);

      // Make the API request using the page context to maintain the session cookies
      const response = await this.page.evaluate(async (url: string) => {
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "application/json, application/problem+json",
              "X-Requested-With": "fetch",
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
            // Important: include credentials to send cookies with request
            credentials: "include",
          });

          // Create a detailed response object with status, content type and text
          const contentType = response.headers.get("content-type") || "";
          const text = await response.text();

          const responseObj = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            contentType,
            text: text.length > 1000 ? `${text.substring(0, 1000)}...` : text,
            isJson: contentType.includes("application/json"),
          };

          // Only try to parse as JSON if the content type is correct and it looks like JSON
          if (
            contentType.includes("application/json") &&
            text.trim().startsWith("{")
          ) {
            try {
              const jsonData = JSON.parse(text);
              return { ...responseObj, json: jsonData };
            } catch (e) {
              return {
                ...responseObj,
                error: `Failed to parse JSON: ${e}`,
                isJsonParseError: true,
              };
            }
          }

          // Not JSON or couldn't parse
          return responseObj;
        } catch (error) {
          return {
            error: String(error),
            url,
          };
        }
      }, accountsApiUrl);

      this.log(
        `Response status: ${
          "status" in response ? response.status : "unknown"
        }, Content-Type: ${
          "contentType" in response ? response.contentType : "unknown"
        }`
      );

      // If we received an authentication error, try a fallback API endpoint
      if ("status" in response && response.status === 403) {
        this.log("Received 403 Forbidden, trying alternative API endpoint...");
        return await this.fetchAccountsAlternative();
      }

      return response as ApiResponse<ApiAccountsData>;
    } catch (error) {
      this.log(`Error in fetchAccounts: ${error}`);
      throw error;
    }
  }

  /**
   * Alternative method to fetch accounts if the main API endpoint fails
   */
  private async fetchAccountsAlternative(): Promise<
    ApiResponse<ApiAccountsData>
  > {
    try {
      // Get the base URL from the current page
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");

      // Alternative URL that's more likely to work with current session
      const alternativeUrl = `${baseUrl}/se/api/accountsummary/accounts?sort=+accountAlias&categoryFilter=ALL_PERSONAL`;

      this.log(`Trying alternative API endpoint: ${alternativeUrl}`);

      // Make the request
      const response = await this.page.evaluate(async (url: string) => {
        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "X-Requested-With": "fetch",
            },
            credentials: "include",
          });

          // Create a detailed response object
          const contentType = response.headers.get("content-type") || "";
          const text = await response.text();

          const responseObj = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            contentType,
            text: text.length > 1000 ? `${text.substring(0, 1000)}...` : text,
            isJson: contentType.includes("application/json"),
          };

          // Try to parse as JSON
          if (
            contentType.includes("application/json") &&
            text.trim().startsWith("{")
          ) {
            try {
              const jsonData = JSON.parse(text);
              return { ...responseObj, json: jsonData };
            } catch (e) {
              return {
                ...responseObj,
                error: `Failed to parse JSON: ${e}`,
                isJsonParseError: true,
              };
            }
          }

          return responseObj;
        } catch (error) {
          return {
            error: String(error),
            url,
          };
        }
      }, alternativeUrl);

      // Save for debugging

      this.log(
        `Alternative API response status: ${
          "status" in response ? response.status : "unknown"
        }, Content-Type: ${
          "contentType" in response ? response.contentType : "unknown"
        }`
      );

      return response as ApiResponse<ApiAccountsData>;
    } catch (error) {
      this.log(`Error in fetchAccountsAlternative: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch transactions from the API
   */
  public async fetchTransactions(
    account: HandelsbankenAccount,
    startDate: string,
    endDate: string
  ): Promise<ApiResponse<ApiTransactionsData>> {
    try {
      // Prepare the API request payload based on account and date range
      const payload = {
        account: `${account.accountNumber}~${account.system}~${account.status}~${account.chosenName}~J`,
        dateFrom: startDate,
        dateTo: endDate,
        transactionType: "A",
        amountFrom: "",
        amountTo: "",
      };

      // Get the base URL from the current page to ensure we use absolute URLs
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");

      // Handelsbanken transactions API endpoint with absolute URL
      const transactionsApiUrl = `${baseUrl}/bb/seip/servlet/ipko?appName=ipko&appAction=ShowAccountTransactions`;

      this.log(`Making API request to ${transactionsApiUrl}`);

      // Make the API request
      const response = await this.page.evaluate(
        async (config: { url: string; data: any }) => {
          try {
            const res = await fetch(config.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                Accept: "application/json",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
              },
              body: JSON.stringify(config.data),
              credentials: "include", // Include cookies for authenticated session
            });

            // Create a detailed response object with status, content type and text
            const contentType = res.headers.get("content-type") || "";
            const text = await res.text();

            const responseObj = {
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
              contentType,
              text: text.length > 1000 ? `${text.substring(0, 1000)}...` : text,
              isJson: contentType?.includes("application/json") ?? false,
            };

            // Only try to parse as JSON if the content type is correct and it looks like JSON
            if (
              contentType?.includes("application/json") &&
              text?.trim().startsWith("{")
            ) {
              try {
                const jsonData = JSON.parse(text);
                return { ...responseObj, json: jsonData };
              } catch (e) {
                return {
                  ...responseObj,
                  error: `Failed to parse JSON: ${e}`,
                  isJsonParseError: true,
                };
              }
            }

            // Not JSON or couldn't parse
            return responseObj;
          } catch (error) {
            return {
              error: String(error),
              url: config.url,
            };
          }
        },
        { url: transactionsApiUrl, data: payload }
      );

      // Save the raw response for debugging

      this.log(
        `Response status: ${
          "status" in response ? response.status : "unknown"
        }, Content-Type: ${
          "contentType" in response ? response.contentType : "unknown"
        }`
      );

      // If we received an authentication error, try a fallback API endpoint
      if (
        ("status" in response && response.status === 403) ||
        ("status" in response && response.status === 401)
      ) {
        this.log(
          "Received authorization error, trying alternative API endpoint..."
        );
        return await this.fetchTransactionsAlternative(
          account,
          startDate,
          endDate
        );
      }

      return response as ApiResponse<ApiTransactionsData>;
    } catch (error) {
      this.log(`Error in fetchTransactions: ${error}`);
      throw error;
    }
  }

  /**
   * Alternative method to fetch transactions if the main API endpoint fails
   */
  private async fetchTransactionsAlternative(
    account: HandelsbankenAccount,
    startDate: string,
    endDate: string
  ): Promise<ApiResponse<ApiTransactionsData>> {
    try {
      // Get the base URL from the current page
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");

      // Alternative transaction API endpoint
      const alternativeUrl = `${baseUrl}/se/api/accountdetails/transactions`;

      // Format payload for the alternative API
      const payload = {
        accountId: account.accountNumber,
        fromDate: startDate,
        toDate: endDate,
      };

      this.log(
        `Trying alternative transactions API endpoint: ${alternativeUrl}`
      );

      // Make the request
      const response = await this.page.evaluate(
        async (config: { url: string; data: any }) => {
          try {
            const res = await fetch(config.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Requested-With": "fetch",
              },
              body: JSON.stringify(config.data),
              credentials: "include",
            });

            // Create a detailed response object
            const contentType = res.headers.get("content-type") || "";
            const text = await res.text();

            const responseObj = {
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
              contentType,
              text: text.length > 1000 ? `${text.substring(0, 1000)}...` : text,
              isJson: contentType?.includes("application/json") ?? false,
            };

            // Try to parse as JSON
            if (
              contentType?.includes("application/json") &&
              text?.trim().startsWith("{")
            ) {
              try {
                const jsonData = JSON.parse(text);
                return { ...responseObj, json: jsonData };
              } catch (e) {
                return {
                  ...responseObj,
                  error: `Failed to parse JSON: ${e}`,
                  isJsonParseError: true,
                };
              }
            }

            return responseObj;
          } catch (error) {
            return {
              error: String(error),
              url: config.url,
            };
          }
        },
        { url: alternativeUrl, data: payload }
      );

      // Save for debugging

      this.log(
        `Alternative transaction API response status: ${
          "status" in response ? response.status : "unknown"
        }, Content-Type: ${
          "contentType" in response ? response.contentType : "unknown"
        }`
      );

      return response as ApiResponse<ApiTransactionsData>;
    } catch (error) {
      this.log(`Error in fetchTransactionsAlternative: ${error}`);
      throw error;
    }
  }

  /**
   * Save transactions to a file for future development/testing
   */
  public async saveTransactionsToFile(
    transactions: any[],
    account: HandelsbankenAccount,
    startDate: string,
    endDate: string
  ): Promise<void> {
    try {
      const filename = `handelsbanken_${account.accountNumber}_${startDate}_${endDate}.json`;
      const filePath = path.join(process.cwd(), "data", filename);

      // Ensure data directory exists
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Save transactions to file
      this.log(`Saving transactions to ${filePath}`);
      fs.writeFileSync(
        filePath,
        JSON.stringify(
          {
            account: {
              accountNumber: account.accountNumber,
              accountName: account.accountName,
              chosenName: account.chosenName,
              system: account.system,
              status: account.status,
            },
            dateRange: {
              startDate,
              endDate,
            },
            transactions,
          },
          null,
          2
        )
      );

      this.log(`Saved ${transactions.length} transactions to ${filePath}`);
      console.log(`\nSaved transactions to: ${filePath}`);
    } catch (error) {
      this.log(`Error saving transactions to file: ${error}`);
      console.error("Failed to save transactions to file:", error);
    }
  }
}
