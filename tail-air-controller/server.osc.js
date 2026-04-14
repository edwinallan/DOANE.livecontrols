const osc = require("osc");
const db = require("./server.db");

let udpPort;
let ioInstance; // Store io globally for this module so updateCameraIP can use it
const cameraIPs = { "Tail A": null, "Tail B": null };
const awaitingPresetSave = {};

// Keep a memory of the config in the backend to broadcast to new clients
const currentConfigs = {
  "Tail A": {
    aiMode: null,
    trackingSpeed: null,
    wbMode: null,
    colorTemp: null,
    zoom: null,
  },
  "Tail B": {
    aiMode: null,
    trackingSpeed: null,
    wbMode: null,
    colorTemp: null,
    zoom: null,
  },
};

function initOSC(io, state) {
  ioInstance = io;
  udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 57120,
  });

  // Polling Zoom Info: 8 seconds and gated by connection state
  setInterval(() => {
    Object.entries(cameraIPs).forEach(([cam, ip]) => {
      // ONLY send if we have an IP AND the global state says the camera is connected
      if (ip && state.sourcesConnected[cam]) {
        try {
          udpPort.send(
            {
              address: "/OBSBOT/WebCam/General/GetZoomInfo",
              args: [{ type: "i", value: 1 }],
            },
            ip,
            57110,
          );
        } catch (e) {
          // Catch synchronous OS routing errors silently
        }
      }
    });
  }, 8000);

  udpPort.on("message", (oscMsg, timeTag, info) => {
    const cam = Object.keys(cameraIPs).find(
      (key) => cameraIPs[key] === info.address,
    );
    if (!cam) return;

    // Intercept Zoom Info and broadcast to frontend + save to DB
    if (oscMsg.address === "/OBSBOT/WebCam/General/ZoomInfo") {
      const zoomVal = oscMsg.args[0];

      if (currentConfigs[cam].zoom !== zoomVal) {
        currentConfigs[cam].zoom = zoomVal;
        db.run(
          `INSERT INTO camera_config (cam, zoom) VALUES (?, ?) 
           ON CONFLICT(cam) DO UPDATE SET zoom = ?`,
          [cam, zoomVal, zoomVal],
        );
        ioInstance.emit("config-update", currentConfigs);
      }

      const saveRequest = awaitingPresetSave[cam];
      if (saveRequest) {
        saveRequest.zoom = zoomVal;
        checkAndSavePreset(cam, saveRequest);
      }
      return;
    }

    const saveRequest = awaitingPresetSave[cam];
    if (!saveRequest) return;

    if (oscMsg.address === "/OBSBOT/WebCam/General/GetGimbalPosInfoResp") {
      // FIX: The camera drops 'roll', leaving [0] as Pitch (Tilt) and [1] as Yaw (Pan)
      saveRequest.tilt = oscMsg.args[0];
      saveRequest.pan = oscMsg.args[1];
      checkAndSavePreset(cam, saveRequest);
    }
  });

  udpPort.on("error", (err) => {
    // Suppress malformed tags and host down/unreachable terminal spam
    if (err.message && err.message.includes("malformed type tag")) return;
    if (err.code === "EHOSTDOWN" || err.code === "EHOSTUNREACH") return;

    console.error("OSC Parser Error:", err.message);
  });

  udpPort.open();

  function checkAndSavePreset(cam, req) {
    if (
      req.pan !== undefined &&
      req.zoom !== undefined &&
      req.tilt !== undefined
    ) {
      clearTimeout(req.timeoutId);
      db.run(
        "INSERT OR REPLACE INTO presets (cam, presetId, pan, tilt, zoom) VALUES (?, ?, ?, ?, ?)",
        [cam, req.presetId, req.pan, req.tilt, req.zoom],
        (err) => {
          console.log(`\n💾 --- SAVING PRESET ---`);
          if (!err) {
            console.log(`✅ Preset P${req.presetId} saved for ${cam}`);
            console.log(
              `   Captured Data -> Pan: ${req.pan}, Tilt: ${req.tilt}, Zoom: ${req.zoom}`,
            );
          } else {
            console.error(`❌ DB Save Error:`, err);
          }
          console.log(`-------------------------\n`);
          delete awaitingPresetSave[cam];
        },
      );
    }
  }

  io.on("connection", (socket) => {
    // Send latest configs to newly connected frontends
    socket.emit("config-update", currentConfigs);

    socket.on("send-osc", ({ targets, address, value }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        // Gate manual commands so we don't error out if UI is clicked while cam is offline
        if (ip && state.sourcesConnected[cam]) {
          const oscValue = parseInt(value);
          try {
            udpPort.send(
              { address, args: [{ type: "i", value: oscValue }] },
              ip,
              57110,
            );
          } catch (e) {}

          // Intercept commands to update our DB and state memory
          let updateField = null;
          if (address === "/OBSBOT/Camera/TailAir/SetAiMode")
            updateField = "aiMode";
          if (address === "/OBSBOT/Camera/TailAir/SetTrackingSpeed")
            updateField = "trackingSpeed";
          if (address === "/OBSBOT/WebCam/General/SetAutoWhiteBalance")
            updateField = "wbMode";
          if (address === "/OBSBOT/WebCam/General/SetColorTemperature")
            updateField = "colorTemp";
          if (address === "/OBSBOT/WebCam/General/SetZoom")
            updateField = "zoom";

          if (updateField) {
            currentConfigs[cam][updateField] = oscValue;

            // If setting Color Temp, ensure WB Mode is forced to Manual (0) in UI memory
            if (updateField === "colorTemp") currentConfigs[cam].wbMode = 0;

            db.run(
              `INSERT INTO camera_config (cam, ${updateField}) VALUES (?, ?) 
                    ON CONFLICT(cam) DO UPDATE SET ${updateField} = ?`,
              [cam, oscValue, oscValue],
            );

            ioInstance.emit("config-update", currentConfigs);
          }
        }
      });
    });

    socket.on("save-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip || !state.sourcesConnected[cam]) return;

        console.log(`\n⏳ --- REQUESTING PRESET DATA ---`);
        console.log(`   Target:  ${cam} (${ip})`);

        const timeoutId = setTimeout(() => {
          console.log(
            `\n❌ TIMEOUT: No response from ${cam} for Preset P${presetId} after 3 seconds.`,
          );
          delete awaitingPresetSave[cam];
        }, 3000);

        awaitingPresetSave[cam] = { presetId, timeoutId };

        try {
          udpPort.send(
            {
              address: "/OBSBOT/WebCam/General/Connected",
              args: [{ type: "i", value: 0 }],
            },
            ip,
            57110,
          );
          udpPort.send(
            {
              address: "/OBSBOT/WebCam/General/GetGimbalPosInfo",
              args: [{ type: "i", value: 1 }],
            },
            ip,
            57110,
          );
          udpPort.send(
            {
              address: "/OBSBOT/WebCam/General/GetZoomInfo",
              args: [{ type: "i", value: 1 }],
            },
            ip,
            57110,
          );
        } catch (e) {}
      });
    });

    socket.on("load-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip || !state.sourcesConnected[cam]) return;

        db.get(
          "SELECT * FROM presets WHERE cam = ? AND presetId = ?",
          [cam, presetId],
          (err, row) => {
            if (row) {
              console.log(
                `\n📤 --- LOADING PRESET P${presetId} FOR ${cam} ---`,
              );
              console.log(
                `   Moving to -> Pan: ${Math.round(row.pan)}, Tilt: ${Math.round(row.tilt)}, Zoom: ${Math.round(row.zoom)}\n`,
              );

              try {
                udpPort.send(
                  {
                    address: "/OBSBOT/WebCam/General/SetGimMotorDegree",
                    args: [
                      { type: "i", value: 50 },
                      { type: "i", value: Math.round(row.pan) },
                      { type: "i", value: Math.round(row.tilt) },
                    ],
                  },
                  ip,
                  57110,
                );

                udpPort.send(
                  {
                    address: "/OBSBOT/WebCam/General/SetZoom",
                    args: [{ type: "i", value: Math.round(row.zoom) }],
                  },
                  ip,
                  57110,
                );
              } catch (e) {}
            }
          },
        );
      });
    });
  });
}

