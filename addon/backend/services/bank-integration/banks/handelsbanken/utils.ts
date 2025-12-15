/**
 * Utility functions for Handelsbanken integration
 */
import readline from "readline";
// Import qrcode-terminal for generating QR code ASCII art
import qrcodeTerminal from "qrcode-terminal";

/**
 * QR Code data structure for API
 */
export interface QRCodeData {
  token: string;
  asciiArt: string;
  timestamp: string;
}

/**
 * Prompt for user input in the terminal.
 * NOTE: This is CLI-specific and may not be used in service context
 */
export function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Generate QR code data from token.
 * Returns only the token and timestamp - frontend will render the QR code.
 */
export function generateQrCodeData(token: string): QRCodeData {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();

  return {
    token,
    asciiArt: "", // Not used - frontend renders QR code
    timestamp,
  };
}

/**
 * Render a QR code in the terminal from the qrStartToken value.
 * Uses qrcode-terminal for reliable terminal rendering.
 * NOTE: This is kept for CLI compatibility but should not be used in service context.
 * Use generateQrCodeData() instead for service/API usage.
 */
export function renderQrToken(token: string): Promise<void> {
  return new Promise<void>((resolve) => {
    // Clear the terminal completely to remove the old QR code
    // Use different methods for different platforms
    if (process.platform === "win32") {
      // For Windows
      process.stdout.write("\x1Bc");
    } else {
      // For Unix-like systems
      process.stdout.write("\x1B[2J\x1B[0f");
    }

    console.log("=".repeat(50));
    console.log(" HANDELSBANKEN BANKID AUTHENTICATION ");
    console.log("=".repeat(50));

    // Show a timestamp to indicate when this QR code was generated
    const now = new Date();
    const timestamp = now.toLocaleTimeString();

    console.log(`QR Code updated at ${timestamp} - Scan with your BankID app`);
    console.log(
      `Token: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`
    );

    // Use qrcode-terminal with small: true for visible QR code characters
    qrcodeTerminal.generate(token, { small: true });

    console.log("\nWaiting for BankID authentication...");
    console.log("The QR code will automatically update if it expires.");
    console.log("=".repeat(50));

    // Resolve immediately after rendering
    resolve();
  });
}

/**
 * Creates a promise that resolves after a specified timeout
 */
export function createTimeoutPromise<T>(
  timeoutMs: number,
  timeoutValue: T,
  logFn?: (message: string) => void
): Promise<T> {
  return new Promise<T>((resolve) => {
    setTimeout(() => {
      if (logFn) logFn(`Timeout of ${timeoutMs}ms reached`);
      resolve(timeoutValue);
    }, timeoutMs);
  });
}
