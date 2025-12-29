/**
 * Parser utility to extract structured information from CLI output
 * Extracts: QR codes, success status, transaction count
 */

/**
 * Detects QR code in output (ASCII art pattern)
 * NOTE: QR codes are now received via SSE events, so this always returns null.
 * Kept for backward compatibility but no longer parses output.
 */
function extractQRCode(output) {
  // QR codes are now sent via SSE events (type: "qr-code")
  // No need to parse ASCII art from output
  return null;
}

/**
 * Extracts success status and transaction count from output
 */
function extractSuccessStatus(output) {
  if (!output) {
    return { success: false, transactionCount: null, statusMessage: null };
  }

  // Look for success patterns
  // Common patterns: "✓ Imported X transactions", "Successfully imported", etc.
  const successPatterns = [
    /✓\s*(?:Imported|Successfully imported)\s+(\d+)\s+transactions?/i,
    /Successfully\s+imported\s+(\d+)\s+transactions?/i,
    /Imported\s+(\d+)\s+transactions?/i,
    /(\d+)\s+transactions?\s+(?:imported|would be imported)/i,
  ];

  for (const pattern of successPatterns) {
    const match = output.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      return {
        success: true,
        transactionCount: count,
        statusMessage: match[0],
      };
    }
  }

  // Check for dry-run success (preview mode)
  const dryRunPatterns = [
    /Would\s+import\s+(\d+)\s+transactions?/i,
    /(\d+)\s+transactions?\s+would\s+be\s+imported/i,
    /Preview:\s+(\d+)\s+transactions?/i,
  ];

  for (const pattern of dryRunPatterns) {
    const match = output.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      return {
        success: true,
        transactionCount: count,
        statusMessage: match[0],
      };
    }
  }

  // Check for general success indicators (without count)
  if (
    /✓\s*(?:Success|Completed|Done)/i.test(output) ||
    /Successfully/i.test(output)
  ) {
    return {
      success: true,
      transactionCount: null,
      statusMessage: "Import completed successfully",
    };
  }

  // Check for error patterns
  const errorPatterns = [
    /💥\s*Unhandled error:\s*([^\n]+)/i,
    /Error:\s*([^\n]+)/i,
    /Profile\s+['"]([^'"]+)['"]\s+not found[^\n]*/i,
    /Command timeout[^\n]*/i,
    /Failed[^\n]*/i,
  ];

  for (const pattern of errorPatterns) {
    const match = output.match(pattern);
    if (match) {
      // Extract error message - use captured group if available, otherwise use full match
      const errorMessage = match[1] || match[0];
      return {
        success: false,
        transactionCount: null,
        statusMessage: errorMessage.trim(),
      };
    }
  }

  // Default: assume not successful if no clear indicators
  return {
    success: false,
    transactionCount: null,
    statusMessage: null,
  };
}

/**
 * Main parser function
 * @param {string} output - Raw CLI output
 * @returns {Object} Parsed data with qrCode, success, transactionCount, statusMessage, rawOutput
 */
export function parseOutput(output) {
  if (!output || typeof output !== "string") {
    return {
      qrCode: null,
      success: false,
      transactionCount: null,
      statusMessage: null,
      rawOutput: output || "",
    };
  }

  const qrCode = extractQRCode(output);
  const { success, transactionCount, statusMessage } =
    extractSuccessStatus(output);

  return {
    qrCode,
    success,
    transactionCount,
    statusMessage,
    rawOutput: output,
  };
}
