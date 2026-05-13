const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let backendProcess = null;

function startBackend() {
  const backendDir = path.resolve(__dirname, "..", "..", "backend");
  if (!fs.existsSync(path.join(backendDir, "package.json"))) return;
  if (process.env.AURA_SKIP_BACKEND_SPAWN === "true") return;

  try {
    backendProcess = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["start"], {
      cwd: backendDir,
      env: {
        ...process.env,
        LLM_AUTOSTART: process.env.LLM_AUTOSTART || "true",
        LLM_START_COMMAND: process.env.LLM_START_COMMAND || "C:/Users/Aarush/AppData/Local/Programs/Python/Python313/Scripts/litert-lm.exe serve --api gemini --port 8080",
        LITERT_LM_BACKEND: process.env.LITERT_LM_BACKEND || "gpu"
      },
      stdio: "ignore",
      windowsHide: true
    });
  } catch (error) {
    console.warn("Backend spawn skipped:", error.message);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#e8efe7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5174";
  const built = path.join(__dirname, "..", "dist", "index.html");
  if (process.env.NODE_ENV === "production" && fs.existsSync(built)) {
    win.loadFile(built);
  } else {
    win.loadURL(devUrl);
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
