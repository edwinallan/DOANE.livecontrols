const osc = require("osc");
const db = require("./server.db");

let udpPort;
const cameraIPs = { "Tail A": null, "Tail B": null };
const awaitingPresetSave = {};

function initOSC(io, state) {
  udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 57120,
  });

  udpPort.on("message", (oscMsg, timeTag, info) => {
    const cam = Object.keys(cameraIPs).find(
      (key) => cameraIPs[key] === info.address,
    );
    if (!cam) return;

    const saveRequest = awaitingPresetSave[cam];
    if (!saveRequest) return;

    if (oscMsg.address === "/OBSBOT/WebCam/General/GetGimbalPosInfoResp") {
      // FIX: The camera drops 'roll', leaving [0] as Pitch (Tilt) and [1] as Yaw (Pan)
      saveRequest.tilt = oscMsg.args[0];
      saveRequest.pan = oscMsg.args[1];
      checkAndSavePreset(cam, saveRequest);
    }

    if (oscMsg.address === "/OBSBOT/WebCam/General/ZoomInfo") {
      saveRequest.zoom = oscMsg.args[0];
      checkAndSavePreset(cam, saveRequest);
    }
  });

  udpPort.on("error", (err) => {
    if (err.message && err.message.includes("malformed type tag")) return;
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
    socket.on("send-osc", ({ targets, address, value }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (ip) {
          const oscValue = parseInt(value);
          udpPort.send(
            { address, args: [{ type: "i", value: oscValue }] },
            ip,
            57110,
          );
        }
      });
    });

    socket.on("save-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip) return;

        console.log(`\n⏳ --- REQUESTING PRESET DATA ---`);
        console.log(`   Target:  ${cam} (${ip})`);

        const timeoutId = setTimeout(() => {
          console.log(
            `\n❌ TIMEOUT: No response from ${cam} for Preset P${presetId} after 3 seconds.`,
          );
          delete awaitingPresetSave[cam];
        }, 3000);

        awaitingPresetSave[cam] = { presetId, timeoutId };

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
      });
    });

    socket.on("load-preset", ({ targets, presetId }) => {
      targets.forEach((cam) => {
        const ip = cameraIPs[cam];
        if (!ip) return;

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
