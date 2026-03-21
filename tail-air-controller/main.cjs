const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { Client, Server } = require("node-osc");
const sqlite3 = require("sqlite3").verbose();

// OSC Clients (Sending to port 57110)
const oscClients = {
  "Tail A": new Client("192.168.1.235", 57110),
  "Tail B": new Client("192.168.1.232", 57110),
};

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

  // Identify which camera replied based on IP
  const cam = rinfo.address === "192.168.1.235" ? "Tail A" : "Tail B";
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

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 850;
  const winHeight = 650;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: 0,
    y: height - winHeight,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  exec("open -a OBS --args --minimize");

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }

  // Init sequence
  ["Tail A", "Tail B"].forEach((cam) => {
    sendOSC(cam, "/OBSBOT/WebCam/General/SetZoomMin", 1);
    sendOSC(cam, "/OBSBOT/WebCam/General/ResetGimbal", 1);
    sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoFocus", 1);
    sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1);
    sendOSC(cam, "/OBSBOT/WebCam/General/SetAutoExposure", 1);
    sendOSC(cam, "/OBSBOT/Camera/TailAir/SetAiMode", 1);
    sendOSC(cam, "/OBSBOT/Camera/TailAir/SetTrackingSpeed", 2);
  });
}

function sendOSC(camera, address, ...args) {
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
