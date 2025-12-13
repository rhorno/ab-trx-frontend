/**
 * Authentication service for Handelsbanken BankID
 */
import { Page } from "playwright";
import { renderQrToken } from "./utils.js";
import { LOGIN_URL } from "./models.js";
import { getLogger, Logger } from "../../../shared/logger.js";

export class AuthService {
  private readonly page: Page;
  private readonly verbose: boolean;
  private qrStartToken: string | null = null;
  private logger: Logger;

  /**
   * Creates a new authentication service
   */
  constructor(page: Page, verbose: boolean = false) {
    this.page = page;
    this.verbose = verbose;
    this.logger = getLogger("Handelsbanken.Auth");
  }

  /**
   * Log message to both file and console if verbose mode is enabled
   */
  private log(message: string): void {
    this.logger.debug(message);
    if (this.verbose) {
      console.log(`[Handelsbanken Auth] ${message}`);
    }
  }

  /**
   * Handle cookie consent modal
   */
  public async handleCookieConsent(): Promise<void> {
    this.log("Checking for cookie consent modal...");

    try {
      // Wait longer for the modal to appear - sometimes it takes a moment to load
      this.log("Waiting for page content to load...");
      await this.page.waitForTimeout(2000);

      // Get the current URL to track where we are
      const currentUrl = await this.page.url();
      this.log(`Current URL: ${currentUrl}`);

      // Check if the page contains the cookie consent modal title
      this.log("Looking for cookie consent modal title...");
      const titleSelector = 'h1:has-text("Cookies på Handelsbanken")';
      const hasModal = await this.page
        .waitForSelector(titleSelector, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (hasModal) {
        this.log("Cookie consent modal detected by title");

        // Try to find the "Godkänn nödvändiga" button - based on the screenshot
        const buttonSelector = 'button:has-text("Godkänn nödvändiga")';
        this.log(`Looking for button with text: ${buttonSelector}`);

        try {
          await this.page.waitForSelector(buttonSelector, { timeout: 3000 });
          this.log('Found "Godkänn nödvändiga" button');

          // Try clicking with force: true option to bypass any overlay issues
          this.log("Attempting to click button...");
          await this.page.click(buttonSelector, { force: true });

          this.log('Clicked "Godkänn nödvändiga" button');
          await this.page.waitForTimeout(2000);

          // Check if modal is still visible
          const modalStillVisible = await this.page
            .waitForSelector(titleSelector, { timeout: 1000 })
            .then(() => true)
            .catch(() => false);

          if (modalStillVisible) {
            this.log("Modal still visible, trying JavaScript click");
            // Try JavaScript click as last resort
            await this.page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll("button"));
              const necessaryButton = buttons.find((button) =>
                button.textContent?.includes("Godkänn nödvändiga")
              );
              if (necessaryButton) {
                (necessaryButton as HTMLButtonElement).click();
              }
            });

            await this.page.waitForTimeout(2000);

            // Check again if modal is still visible after JavaScript click
            const stillVisibleAfterJsClick = await this.page
              .waitForSelector(titleSelector, { timeout: 1000 })
              .then(() => true)
              .catch(() => false);

            if (stillVisibleAfterJsClick) {
              this.log(
                "Modal still visible after JavaScript click, proceeding anyway"
              );
            } else {
              this.log("Modal removed after JavaScript click");
            }
          }
        } catch (error) {
          this.log(`Error finding or clicking button: ${error}`);

          // Try clicking any button that looks like "Godkänn"
          this.log('Trying to find any "Godkänn" button...');
          await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const cookieButtons = buttons.filter((b) =>
              b.textContent?.includes("Godkänn")
            );

            if (cookieButtons.length > 0) {
              // Prefer "Godkänn nödvändiga" if available
              const necessaryButton = cookieButtons.find((b) =>
                b.textContent?.includes("nödvändiga")
              );

              if (necessaryButton) {
                (necessaryButton as HTMLButtonElement).click();
              } else if (cookieButtons.length > 0) {
                // Otherwise click the first "Godkänn" button
                (cookieButtons[0] as HTMLButtonElement).click();
              }
            }
          });

