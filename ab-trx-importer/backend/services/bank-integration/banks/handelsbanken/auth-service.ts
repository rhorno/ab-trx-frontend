/**
 * Authentication service for Handelsbanken BankID
 */
import { Page } from "playwright";
import { LOGIN_URL } from "./models.js";
import { getLogger, Logger } from "../../../shared/logger.js";

export class AuthService {
  private readonly page: Page;
  private readonly verbose: boolean;
  private qrStartToken: string | null = null;
  private autoStartToken: string | null = null;
  private authMode: "same-device" | "other-device" | null = null;
  private logger: Logger;
  private serviceRef: any = null; // POC: Reference to service for QR code notifications

  /**
   * POC: Set service reference for QR code notifications
   */
  setServiceRef(service: any): void {
    this.serviceRef = service;
  }

  /**
   * Set authentication mode (same-device for app-to-app, other-device for QR)
   */
  setAuthMode(mode: "same-device" | "other-device" | null): void {
    this.authMode = mode;
  }

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
    this.logger.debug("=== Starting login flow ===");
    this.logger.debug(`Personnummer: ${personnummer.substring(0, 6)}******`);
    
    const currentUrl = await this.page.url();
    this.logger.debug(`Current URL: ${currentUrl}`);

    // Only navigate to login page if we're not already there
    if (!currentUrl.includes("logon/se/priv/sv/mbidqr")) {
      this.log("Navigating to login page...");
      this.logger.debug(`Navigating to: ${LOGIN_URL}`);
      await this.page.goto(LOGIN_URL);
      this.logger.debug("Navigation complete, waiting for page to load");
    } else {
      this.log("Already on login page, proceeding with login");
      this.logger.debug("Already on login page, skipping navigation");
    }

    this.log("Waiting for personal ID input field...");
    this.logger.debug('Waiting for selector: [data-testid="PersonalIdTypeInput__input"]');
    await this.page.waitForSelector('[data-testid="PersonalIdTypeInput__input"]');
    this.logger.debug("Personal ID input field found");
    
    this.log("Filling in personnummer...");
    this.logger.debug("Filling input field with personnummer");
    await this.page.fill('[data-testid="PersonalIdTypeInput__input"]', personnummer);
    this.logger.debug("Personnummer filled successfully");
    
    // Wait a moment for any validation or UI updates after filling the input
    this.logger.debug("Waiting 100ms for UI to update after filling input");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Determine which button to click based on authMode
    this.logger.debug(`[Auth Mode] Current authMode: ${this.authMode || "null (defaults to other-device)"}`);
    
    if (this.authMode === "same-device") {
      // Same-device flow: Click "Open BankID app" button
      this.log("Auth mode: same-device - Looking for 'Open BankID app' button...");
      this.logger.debug("[Auth Mode] Using same-device flow - will open BankID app");
      
      const sameDeviceButtonSelectors = [
        'button[data-test-id="MBIDStartStage__loginButtonSameDevice"]',
        'button[data-testid="MBIDStartStage__loginButtonSameDevice"]'
      ];
      
      this.logger.debug(`[Auth Mode] Looking for same-device button with selectors: ${sameDeviceButtonSelectors.join(' OR ')}`);
      
      let sameDeviceButtonSelector: string | null = null;
      let sameDeviceButtonFound = false;
      
      for (const selector of sameDeviceButtonSelectors) {
        try {
          this.logger.debug(`[Auth Mode] Trying selector: ${selector}`);
          await this.page.waitForSelector(selector, { 
            state: 'visible',
            timeout: 10000 
          });
          this.logger.debug(`[Auth Mode] Found same-device button with selector: ${selector}`);
          sameDeviceButtonSelector = selector;
          sameDeviceButtonFound = true;
          break;
        } catch (error) {
          this.logger.debug(`[Auth Mode] Selector ${selector} did not find button: ${error}`);
        }
      }
      
      if (!sameDeviceButtonFound) {
        // Diagnostic: List all buttons to see what's available
        this.logger.debug("[Auth Mode] [Diagnostic] Same-device button not found, listing all buttons...");
        const allButtons = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.map((btn, idx) => ({
            index: idx,
            text: btn.textContent?.trim() || '',
            dataTestId: btn.getAttribute('data-testid') || 'none',
            dataTestIdAlt: btn.getAttribute('data-test-id') || 'none',
            visible: btn.offsetParent !== null
          }));
        });
        this.logger.debug(`[Auth Mode] [Diagnostic] Found ${allButtons.length} buttons:`);
        allButtons.forEach(btn => {
          this.logger.debug(`[Auth Mode] [Diagnostic] Button ${btn.index}: text="${btn.text}", data-testid="${btn.dataTestId}", data-test-id="${btn.dataTestIdAlt}", visible=${btn.visible}`);
        });
        
