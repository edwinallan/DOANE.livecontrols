const { Client, Server: OSCServer } = require("node-osc");
const net = require("net");
const db = require("./db");

let oscClients = {};
let camIPs = { "Tail A": null, "Tail B": null };
let pendingPresetSaves = {};

function updateCameraIP(camName, ip) {
  camIPs[camName] = ip;
  if (oscClients[camName]) oscClients[camName].close();
  oscClients[camName] = new Client(ip, 57110);

  // Init Sequence
  sendOSC(camName, "/OBSBOT/WebCam/General/SetZoomMin", 1);
  sendOSC(camName, "/OBSBOT/WebCam/General/ResetGimbal", 1);
}

function sendOSC(camera, address, ...args) {
  if (oscClients[camera]) {
    oscClients[camera].send(address, ...args, (err) => {
      if (err) console.error(`OSC Error (${camera}):`, err);
    });
  }
}

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

function initOSC(io, state) {
  // OSC Server for preset saving
  const oscServer = new OSCServer(57120, "0.0.0.0", () => {
    console.log("📡 OSC Server listening on port 57120");
  });

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
          if (!err)
            console.log(`💾 Saved Preset ${pending.presetId} for ${cam}`);
        },
      );
      delete pendingPresetSaves[cam];
    }
  });

  // TCP Heartbeat
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

  // Socket.IO Handlers
  io.on("connection", (socket) => {
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
}

module.exports = { initOSC, updateCameraIP, sendOSC };
