// Load environment variables from .env file at project root
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Resolve path to project root .env file
// server.js is in backend/, so go up one level to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

dotenv.config({ path: envPath });

import express from "express";
import cors from "cors";
import { handleImport } from "./api/routes/import.js";
import { handleListProfiles } from "./api/routes/profiles.js";
const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Profile listing endpoint
app.get("/api/profiles", (req, res) => {
  handleListProfiles(res);
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
  if (process.env.DEBUG === "true") {
    console.log("🐛 Debug mode enabled - verbose logging active");
  }
  if (process.env.USE_MOCK_SERVICES === "true") {
    console.log("⚠️  Using MOCK services for testing");
  }
});
