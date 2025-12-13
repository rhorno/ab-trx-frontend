const express = require("express");
const cors = require("cors");
const { handleImport } = require("./api/routes/import.js");

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// SSE endpoint for streaming import (now uses services instead of CLI)
app.get("/api/import", (req, res) => {
  const { profile } = req.query;

  if (!profile || typeof profile !== "string" || profile.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "Profile is required",
    });
  }

  // Set up Server-Sent Events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Send initial connection message
  res.write("data: " + JSON.stringify({ type: "connected" }) + "\n\n");

  // Handle client disconnect - cleanup will be handled in handleImport
  req.on("close", () => {
    // Cleanup is handled in handleImport's error handling
    // For now, we rely on service cleanup methods
  });

  // Call service-based import handler
  handleImport(profile.trim(), res).catch((error) => {
    // Final error handler if handleImport fails catastrophically
    if (!res.headersSent) {
      res.write(
        "data: " +
          JSON.stringify({
            type: "error",
            message: error.message || String(error),
          }) +
          "\n\n"
      );
      res.write(
        "data: " +
          JSON.stringify({
            type: "close",
            success: false,
          }) +
          "\n\n"
      );
      res.end();
    }
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