function updateCameraIP(cam, ip) {
  const isNewConnection = !cameraIPs[cam] && ip;
  cameraIPs[cam] = ip;

  if (isNewConnection) {
    db.get("SELECT * FROM camera_config WHERE cam = ?", [cam], (err, row) => {
      if (row && ip) {
        console.log(`\n🔄 Restoring config for ${cam}...`);

        try {
          // Handshake first
          udpPort.send(
            {
              address: "/OBSBOT/WebCam/General/Connected",
              args: [{ type: "i", value: 0 }],
            },
            ip,
            57110,
          );

          if (row.aiMode !== null) {
            currentConfigs[cam].aiMode = row.aiMode;
            udpPort.send(
              {
                address: "/OBSBOT/Camera/TailAir/SetAiMode",
                args: [{ type: "i", value: row.aiMode }],
              },
              ip,
              57110,
            );
          }
          if (row.trackingSpeed !== null) {
            currentConfigs[cam].trackingSpeed = row.trackingSpeed;
            udpPort.send(
              {
                address: "/OBSBOT/Camera/TailAir/SetTrackingSpeed",
                args: [{ type: "i", value: row.trackingSpeed }],
              },
              ip,
              57110,
            );
          }
          if (row.wbMode !== null) {
            currentConfigs[cam].wbMode = row.wbMode;
            udpPort.send(
              {
                address: "/OBSBOT/WebCam/General/SetAutoWhiteBalance",
                args: [{ type: "i", value: row.wbMode }],
              },
              ip,
              57110,
            );
          }
          if (row.colorTemp !== null && row.wbMode === 0) {
            currentConfigs[cam].colorTemp = row.colorTemp;
            udpPort.send(
              {
                address: "/OBSBOT/WebCam/General/SetColorTemperature",
                args: [{ type: "i", value: row.colorTemp }],
              },
              ip,
              57110,
            );
          }
          if (row.zoom !== null) {
            currentConfigs[cam].zoom = row.zoom;
            udpPort.send(
              {
                address: "/OBSBOT/WebCam/General/SetZoom",
                args: [{ type: "i", value: row.zoom }],
              },
              ip,
              57110,
            );
          }

          // Broadcast the restored config to all connected clients
          if (ioInstance) {
            ioInstance.emit("config-update", currentConfigs);
          }
        } catch (e) {}
      }
    });
  }
}

module.exports = { initOSC, updateCameraIP };
