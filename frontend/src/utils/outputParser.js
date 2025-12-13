/**
 * Parser utility to extract structured information from CLI output
 * Extracts: QR codes, success status, transaction count
 */

/**
 * Detects QR code in output (ASCII art pattern)
 * QR codes typically contain blocks of ▄ and █ characters
 */
function extractQRCode(output) {
  if (!output) return null;

  const lines = output.split("\n");

  // Look for QR code section - typically starts after "HANDELSBANKEN BANKID AUTHENTICATION"
  // and contains ASCII art with ▄ and █ characters
  let inQRSection = false;
  let qrStart = -1;
  let qrEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of QR code section
    if (/HANDELSBANKEN BANKID AUTHENTICATION/i.test(line)) {
      inQRSection = true;
      continue;
    }

    // Look for the actual QR code ASCII art (starts with line containing ▄▄▄▄▄)
    if (inQRSection && qrStart === -1 && /^[\s]*▄{10,}/.test(line)) {
      qrStart = i;
      continue;
    }

    // Find end of QR code (when we stop seeing ▄ or █ characters)
    if (qrStart !== -1 && qrEnd === -1) {
      // QR code lines contain only ▄, █, ▀, and whitespace
      const isQRLine = /^[\s▄█▀]*$/.test(line) && line.trim().length > 0;

      if (!isQRLine && i > qrStart + 5) {
        // We've left the QR code area
        qrEnd = i - 1;
        break;
      }
    }
  }

  if (qrStart !== -1) {
    if (qrEnd === -1) {
      // Use a reasonable default end (QR codes are typically 20-25 lines)
      qrEnd = Math.min(qrStart + 25, lines.length - 1);
    }

    // Extract QR code lines, trim empty lines at start/end
    const qrLines = lines.slice(qrStart, qrEnd + 1);

    // Remove leading/trailing empty lines
    while (qrLines.length > 0 && qrLines[0].trim() === "") {
      qrLines.shift();
    }
    while (qrLines.length > 0 && qrLines[qrLines.length - 1].trim() === "") {
      qrLines.pop();
    }

    if (qrLines.length > 0) {
      return qrLines.join("\n");
    }
  }

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
