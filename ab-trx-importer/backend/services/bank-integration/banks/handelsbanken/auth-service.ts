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
  private sessionId: string | null = null; // Session ID for manual authenticate polling
  private authenticatePollingInterval: NodeJS.Timeout | null = null; // Interval for manual polling
  private initRedirectURL: string | null = null; // Redirect URL from init response (e.g., /logon/se/priv/sv/mbidqr/#authenticate)
  private authCallbackSessionId: string | null = null; // Session ID for auth callback tracking (generated when login starts)
  private frontendUrl: string | null = null; // Frontend URL for auth callback (set from params or env)

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
   * Set frontend URL for auth callback (must be network-accessible for mobile devices)
   */
  setFrontendUrl(url: string): void {
    this.frontendUrl = url;
    this.logger.debug(`[Auth] Frontend URL set to: ${url}`);
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
    
    // Generate unique session ID for auth callback tracking
    // Format: timestamp-random (e.g., 1234567890-abc123)
    this.authCallbackSessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.logger.debug(`Generated auth callback session ID: ${this.authCallbackSessionId}`);
    
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
    
    // Verify the input field has the correct value
    const inputValue = await this.page.inputValue('[data-testid="PersonalIdTypeInput__input"]').catch(() => null);
    this.logger.debug(`Input field value after filling: ${inputValue ? inputValue.substring(0, 6) + "******" : "null"}`);
    
    // Wait a bit more to ensure form is ready and any validation has completed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Determine which button to click based on authMode
    this.logger.debug(`[Auth Mode] Current authMode: ${this.authMode || "null (defaults to other-device)"}`);
    
    // CRITICAL FIX: Set up network interception BEFORE clicking the button
    // The init endpoint response might come back immediately after button click,
    // so we need the listener ready before we trigger the request
    if (this.authMode === "same-device") {
      this.logger.debug("[Auth Mode] Setting up network interception BEFORE button click (same-device mode)");
      this.setupNetworkInterception();
    }
    
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
        // Wait for button to be ready and ensure form is ready
        await this.page.waitForSelector(sameDeviceButtonSelector, { state: 'visible', timeout: 5000 });
        
        // Wait a bit more to ensure any form validation or UI updates are complete
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        // Click the button - use waitForResponse to ensure we catch the init request
        const [response] = await Promise.all([
          this.page.waitForResponse(
            (response) => response.url().includes("/mluri/aa/privmbidqrwebse/init/1.0"),
            { timeout: 10000 }
          ).catch(() => null),
          this.page.click(sameDeviceButtonSelector, { timeout: 5000 })
        ]);
        
        this.logger.debug("[Auth Mode] Same-device button clicked successfully");
        
        if (response && response.status() !== 200) {
          this.logger.debug(`[Auth Mode] Init endpoint returned status ${response.status()}`);
        }
      } catch (error) {
        const errorMsg = `Failed to click same-device button: ${error}`;
        this.logger.debug(`[Auth Mode] ERROR: ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // Wait a bit for any additional responses
      this.logger.debug("[Auth Mode] Waiting briefly for any additional responses...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
      // For same-device mode, network interception is already set up before button click
      // For other-device mode, set it up now
      if (this.authMode !== "same-device") {
        this.setupNetworkInterception();
      }
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
    // Network interception is already set up for same-device mode (before button click)
    // For other-device mode, it's set up in login() before calling this method
    this.logger.debug("Network interception should already be set up");

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
    
    if (!this.page) {
      this.logger.debug("[Network] ERROR: page is null, cannot setup network interception");
      return;
    }

    // NOTE: We cannot modify the redirectURL in the init request because Handelsbanken validates it
    // server-side and rejects non-Handelsbanken URLs with a 400 error.
    // Instead, we rely on the redirect parameter in the BankID universal link for redirecting after authentication.
    // The redirectURL in the init request must remain as the original Handelsbanken URL.

    // Also listen for requests to capture what's being sent (for logging)
    this.page.on("request", async (request: any) => {
      const url = request.url();
      if (url.includes("/mluri/aa/privmbidqrwebse/init/1.0") && request.method() === "POST") {
        try {
          const postData = request.postData();
          if (postData) {
            try {
              const requestBody = JSON.parse(postData);
              this.logger.debug(`[Network] Init request redirectURL (not modified): ${requestBody.redirectURL}`);
            } catch (parseErr) {
              this.logger.debug(`[Network] Could not parse init request body for logging`);
            }
          }
        } catch (err) {
          // Error capturing request - continue
        }
      }
    });

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
              
              // Store redirect URL from init request (if present in request)
              // The init request includes redirectURL: "/logon/se/priv/sv/mbidqr/#authenticate"
              // We'll use this after authentication completes
              // Note: The redirectURL in the request is what we sent, not what we get back
              // But we know it's typically: /logon/se/priv/sv/mbidqr/#authenticate
              this.initRedirectURL = "/logon/se/priv/sv/mbidqr/#authenticate";
              this.logger.debug(`[Network] Stored init redirect URL: ${this.initRedirectURL}`);
              
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
                    
                    // Extract sessionId from cancel link for manual polling
                    let sessionId: string | null = null;
                    if (data._links?.cancel?.href) {
                      const sessionIdMatch = data._links.cancel.href.match(/sessionId=([^&]+)/);
                      if (sessionIdMatch) {
                        sessionId = sessionIdMatch[1];
                        this.logger.debug(`[Network] Session ID extracted from cancel link: ${sessionId}`);
                        // Store sessionId for manual polling
                        this.sessionId = sessionId;
                      }
                    }
                    
                    // Notify service layer - frontend will handle opening the app
                    this.logger.debug(`[Network] Checking serviceRef: ${this.serviceRef !== null}`);
                    if (this.serviceRef) {
                      this.logger.debug(`[Network] serviceRef type: ${typeof this.serviceRef}`);
                      this.logger.debug(`[Network] setAutoStartToken type: ${typeof this.serviceRef.setAutoStartToken}`);
                      
                      if (typeof this.serviceRef.setAutoStartToken === "function") {
                        this.logger.debug("[Network] Calling serviceRef.setAutoStartToken() with token and session ID - frontend will open BankID app");
                        try {
                          this.serviceRef.setAutoStartToken(data.autoStartToken, this.authCallbackSessionId);
                          this.logger.debug(`[Network] serviceRef.setAutoStartToken() called successfully with sessionId: ${this.authCallbackSessionId} - frontend should receive token and open app`);
                          
                          // Start manual polling of authenticate endpoint for same-device flow
                          if (sessionId) {
                            this.log("Starting manual polling of authenticate endpoint for same-device flow");
                            this.logger.debug(`[Network] Starting manual authenticate polling with sessionId: ${sessionId}`);
                            // Start polling asynchronously (don't await - it runs in background)
                            this.startManualAuthenticatePolling(sessionId).catch((error) => {
                              this.logger.debug(`[Network] Error starting manual polling: ${error}`);
                            });
                          } else {
                            this.logger.debug("[Network] No sessionId found, cannot start manual polling");
                          }
                        } catch (err) {
                          this.logger.debug(`[Network] ERROR calling setAutoStartToken: ${err}`);
                        }
                      } else {
                        this.logger.debug("[Network] ERROR: serviceRef.setAutoStartToken is not a function");
                      }
                    } else {
                      this.logger.debug("[Network] ERROR: serviceRef is null or undefined");
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
            } else if (contentType.includes("application/problem+json") || contentType.includes("problem+json")) {
            // Handle problem+json responses (error responses)
            this.logger.debug(`[Network] Init endpoint returned error response: Status ${response.status()}, Content-Type: ${contentType}`);
            this.logger.debug(`[Network] Response is problem+json (error): ${contentType}`);
            const text = await response.text().catch(() => null);
            if (text) {
              try {
                const problemData = JSON.parse(text);
                this.logger.debug(`[Network] Problem response: ${JSON.stringify(problemData, null, 2)}`);
                this.logger.error(`[Network] Init endpoint error: ${problemData.message || problemData.type}`);
              } catch (parseErr) {
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
              this.logger.debug(`[Network] Response status: ${data.status || "none"}`);
              this.logger.debug(`[Network] Current stored qrStartToken: ${this.qrStartToken ? this.qrStartToken.substring(0, 20) + "..." : "null"}`);
              
              // Check if this is an error response (code 101 = technical error)
              if (data.code === "101" || data.severity === "F") {
                this.logger.debug(`[Network] Error response detected: code=${data.code}, message=${data.message}`);
                // This is expected early on - the session might not be ready yet
                // Continue - the error should clear once authentication completes
                return;
              }
              
              // Handle different states from polling responses
              if (data.result === "COMPLETE" || data.result === "complete" || data.status === "complete") {
                // Authentication completed successfully!
                this.log("Authentication completed successfully!");
                this.logger.debug("[Network] COMPLETE state detected - authentication successful");
                
                // Check if there's a redirect URL to navigate to
                if (data.redirectURL || data._links?.redirect) {
                  const redirectUrl = data.redirectURL || data._links.redirect.href;
                  this.log(`Redirecting to authenticated page: ${redirectUrl}`);
                  this.logger.debug(`[Network] Redirect URL found: ${redirectUrl}`);
                  
                  // Navigate to the redirect URL to complete authentication
                  try {
                    await this.page.goto(redirectUrl, { waitUntil: "networkidle" });
                    this.logger.debug("[Network] Successfully navigated to redirect URL");
                  } catch (error) {
                    this.logger.debug(`[Network] Error navigating to redirect URL: ${error}`);
                    // Continue anyway - the page might already be authenticated
                  }
                } else {
                  this.logger.debug("[Network] No redirect URL in response, page should already be authenticated");
                }
                
                // Notify that authentication is complete
                if (this.serviceRef && typeof this.serviceRef.notifyAuthStatus === "function") {
                  this.logger.debug("[Network] Notifying service layer of authentication completion");
                  this.serviceRef.notifyAuthStatus({
                    status: "complete",
                    message: "Authentication completed successfully",
                    timestamp: new Date().toISOString(),
                  });
                }
              } else if (data.result === "QR_EXPIRED") {
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
                // Log all keys to help debug what the response contains
                this.logger.debug(`[Network] Response keys: ${Object.keys(data).join(", ")}`);
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
                    this.logger.debug("[Network] Notifying service layer of autoStartToken with session ID");
                    this.serviceRef.setAutoStartToken(data.autoStartToken, this.authCallbackSessionId);
                    this.logger.debug(`[Network] Service layer notified of autoStartToken with sessionId: ${this.authCallbackSessionId}`);
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

  /**
   * Navigate to Handelsbanken's authenticated page after callback completion
   * Uses the redirect URL from the authenticate endpoint response or init request
   */
  private async navigateToAuthenticatedPage(redirectUrlFromResponse?: string | null): Promise<void> {
    this.log("Navigating to Handelsbanken authenticated page...");
    this.logger.debug("[Navigate] Starting navigation to authenticated page");

    // Use the redirect URL from response, init request, or fallback
    let redirectUrl: string | null = redirectUrlFromResponse || null;

    if (!redirectUrl && this.initRedirectURL) {
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
      redirectUrl = baseUrl + this.initRedirectURL;
      this.logger.debug(`[Navigate] Using redirect URL from init: ${redirectUrl}`);
    } else if (!redirectUrl) {
      // Fallback: use a default authenticated page path
      const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
      redirectUrl = `${baseUrl}/privat/`;
      this.logger.debug(`[Navigate] Using fallback redirect URL: ${redirectUrl}`);
    }

    if (redirectUrl) {
      // Make sure it's an absolute URL
      if (redirectUrl.startsWith("/")) {
        const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
        redirectUrl = baseUrl + redirectUrl;
      }

      try {
        this.log(`Navigating to: ${redirectUrl}`);
        this.logger.debug(`[Navigate] Navigating to redirect URL: ${redirectUrl}`);
        await this.page.goto(redirectUrl, { waitUntil: "networkidle", timeout: 30000 });
        this.logger.debug("[Navigate] Successfully navigated to authenticated page");

        // Wait a bit for the page to fully load and establish session
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const currentUrl = await this.page.url();
        this.logger.debug(`[Navigate] Current URL after navigation: ${currentUrl}`);

        // Check if we're on an authenticated page
        if (
          currentUrl.includes("/privat/") ||
          currentUrl.includes("/dashboard") ||
          !currentUrl.includes("/mbidqr/")
        ) {
          this.log("Successfully navigated to authenticated page");
          this.logger.debug("[Navigate] Appears to be on authenticated page");
        } else {
          this.logger.debug("[Navigate] Still on login page, may need to wait longer");
        }
      } catch (error) {
        this.logger.debug(`[Navigate] Error navigating to redirect URL: ${error}`);
        // Continue anyway - the session might still be established
      }
    } else {
      this.logger.debug("[Navigate] No redirect URL available");
    }
  }

  /**
   * Check if auth callback completion has been received from frontend
   * Polls the backend API to check if the session is marked as complete
   */
  private async checkAuthCallbackCompletion(): Promise<boolean> {
    if (!this.authCallbackSessionId) {
      this.logger.debug("[Auth Callback] No session ID available for callback check");
      return false;
    }

    try {
      // Use Node.js fetch or http module to call backend API
      // Since we're in a Node.js environment, we can use fetch (Node 18+) or http
      const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
      const statusUrl = `${backendUrl}/api/auth/status/${encodeURIComponent(this.authCallbackSessionId)}`;

      this.logger.debug(`[Auth Callback] Checking completion status: ${statusUrl}`);

      const response = await fetch(statusUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        this.logger.debug(`[Auth Callback] Status check failed: ${response.status}`);
        return false;
      }

      const data = await response.json();
      this.logger.debug(`[Auth Callback] Status response: ${JSON.stringify(data)}`);

      if (data.success && data.complete) {
        this.log("Auth callback completion detected!");
        this.logger.debug(`[Auth Callback] Completion confirmed at ${data.timestamp}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.debug(`[Auth Callback] Error checking completion: ${error}`);
      return false;
    }
  }

  /**
   * Start manual polling of the authenticate endpoint for same-device flow
   * The website doesn't automatically poll in same-device mode, so we need to do it manually
   */
  private async startManualAuthenticatePolling(sessionId: string): Promise<void> {
    // Stop any existing polling
    if (this.authenticatePollingInterval) {
      clearInterval(this.authenticatePollingInterval);
    }

    this.log(`Starting manual authenticate endpoint polling with sessionId: ${sessionId.substring(0, 10)}...`);
    this.logger.debug(`[Manual Polling] Starting with sessionId: ${sessionId}`);

    const authenticateUrl = `https://secure.handelsbanken.se/mluri/aa/privmbidqrwebse/authenticate/1.0?sessionId=${sessionId}`;
    let pollCount = 0;
    const maxPolls = 120; // Poll for up to 2 minutes (120 * 1 second)
    
    // Wait a bit before starting to poll - give the user time to authenticate in the BankID app
    // The initialSleepTime from init response is typically 3000ms, so wait at least that long
    // Also set up a page navigation listener to detect when authentication completes
    // (the user's mobile browser might redirect, but we can detect URL changes in Playwright)
    this.logger.debug(`[Manual Polling] Waiting 5 seconds before starting to poll (to allow user time to authenticate)`);
    
    // Set up a listener for page navigation - if the page navigates away from the login page,
    // it might indicate authentication completed (even if it's in the user's mobile browser)
    const navigationListener = (frame: any) => {
      if (frame.parentFrame() === null) {
        const url = frame.url();
        this.logger.debug(`[Manual Polling] Page navigated to: ${url}`);
        
        // If we navigate away from the login/mbidqr page, authentication might have completed
        if (!url.includes("/mbidqr/") && !url.includes("/login")) {
          this.logger.debug(`[Manual Polling] Navigation away from login page detected - authentication might be complete`);
        }
      }
    };
    this.page.on("framenavigated", navigationListener);
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    this.authenticatePollingInterval = setInterval(async () => {
      pollCount++;
      this.logger.debug(`[Manual Polling] Poll #${pollCount} - Checking authenticate endpoint and auth callback`);
      
      if (pollCount > maxPolls) {
        this.log("Manual authenticate polling timeout reached");
        this.logger.debug("[Manual Polling] Timeout reached, stopping polling");
        if (this.authenticatePollingInterval) {
          clearInterval(this.authenticatePollingInterval);
          this.authenticatePollingInterval = null;
        }
        return;
      }

      // First check if auth callback completion has been received
      // Only check every 2 polls to reduce API calls (check callback and authenticate endpoint alternately)
      if (pollCount % 2 === 0) {
        const callbackComplete = await this.checkAuthCallbackCompletion();
        if (callbackComplete) {
          this.log("Auth callback completion detected - authentication successful!");
          this.logger.debug("[Manual Polling] Auth callback complete, will proceed to navigate to authenticated page");
          // Stop polling - we'll handle navigation below
          if (this.authenticatePollingInterval) {
            clearInterval(this.authenticatePollingInterval);
            this.authenticatePollingInterval = null;
          }
          // Navigate to Handelsbanken authenticated page
          await this.navigateToAuthenticatedPage();
          return;
        }
      }

      try {
        // Make request to authenticate endpoint using page context (to maintain cookies)
        // Try POST first, then fall back to GET if 405 (Method Not Allowed)
        const response = await this.page.evaluate(async (url: string) => {
          try {
            // Try POST first, then GET if 405 (Method Not Allowed)
            let response = await fetch(url, {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
              },
              credentials: "include",
              body: JSON.stringify({}),
            });

            if (!response.ok && response.status === 405) {
              response = await fetch(url, {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "X-Requested-With": "XMLHttpRequest",
                },
                credentials: "include",
              });
            }

            const contentType = response.headers.get("content-type") || "";
            const text = await response.text();

            return {
              ok: response.ok,
              status: response.status,
              contentType,
              text,
              isJson: contentType.includes("application/json"),
            };
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }, authenticateUrl);

        if ("error" in response) {
          this.logger.debug(`[Manual Polling] Error in poll #${pollCount}: ${response.error}`);
          return;
        }

        this.logger.debug(`[Manual Polling] Poll #${pollCount} response: status=${response.status}, isJson=${response.isJson}`);
        
        // Log response text preview for debugging
        if (response.text && response.text.length > 0) {
          const textPreview = response.text.length > 200 ? response.text.substring(0, 200) + "..." : response.text;
          this.logger.debug(`[Manual Polling] Response text preview: ${textPreview}`);
        }

        if (response.isJson && response.text) {
          try {
            const data = JSON.parse(response.text);
            this.logger.debug(`[Manual Polling] Poll #${pollCount} data keys: ${Object.keys(data).join(", ")}`);
            // Log full response for first few polls to understand the structure
            if (pollCount <= 3) {
              this.logger.debug(`[Manual Polling] Full response (poll #${pollCount}): ${JSON.stringify(data, null, 2)}`);
            }

            // Check if this is an error response
            // Error codes 100, 101, 102 typically mean:
            // - Session not ready yet (expected early on - user hasn't authenticated)
            // - User hasn't authenticated yet
            // - Session expired (if it persists after user authenticates)
            // We need to continue polling until we get result: "COMPLETE"
            if (data.code === "101" || data.code === "100" || data.code === "102" || data.severity === "F") {
              this.logger.debug(`[Manual Polling] Poll #${pollCount}: Error response (code: ${data.code}, message: ${data.message})`);
              
              // Error 101 might mean:
              // 1. Session not ready yet (expected early on - user hasn't authenticated)
              // 2. Session expired (if it persists after user authenticates)
              // 3. User hasn't authenticated yet
              // Continue polling - the error should clear once authentication completes
              // But if we've been polling for a while and still getting errors, the session might have expired
              if (pollCount > 30) {
                this.logger.debug(`[Manual Polling] Poll #${pollCount}: Still getting errors after 30 polls - session might have expired or user hasn't authenticated yet`);
              }
              
              // Check if the page URL has changed - this might indicate authentication completed in the user's browser
              // Even though Playwright doesn't have the session, the page might have redirected
              try {
                const currentUrl = await this.page.url();
                if (currentUrl.includes("/privat/") || currentUrl.includes("/dashboard") || 
                    (!currentUrl.includes("/mbidqr/") && !currentUrl.includes("/login"))) {
                  this.logger.debug(`[Manual Polling] Page URL suggests authentication might have completed: ${currentUrl}`);
                  // Try navigating to the redirect URL to establish session
                  if (this.initRedirectURL) {
                    const baseUrl = currentUrl.split("/").slice(0, 3).join("/");
                    const redirectUrl = baseUrl + this.initRedirectURL;
                    this.log(`Attempting to navigate to redirect URL: ${redirectUrl}`);
                    try {
                      await this.page.goto(redirectUrl, { waitUntil: "networkidle", timeout: 30000 });
                      this.logger.debug("[Manual Polling] Navigated to redirect URL after detecting URL change");
                    } catch (error) {
                      this.logger.debug(`[Manual Polling] Error navigating to redirect URL: ${error}`);
                    }
                  }
                }
              } catch (error) {
                // Ignore errors checking URL
              }
              
              return;
            }
            
            // Check for other error formats
            if (data.error || (data.message && (data.message.toLowerCase().includes("error") || data.message.toLowerCase().includes("fel")))) {
              this.logger.debug(`[Manual Polling] Poll #${pollCount}: Error detected in response: ${data.message || data.error}`);
              return;
            }

              // Check for completion - the authenticate endpoint returns result: "COMPLETE" when authentication succeeds
              // This happens after the user authenticates in the BankID app
              // Note: Error codes (100, 101, 102) are expected before authentication completes
              const isComplete = 
                data.result === "COMPLETE" || 
                data.result === "complete";
              
              // Also check for redirect link - if present, authentication is likely complete
              const hasRedirectLink = !!(data._links && data._links.redirect);
              
              // If we have a redirect link but no result field, assume complete
              const isCompleteByRedirect = hasRedirectLink && !data.result && !data.code;
              
            if (isComplete || isCompleteByRedirect) {
              this.log("Authentication completed successfully via manual polling!");
              this.logger.debug("[Manual Polling] COMPLETE state detected");
              this.logger.debug(`[Manual Polling] Full response: ${JSON.stringify(data, null, 2)}`);

              // Stop polling
              if (this.authenticatePollingInterval) {
                clearInterval(this.authenticatePollingInterval);
                this.authenticatePollingInterval = null;
              }

              // Navigate to authenticated page - pass redirect URL from response if available
              await this.navigateToAuthenticatedPage(data.redirectURL || data._links?.redirect?.href);

              // Check for redirect URL - this is critical for completing authentication
              // After authentication completes, we need to navigate to the redirect URL to establish the session
              let redirectUrl: string | null = null;
              if (data.redirectURL) {
                redirectUrl = data.redirectURL;
              } else if (data._links?.redirect?.href) {
                redirectUrl = data._links.redirect.href;
              } else if (this.initRedirectURL) {
                // Use the redirect URL from the init request
                // This is typically: /logon/se/priv/sv/mbidqr/#authenticate
                // After authentication completes, navigating here should establish the session
                const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
                redirectUrl = baseUrl + this.initRedirectURL;
                this.logger.debug(`[Manual Polling] Using redirect URL from init request: ${redirectUrl}`);
              }
              
              if (redirectUrl) {
                // Make sure it's an absolute URL
                if (redirectUrl.startsWith("/")) {
                  const baseUrl = await this.page.url().split("/").slice(0, 3).join("/");
                  redirectUrl = baseUrl + redirectUrl;
                }
                
                this.log(`Redirecting to authenticated page: ${redirectUrl}`);
                this.logger.debug(`[Manual Polling] Redirect URL: ${redirectUrl}`);
                
                try {
                  // Navigate to the redirect URL to complete authentication
                  // This should establish the session in Playwright
                  await this.page.goto(redirectUrl, { waitUntil: "networkidle", timeout: 30000 });
                  this.logger.debug("[Manual Polling] Successfully navigated to redirect URL");
                  
                  // Wait for the page to fully load and establish session
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  
                  // Check if we're now authenticated by checking the URL
                  const currentUrl = await this.page.url();
                  this.logger.debug(`[Manual Polling] Current URL after redirect: ${currentUrl}`);
                  
                  // Check if we're on an authenticated page (not the login page)
                  if (!currentUrl.includes("/mbidqr/") || currentUrl.includes("/privat/") || currentUrl.includes("/dashboard")) {
                    this.log("Successfully authenticated - navigated to authenticated page");
                    this.logger.debug("[Manual Polling] Appears to be on authenticated page");
                  } else {
                    this.logger.debug("[Manual Polling] Still on login/mbidqr page, may need to wait longer");
                    // Wait a bit more and check again
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const finalUrl = await this.page.url();
                    this.logger.debug(`[Manual Polling] Final URL after additional wait: ${finalUrl}`);
                  }
                } catch (error) {
                  this.logger.debug(`[Manual Polling] Error navigating to redirect URL: ${error}`);
                }
              } else {
                this.logger.debug("[Manual Polling] No redirect URL found, but authentication appears complete");
              }

              // Notify that authentication is complete
              if (this.serviceRef && typeof this.serviceRef.notifyAuthStatus === "function") {
                this.logger.debug("[Manual Polling] Notifying service layer of authentication completion");
                this.serviceRef.notifyAuthStatus({
                  status: "complete",
                  message: "Authentication completed successfully",
                  timestamp: new Date().toISOString(),
                });
              }
            } else if (data.result === "IN_PROGRESS") {
              this.logger.debug(`[Manual Polling] Poll #${pollCount}: Authentication in progress`);
            } else if (data.result === "NO_CLIENT_STARTED") {
              this.logger.debug(`[Manual Polling] Poll #${pollCount}: Waiting for client to start`);
            } else {
              this.logger.debug(`[Manual Polling] Poll #${pollCount}: Unknown result: ${data.result || "none"}, status: ${data.status || "none"}`);
              // Log full response for debugging
              this.logger.debug(`[Manual Polling] Full response: ${JSON.stringify(data, null, 2)}`);
            }
          } catch (parseError) {
            this.logger.debug(`[Manual Polling] Error parsing JSON in poll #${pollCount}: ${parseError}`);
          }
        }
      } catch (error) {
        this.logger.debug(`[Manual Polling] Error in poll #${pollCount}: ${error}`);
      }
    }, 1000); // Poll every 1 second
  }

}
