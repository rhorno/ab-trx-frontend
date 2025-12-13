const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const app = express();
const PORT = 8000;
const CLI_DIR = "/Users/richardhorno/dev/ab-trx-importer";

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Store active processes to allow cleanup
const activeProcesses = new Map();

// SSE endpoint for streaming import
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

  // Spawn CLI process
  const cliProcess = spawn(
    "npm",
    ["start", "--", `--profile=${profile}`, "--dry-run"],
    {
      cwd: CLI_DIR,
      shell: true,
    }
  );

  const processId = `${Date.now()}-${Math.random()}`;
  activeProcesses.set(processId, cliProcess);

  let accumulatedOutput = "";
  let accumulatedStderr = "";

  // Stream stdout
  cliProcess.stdout.on("data", (data) => {
    const chunk = data.toString();
    accumulatedOutput += chunk;
    res.write(
      "data: " + JSON.stringify({ type: "stdout", data: chunk }) + "\n\n"
    );
  });

  // Stream stderr
  cliProcess.stderr.on("data", (data) => {
    const chunk = data.toString();
    accumulatedStderr += chunk;
    res.write(
      "data: " + JSON.stringify({ type: "stderr", data: chunk }) + "\n\n"
    );
  });

  // Handle process completion
  cliProcess.on("close", (code) => {
    activeProcesses.delete(processId);

    const result = {
      type: "close",
      code: code,
      success: code === 0,
      output: accumulatedOutput,
      stderr: accumulatedStderr,
    };

    res.write("data: " + JSON.stringify(result) + "\n\n");
    res.end();
  });

  // Handle process errors
  cliProcess.on("error", (err) => {
    activeProcesses.delete(processId);

    const error = {
      type: "error",
      message: err.message,
      output: accumulatedOutput,
      stderr: accumulatedStderr,
    };

    res.write("data: " + JSON.stringify(error) + "\n\n");
    res.end();
  });

  // Handle client disconnect
  req.on("close", () => {
    if (activeProcesses.has(processId)) {
      cliProcess.kill("SIGTERM");
      activeProcesses.delete(processId);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
