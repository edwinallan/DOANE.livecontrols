const osc = require("osc");
const db = require("./server.db");

let udpPort;
const cameraIPs = { "Tail A": "192.168.0.201", "Tail B": "192.168.0.202" };
const awaitingPresetSave = {}; // Memory queue to track cameras returning info

function initOSC(io, state) {
  // Bind standard OBSBOT port
  udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 57110,
  });

  // Listen for the camera's reply when we ask for its pan/tilt/zoom
  udpPort.on("message", (oscMsg, timeTag, info) => {
    const cam = Object.keys(cameraIPs).find(
      (key) => cameraIPs[key] === info.address,
    );
    if (!cam) return;

    const saveRequest = awaitingPresetSave[cam];
    if (!saveRequest) return;

    // According to OBSBOT CSV: GetGimbalPosInfoResp returns 3 integers (speed, pan, tilt)
    if (oscMsg.address === "/OBSBOT/WebCam/General/GetGimbalPosInfoResp") {
      saveRequest.pan = oscMsg.args[1];
      saveRequest.tilt = oscMsg.args[2];
      checkAndSavePreset(cam, saveRequest);
    }

    // According to OBSBOT CSV: ZoomInfo returns 2 integers (zoom, speed)
    if (oscMsg.address === "/OBSBOT/WebCam/General/ZoomInfo") {
      saveRequest.zoom = oscMsg.args[0];
      checkAndSavePreset(cam, saveRequest);
    }
  });

  udpPort.on("error", (err) => console.error("OSC Error:", err));
  udpPort.open();

  // Commit to DB once we've collected the responses
  function checkAndSavePreset(cam, req) {
    if (
      req.pan !== undefined &&
      req.zoom !== undefined &&
      req.tilt !== undefined
    ) {
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
    // --- STANDARD ACTIONS (Manual PTZ, AI, Colors, etc.) ---
    socket.on("send-osc", ({ targets, address, value }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (ip) {
          const oscValue = parseInt(value);

          // Log the exact command going out
          console.log(`\n📡 --- SENDING STANDARD OSC ---`);
          console.log(`   Target:  ${cam} (${ip})`);
          console.log(`   Address: ${address}`);
          console.log(`   Args:    [type: "i", value: ${oscValue}]`);
          console.log(`-------------------------------\n`);

          udpPort.send(
            { address, args: [{ type: "i", value: oscValue }] },
            ip,
            57110,
          );
        } else {
          console.log(`⚠️ Cannot send OSC: No IP found for ${cam}`);
        }
      });
    });

    // --- HANDLE "LONG PRESS" (Save Preset) ---
    socket.on("save-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip) {
          console.log(`⚠️ Cannot save preset: No IP found for ${cam}`);
          return;
        }

        console.log(
          `\n⏳ Requesting coordinates from ${cam} for Preset P${presetId}...`,
        );
        awaitingPresetSave[cam] = { presetId };

        // Ask the camera for its exact position and zoom
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
      });
    });

    // --- HANDLE "QUICK TAP" (Load Preset) ---
    socket.on("load-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip) return;

        db.get(
          "SELECT * FROM presets WHERE cam = ? AND presetId = ?",
          [cam, presetId],
          (err, row) => {
            console.log(`\n📤 --- LOADING PRESET ---`);
            if (err) {
              console.error(`❌ DB Load Error:`, err);
            } else if (row) {
              const speed = 50;
              const panVal = Math.round(row.pan);
              const tiltVal = Math.round(row.tilt);
              const zoomVal = Math.round(row.zoom);

              console.log(`✅ Loaded P${presetId} for ${cam} from DB.`);
              console.log(
                `   Sending OSC -> /OBSBOT/WebCam/General/SetGimMotorDegree | Args: [speed:${speed}, pan:${panVal}, tilt:${tiltVal}]`,
              );
              console.log(
                `   Sending OSC -> /OBSBOT/WebCam/General/SetZoom | Args: [zoom:${zoomVal}]`,
              );

              // OBSBOT CSV rules apply: SetGimMotorDegree requires EXACTLY 3 ints (speed, pan, tilt)
              udpPort.send(
                {
                  address: "/OBSBOT/WebCam/General/SetGimMotorDegree",
                  args: [
                    { type: "i", value: speed }, // Movement speed (0-90)
                    { type: "i", value: panVal },
                    { type: "i", value: tiltVal },
                  ],
                },
                ip,
                57110,
              );

              // OBSBOT CSV rules apply: SetZoom requires EXACTLY 1 int (zoom level)
              udpPort.send(
                {
                  address: "/OBSBOT/WebCam/General/SetZoom",
                  args: [{ type: "i", value: zoomVal }],
                },
                ip,
                57110,
              );
            } else {
              console.log(
                `⚠️ No preset data found in DB for ${cam} (Preset P${presetId}).`,
              );
            }
            console.log(`-------------------------\n`);
          },
        );
      });
    });
  });
}

function updateCameraIP(cam, ip) {
  cameraIPs[cam] = ip;
}

module.exports = { initOSC, updateCameraIP };
