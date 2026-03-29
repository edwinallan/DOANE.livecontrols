require("dotenv").config();

const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { Client, Server } = require("node-osc");
const sqlite3 = require("sqlite3").verbose();
const { default: OBSWebSocket } = require("obs-websocket-js");

// OSC Clients (Empty initially, populated dynamically from OBS)
let oscClients = {};

// OSC Server (Listening on port 57120 for replies)
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
let pendingPresetSaves = {}; // Tracks which camera is currently trying to save a preset

// Listen for incoming OSC messages from cameras
oscServer.on("message", (msg, rinfo) => {
  const address = msg[0];
  const args = msg.slice(1);

  // Identify which camera replied based on the dynamically stored IPs
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
    // Assuming standard reply address
    pending.pan = args[0]; // Yaw/Pan
    pending.tilt = args[1]; // Pitch/Tilt
  } else if (address === "/OBSBOT/WebCam/General/ZoomInfo") {
    pending.zoom = args[0]; // Zoom percentage
  }

  // Once we have both coordinates, save to SQLite
  if (pending.pan !== undefined && pending.zoom !== undefined) {
    db.run(
      `INSERT OR REPLACE INTO presets (cam, presetId, pan, tilt, zoom) VALUES (?, ?, ?, ?, ?)`,
      [cam, pending.presetId, pending.pan, pending.tilt, pending.zoom],
      (err) => {
        if (err) console.error("DB Save Error:", err);
        else console.log(`Saved Preset ${pending.presetId} for ${cam}`);
      },
    );
    delete pendingPresetSaves[cam]; // Clear pending state
  }
});

// --- DYNAMIC IP DISCOVERY VIA OBS WEBSOCKET ---
const obs = new OBSWebSocket();

async function setupDynamicOSC() {
  try {
    // Grab the password from the .env file
    const obsPassword = process.env.VITE_OBS_PASSWORD || undefined;

    // Connect using the password
    await obs.connect("ws://127.0.0.1:4455", obsPassword);
    console.log("[Node] Connected to OBS. Fetching Camera IPs...");

    const cams = ["Tail A", "Tail B"];
    const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/; // Regex to find an IP address

    for (const cam of cams) {
      try {
        const { inputSettings } = await obs.call("GetInputSettings", {
          inputName: cam,
        });
        const settingsStr = JSON.stringify(inputSettings);
        const match = settingsStr.match(ipv4Regex);

        if (match) {
          const ip = match[0];
          console.log(`[OSC] Successfully mapped ${cam} to IP: ${ip}`);

          // Close old connection if it exists to prevent memory leaks
          if (oscClients[cam]) oscClients[cam].close();
          oscClients[cam] = new Client(ip, 57110);

          // Run the camera init sequence now that we have the IP
          sendOSC(cam, "/OBSBOT/WebCam/General/SetZoomMin", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/ResetGimbal", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoFocus", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1);
          sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoExposure", 1);
          sendOSC(cam, "/OBSBOT/Camera/TailAir/SetAiMode", 1);
          sendOSC(cam, "/OBSBOT/Camera/TailAir/SetTrackingSpeed", 2);
        } else {
          console.warn(
            `[OSC] No IP address found inside the OBS settings for ${cam}.`,
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
    title: "DOANE.live", // Updated Window Title
    width: winWidth,
    height: winHeight,
    x: 0,
    y: height - winHeight,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  exec("open -a OBS");

  // Add a 3-second delay to let OBS fully initialize its WebSocket server
  setTimeout(() => {
    if (process.env.NODE_ENV === "development") {
      mainWindow.loadURL("http://localhost:5173");
    } else {
      mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
    }

    // Start the OBS connection loop from the backend
    setupDynamicOSC();
  }, 3000);
}

// Safely send OSC messages only if the client exists
function sendOSC(camera, address, ...args) {
  if (!oscClients[camera]) {
    console.warn(
      `[Warning] Cannot send OSC: Client for ${camera} is not initialized. Is the IP in OBS correct?`,
    );
    return;
  }
  oscClients[camera].send({ address, args }, (err) => {
    if (err) console.error(`OSC Error (${camera}):`, err);
  });
}

// IPC Handlers
ipcMain.on("send-osc", (e, { targets, address, value }) => {
  targets.forEach((target) => sendOSC(target, address, value));
});

// Trigger a save sequence
ipcMain.on("save-preset", (e, { targets, presetId }) => {
  targets.forEach((cam) => {
    pendingPresetSaves[cam] = {
      presetId,
      pan: undefined,
      tilt: undefined,
      zoom: undefined,
    };
    // Ask camera for current info
    sendOSC(cam, "/OBSBOT/WebCam/General/GetGimbalPosInfo", 1);
    sendOSC(cam, "/OBSBOT/WebCam/General/GetZoomInfo", 1);
  });
});

// Load a preset
ipcMain.on("load-preset", (e, { targets, presetId }) => {
  targets.forEach((cam) => {
    db.get(
      "SELECT pan, tilt, zoom FROM presets WHERE cam = ? AND presetId = ?",
      [cam, presetId],
      (err, row) => {
        if (row) {
          // Send load commands
          sendOSC(
            cam,
            "/OBSBOT/WebCam/General/SetGimMotorDegree",
            row.pan,
            row.tilt,
            0,
          ); // Yaw, Pitch, Roll
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
