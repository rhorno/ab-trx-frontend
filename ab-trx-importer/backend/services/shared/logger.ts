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
      if (isVerbose || isDebugMode) {
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
