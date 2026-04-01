require("dotenv").config(); [cite: 1]
const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { Client, Server: OSCServer } = require("node-osc"); [cite: 2]
const sqlite3 = require("sqlite3").verbose(); [cite: 2]
const { default: OBSWebSocket } = require("obs-websocket-js"); [cite: 2]
const net = require("net"); [cite: 3]
const path = require("path");

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Serve the built React app (when running in production)
app.use(express.static(path.join(__dirname, "dist")));

// --- STATE ---
let state = {
  obsConnected: false,
  activeScene: "",
  isStreaming: false,
  streamBitrate: 0,
  isRecording: false,
  sourcesConnected: { "Tail A": false, "Tail B": false, "Mobile SRT": false },
  autoSwitch: { enabled: false, mobile: false, min: 5, max: 15 },
};

// --- OSC & DB SETUP ---
let oscClients = {};
let camIPs = { "Tail A": null, "Tail B": null }; [cite: 4]
let pendingPresetSaves = {};

const db = new sqlite3.Database(path.join(__dirname, "presets.db"));
db.run("CREATE TABLE IF NOT EXISTS presets (cam TEXT, presetId INTEGER, pan REAL, tilt REAL, zoom REAL, PRIMARY KEY(cam, presetId))"); [cite: 7]

const oscServer = new OSCServer(57120, "0.0.0.0", () => {
  console.log("OSC Server listening on port 57120"); [cite: 5]
});

// OSC Preset Save Listener
oscServer.on("message", (msg, rinfo) => {
  const address = msg[0];
  const args = msg.slice(1);
  let cam = Object.keys(oscClients).find(c => oscClients[c].host === rinfo.address);
  if (!cam || !pendingPresetSaves[cam]) return;

  const pending = pendingPresetSaves[cam];
  if (address === "/OBSBOT/WebCam/General/GimbalPosInfo") {
    pending.pan = args[0]; pending.tilt = args[1]; [cite: 11]
  } else if (address === "/OBSBOT/WebCam/General/ZoomInfo") {
    pending.zoom = args[0]; [cite: 12]
  }

  if (pending.pan !== undefined && pending.zoom !== undefined) {
    db.run(
      `INSERT OR REPLACE INTO presets (cam, presetId, pan, tilt, zoom) VALUES (?, ?, ?, ?, ?)`,
      [cam, pending.presetId, pending.pan, pending.tilt, pending.zoom],
      (err) => {
        if (!err) console.log(`Saved Preset ${pending.presetId} for ${cam}`); [cite: 12]
      }
    );
    delete pendingPresetSaves[cam];
  }
});

function sendOSC(camera, address, ...args) {
  if (oscClients[camera]) {
    oscClients[camera].send(address, ...args, (err) => {
      if (err) console.error(`OSC Error (${camera}):`, err); [cite: 28]
    });
  }
}

// --- TCP HEARTBEAT ---
function checkDeviceAlive(ip) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on("connect", () => { socket.destroy(); resolve(true); }); [cite: 8]
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); }); [cite: 9]
    socket.connect(554, ip);
  });
}

setInterval(async () => {
  let updated = false;
  for (const cam of Object.keys(camIPs)) {
    const isAlive = camIPs[cam] ? await checkDeviceAlive(camIPs[cam]) : false; [cite: 10]
    if (state.sourcesConnected[cam] !== isAlive) {
      state.sourcesConnected[cam] = isAlive;
      updated = true;
    }
  }
  if (updated) io.emit("state-update", state);
}, 2000); [cite: 11]

// --- OBS CONNECTION & LOGIC ---
const obs = new OBSWebSocket();
let mobileAudioTimeout;
let autoSwitchTimer;

async function connectOBS() {
  try {
    await obs.connect("ws://127.0.0.1:4455", process.env.VITE_OBS_PASSWORD, { eventSubscriptions: 66559 }); [cite: 14]
    state.obsConnected = true;
    
    const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
    state.activeScene = currentProgramSceneName;
    const streamStatus = await obs.call("GetStreamStatus");
    state.isStreaming = streamStatus.outputActive;
    io.emit("state-update", state);
    
    fetchCameraIPs();
  } catch (err) {
    state.obsConnected = false;
    io.emit("state-update", state);
    setTimeout(connectOBS, 5000);
  }
}

async function fetchCameraIPs() {
  const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/; [cite: 15]
  for (const cam of ["Tail A", "Tail B"]) {
    try {
      const { inputSettings } = await obs.call("GetInputSettings", { inputName: cam }); [cite: 16]
      const match = JSON.stringify(inputSettings).match(ipv4Regex); [cite: 17]
      if (match) {
        camIPs[cam] = match[0]; [cite: 18]
        if (oscClients[cam]) oscClients[cam].close(); [cite: 19]
        oscClients[cam] = new Client(match[0], 57110); [cite: 19]
        
        // Init Sequence
        sendOSC(cam, "/OBSBOT/WebCam/General/SetZoomMin", 1);
        sendOSC(cam, "/OBSBOT/WebCam/General/ResetGimbal", 1); [cite: 20]
      }
    } catch (e) {}
  }
}