          await this.page.waitForTimeout(2000);
        }
      } else {
        this.log("No cookie consent modal detected by title");

        // Try alternative detection - look for any element containing "Cookies på Handelsbanken"
        const altTitleSelector = 'text="Cookies på Handelsbanken"';
        const hasAltModal = await this.page
          .waitForSelector(altTitleSelector, { timeout: 2000 })
          .then(() => true)
          .catch(() => false);

        if (hasAltModal) {
          this.log("Cookie modal detected by text content");

          // Try to find and click the right button
          await this.page.evaluate(() => {
            // Get all buttons on the page
            const buttons = Array.from(document.querySelectorAll("button"));

            // Find button with "Godkänn nödvändiga" text
            for (const button of buttons) {
              if (button.textContent?.includes("Godkänn nödvändiga")) {
                (button as HTMLButtonElement).click();
                return;
              }
            }

            // If not found, try buttons near the "Cookies på Handelsbanken" text
            const cookieText = document.evaluate(
              "//*[contains(text(), 'Cookies på Handelsbanken')]",
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue;

            if (cookieText) {
              // Try to find nearby buttons
              let element: Element | null = cookieText as Element;
              while (element && element.tagName !== "BODY") {
                const nearbyButtons = element.querySelectorAll("button");
                if (nearbyButtons.length > 0) {
                  // Try to find the right button or click the second one (usually "decline")
                  const necessaryButton = Array.from(nearbyButtons).find((b) =>
                    b.textContent?.includes("nödvändiga")
                  );

                  if (necessaryButton) {
                    (necessaryButton as HTMLButtonElement).click();
                  } else if (nearbyButtons.length > 1) {
                    (nearbyButtons[1] as HTMLButtonElement).click();
                  } else if (nearbyButtons.length === 1) {
                    (nearbyButtons[0] as HTMLButtonElement).click();
                  }
                  return;
                }
                element = element.parentElement;
              }
            }
          });

          await this.page.waitForTimeout(2000);
        } else {
          this.log("No cookie modal detected by any method");
        }
      }
    } catch (err) {
      this.log(`Error handling cookie consent: ${err}`);
    }
  }

  /**
   * Handle the login flow with BankID QR code
   */
  public async login(personnummer: string): Promise<boolean> {
    const currentUrl = await this.page.url();

    // Only navigate to login page if we're not already there
    if (!currentUrl.includes("logon/se/priv/sv/mbidqr")) {
      this.log("Navigating to login page...");
      await this.page.goto(LOGIN_URL);
    } else {
      this.log("Already on login page, proceeding with login");
    }

    while (true) {
      this.log("Waiting for userId input field...");
      await this.page.waitForSelector("input#userId");
      this.log("Filling in personnummer...");
      await this.page.fill("input#userId", personnummer);

      this.log("Clicking login button...");
      try {
        await this.page.click(
          'button[data-test-id="MBIDStartStage__loginButton"]'
        );
      } catch (err) {
        this.log(`Error clicking login button: ${err}`);
        // Try a different approach if the button is obscured
        this.log("Trying alternative click method...");
        await this.page.evaluate(() => {
          const button = document.querySelector(
            'button[data-test-id="MBIDStartStage__loginButton"]'
          );
          if (button) (button as HTMLButtonElement).click();
        });
      }

      // Wait a moment for any animations to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Handle QR auth with our improved method
      this.log("Setting up BankID authentication flow...");
      try {
        // Set up our improved QR code detection methods
        await this.handleBankIdAuthentication();

        // If we get here without errors, consider it a success
        this.log("BankID authentication completed");
        return true;
      } catch (error) {
        this.log(`Error during BankID authentication: ${error}`);

        // Check if we need to retry from a higher-level function
        return false;
      }
    }
  }

  /**
   * Handle the BankID authentication flow for Handelsbanken
   */
  private async handleBankIdAuthentication(): Promise<void> {
    // Setup QR token detection
    this.setupQrCodeDetection();

    // Wait for the QR login screen - we look both for the mobile QR and desktop QR options
    this.log("Waiting for BankID QR login screen...");
    try {
      await Promise.race([
        this.page.waitForSelector(
          'a[data-test-id="QrInitiateMobileDeviceLaunch-QrInitiateMobileDeviceLaunchLinkBtn"]',
          { timeout: 10000 }
        ),
        this.page.waitForSelector(
          '[data-test-id="QrInitiateOtherDeviceLaunch-QrInitiateOtherDeviceLaunchBtn"]',
          { timeout: 10000 }
        ),
        this.page.waitForSelector('img[src^="data:image/png;base64"]', {
          timeout: 10000,
        }),
        this.page.waitForSelector('[class*="qr"],[id*="qr"]', {
          timeout: 10000,
        }),
      ]);
      this.log("Found QR login option screen.");
    } catch (error) {
      this.log(
        "Could not find QR login screen through selectors, but continuing anyway."
      );
    }

    // Wait a moment for any scripts to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Set up login success detection (this runs in parallel)
    const loginPromise = this.setupLoginSuccessDetection();

    // Try to find the QR code with multiple attempts
    const qrStartToken = await this.findQrCodeWithMultipleAttempts();

    if (qrStartToken) {
      // Found the QR token, display it
      this.log(
        `Successfully obtained QR token: ${qrStartToken.substring(0, 10)}...`
      );
      await renderQrToken(qrStartToken);
    } else {
      // Could not find the QR token, inform the user
      this.log("Could not find QR code token automatically.");
      console.log("\nUnable to automatically extract QR code.");
      console.log(
        "Please scan the QR code shown in the browser window with your BankID app."
      );
      console.log(
        "If no QR code is visible, look for a button to show the QR code or try an alternative login method.\n"
      );
    }

    // Wait for the login to complete
    this.log("Waiting for BankID authentication to complete...");
    await loginPromise;
    this.log("BankID authentication completed successfully.");
  }

  /**
   * Setup detection of QR codes through response interception
   */
  private setupQrCodeDetection(): void {
    this.log("Setting up QR code detection through response interception");

    // Listen for responses that might contain QR token data
    this.page.on("response", async (response: any) => {
      const url = response.url();

      // Look for common API endpoints that might return QR token data
      if (
        url.includes("/api/qr") ||
        url.includes("/bankid") ||
        url.includes("/auth") ||
        url.includes("/login")
      ) {
        try {
          const contentType = response.headers()["content-type"] || "";

          if (contentType.includes("application/json")) {
            const data = await response.json().catch(() => null);

            if (data) {
              // Recursively search for qrStartToken or qrData in the response
              const findToken = (obj: any): string | null => {
                if (!obj || typeof obj !== "object") return null;

                if (obj.qrStartToken && typeof obj.qrStartToken === "string") {
                  return obj.qrStartToken;
                }

                if (obj.qrData && typeof obj.qrData === "string") {
                  return obj.qrData;
                }

                if (
                  obj.token &&
                  typeof obj.token === "string" &&
                  obj.token.length > 20
                ) {
                  return obj.token;
                }

                for (const key in obj) {
                  if (typeof obj[key] === "object") {
                    const result = findToken(obj[key]);
                    if (result) return result;
                  }
                }

                return null;
              };

              const token = findToken(data);
              if (token) {
                this.log(
                  `Found QR token in API response: ${token.substring(0, 10)}...`
                );
                this.qrStartToken = token;
                // Always render the QR code when found in an API response
                await renderQrToken(token);
              }
            }
          }
        } catch (error) {
          // Ignore errors in response handling
        }
      }
    });
  }

  /**
   * Monitor navigation to detect successful login
   */
  private setupLoginSuccessDetection(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.log("Setting up login success detection");

      // Flag to track if we've already resolved
      let hasResolved = false;

      // Setup a timeout to eventually resolve even if we don't detect success
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          this.log("Login detection timeout reached");
          hasResolved = true;
          resolve();
        }
      }, 120000); // 2 minute timeout

      // Listen for navigation events that might indicate successful login
      this.page.on("framenavigated", async (frame) => {
        if (frame.parentFrame() === null) {
          // Main frame only
          const url = frame.url();
          this.log(`Main frame navigated to: ${url}`);

          // Check if the URL indicates a successful login
          if (
            url.includes("/privat") ||
            url.includes("/dashboard") ||
            url.includes("/overview") ||
            url.includes("/account") ||
            url.includes("/welcome") ||
            !url.includes("/login")
          ) {
            // Wait a bit to make sure the page has loaded
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Check for elements that indicate we're logged in
            const isLoggedIn = await this.page
              .evaluate(() => {
                // Look for common elements that appear after login
                const logoutLinks =
                  document.querySelectorAll('a[href*="logout"]');
                const accountElements = document.querySelectorAll(
                  '[class*="account"],[class*="balance"],[class*="overview"]'
                );
                const welcomeElements = document.querySelectorAll(
                  '[class*="welcome"],[class*="greeting"]'
                );

                return (
                  logoutLinks.length > 0 ||
                  accountElements.length > 0 ||
                  welcomeElements.length > 0
                );
              })
              .catch(() => false);

            if (isLoggedIn) {
              this.log(
                "Detected successful login based on page navigation and content"
              );
              clearTimeout(timeout);
              if (!hasResolved) {
                hasResolved = true;
                resolve();
              }
            }
          }
        }
      });

      // Also detect successful login by checking periodically
      const checkLoginInterval = setInterval(async () => {
        if (hasResolved) {
          clearInterval(checkLoginInterval);
          return;
        }

        try {
          const isLoggedIn = await this.page
            .evaluate(() => {
              // Same checks as above but run periodically
              const logoutLinks =
                document.querySelectorAll('a[href*="logout"]');
              const accountElements = document.querySelectorAll(
                '[class*="account"],[class*="balance"],[class*="overview"]'
              );
              const welcomeElements = document.querySelectorAll(
                '[class*="welcome"],[class*="greeting"]'
              );

              return (
                logoutLinks.length > 0 ||
                accountElements.length > 0 ||
                welcomeElements.length > 0
              );
            })
            .catch(() => false);

          if (isLoggedIn) {
            this.log("Detected successful login through periodic check");
            clearTimeout(timeout);
            clearInterval(checkLoginInterval);
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          }
        } catch (error) {
          // Ignore errors in check
        }
      }, 5000); // Check every 5 seconds
    });
  }

  /**
   * Extract QR code token from the current page
   */
  private async extractQrCodeFromPage(): Promise<string | null> {
    this.log("Attempting to extract QR code from page...");

    try {
      return await this.page.evaluate(() => {
        // Method 1: Look for qrStartToken in window variables
        if (
          window.hasOwnProperty("qrData") ||
          window.hasOwnProperty("qrStartToken")
        ) {
          // @ts-ignore
          const token = window.qrData || window.qrStartToken;
          if (typeof token === "string" && token.length > 20) {
            console.log(
              `Found qrStartToken in window object: ${token.substring(
                0,
                10
              )}...`
            );
            return token;
          }
        }

        // Method 2: Check if there's a QR token in any script tag
        const scripts = Array.from(document.querySelectorAll("script"));
        for (const script of scripts) {
          const content = script.textContent || "";
          if (content.includes("qrStartToken") || content.includes("qrData")) {
            // Try multiple regex patterns to capture various formats
            const patterns = [
              /"qrStartToken"\s*:\s*"([^"]+)"/,
              /'qrStartToken'\s*:\s*'([^']+)'/,
              /qrStartToken\s*=\s*["']([^"']+)["']/,
              /"qrData"\s*:\s*"([^"]+)"/,
              /'qrData'\s*:\s*'([^']+)'/,
              /qrData\s*=\s*["']([^"']+)["']/,
            ];

            for (const pattern of patterns) {
              const match = content.match(pattern);
              if (match && match[1]) {
                console.log(
                  `Found QR token in script: ${match[1].substring(0, 10)}...`
                );
                return match[1];
              }
            }
          }
        }

        // Method 3: Look for it in the page source using various patterns
        const html = document.documentElement.outerHTML;
        const sourcePatterns = [
          /"qrStartToken"\s*:\s*"([^"]+)"/,
          /'qrStartToken'\s*:\s*'([^']+)'/,
          /qrStartToken\s*=\s*["']([^"']+)["']/,
          /"qrData"\s*:\s*"([^"]+)"/,
          /'qrData'\s*:\s*'([^']+)'/,
          /qrData\s*=\s*["']([^"']+)["']/,
        ];

        for (const pattern of sourcePatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            console.log(
              `Found QR token in page source: ${match[1].substring(0, 10)}...`
            );
            return match[1];
          }
        }

        // Method 4: Look for canvas elements that might be rendering QR codes
        const canvases = document.querySelectorAll("canvas");
        if (canvases.length > 0) {
          console.log(
            `Found ${canvases.length} canvas elements, checking for QR code data`
          );

          // Sometimes QR code data is stored in adjacent elements or data attributes
          for (const canvas of Array.from(canvases)) {
            // Check parent and sibling elements for data attributes
            const parent = canvas.parentElement;
            if (parent) {
              const dataAttrs = parent
                .getAttributeNames()
                .filter((attr) => attr.startsWith("data-"));
              for (const attr of dataAttrs) {
                const value = parent.getAttribute(attr);
                if (value && value.length > 20) {
                  console.log(
                    `Found potential token in canvas parent data attribute: ${value.substring(
                      0,
                      10
                    )}...`
                  );
                  return value;
                }
              }
            }
          }
        }

        // Method 5: Check for src attributes in img tags that might contain the QR data
        const qrImages = document.querySelectorAll(
          'img[src^="data:image/"], img[alt*="QR"], img[alt*="qr"]'
        );
        for (const img of Array.from(qrImages)) {
          // Check if there are any hidden inputs or data attributes nearby
          const parent = img.parentElement;
          if (parent) {
            // Look for hidden inputs
            const inputs = parent.querySelectorAll('input[type="hidden"]');
            for (const input of Array.from(inputs)) {
              const value = (input as HTMLInputElement).value;
              if (value && value.length > 20) {
                console.log(
                  `Found potential token in hidden input: ${value.substring(
                    0,
                    10
                  )}...`
                );
                return value;
              }
            }

            // Check for data attributes that might contain the token
            const dataAttrs = parent
              .getAttributeNames()
              .filter((attr) => attr.startsWith("data-"));
            for (const attr of dataAttrs) {
              const value = parent.getAttribute(attr);
              if (value && value.length > 20) {
                console.log(
                  `Found potential token in img parent data attribute: ${value.substring(
                    0,
                    10
                  )}...`
                );
                return value;
              }
            }
          }
        }

        // Method 6: Look for QR code information in any DOM elements
        // This is more aggressive but might be needed when the QR code is rendered in a non-standard way
        const potentialContainers = document.querySelectorAll(
          '[class*="qr"], [id*="qr"], [data-*="qr"], [class*="bankid"], [id*="bankid"]'
        );

        for (const container of Array.from(potentialContainers)) {
          // Check for data attributes
          const allAttributes = container.getAttributeNames();
          for (const attr of allAttributes) {
            const value = container.getAttribute(attr);
            if (value && value.length > 20) {
              console.log(
                `Found potential token in element attribute: ${value.substring(
                  0,
                  10
                )}...`
              );
              return value;
            }
          }

          // Check text content of the element and its children
          const text = container.textContent || "";
          const matches = text.match(/[A-Za-z0-9+/=]{30,}/);
          if (matches && matches[0]) {
            console.log(
              `Found potential token in text content: ${matches[0].substring(
                0,
                10
              )}...`
            );
            return matches[0];
          }
        }

        // Method 7: As a last resort, check all rendered JSON data on the page
        console.log(
          "Searching for QR token in all page scripts as last resort"
        );
        const allScriptContents = scripts
          .map((s) => s.textContent || "")
          .join(" ");
        const jsonBlocks = allScriptContents.match(/(\{[^{}]*\})/g) || [];

        for (const jsonBlock of jsonBlocks) {
          try {
            const data = JSON.parse(jsonBlock);
            // Recursively search for qrStartToken or qrData in the parsed object
            const findToken = (obj: any): string | null => {
              if (!obj || typeof obj !== "object") return null;

              if (obj.qrStartToken && typeof obj.qrStartToken === "string") {
                return obj.qrStartToken;
              }

              if (obj.qrData && typeof obj.qrData === "string") {
                return obj.qrData;
              }

              for (const key in obj) {
                if (typeof obj[key] === "object") {
                  const result = findToken(obj[key]);
                  if (result) return result;
                }
              }

              return null;
            };

            const token = findToken(data);
            if (token) {
              console.log(
                `Found QR token in JSON data: ${token.substring(0, 10)}...`
              );
              return token;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }

        return null;
      });
    } catch (error) {
      this.log(`Error extracting QR code: ${error}`);
      return null;
    }
  }

  /**
   * Check for QR code expiration indicators on the page
   */
  private async checkQrCodeExpiration(): Promise<boolean> {
    try {
      // Check for common expiration indicators
      return await this.page.evaluate(() => {
        // Look for text indicating expiration
        const expirationTexts = [
          "utgått",
          "expired",
          "förfallen",
          "ny kod",
          "new code",
          "försök igen",
          "try again",
          "uppdatera",
          "refresh",
          "qr-koden har utgått",
          "qr code has expired",
        ];

        // Get all text from the page
        const pageText = document.body.innerText.toLowerCase();

        // Check if any expiration text is present
        for (const text of expirationTexts) {
          if (pageText.includes(text)) {
            console.log(`Detected QR code expiration indicator: ${text}`);
            return true;
          }
        }

        // Also check for timers that might be at zero
        const timerElements = document.querySelectorAll(
          '[class*="timer"], [class*="countdown"], [class*="tid"]'
        );
        for (const timer of Array.from(timerElements)) {
          const timerText = timer.textContent || "";
          if (timerText.includes("0:00") || timerText.includes("00:00")) {
            console.log("Detected countdown timer at zero");
            return true;
          }
        }

        // Check for specific error messages or indicators
        const errorElements = document.querySelectorAll(
          '.error, .alert, .warning, [class*="error"], [class*="warning"]'
        );
        for (const error of Array.from(errorElements)) {
          const errorText = error.textContent || "";
          if (errorText.length > 0) {
            console.log(
              `Detected error message: ${errorText.substring(0, 50)}...`
            );
            return true;
          }
        }

        return false;
      });
    } catch (error) {
      this.log(`Error checking QR code expiration: ${error}`);
      return false;
    }
  }

  /**
   * Ensures we find the QR code by trying multiple methods and attempts
   */
  private async findQrCodeWithMultipleAttempts(): Promise<string | null> {
    this.log("Trying to find QR code with multiple attempts...");

    // Try extracting the QR code multiple times with different timings
    const delays = [500, 1000, 2000, 3000, 5000];

    for (let i = 0; i < delays.length; i++) {
      // Try first to get it from intercepted responses
      if (this.qrStartToken) {
        this.log(
          `Found qrStartToken from intercepted responses: ${this.qrStartToken.substring(
            0,
            10
          )}...`
        );
        const token = this.qrStartToken;
        // Always render the QR code when found
        await renderQrToken(token);
        return token;
      }

      // Then try to extract it from the page
      const extractedToken = await this.extractQrCodeFromPage();
      if (extractedToken) {
        this.log(
          `Successfully extracted QR code from page on attempt ${i + 1}`
        );
        // Always render the QR code when found
        await renderQrToken(extractedToken);
        return extractedToken;
      }

      this.log(
        `QR code not found on attempt ${i + 1}, waiting ${
          delays[i]
        }ms before next attempt...`
      );

      if (i < delays.length - 1) {
        // Try clicking any "Show QR code" buttons or alternatives
        await this.page.evaluate(() => {
          // Find and click any buttons that might reveal the QR code
          const potentialButtons = Array.from(
            document.querySelectorAll('button, a, [role="button"]')
          ).filter((el) => {
            const text = (el.textContent || "").toLowerCase();
            return (
              text.includes("qr") ||
              text.includes("visa qr") ||
              text.includes("bankid") ||
              text.includes("mobil") ||
              text.includes("visa kod")
            );
          });

          if (potentialButtons.length > 0) {
            console.log(
              `Found ${potentialButtons.length} potential QR trigger buttons`
            );
            (potentialButtons[0] as HTMLElement).click();
          }
        });

        // Wait for the specified delay
        await new Promise((resolve) => setTimeout(resolve, delays[i]));
      }
    }

    // If we get here, try one last approach - refresh the page and try again
    this.log("Refreshing page for one final attempt...");
    try {
      await this.page.reload();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return await this.extractQrCodeFromPage();
    } catch (error) {
      this.log(`Error during final QR code extraction attempt: ${error}`);
    }

    return null;
  }
}
