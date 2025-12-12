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

app.post("/api/import", async (req, res) => {
  try {
    const { profile } = req.body;

    if (!profile || typeof profile !== "string" || profile.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Profile is required",
      });
    }

    const command = `npm start -- --profile=${profile} --dry-run`;

    // Use spawn with timeout to be able to kill the process
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const process = spawn("npm", ["start", "--", `--profile=${profile}`, "--dry-run"], {
        cwd: CLI_DIR,
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        process.kill("SIGTERM");
        reject(
          new Error(
            "Command timeout: CLI execution took too long (30s). The CLI may be waiting for user interaction (e.g., BankID authentication)."
          )
        );
      }, 30000); // 30 second timeout

      process.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const error = new Error(stderr || `Process exited with code ${code}`);
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        }
      });

      process.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    res.json({
      success: true,
      output: stdout,
      error: stderr || null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      output: error.stdout || null,
      stderr: error.stderr || null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
