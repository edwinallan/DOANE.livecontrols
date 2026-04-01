require("dotenv").config();

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { Client, Server } = require("node-osc");
const sqlite3 = require("sqlite3").verbose();
const { default: OBSWebSocket } = require("obs-websocket-js");
const net = require("net"); // Used for the rock-solid TCP heartbeat

// OSC Clients & IP Storage
let oscClients = {};
let camIPs = { "Tail A": null, "Tail B": null };

// OSC Server (Listening on port 57120 for preset replies)
const oscServer = new Server(57120, "0.0.0.0", () => {
  console.log("OSC Server is listening on port 57120");
});

// SQLite DB Setup
const dbPath = path.join(app.getPath("userData"), "presets.db");
const db = new sqlite3.Database(dbPath);

db.run(
  "CREATE TABLE IF NOT EXISTS presets (cam TEXT, presetId INTEGER, pan REAL, tilt REAL, zoom REAL, PRIMARY KEY(cam, presetId))",
);

let mainWindow;
let pendingPresetSaves = {};

// --- TCP HEARTBEAT LOOP (100% RELIABLE) ---
function checkDeviceAlive(ip) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500); // 1.5 second timeout

    socket.on("connect", () => {
      socket.destroy();
      resolve(true); // Port 554 is open!
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    // Check the RTSP streaming port that OBS uses
    socket.connect(554, ip);
  });
}

setInterval(async () => {
  let statusUpdate = {};
  for (const cam of Object.keys(camIPs)) {
    if (camIPs[cam]) {
      statusUpdate[cam] = await checkDeviceAlive(camIPs[cam]);
    } else {
      statusUpdate[cam] = false;
    }
  }

  // Send the true/false states to the React frontend
  if (mainWindow) {
    mainWindow.webContents.send("camera-status", statusUpdate);
  }
}, 2000); // Ping every 2 seconds

// Listen for incoming OSC messages (for preset saving)
oscServer.on("message", (msg, rinfo) => {
  const address = msg[0];
  const args = msg.slice(1);

  let cam = null;
  for (const [camName, client] of Object.entries(oscClients)) {
    if (client.host === rinfo.address) {
      cam = camName;
      break;
    }
  }

  if (!cam) return;
  const pending = pendingPresetSaves[cam];
  if (!pending) return;

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
        if (err) console.error("DB Save Error:", err);
        else console.log(`Saved Preset ${pending.presetId} for ${cam}`);
      },
    );
    delete pendingPresetSaves[cam];
  }
});

// --- DYNAMIC IP DISCOVERY VIA OBS WEBSOCKET ---
const obs = new OBSWebSocket();

async function setupDynamicOSC() {
  try {
    const obsPassword = process.env.VITE_OBS_PASSWORD || undefined;
    await obs.connect("ws://127.0.0.1:4455", obsPassword);
    console.log("[Node] Connected to OBS. Fetching Camera IPs...");

    const cams = ["Tail A", "Tail B"];
    const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

    for (const cam of cams) {
      try {
        const { inputSettings } = await obs.call("GetInputSettings", {
          inputName: cam,
        });
        const settingsStr = JSON.stringify(inputSettings);
        const match = settingsStr.match(ipv4Regex);

        if (match) {
          const ip = match[0];
          camIPs[cam] = ip; // Store for the new heartbeat
          console.log(`[OSC] Successfully mapped ${cam} to IP: ${ip}`);

          if (oscClients[cam]) oscClients[cam].close();
          oscClients[cam] = new Client(ip, 57110);

          // Init sequence
          sendOSC(cam, "/OBSBOT/WebCam/General/SetZoomMin", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/ResetGimbal", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoFocus", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoExposure", 1);
          sendOSC(cam, "/OBSBOT/Camera/TailAir/SetAiMode", 1);
          sendOSC(cam, "/OBSBOT/Camera/TailAir/SetTrackingSpeed", 2);
        } else {
          console.warn(
            `[OSC] No IP address found inside OBS settings for ${cam}.`,
          );
        }
      } catch (err) {
        console.warn(
          `[OSC] OBS Source '${cam}' not found or no settings available.`,
        );
      }
    }
  } catch (error) {
    console.warn(
      `[Node] Waiting for OBS to open or password incorrect... retrying in 5 seconds. Error: ${error.message}`,
    );
    setTimeout(setupDynamicOSC, 5000);
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 850;
  const winHeight = 650;

  mainWindow = new BrowserWindow({
    title: "DOANE.live",
    width: winWidth,
    height: winHeight,
    x: 0,
    y: height - winHeight,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  exec("open -a OBS");

  setTimeout(() => {
    if (process.env.NODE_ENV === "development") {
      mainWindow.loadURL("http://localhost:5173");
    } else {
      mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
    }
    setupDynamicOSC();
  }, 3000);
}

// Fixed: Spread arguments correctly for node-osc!
function sendOSC(camera, address, ...args) {
  if (!oscClients[camera]) {
    console.warn(
      `[Warning] Cannot send OSC: Client for ${camera} is not initialized.`,
    );
    return;
  }
  oscClients[camera].send(address, ...args, (err) => {
    if (err) console.error(`OSC Error (${camera}):`, err);
  });
}

// IPC Handlers
ipcMain.on("send-osc", (e, { targets, address, value }) => {
  targets.forEach((target) => sendOSC(target, address, value));
});

ipcMain.on("save-preset", (e, { targets, presetId }) => {
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

ipcMain.on("load-preset", (e, { targets, presetId }) => {
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
