const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("auraDesktop", {
  backendUrl: process.env.AURA_BACKEND_URL || "http://localhost:3001"
});
