require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { Client, Server: OSCServer } = require("node-osc");
const sqlite3 = require("sqlite3").verbose();
const { default: OBSWebSocket } = require("obs-websocket-js");
const net = require("net");
const path = require("path");

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
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
let camIPs = { "Tail A": null, "Tail B": null };
let pendingPresetSaves = {};

const dbPath = path.join(__dirname, "presets.db");
const db = new sqlite3.Database(dbPath);
db.run(
  "CREATE TABLE IF NOT EXISTS presets (cam TEXT, presetId INTEGER, pan REAL, tilt REAL, zoom REAL, PRIMARY KEY(cam, presetId))",
);

const oscServer = new OSCServer(57120, "0.0.0.0", () => {
  console.log("OSC Server listening on port 57120");
});

// OSC Preset Save Listener
oscServer.on("message", (msg, rinfo) => {
  const address = msg[0];
  const args = msg.slice(1);
  let cam = Object.keys(oscClients).find(
    (c) => oscClients[c].host === rinfo.address,
  );
  if (!cam || !pendingPresetSaves[cam]) return;

  const pending = pendingPresetSaves[cam];
  if (address === "/OBSBOT/WebCam/General/GimbalPosInfo") {
    pending.pan = args[0];
    pending.tilt = args[1];
  } else if (address === "/OBSBOT/WebCam/General/ZoomInfo") {
    pending.zoom = args[0];
  }

  if (pending.pan !== undefined && pending.zoom !== undefined) {
    db.run(
      `INSERT OR REPLACE INTO presets (cam, presetId, pan, tilt, zoom) VALUES (?, ?, ?, ?, ?)`,
      [cam, pending.presetId, pending.pan, pending.tilt, pending.zoom],
      (err) => {
        if (!err) console.log(`Saved Preset ${pending.presetId} for ${cam}`);
      },
    );
    delete pendingPresetSaves[cam];
  }
});

function sendOSC(camera, address, ...args) {
  if (oscClients[camera]) {
    oscClients[camera].send(address, ...args, (err) => {
      if (err) console.error(`OSC Error (${camera}):`, err);
    });
  }
}

// --- TCP HEARTBEAT ---
function checkDeviceAlive(ip) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(554, ip);
  });
}

setInterval(async () => {
  let updated = false;
  for (const cam of Object.keys(camIPs)) {
    const isAlive = camIPs[cam] ? await checkDeviceAlive(camIPs[cam]) : false;
    if (state.sourcesConnected[cam] !== isAlive) {
      state.sourcesConnected[cam] = isAlive;
      updated = true;
    }
  }
  if (updated) io.emit("state-update", state);
}, 2000);

// --- OBS CONNECTION & LOGIC ---
const obsMain = new OBSWebSocket();
const obsAudio = new OBSWebSocket();
let mobileAudioTimeout;
let autoSwitchTimer;

