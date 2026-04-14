const jsQR = require("jsqr");
const jpeg = require("jpeg-js");

function initSync(io, state, obsMain, getCurrentScreenshots) {
  let isSyncing = false;

  io.on("connection", (socket) => {
    socket.on("start-sync", () => {
      if (isSyncing) return;
      isSyncing = true;
      console.log("⏱️ Starting A/V Sync Analysis (5 seconds)...");

      let attempts = 0;
      const maxAttempts = 25;
      let timestamps = { "CAM 1": [], "CAM 2": [], Mobile: [] };

      const syncInterval = setInterval(async () => {
        attempts++;
        const screenshots = getCurrentScreenshots();

        for (const [scene, base64Data] of Object.entries(screenshots)) {
          const sourceName =
            scene === "CAM 1"
              ? "Tail A"
              : scene === "CAM 2"
                ? "Tail B"
                : "Mobile SRT";
          if (!state.sourcesConnected || !state.sourcesConnected[sourceName])
            continue;

          try {
            const buffer = Buffer.from(base64Data.split(",")[1], "base64");
            const rawImageData = jpeg.decode(buffer, { useTArray: true });
            const code = jsQR(
              rawImageData.data,
              rawImageData.width,
              rawImageData.height,
            );

            if (code && code.data) {
              timestamps[scene].push(parseInt(code.data));
            }
          } catch (e) {
            /* Ignore decoding errors */
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(syncInterval);
          isSyncing = false;

          try {
            const finalTs = {};
            for (const [scene, tsArray] of Object.entries(timestamps)) {
              if (tsArray.length > 0) {
                finalTs[scene] = Math.max(...tsArray);
                console.log(`📸 ${scene} best timestamp: ${finalTs[scene]}`);
              }
            }

            const foundCount = Object.keys(finalTs).length;
            if (foundCount < 2) {
              console.log(
                "❌ Sync Failed: Could not detect enough clear QR codes on online cameras.",
              );
              io.emit("sync-failed");
              return;
            }

            io.emit("sync-complete");

            const validTs = Object.values(finalTs);
            const slowestTs = Math.min(...validTs);

            const masterScene = Object.keys(finalTs).find(
              (scene) => finalTs[scene] === slowestTs,
            );
            const masterSourceName =
              masterScene === "CAM 1"
                ? "Tail A"
                : masterScene === "CAM 2"
                  ? "Tail B"
                  : "Mobile SRT";

            console.log("\n📐 --- SYNC CALCULATIONS ---");
            console.log(
              `👑 SYNC MASTER: ${masterSourceName} (Used as baseline)`,
            );

            // SAFETY: Ensure syncOffsets exists in state even if server.store.js wasn't updated
            if (!state.syncOffsets) {
              state.syncOffsets = {
                "Tail A": null,
                "Tail B": null,
                "Mobile SRT": null,
              };
            }

            for (const [scene, ts] of Object.entries(finalTs)) {
              const delayMs = ts - slowestTs;
              const sourceName =
                scene === "CAM 1"
                  ? "Tail A"
                  : scene === "CAM 2"
                    ? "Tail B"
                    : "Mobile SRT";

              console.log(`   ${sourceName} Delay needed: +${delayMs}ms`);
              state.syncOffsets[sourceName] = delayMs;

              obsMain
                .call("SetSourceFilterSettings", {
                  sourceName: sourceName,
                  filterName: "Video Delay",
                  filterSettings: { delay_ms: delayMs },
                })
                .catch(() =>
                  console.log(
                    `   ⚠️ Could not set video delay for ${sourceName}. Is the filter named "Video Delay"?`,
                  ),
                );

              obsMain
                .call("SetInputAudioSyncOffset", {
                  inputName: sourceName,
                  inputAudioSyncOffset: delayMs,
                })
                .catch(() => {});
            }
            console.log("---------------------------\n");

            io.emit("state-update", state);
          } catch (err) {
            console.error("❌ CRITICAL SYNC ERROR:", err);
            io.emit("sync-failed");
          }
        }
      }, 200);
    });
  });
}

module.exports = { initSync };
