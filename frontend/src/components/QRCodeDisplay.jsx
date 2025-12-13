/**
 * QR Code Display Component
 * Displays ASCII art QR codes for BankID authentication
 */

function QRCodeDisplay({ qrCode }) {
  if (!qrCode) {
    return null;
  }

  return (
    <div className="qr-container">
      <h3 className="qr-title">BankID Authentication Required</h3>
      <p className="qr-instruction">
        Scan the QR code below with your BankID mobile app
      </p>
      <div className="qr-code-box">
        <pre className="qr-code-pre">{qrCode}</pre>
      </div>
      <p className="qr-footer">
        The QR code will automatically update if it expires.
      </p>
    </div>
  );
}

export default QRCodeDisplay;
