import { useState } from "react";

function App() {
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);

  const handleImport = async () => {
    if (!profile.trim()) {
      setError("Please enter a profile name");
      return;
    }

    setLoading(true);
    setError(null);
    setOutput(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profile.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        setOutput(data.output);
        setError(data.error || null);
      } else {
        setError(data.error || "Import failed");
        setOutput(data.output || null);
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "800px",
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>AB Transaction Importer</h1>

      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder="Enter profile name"
          disabled={loading}
          style={{
            padding: "8px",
            width: "200px",
            marginRight: "10px",
            fontSize: "14px",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && profile.trim()) {
              handleImport();
            }
          }}
        />
        <button
          onClick={handleImport}
          disabled={loading || !profile.trim()}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            cursor: loading || !profile.trim() ? "not-allowed" : "pointer",
            opacity: loading || !profile.trim() ? 0.6 : 1,
          }}
        >
          {loading ? "Running..." : "Run Import"}
        </button>
      </div>

      {error && (
        <div
          style={{
            color: "red",
            marginBottom: "10px",
            padding: "10px",
            backgroundColor: "#ffe6e6",
            borderRadius: "4px",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {output && (
        <div>
          <h3>Output:</h3>
          <pre
            style={{
              background: "#f5f5f5",
              padding: "10px",
              overflow: "auto",
              maxHeight: "500px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "12px",
              lineHeight: "1.4",
            }}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;
