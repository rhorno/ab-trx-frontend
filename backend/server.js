const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
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

    const { stdout, stderr } = await execAsync(command, {
      cwd: CLI_DIR,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
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