        const errorMsg = `Same-device button not found with selectors: ${sameDeviceButtonSelectors.join(', ')}. Available buttons listed in debug logs.`;
        this.logger.debug(`[Auth Mode] ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      if (!sameDeviceButtonSelector) {
        throw new Error("Same-device button selector is null - this should not happen");
      }
      
      this.log("Clicking 'Open BankID app' button...");
      this.logger.debug(`[Auth Mode] Clicking same-device button with selector: ${sameDeviceButtonSelector}`);
      
      try {
        await this.page.click(sameDeviceButtonSelector, { timeout: 5000 });
        this.logger.debug("[Auth Mode] Same-device button clicked successfully");
      } catch (error) {
        const errorMsg = `Failed to click same-device button: ${error}`;
        this.logger.debug(`[Auth Mode] ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // Wait for init endpoint response with autoStartToken
      this.logger.debug("[Auth Mode] Waiting for init endpoint response with autoStartToken...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } else {
      // Other-device flow: Click "Use BankID app from another device" button (QR code flow)
      this.log("Auth mode: other-device - Looking for 'Use BankID app from another device' button...");
      this.logger.debug("[Auth Mode] Using other-device flow - will show QR code");
      
      const otherDeviceButtonSelectors = [
        'button[data-test-id="MBIDStartStage__otherDeviceButton"]',
        'button[data-testid="MBIDStartStage__otherDeviceButton"]'
      ];
      
      this.logger.debug(`[Auth Mode] Looking for other device button with selectors: ${otherDeviceButtonSelectors.join(' OR ')}`);
      
      let otherDeviceButtonSelector: string | null = null;
      let otherDeviceButtonFound = false;
      
      for (const selector of otherDeviceButtonSelectors) {
        try {
          this.logger.debug(`[Auth Mode] Trying selector: ${selector}`);
          await this.page.waitForSelector(selector, { 
            state: 'visible',
            timeout: 10000 
          });
          this.logger.debug(`[Auth Mode] Found other device button with selector: ${selector}`);
          otherDeviceButtonSelector = selector;
          otherDeviceButtonFound = true;
          break;
        } catch (error) {
          this.logger.debug(`[Auth Mode] Selector ${selector} did not find button: ${error}`);
        }
      }
      
      if (!otherDeviceButtonFound) {
        // Diagnostic: List all buttons to see what's available
        this.logger.debug("[Auth Mode] [Diagnostic] Other device button not found, listing all buttons...");
        const allButtons = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.map((btn, idx) => ({
            index: idx,
            text: btn.textContent?.trim() || '',
            dataTestId: btn.getAttribute('data-testid') || 'none',
            dataTestIdAlt: btn.getAttribute('data-test-id') || 'none',
            visible: btn.offsetParent !== null
          }));
        });
        this.logger.debug(`[Auth Mode] [Diagnostic] Found ${allButtons.length} buttons:`);
        allButtons.forEach(btn => {
          this.logger.debug(`[Auth Mode] [Diagnostic] Button ${btn.index}: text="${btn.text}", data-testid="${btn.dataTestId}", data-test-id="${btn.dataTestIdAlt}", visible=${btn.visible}`);
        });
        
        const errorMsg = `Other device button not found with selectors: ${otherDeviceButtonSelectors.join(', ')}. Available buttons listed in debug logs.`;
        this.logger.debug(`[Auth Mode] ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      if (!otherDeviceButtonSelector) {
        throw new Error("Other device button selector is null - this should not happen");
      }
      
      this.log("Clicking 'Use BankID app from another device' button...");
      this.logger.debug(`[Auth Mode] Clicking other device button with selector: ${otherDeviceButtonSelector}`);
      
      try {
        await this.page.click(otherDeviceButtonSelector, { timeout: 5000 });
        this.logger.debug("[Auth Mode] Other device button clicked successfully");
      } catch (error) {
        const errorMsg = `Failed to click other device button: ${error}`;
        this.logger.debug(`[Auth Mode] ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // Wait a moment for QR code to appear
      this.logger.debug("[Auth Mode] Waiting 1 second for QR code to appear after clicking other device button");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Handle QR auth with simplified monitoring method
    this.log("Setting up BankID authentication flow...");
    this.logger.debug("=== Starting QR code monitoring ===");
    try {
      await this.handleQrCodeMonitoring();

      // If we get here without errors, consider it a success
      this.log("BankID authentication completed");
      this.logger.debug("=== Login flow completed successfully ===");
      return true;
    } catch (error) {
      this.log(`Error during BankID authentication: ${error}`);
      this.logger.debug(`=== Login flow failed: ${error} ===`);
      return false;
    }
  }

  /**
   * Handle the BankID authentication flow by monitoring network requests
   * The website automatically polls the authenticate endpoint - we just intercept the responses
   */
  private async handleQrCodeMonitoring(): Promise<void> {
    this.logger.debug("Setting up QR code monitoring flow");
    
    // Set up network request interception
    this.logger.debug("Step 1: Setting up network interception");
    this.setupNetworkInterception();
    this.logger.debug("Network interception setup complete");

    // Set up login success detection (runs in parallel)
    this.logger.debug("Step 2: Setting up login success detection");
    const loginPromise = this.setupLoginSuccessDetection();
    this.logger.debug("Login success detection setup complete, waiting for authentication...");

    // Wait for authentication to complete
    this.log("Waiting for BankID authentication to complete...");
    this.logger.debug("Waiting for login promise to resolve...");
    await loginPromise;
    this.log("BankID authentication completed successfully.");
    this.logger.debug("Login promise resolved - authentication successful");
  }

  /**
   * Setup network request interception for init and authenticate endpoints
   * The website automatically polls the authenticate endpoint - we just listen to responses
   */
  private setupNetworkInterception(): void {
    this.log("Setting up network request interception for QR code monitoring");
    this.logger.debug("Registering response listener for network interception");
    this.logger.debug(`[Network] serviceRef available: ${this.serviceRef !== null}`);
    this.logger.debug(`[Network] serviceRef.setQrToken available: ${this.serviceRef && typeof this.serviceRef.setQrToken === "function"}`);

    // Listen for responses from the specific Handelsbanken API endpoints
    this.page.on("response", async (response: any) => {
      const url = response.url();
      const status = response.status();
      this.logger.debug(`[Network] Response received: ${url}`);
      this.logger.debug(`[Network] Status: ${status}`);
      this.logger.debug(`[Network] Method: ${response.request().method()}`);

      // Monitor init endpoint for initial qrStartToken and sessionId
      if (url.includes("/mluri/aa/privmbidqrwebse/init/1.0")) {
        this.logger.debug("[Network] ===== INIT ENDPOINT DETECTED =====");
        this.logger.debug(`[Network] Full URL: ${url}`);
        try {
          const contentType = response.headers()["content-type"] || "";
          this.logger.debug(`[Network] Content-Type: ${contentType}`);
          this.logger.debug(`[Network] Response OK: ${response.ok()}`);
          
          if (contentType.includes("application/json")) {
            this.logger.debug("[Network] Parsing JSON response from init endpoint");
            const data = await response.json().catch((err: any) => {
              this.logger.debug(`[Network] JSON parse error: ${err}`);
              return null;
            });
            
            if (data) {
              this.logger.debug(`[Network] Init response data keys: ${Object.keys(data).join(", ")}`);
              this.logger.debug(`[Network] Full init response: ${JSON.stringify(data, null, 2)}`);
              
              // Log additional response fields
              if (data.initialSleepTime !== undefined) {
                this.logger.debug(`[Network] initialSleepTime: ${data.initialSleepTime}ms`);
              }
              if (data.redirectURLUsed !== undefined) {
                this.logger.debug(`[Network] redirectURLUsed: ${data.redirectURLUsed}`);
              }
              if (data._links && data._links.cancel) {
                this.logger.debug(`[Network] Cancel link: ${data._links.cancel.href}`);
                this.logger.debug(`[Network] Cancel link methods: ${JSON.stringify(data._links.cancel.hints?.allow || [])}`);
              }
              
              // Handle autoStartToken for same-device flow
              if (data.autoStartToken) {
                this.logger.debug(`[Network] ===== AUTO START TOKEN DETECTED IN INIT ENDPOINT =====`);
                this.logger.debug(`[Network] autoStartToken found: ${data.autoStartToken.substring(0, 20)}...`);
                this.logger.debug(`[Network] autoStartToken length: ${data.autoStartToken.length}`);
                this.logger.debug(`[Network] Current authMode: ${this.authMode}`);
                
                if (this.authMode === "same-device") {
                  this.log(
                    `Found autoStartToken from init endpoint: ${data.autoStartToken.substring(
                      0,
                      10
                    )}...${data.autoStartToken.substring(data.autoStartToken.length - 5)}`
                  );
                  
                  if (!this.autoStartToken) {
                    this.autoStartToken = data.autoStartToken;
                    this.logger.debug(`[Network] Storing autoStartToken (previous: null)`);
                    
                    // Notify service layer
                    this.logger.debug(`[Network] Checking serviceRef: ${this.serviceRef !== null}`);
                    if (this.serviceRef) {
                      this.logger.debug(`[Network] serviceRef type: ${typeof this.serviceRef}`);
                      this.logger.debug(`[Network] setAutoStartToken type: ${typeof this.serviceRef.setAutoStartToken}`);
                      
                      if (typeof this.serviceRef.setAutoStartToken === "function") {
                        this.logger.debug("[Network] Calling serviceRef.setAutoStartToken() with token");
                        try {
                          this.serviceRef.setAutoStartToken(data.autoStartToken);
                          this.logger.debug("[Network] serviceRef.setAutoStartToken() called successfully");
                        } catch (err) {
                          this.logger.debug(`[Network] ERROR calling setAutoStartToken: ${err}`);
                        }
                      } else {
                        this.logger.debug("[Network] ERROR: serviceRef.setAutoStartToken is not a function");
                      }
                    } else {
                      this.logger.debug("[Network] ERROR: serviceRef is null or undefined");
                    }
                    
                    // Trigger opening BankID app
                    this.logger.debug("[Network] Triggering BankID app opening...");
                    try {
                      await this.openBankIdApp(data.autoStartToken);
                      this.logger.debug("[Network] BankID app opening triggered successfully");
                    } catch (err) {
                      this.log(`Error opening BankID app: ${err}`);
                      this.logger.debug(`[Network] ERROR opening BankID app: ${err}`);
                      this.logger.debug(`[Network] Error stack: ${err instanceof Error ? err.stack : "no stack"}`);
                    }
                  } else {
                    this.logger.debug("[Network] AutoStartToken already exists, skipping");
                  }
                } else {
                  this.logger.debug("[Network] WARNING: autoStartToken found but authMode is not 'same-device' (authMode: ${this.authMode})");
                }
              }
              
              // Handle qrStartToken for other-device flow (existing behavior)
              if (data.qrStartToken) {
                this.logger.debug(`[Network] ===== QR START TOKEN DETECTED IN INIT ENDPOINT =====`);
                this.logger.debug(`[Network] qrStartToken found: ${data.qrStartToken.substring(0, 20)}...`);
                this.logger.debug(`[Network] QR token length: ${data.qrStartToken.length}`);
                
                if (data._links && data._links.authenticate) {
                  this.logger.debug(`[Network] Authenticate link: ${data._links.authenticate.href}`);
                  const sessionIdMatch = data._links.authenticate.href.match(/sessionId=([^&]+)/);
                  if (sessionIdMatch) {
                    this.logger.debug(`[Network] Session ID extracted: ${sessionIdMatch[1]}`);
                  }
                }
                
                const previousToken = this.qrStartToken;
                this.qrStartToken = data.qrStartToken;
                this.logger.debug(`[Network] Storing initial QR token (previous: ${previousToken ? previousToken.substring(0, 10) + "..." : "null"})`);
                
                // Notify service layer (frontend will render)
                this.logger.debug(`[Network] Checking serviceRef: ${this.serviceRef !== null}`);
                if (this.serviceRef) {
                  this.logger.debug(`[Network] serviceRef type: ${typeof this.serviceRef}`);
                  this.logger.debug(`[Network] setQrToken type: ${typeof this.serviceRef.setQrToken}`);
                  
                  if (typeof this.serviceRef.setQrToken === "function") {
                    this.logger.debug("[Network] Calling serviceRef.setQrToken() with token");
                    try {
                      this.serviceRef.setQrToken(data.qrStartToken);
                      this.logger.debug("[Network] serviceRef.setQrToken() called successfully");
                    } catch (err) {
                      this.logger.debug(`[Network] ERROR calling setQrToken: ${err}`);
                    }
                  } else {
                    this.logger.debug("[Network] ERROR: serviceRef.setQrToken is not a function");
                  }
                } else {
                  this.logger.debug("[Network] ERROR: serviceRef is null or undefined");
                }
              } else {
                this.logger.debug("[Network] No qrStartToken found in init response");
              }
              
              // Log if neither token is found
              if (!data.autoStartToken && !data.qrStartToken) {
                this.logger.debug("[Network] WARNING: Neither autoStartToken nor qrStartToken found in init response");
                this.logger.debug(`[Network] Available keys in response: ${Object.keys(data).join(", ")}`);
              }
            } else {
              this.logger.debug("[Network] Failed to parse JSON from init response - data is null");
            }
          } else {
            this.logger.debug(`[Network] Response is not JSON (Content-Type: ${contentType})`);
            const text = await response.text().catch(() => null);
            if (text) {
              this.logger.debug(`[Network] Response text (first 200 chars): ${text.substring(0, 200)}`);
            }
          }
        } catch (error) {
          this.log(`Error processing init response: ${error}`);
          this.logger.debug(`[Network] Error processing init response: ${error}`);
          this.logger.debug(`[Network] Error stack: ${error instanceof Error ? error.stack : "no stack"}`);
        }
        this.logger.debug("[Network] ===== INIT ENDPOINT PROCESSING COMPLETE =====");
      }

      // Monitor authenticate endpoint for polling responses (website polls automatically)
      if (url.includes("/mluri/aa/privmbidqrwebse/authenticate/1.0")) {
        this.logger.debug("[Network] ===== AUTHENTICATE ENDPOINT DETECTED =====");
        this.logger.debug(`[Network] Full URL: ${url}`);
        try {
          const contentType = response.headers()["content-type"] || "";
          this.logger.debug(`[Network] Content-Type: ${contentType}`);
          this.logger.debug(`[Network] Response OK: ${response.ok()}`);
          
          if (contentType.includes("application/json")) {
            this.logger.debug("[Network] Parsing JSON response from authenticate endpoint");
            const data = await response.json().catch((err: any) => {
              this.logger.debug(`[Network] JSON parse error: ${err}`);
              return null;
            });
            
            if (data) {
              this.logger.debug(`[Network] Authenticate response data keys: ${Object.keys(data).join(", ")}`);
              this.logger.debug(`[Network] Full authenticate response: ${JSON.stringify(data, null, 2)}`);
              this.logger.debug(`[Network] Response result: ${data.result || "none"}`);
              this.logger.debug(`[Network] Current stored qrStartToken: ${this.qrStartToken ? this.qrStartToken.substring(0, 20) + "..." : "null"}`);
              
              // Handle different states from polling responses
              if (data.result === "QR_EXPIRED") {
                this.log("QR code expired - authentication timeout");
                this.logger.debug("[Network] QR_EXPIRED state detected");
                // Notify service layer of expiration
                if (
                  this.serviceRef &&
                  typeof this.serviceRef.notifyAuthError === "function"
                ) {
                  this.logger.debug("[Network] Notifying service layer of QR expiration");
                  this.serviceRef.notifyAuthError("QR code expired - please try again");
                  this.logger.debug("[Network] Service layer notified of expiration");
                } else {
                  this.logger.debug("[Network] WARNING: serviceRef not available for error notification");
                  this.logger.debug(`[Network] serviceRef: ${this.serviceRef}, notifyAuthError type: ${this.serviceRef ? typeof this.serviceRef.notifyAuthError : "N/A"}`);
                }
              } else if (data.result === "IN_PROGRESS") {
                this.log("Authentication in progress - waiting for user approval");
                this.logger.debug("[Network] IN_PROGRESS state - user has scanned, waiting for approval");
              } else if (data.result === "NO_CLIENT_STARTED") {
                this.log("Waiting for user to scan QR code");
                this.logger.debug("[Network] NO_CLIENT_STARTED state - waiting for user to scan QR code");
              } else {
                this.logger.debug(`[Network] Unknown result state: ${data.result}`);
              }

              // Update QR code if qrStartToken changed (new QR code generated)
              if (data.qrStartToken) {
                this.logger.debug(`[Network] qrStartToken found in response: ${data.qrStartToken.substring(0, 20)}...`);
                this.logger.debug(`[Network] Comparing tokens - current: ${this.qrStartToken ? this.qrStartToken.substring(0, 20) + "..." : "null"}, new: ${data.qrStartToken.substring(0, 20)}...`);
                
                if (data.qrStartToken !== this.qrStartToken) {
                  this.log(
                    `QR token updated: ${data.qrStartToken.substring(
                      0,
                      10
                    )}...${data.qrStartToken.substring(data.qrStartToken.length - 5)}`
                  );
                  this.logger.debug(`[Network] QR token changed from ${this.qrStartToken?.substring(0, 10) || "null"}... to ${data.qrStartToken.substring(0, 10)}...`);
                  this.qrStartToken = data.qrStartToken;
                  this.logger.debug("[Network] Storing updated QR token");
                  
                  // Notify service layer to update frontend QR code
                  this.logger.debug(`[Network] Checking serviceRef for token update: ${this.serviceRef !== null}`);
                  if (this.serviceRef) {
                    this.logger.debug(`[Network] setQrToken type: ${typeof this.serviceRef.setQrToken}`);
                    if (typeof this.serviceRef.setQrToken === "function") {
                      this.logger.debug("[Network] Calling serviceRef.setQrToken() with updated token");
                      try {
                        this.serviceRef.setQrToken(data.qrStartToken);
                        this.logger.debug("[Network] serviceRef.setQrToken() called successfully");
                      } catch (err) {
                        this.logger.debug(`[Network] ERROR calling setQrToken: ${err}`);
                      }
                    } else {
                      this.logger.debug("[Network] ERROR: serviceRef.setQrToken is not a function");
                    }
                  } else {
                    this.logger.debug("[Network] ERROR: serviceRef is null for token update");
                  }
                } else {
                  this.logger.debug("[Network] QR token unchanged, skipping update");
                }
              } else {
                this.logger.debug("[Network] No qrStartToken in authenticate response");
                this.logger.debug(`[Network] Available keys: ${Object.keys(data).join(", ")}`);
              }

              // Handle autoStartToken for same-device flow
              if (data.autoStartToken) {
                this.logger.debug(`[Network] autoStartToken found: ${data.autoStartToken.substring(0, 20)}...`);
                if (!this.autoStartToken) {
                  this.log(
                    `Found autoStartToken: ${data.autoStartToken.substring(
                      0,
                      10
                    )}...${data.autoStartToken.substring(data.autoStartToken.length - 5)}`
                  );
                  this.autoStartToken = data.autoStartToken;
                  this.logger.debug("[Network] Storing autoStartToken");
                  
                  // Notify service layer
                  if (
                    this.serviceRef &&
                    typeof this.serviceRef.setAutoStartToken === "function"
                  ) {
                    this.logger.debug("[Network] Notifying service layer of autoStartToken");
                    this.serviceRef.setAutoStartToken(data.autoStartToken);
                    this.logger.debug("[Network] Service layer notified of autoStartToken");
                  } else {
                    this.logger.debug("[Network] WARNING: serviceRef not available for autoStartToken");
                  }
                } else {
                  this.logger.debug("[Network] AutoStartToken already exists, skipping");
                }
              } else {
                this.logger.debug("[Network] No autoStartToken in authenticate response");
              }
              
              // Log iterationSleepTime if present
              if (data.iterationSleepTime) {
                this.logger.debug(`[Network] Iteration sleep time: ${data.iterationSleepTime}ms`);
              }
            } else {
              this.logger.debug("[Network] Failed to parse JSON from authenticate response - data is null");
              const text = await response.text().catch(() => null);
              if (text) {
                this.logger.debug(`[Network] Response text (first 200 chars): ${text.substring(0, 200)}`);
              }
            }
          } else {
            this.logger.debug(`[Network] Response is not JSON (Content-Type: ${contentType})`);
            const text = await response.text().catch(() => null);
            if (text) {
              this.logger.debug(`[Network] Response text (first 200 chars): ${text.substring(0, 200)}`);
            }
          }
        } catch (error) {
          this.log(`Error processing authenticate response: ${error}`);
          this.logger.debug(`[Network] Error processing authenticate response: ${error}`);
          this.logger.debug(`[Network] Error stack: ${error instanceof Error ? error.stack : "no stack"}`);
        }
        this.logger.debug("[Network] ===== AUTHENTICATE ENDPOINT PROCESSING COMPLETE =====");
      } else {
        // Log other network requests for debugging (but don't process them)
        if (url.includes("/mluri/") || url.includes("/mbidqr")) {
          this.logger.debug(`[Network] Other relevant URL detected (not init/authenticate): ${url}`);
        }
      }
    });
    
    this.logger.debug("Network interception listener registered successfully");
    this.logger.debug(`[Network] Final serviceRef check: ${this.serviceRef !== null}`);
  }

  /**
   * Open BankID mobile app using deep link with autoStartToken
   * Uses universal link (preferred) with fallback to custom scheme
   */
  private async openBankIdApp(autoStartToken: string): Promise<void> {
    this.log("Opening BankID app...");
    this.logger.debug("[BankID App] ===== Starting BankID app opening process =====");
    this.logger.debug(`[BankID App] autoStartToken: ${autoStartToken.substring(0, 20)}...${autoStartToken.substring(autoStartToken.length - 5)}`);
    this.logger.debug(`[BankID App] autoStartToken length: ${autoStartToken.length}`);
    
    // Construct universal link (preferred for Android 6+ and iOS)
    const universalLink = `https://app.bankid.com/?autostarttoken=${encodeURIComponent(autoStartToken)}&redirect=null`;
    this.logger.debug(`[BankID App] Universal link constructed: https://app.bankid.com/?autostarttoken=[TOKEN]&redirect=null`);
    this.logger.debug(`[BankID App] Attempting to open BankID app with universal link...`);
    
    try {
      // Try universal link first
      await this.page.goto(universalLink, { 
        waitUntil: 'networkidle', 
        timeout: 5000 
      });
      this.log("BankID app opening triggered via universal link");
      this.logger.debug("[BankID App] Universal link navigation completed successfully");
    } catch (universalLinkError) {
      this.logger.debug(`[BankID App] Universal link failed: ${universalLinkError}`);
      this.logger.debug(`[BankID App] Error details: ${universalLinkError instanceof Error ? universalLinkError.message : String(universalLinkError)}`);
      
      // Fallback to custom scheme
      const customScheme = `bankid:///?autostarttoken=${encodeURIComponent(autoStartToken)}&redirect=null`;
      this.logger.debug(`[BankID App] Universal link failed, trying custom scheme...`);
      this.logger.debug(`[BankID App] Custom scheme constructed: bankid:///?autostarttoken=[TOKEN]&redirect=null`);
      
      try {
        await this.page.goto(customScheme, { 
          waitUntil: 'networkidle', 
          timeout: 5000 
        });
        this.log("BankID app opening triggered via custom scheme");
        this.logger.debug("[BankID App] Custom scheme navigation completed successfully");
      } catch (customSchemeError) {
        const errorMsg = `Failed to open BankID app with both universal link and custom scheme. Universal link error: ${universalLinkError instanceof Error ? universalLinkError.message : String(universalLinkError)}. Custom scheme error: ${customSchemeError instanceof Error ? customSchemeError.message : String(customSchemeError)}`;
        this.log(`Error: ${errorMsg}`);
        this.logger.debug(`[BankID App] ERROR: ${errorMsg}`);
        this.logger.debug(`[BankID App] Custom scheme error stack: ${customSchemeError instanceof Error ? customSchemeError.stack : "no stack"}`);
        throw new Error(errorMsg);
      }
    }
    
    this.logger.debug("[BankID App] ===== BankID app opening process complete =====");
  }

  /**
   * Monitor navigation to detect successful login
   */
  private setupLoginSuccessDetection(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.log("Setting up login success detection");
      this.logger.debug("[Login Detection] Initializing login success detection");
      this.logger.debug("[Login Detection] Timeout set to 120 seconds (2 minutes)");

      // Flag to track if we've already resolved
      let hasResolved = false;

      // Setup a timeout to eventually resolve even if we don't detect success
      const timeout = setTimeout(() => {
        if (!hasResolved) {
          this.log("Login detection timeout reached");
          this.logger.debug("[Login Detection] Timeout reached after 120 seconds");
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
          this.logger.debug(`[Login Detection] Frame navigated to: ${url}`);

          // Check if the URL indicates a successful login
          const isAuthenticatedUrl =
            url.includes("/privat") ||
            url.includes("/dashboard") ||
            url.includes("/overview") ||
            url.includes("/account") ||
            url.includes("/welcome") ||
            !url.includes("/login");
            
          this.logger.debug(`[Login Detection] Is authenticated URL: ${isAuthenticatedUrl}`);
          
          if (isAuthenticatedUrl) {
            this.logger.debug("[Login Detection] Potential authenticated URL detected, checking page content");
            // Wait a bit to make sure the page has loaded
            await new Promise((resolve) => setTimeout(resolve, 2000));
            this.logger.debug("[Login Detection] Waited 2 seconds for page to load");

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

                return {
                  hasLogoutLinks: logoutLinks.length > 0,
                  hasAccountElements: accountElements.length > 0,
                  hasWelcomeElements: welcomeElements.length > 0,
                  isLoggedIn: (
                    logoutLinks.length > 0 ||
                    accountElements.length > 0 ||
                    welcomeElements.length > 0
                  )
                };
              })
              .catch(() => ({ isLoggedIn: false }));

            this.logger.debug(`[Login Detection] Page content check: ${JSON.stringify(isLoggedIn)}`);

            if (isLoggedIn.isLoggedIn) {
              this.log(
                "Detected successful login based on page navigation and content"
              );
              this.logger.debug("[Login Detection] Login confirmed - clearing timeout and resolving");
              clearTimeout(timeout);
              if (!hasResolved) {
                hasResolved = true;
                resolve();
              }
            } else {
              this.logger.debug("[Login Detection] Page content does not indicate login yet");
            }
          } else {
            this.logger.debug("[Login Detection] URL does not indicate authenticated state");
          }
        }
      });