async function connectOBS() {
  try {
    const obsPassword = process.env.VITE_OBS_PASSWORD || undefined;

    // Connect Main OBS (Default low-volume events: scenes, stream status)
    await obsMain.connect("ws://127.0.0.1:4455", obsPassword);

    // Connect Audio-Only OBS (Strictly for InputVolumeMeters -> 65536)
    await obsAudio.connect("ws://127.0.0.1:4455", obsPassword, {
      eventSubscriptions: 65536,
    });

    state.obsConnected = true;

    const { currentProgramSceneName } = await obsMain.call(
      "GetCurrentProgramScene",
    );
    state.activeScene = currentProgramSceneName;
    const streamStatus = await obsMain.call("GetStreamStatus");
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
  const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  for (const cam of ["Tail A", "Tail B"]) {
    try {
      const { inputSettings } = await obsMain.call("GetInputSettings", {
        inputName: cam,
      });
      const match = JSON.stringify(inputSettings).match(ipv4Regex);
      if (match) {
        camIPs[cam] = match[0];
        if (oscClients[cam]) oscClients[cam].close();
        oscClients[cam] = new Client(match[0], 57110);

        // Init Sequence
        sendOSC(cam, "/OBSBOT/WebCam/General/SetZoomMin", 1);
        sendOSC(cam, "/OBSBOT/WebCam/General/ResetGimbal", 1);
      }
    } catch (e) {}
  }
}

// Main OBS Events
obsMain.on("ConnectionClosed", () => {
  state.obsConnected = false;
  io.emit("state-update", state);
  setTimeout(connectOBS, 3000);
});

obsMain.on("CurrentProgramSceneChanged", (data) => {
  state.activeScene = data.sceneName;
  io.emit("state-update", state);
});

obsMain.on("StreamStateChanged", (data) => {
  state.isStreaming = data.outputActive;
  io.emit("state-update", state);
});

// Audio OBS Events (Listen to the firehose here)
obsAudio.on("InputVolumeMeters", (data) => {
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

// OBS Screenshot Poller (Polite & Memory Safe)
let isFetchingScreenshot = false;

setInterval(async () => {
  // If OBS isn't connected, no scene is active, OR we are already fetching an image, do nothing!
  if (!state.obsConnected || !state.activeScene || isFetchingScreenshot) return;

  isFetchingScreenshot = true; // Lock the door

  try {
    const res = await obsMain.call("GetSourceScreenshot", {
      sourceName: state.activeScene,
      imageFormat: "jpeg",
      // Lowered resolution slightly to save network bandwidth to the iPad
      imageWidth: 480,
      imageHeight: 270,
      imageCompressionQuality: 60,
    });

    // Only send to clients if someone is actually connected to avoid buffering memory
    if (io.engine.clientsCount > 0) {
      io.emit("obs-screenshot", res.imageData);
    }
  } catch (err) {
    // Ignore screenshot errors (like if the scene transitions while grabbing)
  } finally {
    isFetchingScreenshot = false; // Unlock the door for the next second
  }
}, 1000);

// --- AUTO SWITCHER LOGIC ---
function scheduleNextSwitch() {
  clearTimeout(autoSwitchTimer);
  if (!state.autoSwitch.enabled) return;

  const delay =
    Math.floor(
      Math.random() * (state.autoSwitch.max - state.autoSwitch.min + 1) +
        state.autoSwitch.min,
    ) * 1000;

  autoSwitchTimer = setTimeout(async () => {
    if (state.autoSwitch.mobile && state.sourcesConnected["Mobile SRT"]) {
      await obsMain
        .call("SetCurrentProgramScene", { sceneName: "Mobile" })
        .catch(() => {});
    } else {
      const available = ["CAM 1", "CAM 2"].filter(
        (scene) =>
          (scene === "CAM 1" && state.sourcesConnected["Tail A"]) ||
          (scene === "CAM 2" && state.sourcesConnected["Tail B"]),
      );
      if (available.length > 0) {
        const nextScene =
          available[Math.floor(Math.random() * available.length)];
        await obsMain
          .call("SetCurrentProgramScene", { sceneName: nextScene })
          .catch(() => {});
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
    if (state.obsConnected)
      await obsMain
        .call("SetCurrentProgramScene", { sceneName })
        .catch(() => {});
  });

  socket.on("toggle-stream", async () => {
    if (state.obsConnected) await obsMain.call("ToggleStream").catch(() => {});
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
      pendingPresetSaves[cam] = {
        presetId,
        pan: undefined,
        tilt: undefined,
        zoom: undefined,
      };
      sendOSC(cam, "/OBSBOT/WebCam/General/GetGimbalPosInfo", 1);
      sendOSC(cam, "/OBSBOT/WebCam/General/GetZoomInfo", 1);
    });
  });

  socket.on("load-preset", ({ targets, presetId }) => {
    targets.forEach((cam) => {
      db.get(
        "SELECT pan, tilt, zoom FROM presets WHERE cam = ? AND presetId = ?",
        [cam, presetId],
        (err, row) => {
          if (row) {
            sendOSC(
              cam,
              "/OBSBOT/WebCam/General/SetGimMotorDegree",
              row.pan,
              row.tilt,
              0,
            );
            sendOSC(cam, "/OBSBOT/WebCam/General/SetZoom", row.zoom);
          }
        },
      );
    });
  });
});

server.listen(4000, "0.0.0.0", () => {
  console.log("🚀 Headless Server running on http://localhost:4000");
  connectOBS();
});
