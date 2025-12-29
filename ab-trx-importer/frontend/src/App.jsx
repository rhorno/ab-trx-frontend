import { useState, useEffect, useRef, useCallback } from "react";
import { parseOutput } from "./utils/outputParser";
import QRCodeDisplay from "./components/QRCodeDisplay";
import ImportStatus from "./components/ImportStatus";
import debugLogger from "./utils/debugLogger";
import "./App.css";

function App() {
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedProfileData, setSelectedProfileData] = useState(null);
  const [showAuthModeModal, setShowAuthModeModal] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [eventSource, setEventSource] = useState(null);
  const accumulatedOutputRef = useRef("");
  const loadingRef = useRef(false);

  // Fetch profiles on component mount
  useEffect(() => {
    const controller = new AbortController();

    const fetchProfiles = async () => {
      try {
        setProfilesLoading(true);
        setProfilesError(null);

        const response = await fetch("/api/profiles", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch profiles: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success && Array.isArray(data.profiles)) {
          setProfiles(data.profiles);
        } else {
          throw new Error("Invalid response format from profiles API");
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error fetching profiles:", err);
          setProfilesError(err.message || "Failed to load profiles");
        }
      } finally {
        setProfilesLoading(false);
      }
    };

    fetchProfiles();

    return () => {
      controller.abort();
    };
  }, []);

  // Check if selected profile is Handelsbanken
  const isHandelsbankenProfile = selectedProfileData?.bank === "handelsbanken";

  // Handle profile selection
  const handleProfileSelect = (profileName) => {
    const profile = profiles.find((p) => p.name === profileName);
    setSelectedProfile(profileName);
    setSelectedProfileData(profile);
    setAuthMode(null); // Reset auth mode when profile changes
  };

  // Start the actual import process
  const startImport = useCallback((overrideAuthMode = null) => {
    if (!selectedProfile || !selectedProfile.trim()) {
      setError("Please select a profile first");
      return;
    }

    const profileName = selectedProfile;
    // Use overrideAuthMode if provided, otherwise use state authMode
    const effectiveAuthMode = overrideAuthMode !== null ? overrideAuthMode : authMode;

    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
    }
    setLoading(true);
    loadingRef.current = true;
    setError(null);
    setOutput("");
    setParsedData(null);
    accumulatedOutputRef.current = "";

    // Create EventSource for Server-Sent Events
    // Include authMode for Handelsbanken profiles
    let url = `/api/import?profile=${encodeURIComponent(profileName.trim())}`;
    if (isHandelsbankenProfile && effectiveAuthMode) {
      url += `&authMode=${encodeURIComponent(effectiveAuthMode)}`;
    }
    debugLogger.info("Creating EventSource connection", {
      url,
      profile: profileName,
      authMode: effectiveAuthMode,
      isHandelsbanken: isHandelsbankenProfile,
    });
    
    const es = new EventSource(url);
    
    // Handle connection open
    es.addEventListener("open", () => {
      debugLogger.info("EventSource connection opened", {
        readyState: es.readyState,
        url: es.url,
      });
    });

    // Handle connection
    es.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        
        debugLogger.debug("SSE message received", {
          type: data.type,
          hasData: !!data.data,
          dataLength: data.data ? String(data.data).length : 0,
        });

        if (data.type === "connected") {
          // Connection established
          debugLogger.info("SSE connection established", {
            readyState: es.readyState,
          });
          return;
        }

        if (data.type === "qr-code") {
          // Handle QR code token from backend (token string)
          debugLogger.info("QR code token received via SSE", {
            token: data.data,
            tokenLength: data.data ? String(data.data).length : 0,
          });
          setParsedData((prev) => {
            const newData = {
              ...prev,
              qrCode: data.data, // Token string
              // Don't set success to false when QR code appears - we're waiting for auth
              success: prev?.success ?? null,
            };
            debugLogger.debug("State updated with QR code", {
              hasQrCode: !!newData.qrCode,
              hasAutoStartToken: !!newData.autoStartToken,
              success: newData.success,
            });
            return newData;
          });
          return;
        }

        if (data.type === "bankid-autostart") {
          // Handle auto-start token from backend (for app-to-app flow)
          debugLogger.info("BankID auto-start token received via SSE", {
            autoStartToken: data.data,
            tokenLength: data.data ? String(data.data).length : 0,
            tokenPreview: data.data
              ? `${data.data.substring(0, 10)}...${data.data.substring(data.data.length - 5)}`
              : null,
          });
          setParsedData((prev) => {
            const newData = {
              ...prev,
              autoStartToken: data.data, // Auto-start token string
              // Don't set success to false when auto-start token appears - we're waiting for auth
              success: prev?.success ?? null,
            };
            debugLogger.debug("State updated with autoStartToken", {
              hasQrCode: !!newData.qrCode,
              hasAutoStartToken: !!newData.autoStartToken,
              autoStartTokenLength: newData.autoStartToken
                ? newData.autoStartToken.length
                : 0,
              success: newData.success,
            });
            return newData;
          });
          return;
        }

        if (data.type === "stdout" || data.type === "stderr") {
          // Accumulate output
          accumulatedOutputRef.current += data.data;
          setOutput(accumulatedOutputRef.current);
          debugLogger.debug(`SSE ${data.type} message`, {
            dataLength: data.data ? String(data.data).length : 0,
            accumulatedLength: accumulatedOutputRef.current.length,
          });

          // Parse accumulated output in real-time to extract QR codes and status
          const parsed = parseOutput(accumulatedOutputRef.current);

          // If we have a QR code and are still loading, preserve null success state
          // Only set success to false if we have a clear error and no QR code
          setParsedData((prev) => {
            const hasQRCode = prev?.qrCode || parsed.qrCode;
            const isStillLoading = loadingRef.current;

            // If we have QR code and are loading, don't show error yet
            // Only suppress error if there's no explicit error message
            if (
              hasQRCode &&
              isStillLoading &&
              parsed.success === false &&
              !parsed.statusMessage
            ) {
              return {
                ...parsed,
                qrCode: prev?.qrCode || parsed.qrCode,
                success: null, // Keep as null while waiting for auth
              };
            }

            // Preserve QR code if it exists
            return {
              ...parsed,
              qrCode: prev?.qrCode || parsed.qrCode,
            };
          });
        }

        if (data.type === "close") {
          // Process completed
          debugLogger.info("SSE close message received", {
            success: data.success,
            hasOutput: !!data.output,
            hasStderr: !!data.stderr,
          });
          setLoading(false);
          loadingRef.current = false;
          es.close();

          // Final parse of complete output
          const finalOutput = data.output || accumulatedOutputRef.current;
          const finalStderr = data.stderr || "";
          const finalParsed = parseOutput(finalOutput + "\n" + finalStderr);

          if (data.success) {
            finalParsed.success = true;
          } else {
            finalParsed.success = false;
            if (finalStderr && !finalParsed.statusMessage) {
              finalParsed.statusMessage = finalStderr.trim();
            }
          }

          setParsedData(finalParsed);
          setOutput(finalOutput);
        }

        if (data.type === "error") {
          // Process error
          debugLogger.error("SSE error message received", {
            message: data.message,
            hasOutput: !!data.output,
          });
          setLoading(false);
          loadingRef.current = false;
          setError(data.message || "Import failed");
          es.close();

          const errorParsed = parseOutput(
            data.output || accumulatedOutputRef.current
          );
          errorParsed.success = false;
          if (data.message && !errorParsed.statusMessage) {
            errorParsed.statusMessage = data.message;
          }
          setParsedData(errorParsed);
        }

        // Log any other message types
        if (
          !["connected", "qr-code", "bankid-autostart", "stdout", "stderr", "close", "error"].includes(
            data.type
          )
        ) {
          debugLogger.debug("Unknown SSE message type received", {
            type: data.type,
            data: data,
          });
        }
      } catch (err) {
        debugLogger.error("Error parsing SSE data", {
          error: err.message,
          stack: err.stack,
          rawData: event.data,
        });
      }
    });

    // Handle errors
    es.onerror = (err) => {
      debugLogger.error("EventSource error occurred", {
        error: err,
        readyState: es.readyState,
        url: es.url,
      });
      setLoading(false);
      loadingRef.current = false;
      setError("Connection error. Please try again.");
      es.close();
    };

    // Handle connection close
    es.addEventListener("close", () => {
      debugLogger.info("EventSource connection closed", {
        readyState: es.readyState,
      });
    });

    setEventSource(es);
    setShowAuthModeModal(false); // Close modal when import starts
  }, [eventSource, selectedProfile, isHandelsbankenProfile, authMode]);

  // Handle import button click
  const handleImportClick = useCallback(() => {
    if (!selectedProfile || !selectedProfile.trim()) {
      setError("Please select a profile first");
      return;
    }

    // For Handelsbanken profiles, show auth mode selection first
    if (isHandelsbankenProfile && !authMode) {
      setShowAuthModeModal(true);
      return;
    }

    // For non-Handelsbanken or when authMode is already selected, proceed
    startImport();
  }, [selectedProfile, isHandelsbankenProfile, authMode, startImport]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  return (
    <div className="app-container">
      {/* Profiles List */}
      <div className="profiles-section">
        {profilesLoading && (
          <div className="profiles-loading">Loading profiles...</div>
        )}

        {profilesError && (
          <div className="profiles-error">
            Error loading profiles: {profilesError}
          </div>
        )}

        {!profilesLoading && !profilesError && profiles.length === 0 && (
          <div className="profiles-empty">No profiles available</div>
        )}

        {!profilesLoading && !profilesError && profiles.length > 0 && (
          <>
            <div className="profiles-list">
              {profiles.map((profile) => (
                <div
                  key={profile.name}
                  className={`profile-item ${
                    selectedProfile === profile.name ? "selected" : ""
                  }`}
                  onClick={() => handleProfileSelect(profile.name)}
                >
                  <span className="profile-name">{profile.name}</span>
                </div>
              ))}
            </div>
            <div className="import-section">
              <button
                onClick={handleImportClick}
                disabled={loading || !selectedProfile}
                className="import-button"
              >
                {loading ? "Running..." : "Import"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Auth Mode Selection Modal for Handelsbanken */}
      {showAuthModeModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Choose BankID Authentication Method</h2>
            <p className="modal-description">
              How do you want to authenticate with BankID?
            </p>
            <div className="auth-mode-options">
              <button
                className={`auth-mode-button ${
                  authMode === "same-device" ? "selected" : ""
                }`}
                onClick={() => {
                  const newAuthMode = "same-device";
                  setAuthMode(newAuthMode);
                  setShowAuthModeModal(false);
                  startImport(newAuthMode);
                }}
              >
                <div className="auth-mode-title">Open BankID App</div>
                <div className="auth-mode-description">
                  Open BankID app on this device (recommended on mobile)
                </div>
              </button>
              <button
                className={`auth-mode-button ${
                  authMode === "other-device" ? "selected" : ""
                }`}
                onClick={() => {
                  const newAuthMode = "other-device";
                  setAuthMode(newAuthMode);
                  setShowAuthModeModal(false);
                  startImport(newAuthMode);
                }}
              >
                <div className="auth-mode-title">Scan QR Code</div>
                <div className="auth-mode-description">
                  Show QR code to scan from another device
                </div>
              </button>
            </div>
            <button
              className="modal-close-button"
              onClick={() => setShowAuthModeModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Display QR Code if available, OR show button if autoStartToken is available */}
      {(parsedData?.qrCode || parsedData?.autoStartToken) && (
        <QRCodeDisplay
          qrCode={parsedData.qrCode}
          autoStartToken={parsedData.autoStartToken}
        />
      )}

      {/* Display Import Status */}
      {parsedData && (
        <ImportStatus
          success={parsedData.success}
          transactionCount={parsedData.transactionCount}
          statusMessage={parsedData.statusMessage || error}
          isDryRun={true}
          isWaitingAuth={
            loading &&
            parsedData.qrCode &&
            (parsedData.success === null || parsedData.success === undefined) &&
            parsedData.transactionCount === null &&
            !parsedData.statusMessage
          }
        />
      )}

      {/* Fallback: Display raw output if parsing didn't extract key info or for debugging */}
      {output &&
        !parsedData?.qrCode &&
        parsedData?.success === false &&
        parsedData?.transactionCount === null && (
          <div className="raw-output-container">
            <h3 className="raw-output-title">Output:</h3>
            <pre className="raw-output-pre">{output}</pre>
          </div>
        )}
    </div>
  );
}

export default App;
