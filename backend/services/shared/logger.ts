/**
 * Simple logger implementation
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  error(message: string): void;
}

let isVerbose = false;

/**
 * Initialize the logger with global settings
 */
export function initializeLogger(verbose: boolean = false): void {
  isVerbose = verbose;
}

/**
 * Get a logger instance for a specific component
 */
export function getLogger(component: string): Logger {
  return {
    debug: (message: string) => {
      if (isVerbose) {
        console.log(`[${component}] ${message}`);
      }
    },
    info: (message: string) => {
      console.log(`[${component}] ${message}`);
    },
    error: (message: string) => {
      console.error(`[ERROR] [${component}] ${message}`);
    }
  };
}