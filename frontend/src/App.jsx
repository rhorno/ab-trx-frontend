import { useState, useEffect, useRef, useCallback } from "react";
import { parseOutput } from "./utils/outputParser";
import QRCodeDisplay from "./components/QRCodeDisplay";
import ImportStatus from "./components/ImportStatus";
import "./App.css";

function App() {
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [eventSource, setEventSource] = useState(null);
  const accumulatedOutputRef = useRef("");

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

  const handleImport = useCallback(() => {
    console.log("handleImport called, profile:", selectedProfile);
    if (!selectedProfile || !selectedProfile.trim()) {
      setError("Please select a profile first");
      return;
    }

    const profileName = selectedProfile;

    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
    }

    setLoading(true);
    setError(null);
    setOutput("");
    setParsedData(null);
    accumulatedOutputRef.current = "";

    // Create EventSource for Server-Sent Events
    const url = `/api/import?profile=${encodeURIComponent(profileName.trim())}`;
    console.log("Creating EventSource with URL:", url);
    const es = new EventSource(url);
    console.log("EventSource created:", es);

    // Handle connection
    es.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          // Connection established
          return;
        }

        if (data.type === "qr-code") {
          // Handle QR code token from backend (token string)
          setParsedData((prev) => ({
            ...prev,
            qrCode: data.data, // Token string
          }));
          return;
        }

        if (data.type === "stdout" || data.type === "stderr") {
          // Accumulate output
          accumulatedOutputRef.current += data.data;
          setOutput(accumulatedOutputRef.current);

          // Parse accumulated output in real-time to extract QR codes and status
          const parsed = parseOutput(accumulatedOutputRef.current);
          setParsedData(parsed);
        }

        if (data.type === "close") {
          // Process completed
          setLoading(false);
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
          setLoading(false);
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
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    });

    // Handle errors
    es.onerror = (err) => {
      console.error("EventSource error:", err);
      setLoading(false);
      setError("Connection error. Please try again.");
      es.close();
    };

    setEventSource(es);
  }, [eventSource, selectedProfile]);

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
      <h1 className="app-title">AB Transaction Importer</h1>

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
                  onClick={() => setSelectedProfile(profile.name)}
                >
                  <span className="profile-name">{profile.name}</span>
                </div>
              ))}
            </div>
            <div className="import-section">
              <button
                onClick={handleImport}
                disabled={loading || !selectedProfile}
                className="import-button"
              >
                {loading ? "Running..." : "Import"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Display QR Code if available */}
      {parsedData?.qrCode && <QRCodeDisplay qrCode={parsedData.qrCode} />}

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
            parsedData.success === false &&
            parsedData.transactionCount === null
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
