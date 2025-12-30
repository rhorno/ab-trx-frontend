/**
 * Auth Callback Component
 * Handles the redirect from BankID after authentication
 */
import { useEffect, useState } from "react";
import debugLogger from "../utils/debugLogger";

function AuthCallback() {
  const [status, setStatus] = useState("loading"); // loading, success, error
  const [message, setMessage] = useState("Processing authentication...");

        useEffect(() => {
          // Extract sessionId from URL parameters
          const urlParams = new URLSearchParams(window.location.search);
          const sessionId = urlParams.get("sessionId");

          debugLogger.info("Auth callback page loaded", {
            sessionId: sessionId || null,
            fullUrl: window.location.href,
            searchParams: window.location.search,
          });

    if (!sessionId) {
      setStatus("error");
      setMessage("Missing session ID. Authentication cannot be completed.");
      debugLogger.error("Auth callback missing sessionId", {
        url: window.location.href,
      });
      return;
    }

    // Send completion signal to backend
    const notifyBackend = async () => {
      try {
        debugLogger.info("Sending auth completion to backend", {
          sessionId,
        });

        const response = await fetch("/api/auth/callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            timestamp: new Date().toISOString(),
          }),
        });

        if (!response.ok) {
          throw new Error(`Backend responded with status ${response.status}`);
        }

        const data = await response.json();
        debugLogger.info("Auth completion sent successfully", {
          sessionId,
          response: data,
        });

        setStatus("success");
        setMessage("Authentication completed successfully! You can close this window.");
      } catch (error) {
        debugLogger.error("Error sending auth completion to backend", {
          sessionId,
          error: error.message,
          stack: error.stack,
        });
        setStatus("error");
        setMessage(
          `Failed to complete authentication: ${error.message}. Please try again.`
        );
      }
    };

    notifyBackend();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "500px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            marginBottom: "20px",
            color: status === "success" ? "#28a745" : status === "error" ? "#dc3545" : "#333",
          }}
        >
          {status === "loading" && "Processing Authentication..."}
          {status === "success" && "Authentication Successful"}
          {status === "error" && "Authentication Error"}
        </h1>

        <p
          style={{
            fontSize: "16px",
            color: "#666",
            marginBottom: "30px",
          }}
        >
          {message}
        </p>

        {status === "loading" && (
          <div
            style={{
              display: "inline-block",
              width: "40px",
              height: "40px",
              border: "4px solid #f3f3f3",
              borderTop: "4px solid #3498db",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        )}

        {status === "success" && (
          <div
            style={{
              fontSize: "48px",
              color: "#28a745",
              marginBottom: "20px",
            }}
          >
            ✓
          </div>
        )}

        {status === "error" && (
          <div
            style={{
              fontSize: "48px",
              color: "#dc3545",
              marginBottom: "20px",
            }}
          >
            ✗
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default AuthCallback;
