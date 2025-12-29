// Load environment variables from .env file at project root
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import * as fs from "fs";

// Resolve path to project root .env file
// server.js is in backend/, so we need to find the correct .env location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if running in Home Assistant (check for /app directory or SUPERVISOR_TOKEN)
const isHomeAssistant =
  process.cwd().includes("/app") || process.env.SUPERVISOR_TOKEN !== undefined;

// Try multiple .env file locations in priority order
const possibleEnvPaths = [];

if (isHomeAssistant) {
  // Home Assistant: .env is one level up at /app/.env
  const projectRoot = path.resolve(__dirname, "..");
  possibleEnvPaths.push(path.join(projectRoot, ".env"));
} else {
  // Local development: try workspace root (two levels up from backend/)
  const workspaceRoot = path.resolve(__dirname, "../..");
  possibleEnvPaths.push(path.join(workspaceRoot, ".env"));

  // Fallback: also check one level up (ab-trx-importer/.env) for backward compatibility
  const projectRoot = path.resolve(__dirname, "..");
  possibleEnvPaths.push(path.join(projectRoot, ".env"));
}

// Find and load the first existing .env file
let envPath = null;
for (const candidatePath of possibleEnvPaths) {
  if (fs.existsSync(candidatePath)) {
    envPath = candidatePath;
    break;
  }
}

if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`✓ Loaded .env file from: ${envPath}`);
} else {
  // No .env file found - dotenv will use process.env defaults
  console.log(
    `⚠️  No .env file found. Tried locations: ${possibleEnvPaths.join(", ")}`
  );
  console.log("   Using environment variables from process.env");
}

import express from "express";
import cors from "cors";
import { handleImport } from "./api/routes/import.js";
import { handleListProfiles } from "./api/routes/profiles.js";
const app = express();
const PORT = process.env.PORT || 8000;

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
  const { profile, authMode } = req.query;

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
  // Pass authMode if provided (for Handelsbanken profiles)
  const effectiveAuthMode =
    authMode && typeof authMode === "string" ? authMode.trim() : null;
  handleImport(profile.trim(), res, effectiveAuthMode).catch((error) => {
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
  const isDebugMode = process.env.DEBUG === "true" || process.env.NODE_ENV === "development";
  if (isDebugMode) {
    console.log("🐛 Debug mode enabled - verbose logging active");
    console.log(`   DEBUG=${process.env.DEBUG || "not set"}`);
    console.log(`   NODE_ENV=${process.env.NODE_ENV || "not set"}`);
  }
  if (process.env.USE_MOCK_SERVICES === "true") {
    console.log("⚠️  Using MOCK services for testing");
  }
});
