const { contextBridge } = require("electron");

const port = process.env.BACKEND_PORT || "3101";
contextBridge.exposeInMainWorld("auraDesktop", {
  backendUrl: process.env.AURA_BACKEND_URL || `http://127.0.0.1:${port}`
});