      // Also detect successful login by checking periodically
      this.logger.debug("[Login Detection] Setting up periodic check (every 5 seconds)");
      const checkLoginInterval = setInterval(async () => {
        if (hasResolved) {
          this.logger.debug("[Login Detection] Already resolved, clearing interval");
          clearInterval(checkLoginInterval);
          return;
        }

        this.logger.debug("[Login Detection] Running periodic login check");
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

              return {
                hasLogoutLinks: logoutLinks.length > 0,
                hasAccountElements: accountElements.length > 0,
                hasWelcomeElements: welcomeElements.length > 0,
                isLoggedIn: (
                  logoutLinks.length > 0 ||
                  accountElements.length > 0 ||
                  welcomeElements.length > 0
                )
              };
            })
            .catch(() => ({ isLoggedIn: false }));

          this.logger.debug(`[Login Detection] Periodic check result: ${JSON.stringify(isLoggedIn)}`);

          if (isLoggedIn.isLoggedIn) {
            this.log("Detected successful login through periodic check");
            this.logger.debug("[Login Detection] Login confirmed via periodic check - clearing timeout and interval");
            clearTimeout(timeout);
            clearInterval(checkLoginInterval);
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          }
        } catch (error) {
          this.logger.debug(`[Login Detection] Error in periodic check: ${error}`);
          // Ignore errors in check
        }
      }, 5000); // Check every 5 seconds
    });
  }

}
