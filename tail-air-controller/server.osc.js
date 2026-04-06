const osc = require("osc");
const db = require("./server.db");

let udpPort;
const cameraIPs = { "Tail A": null, "Tail B": null };
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
          if (!err) console.log(`✅ Preset ${req.presetId} saved for ${cam}`);
          delete awaitingPresetSave[cam];
        },
      );
    }
  }

  io.on("connection", (socket) => {
    // Standard actions
    socket.on("send-osc", ({ targets, address, value }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (ip) {
          udpPort.send(
            { address, args: [{ type: "i", value: parseInt(value) }] },
            ip,
            57110,
          );
        }
      });
    });

    // Handle the "Long Press" Action
    socket.on("save-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip) return;

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

    // Handle the "Quick Tap" Action
    socket.on("load-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip) return;

        db.get(
          "SELECT * FROM presets WHERE cam = ? AND presetId = ?",
          [cam, presetId],
          (err, row) => {
            if (row) {
              // OBSBOT CSV rules apply: SetGimMotorDegree requires EXACTLY 3 ints (speed, pan, tilt)
              udpPort.send(
                {
                  address: "/OBSBOT/WebCam/General/SetGimMotorDegree",
                  args: [
                    { type: "i", value: 50 }, // Movement speed (0-90)
                    { type: "i", value: Math.round(row.pan) },
                    { type: "i", value: Math.round(row.tilt) },
                  ],
                },
                ip,
                57110,
              );

              // OBSBOT CSV rules apply: SetZoom requires EXACTLY 1 int (zoom level)
              udpPort.send(
                {
                  address: "/OBSBOT/WebCam/General/SetZoom",
                  args: [{ type: "i", value: Math.round(row.zoom) }],
                },
                ip,
                57110,
              );
            }
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
