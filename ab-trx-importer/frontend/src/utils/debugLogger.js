/**
 * Debug Logger Utility
 * Provides structured logging with optional backend submission for centralized debugging
 */

const DEBUG_PREFIX = "[BankID Debug]";
const BACKEND_LOG_ENDPOINT = "/api/debug-log";

/**
 * Get device and browser information
 */
function getDeviceInfo() {
  const ua = navigator.userAgent;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  
  return {
    userAgent: ua,
    isMobile,
    isIOS,
    isAndroid,
    platform: navigator.platform,
    language: navigator.language,
  };
}

/**
 * Format log message with timestamp and context
 */
function formatLogMessage(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const deviceInfo = getDeviceInfo();
  
  return {
    timestamp,
    level,
    message,
    context,
    device: deviceInfo,
  };
}

/**
 * Truncate sensitive token data for logging
 */
function truncateToken(token, startChars = 10, endChars = 5) {
  if (!token || typeof token !== "string") {
    return token;
  }
  if (token.length <= startChars + endChars) {
    return token.substring(0, startChars) + "...";
  }
  return token.substring(0, startChars) + "..." + token.substring(token.length - endChars);
}

/**
 * Send log to backend (non-blocking, fails silently)
 */
async function sendToBackend(logData) {
  try {
    const response = await fetch(BACKEND_LOG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(logData),
    });
    // Log to console if fetch fails (for debugging instrumentation)
    if (!response.ok) {
      console.warn(`[BankID Debug] Failed to send log to backend: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // Log to console for debugging (only for instrumentation issues)
    console.warn(`[BankID Debug] Error sending log to backend:`, error.message);
    // Silently fail - backend logging is optional
    // Don't log errors to avoid infinite loops
  }
}

/**
 * Debug logger with multiple log levels
 */
export const debugLogger = {
  /**
   * Log debug message
   */
  debug(message, context = {}) {
    const logData = formatLogMessage("debug", message, context);
    const consoleMessage = `${DEBUG_PREFIX} [${logData.timestamp}] ${message}`;
    
    if (context.token) {
      context.token = truncateToken(context.token);
    }
    if (context.autoStartToken) {
      context.autoStartToken = truncateToken(context.autoStartToken);
    }
    
    console.log(consoleMessage, context);
    sendToBackend(logData);
  },

  /**
   * Log info message
   */
  info(message, context = {}) {
    const logData = formatLogMessage("info", message, context);
    const consoleMessage = `${DEBUG_PREFIX} [${logData.timestamp}] ${message}`;
    
    if (context.token) {
      context.token = truncateToken(context.token);
    }
    if (context.autoStartToken) {
      context.autoStartToken = truncateToken(context.autoStartToken);
    }
    
    console.info(consoleMessage, context);
    sendToBackend(logData);
  },

  /**
   * Log warning message
   */
  warn(message, context = {}) {
    const logData = formatLogMessage("warn", message, context);
    const consoleMessage = `${DEBUG_PREFIX} [${logData.timestamp}] ${message}`;
    
    if (context.token) {
      context.token = truncateToken(context.token);
    }
    if (context.autoStartToken) {
      context.autoStartToken = truncateToken(context.autoStartToken);
    }
    
    console.warn(consoleMessage, context);
    sendToBackend(logData);
  },

  /**
   * Log error message
   */
  error(message, context = {}) {
    const logData = formatLogMessage("error", message, context);
    const consoleMessage = `${DEBUG_PREFIX} [${logData.timestamp}] ${message}`;
    
    if (context.token) {
      context.token = truncateToken(context.token);
    }
    if (context.autoStartToken) {
      context.autoStartToken = truncateToken(context.autoStartToken);
    }
    
    console.error(consoleMessage, context);
    sendToBackend(logData);
  },

  /**
   * Truncate token for safe logging
   */
  truncateToken,
};

export default debugLogger;
