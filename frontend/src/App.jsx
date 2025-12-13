import { useState, useEffect, useRef } from "react";
import { parseOutput } from "./utils/outputParser";
import QRCodeDisplay from "./components/QRCodeDisplay";
import ImportStatus from "./components/ImportStatus";
import "./App.css";

function App() {
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [eventSource, setEventSource] = useState(null);
  const accumulatedOutputRef = useRef("");

  const handleImport = () => {
    console.log("handleImport called, profile:", profile);
    if (!profile.trim()) {
      setError("Please enter a profile name");
      return;
    }

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
    const url = `/api/import?profile=${encodeURIComponent(profile.trim())}`;
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
  };

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

      <div className="form-group">
        <input
          type="text"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder="Enter profile name"
          disabled={loading}
          className="profile-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && profile.trim()) {
              handleImport();
            }
          }}
        />
        <button
          onClick={handleImport}
          disabled={loading || !profile.trim()}
          className="import-button"
        >
          {loading ? "Running..." : "Run Import"}
        </button>
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
