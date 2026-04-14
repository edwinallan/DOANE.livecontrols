require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const path = require("path");

// Import our shared state
const state = require("./server.store");

// Import our isolated modules
const { initOSC } = require("./server.osc");
const { initOBS, obsMain, getCurrentScreenshots } = require("./server.obs"); // UPDATED
const { initYouTube } = require("./server.youtube");
const { initModem } = require("./server.modem");
const { initSync } = require("./server.sync"); // NEW: Import Sync Module

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Serve the built React frontend
app.use(express.static(path.join(__dirname, "dist")));

// --- INITIALIZE MODULES ---
initOSC(io, state);
initOBS(io, state);
initYouTube(app, io, state);
initModem(io, state);

// NEW: Initialize the A/V Sync Engine
initSync(io, state, obsMain, getCurrentScreenshots);

// Default Connection Handler
io.on("connection", (socket) => {
  console.log("📱 Client Connected");
  socket.emit("state-update", state);
});

// Start Server
server.listen(4000, "0.0.0.0", () => {
  console.log("🚀 Server running on port 4000");
});
