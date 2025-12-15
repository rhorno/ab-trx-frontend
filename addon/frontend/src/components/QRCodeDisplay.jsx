/**
 * QR Code Display Component
 * Displays QR codes for BankID authentication using qrcode.react
 */
import { QRCodeSVG } from "qrcode.react";

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
