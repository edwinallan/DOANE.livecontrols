const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { Client } = require("node-osc");
const sqlite3 = require("sqlite3").verbose();

// OSC Clients for the cameras
const oscClients = {
  "Tail A": new Client("192.168.1.235", 57110),
  "Tail B": new Client("192.168.1.232", 57110),
};

// SQLite DB for presets
const db = new sqlite3.Database(
  path.join(app.getPath("userData"), "presets.db"),
);
db.run(
  "CREATE TABLE IF NOT EXISTS presets (id INTEGER PRIMARY KEY, button TEXT, zoom REAL, pan REAL, tilt REAL)",
);

let mainWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 800;
  const winHeight = 600;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: 0,
    y: height - winHeight, // Bottom left
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Simplified for internal studio tool
    },
  });

  // Launch OBS minimized (Mac)
  exec("open -a OBS --args --minimize");

  // Load Vite dev server or built files
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }

  // Initial Camera Setup on Load
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
  const msg = { address, args };
  oscClients[camera].send(msg, (err) => {
    if (err) console.error(`OSC Error (${camera}):`, err);
  });
}

// IPC Listener from React to send OSC
ipcMain.on("send-osc", (event, { targets, address, value }) => {
  targets.forEach((target) => {
    sendOSC(target, address, value);
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