// OBS Events
obs.on("ConnectionClosed", () => {
  state.obsConnected = false;
  io.emit("state-update", state);
  setTimeout(connectOBS, 3000);
});
obs.on("CurrentProgramSceneChanged", (data) => {
  state.activeScene = data.sceneName;
  io.emit("state-update", state);
});
obs.on("StreamStateChanged", (data) => {
  state.isStreaming = data.outputActive;
  io.emit("state-update", state);
});
obs.on("InputVolumeMeters", (data) => {
  const mobileInput = data.inputs.find((i) => i.inputName === "Mobile SRT");
  if (mobileInput && mobileInput.inputLevelsMul.some((l) => l[1] > 0.0001)) {
    if (!state.sourcesConnected["Mobile SRT"]) {
      state.sourcesConnected["Mobile SRT"] = true;
      io.emit("state-update", state);
    }
    clearTimeout(mobileAudioTimeout);
    mobileAudioTimeout = setTimeout(() => {
      state.sourcesConnected["Mobile SRT"] = false;
      io.emit("state-update", state);
    }, 2000);
  }
});

// OBS Screenshot Poller (Every 1 second)
setInterval(async () => {
  if (!state.obsConnected || !state.activeScene) return;
  try {
    const res = await obs.call("GetSourceScreenshot", {
      sourceName: state.activeScene,
      imageFormat: "jpeg",
      imageWidth: 640,
      imageHeight: 360,
      imageCompressionQuality: 70
    });
    io.emit("obs-screenshot", res.imageData);
  } catch (err) {}
}, 1000);

// --- AUTO SWITCHER LOGIC ---
function scheduleNextSwitch() {
  clearTimeout(autoSwitchTimer);
  if (!state.autoSwitch.enabled) return;

  const delay = Math.floor(Math.random() * (state.autoSwitch.max - state.autoSwitch.min + 1) + state.autoSwitch.min) * 1000;
  
  autoSwitchTimer = setTimeout(async () => {
    if (state.autoSwitch.mobile && state.sourcesConnected["Mobile SRT"]) {
      await obs.call("SetCurrentProgramScene", { sceneName: "Mobile" }).catch(()=>{});
    } else {
      const available = ["CAM 1", "CAM 2"].filter(scene => 
        (scene === "CAM 1" && state.sourcesConnected["Tail A"]) ||
        (scene === "CAM 2" && state.sourcesConnected["Tail B"])
      );
      if (available.length > 0) {
        const nextScene = available[Math.floor(Math.random() * available.length)];
        await obs.call("SetCurrentProgramScene", { sceneName: nextScene }).catch(()=>{});
      }
    }
    scheduleNextSwitch();
  }, delay);
}

// --- SOCKET.IO CLIENT HANDLERS ---
io.on("connection", (socket) => {
  console.log("Client connected from iPad");
  socket.emit("state-update", state);

  socket.on("set-scene", async (sceneName) => {
    if (state.obsConnected) await obs.call("SetCurrentProgramScene", { sceneName }).catch(()=>{});
  });

  socket.on("toggle-stream", async () => {
    if (state.obsConnected) await obs.call("ToggleStream").catch(()=>{});
  });

  socket.on("update-autoswitch", (config) => {
    state.autoSwitch = { ...state.autoSwitch, ...config };
    io.emit("state-update", state);
    scheduleNextSwitch();
  });

  socket.on("send-osc", ({ targets, address, value }) => {
    targets.forEach((target) => sendOSC(target, address, value));
  });

  socket.on("save-preset", ({ targets, presetId }) => {
    targets.forEach((cam) => {
      pendingPresetSaves[cam] = { presetId, pan: undefined, tilt: undefined, zoom: undefined }; [cite: 30]
      sendOSC(cam, "/OBSBOT/WebCam/General/GetGimbalPosInfo", 1);
      sendOSC(cam, "/OBSBOT/WebCam/General/GetZoomInfo", 1); [cite: 30]
    });
  });

  socket.on("load-preset", ({ targets, presetId }) => {
    targets.forEach((cam) => {
      db.get("SELECT pan, tilt, zoom FROM presets WHERE cam = ? AND presetId = ?", [cam, presetId], (err, row) => { [cite: 31]
        if (row) {
          sendOSC(cam, "/OBSBOT/WebCam/General/SetGimMotorDegree", row.pan, row.tilt, 0); [cite: 31, 32]
          sendOSC(cam, "/OBSBOT/WebCam/General/SetZoom", row.zoom); [cite: 32]
        }
      });
    });
  });
});

server.listen(4000, "0.0.0.0", () => {
  console.log("🚀 Headless Server running on http://localhost:4000");
  connectOBS();
});