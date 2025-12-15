/**
 * QR Code Display Component
 * Displays QR codes for BankID authentication using qrcode.react
 * Also shows "Open BankID" button when autoStartToken is available
 */
import { QRCodeSVG } from "qrcode.react";

function QRCodeDisplay({ qrCode, autoStartToken }) {
  if (!qrCode) {
    return null;
  }

  const handleOpenBankID = () => {
    if (!autoStartToken) {
      console.error("No autoStartToken available");
      return;
    }

    // Construct BankID deep link
    // Format: bankid:///?autostarttoken=<token>&redirect=null
    const deepLink = `bankid:///?autostarttoken=${encodeURIComponent(
      autoStartToken
    )}&redirect=null`;

    try {
      // Attempt to open the BankID app
      window.location.href = deepLink;

      // Fallback: If the app doesn't open, show a message after a short delay
      setTimeout(() => {
        // If we're still on the page after 2 seconds, the app might not be installed
        // We could show a message here, but for now we'll just let the user know
        // they can still use the QR code
      }, 2000);
    } catch (error) {
      console.error("Error opening BankID app:", error);
      // Fallback: User can still scan QR code
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
            onClick={handleOpenBankID}
            className="qr-open-bankid-button"
            type="button"
          >
            Open BankID App
          </button>
        </div>
      )}

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
      <p className="qr-footer">
        The QR code will automatically update if it expires.
      </p>
    </div>
  );
}

export default QRCodeDisplay;
