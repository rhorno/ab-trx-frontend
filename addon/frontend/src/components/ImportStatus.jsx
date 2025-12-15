/**
 * Import Status Component
 * Displays success/error status and transaction count
 */

function ImportStatus({
  success,
  transactionCount,
  statusMessage,
  isDryRun,
  isWaitingAuth,
}) {
  // Show waiting state if we have QR code but no success/failure yet
  if (isWaitingAuth && success === null && !statusMessage) {
    return (
      <div className="status-container status-waiting">
        <div className="status-header">
          <span className="status-icon">⏳</span>
          <strong className="status-title">Waiting for Authentication</strong>
        </div>
        <div className="status-message">
          Please scan the QR code above with your BankID app to continue.
        </div>
      </div>
    );
  }

  // Don't show anything if we don't have a status yet (null/undefined) and no message
  if ((success === null || success === undefined) && !statusMessage) {
    return null;
  }

  // Success state
  if (success === true) {
    return (
      <div className="status-container status-success">
        <div className="status-header">
          <span className="status-icon">✓</span>
          <strong className="status-title">Import Successful</strong>
        </div>
        {transactionCount !== null && (
          <div className="status-count">
            {isDryRun ? (
              <span>
                <strong>{transactionCount}</strong> transaction
                {transactionCount !== 1 ? "s" : ""} would be imported (dry-run)
              </span>
            ) : (
              <span>
                Successfully imported <strong>{transactionCount}</strong>{" "}
                transaction{transactionCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
        {statusMessage && transactionCount === null && (
          <div className="status-message">{statusMessage}</div>
        )}
      </div>
    );
  }

  // Error state - only show when success is explicitly false
  if (success === false) {
    return (
      <div className="status-container status-error">
        <div className="status-header">
          <span className="status-icon">✗</span>
          <strong className="status-title">Import Failed</strong>
        </div>
        {statusMessage && <div className="status-message">{statusMessage}</div>}
      </div>
    );
  }

  // Default: don't show anything if success is null/undefined
  return null;
}

export default ImportStatus;
