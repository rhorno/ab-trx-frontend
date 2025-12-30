/**
 * QR Code Display Component
 * Displays QR codes for BankID authentication using qrcode.react
 * Also shows "Open BankID" button when autoStartToken is available
 */
import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import debugLogger from "../utils/debugLogger";

function QRCodeDisplay({ qrCode, autoStartToken, sessionId }) {
  const autoOpenAttemptedRef = useRef(false);
  const previousAutoStartTokenRef = useRef(null);
  
  // Detect if we're on mobile
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Log prop changes and attempt automatic app opening
  useEffect(() => {
    debugLogger.debug("QRCodeDisplay props received/updated", {
      hasQrCode: !!qrCode,
      qrCodeLength: qrCode ? String(qrCode).length : 0,
      hasAutoStartToken: !!autoStartToken,
      autoStartTokenLength: autoStartToken ? autoStartToken.length : 0,
      autoStartTokenPreview: autoStartToken
        ? debugLogger.truncateToken(autoStartToken)
        : null,
    });

    // Check if autoStartToken is new (different from previous)
    const isNewToken =
      autoStartToken &&
      autoStartToken !== previousAutoStartTokenRef.current;

    if (isNewToken) {
      debugLogger.info("New autoStartToken received in QRCodeDisplay", {
        tokenLength: autoStartToken.length,
        tokenPreview: debugLogger.truncateToken(autoStartToken),
        previousToken: previousAutoStartTokenRef.current
          ? debugLogger.truncateToken(previousAutoStartTokenRef.current)
          : null,
      });
      previousAutoStartTokenRef.current = autoStartToken;

      // On mobile, automatic app opening is blocked by browser security
      // Only attempt automatic opening on desktop (where it might work)
      // On mobile, user must click the button (direct user interaction required)
      if (!autoOpenAttemptedRef.current && !isMobileDevice) {
        debugLogger.info(
          "Scheduling automatic BankID app opening attempt (desktop only)",
          {
            delay: 500,
            isMobile: isMobileDevice,
            tokenPreview: debugLogger.truncateToken(autoStartToken),
          }
        );
        autoOpenAttemptedRef.current = true;

        setTimeout(() => {
          debugLogger.info("Executing automatic BankID app opening (desktop)", {
            tokenPreview: debugLogger.truncateToken(autoStartToken),
          });
          handleOpenBankID(autoStartToken, true);
        }, 500);
      } else if (isMobileDevice) {
        debugLogger.info(
          "On mobile device - automatic app opening is blocked by browser security",
          {
            isMobile: true,
            message: "User must click the 'Open BankID App' button to open the app",
            tokenPreview: debugLogger.truncateToken(autoStartToken),
          }
        );
        autoOpenAttemptedRef.current = true; // Mark as attempted so we don't try again
      } else {
        debugLogger.debug(
          "Skipping automatic app opening - already attempted",
          {
            tokenPreview: debugLogger.truncateToken(autoStartToken),
          }
        );
      }
    } else if (autoStartToken) {
      debugLogger.debug("autoStartToken unchanged", {
        tokenPreview: debugLogger.truncateToken(autoStartToken),
      });
    }

    // Log button visibility state
    if (autoStartToken) {
      debugLogger.debug("Open BankID button should be visible", {
        hasAutoStartToken: true,
        tokenLength: autoStartToken.length,
      });
    } else {
      debugLogger.debug("Open BankID button should be hidden", {
        hasAutoStartToken: false,
      });
    }
  }, [qrCode, autoStartToken]);

  // Render component if we have either QR code OR autoStartToken
  // (for same-device flow, we might only have autoStartToken without QR code)
  if (!qrCode && !autoStartToken) {
    return null;
  }

  const handleOpenBankID = (token = autoStartToken, isAutomatic = false) => {
    const clickTimestamp = new Date().toISOString();
    const triggerType = isAutomatic ? "automatic" : "manual";

    debugLogger.info("handleOpenBankID called", {
      triggerType,
      clickTimestamp,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? debugLogger.truncateToken(token) : null,
    });

    if (!token) {
      debugLogger.error("No autoStartToken available for app opening", {
        triggerType,
        clickTimestamp,
      });
      return;
    }

    // Get device information
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);

    debugLogger.debug("Device information", {
      userAgent,
      isMobile,
      isIOS,
      isAndroid,
      platform: navigator.platform,
      language: navigator.language,
    });

    // Construct callback URL for redirect after authentication
    // Use current origin (works for both localhost and production)
    const callbackUrl = sessionId
      ? `${window.location.origin}/auth-callback?sessionId=${encodeURIComponent(sessionId)}`
      : null;
    
    // Construct BankID deep link
    // Universal link (preferred for Android 6+ and iOS): https://app.bankid.com/?autostarttoken=<token>&redirect=<callback_url>
    // Custom scheme (fallback): bankid:///?autostarttoken=<token>&redirect=<callback_url>
    // If callbackUrl is available, use it; otherwise use null (fallback behavior)
    const redirectParam = callbackUrl ? encodeURIComponent(callbackUrl) : "null";
    
    const universalLink = `https://app.bankid.com/?autostarttoken=${encodeURIComponent(
      token
    )}&redirect=${redirectParam}`;
    const customScheme = `bankid:///?autostarttoken=${encodeURIComponent(
      token
    )}&redirect=${redirectParam}`;

    debugLogger.info("Deep link URLs constructed", {
      universalLink,
      customScheme,
      callbackUrl,
      sessionId: sessionId || null,
      tokenLength: token.length,
      tokenEncoded: encodeURIComponent(token),
      universalLinkLength: universalLink.length,
      customSchemeLength: customScheme.length,
    });

    // Try universal link first (preferred)
    debugLogger.info("Attempting to open BankID app with universal link", {
      triggerType,
      url: universalLink,
      method: "window.location.href",
    });

    const navigationStartTime = Date.now();

    try {
      // Use window.location for universal link
      window.location.href = universalLink;
      const navigationTime = Date.now() - navigationStartTime;

      debugLogger.info("Universal link navigation triggered", {
        triggerType,
        navigationTime,
        url: universalLink,
        timestamp: new Date().toISOString(),
      });

      // Fallback: If the app doesn't open, try custom scheme after a short delay
      setTimeout(() => {
        // Check if we're still on the page (app might not have opened)
        // Note: This is a best-effort check - we can't reliably detect if the app opened
        debugLogger.debug(
          "Fallback check: If app didn't open, custom scheme can be tried",
          {
            triggerType,
            timeSinceNavigation: Date.now() - navigationStartTime,
            currentUrl: window.location.href,
          }
        );
      }, 1000);
    } catch (error) {
      const errorTime = Date.now() - navigationStartTime;
      debugLogger.error("Universal link navigation failed, trying custom scheme", {
        triggerType,
        error: error.message,
        errorStack: error.stack,
        errorTime,
        url: universalLink,
      });

      // Fallback to custom scheme
      debugLogger.info("Attempting to open BankID app with custom scheme", {
        triggerType,
        url: customScheme,
        method: "window.location.href",
      });

      const customSchemeStartTime = Date.now();

      try {
        window.location.href = customScheme;
        const customSchemeTime = Date.now() - customSchemeStartTime;

        debugLogger.info("Custom scheme navigation triggered", {
          triggerType,
          navigationTime: customSchemeTime,
          url: customScheme,
          timestamp: new Date().toISOString(),
        });
      } catch (customError) {
        const customErrorTime = Date.now() - customSchemeStartTime;
        debugLogger.error(
          "Both universal link and custom scheme failed",
          {
            triggerType,
            universalLinkError: error.message,
            customSchemeError: customError.message,
            customErrorStack: customError.stack,
            totalTime: Date.now() - navigationStartTime,
            customErrorTime,
          }
        );
        // User can still scan QR code as fallback
      }
    }
  };

  return (
    <div className="qr-container">
      <h3 className="qr-title">BankID Authentication Required</h3>
      <p className="qr-instruction">
        {autoStartToken
          ? "Open BankID app or scan the QR code below with your BankID mobile app"
          : "Scan the QR code below with your BankID mobile app"}
      </p>

      {/* Show "Open BankID" button when autoStartToken is available */}
      {autoStartToken && (
        <div className="qr-button-container">
          <button
            onClick={() => {
              handleOpenBankID(autoStartToken, false);
            }}
            className="qr-open-bankid-button"
            type="button"
          >
            Open BankID App
          </button>
          {/* Show mobile-specific message */}
          {isMobileDevice && (
            <p style={{ marginTop: "10px", fontSize: "14px", color: "#666" }}>
              Tap the button above to open the BankID app on this device
            </p>
          )}
        </div>
      )}

      {/* Only show QR code if we have one */}
      {qrCode && (
        <div className="qr-code-box">
          <QRCodeSVG
            value={qrCode}
            size={200}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            includeMargin={true}
          />
        </div>
      )}
      {/* Only show footer if we have a QR code */}
      {qrCode && (
        <p className="qr-footer">
          The QR code will automatically update if it expires.
        </p>
      )}
    </div>
  );
}

export default QRCodeDisplay;
