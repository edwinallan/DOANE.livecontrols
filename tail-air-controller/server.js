require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const path = require("path");

// Import our shared state
const state = require("./store");

// Import our isolated modules
const { initOSC } = require("./osc");
const { initOBS } = require("./obs");
const { initYouTube } = require("./youtube");

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

// Default Connection Handler
io.on("connection", (socket) => {
  console.log("📱 Client Connected");
  socket.emit("state-update", state);
});

// Start Server
server.listen(4000, "0.0.0.0", () => {
  console.log("🚀 Server running on port 4000");
});
