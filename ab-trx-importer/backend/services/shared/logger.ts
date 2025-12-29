/**
 * Simple logger implementation
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  error(message: string): void;
}

let isVerbose = false;
let isDebugMode = false;

/**
 * Check if debug mode should be enabled
 * This checks environment variables directly so it works even if initializeLogger wasn't called
 */
function shouldEnableDebugMode(): boolean {
  return (
    isVerbose ||
    isDebugMode ||
    process.env.DEBUG === "true" ||
    process.env.NODE_ENV === "development"
  );
}

/**
 * Initialize the logger with global settings
 */
export function initializeLogger(verbose: boolean = false): void {
  isVerbose = verbose;
  // Enable debug mode if DEBUG environment variable is set
  isDebugMode =
    process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
}

/**
 * Get a logger instance for a specific component
 */
export function getLogger(component: string): Logger {
  return {
    debug: (message: string) => {
      if (shouldEnableDebugMode()) {
        console.log(`[DEBUG] [${component}] ${message}`);
      }
    },
    info: (message: string) => {
      console.log(`[INFO] [${component}] ${message}`);
    },
    error: (message: string) => {
      console.error(`[ERROR] [${component}] ${message}`);
    },
  };
}
