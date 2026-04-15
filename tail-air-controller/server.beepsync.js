const { exec } = require("child_process");

function initBeepSync(io, state, obsMain) {
  let isSyncing = false;

  // Track map corresponding to your OBS Audio Matrix
  const trackMapping = {
    "Tail A": 0, // Track 1
    "Tail B": 1, // Track 2
    "Mobile SRT": 2, // Track 3
    "Master Beep": 3, // Track 4 (Logic Pro / Base Audio)
  };

  // Helper function to extract the peak timestamp using FFmpeg
  const analyzeTrack = (filePath, trackIndex) => {
    return new Promise((resolve) => {
      // 1. Map to specific audio track
      // 2. Bandpass filter isolates 2750Hz-3250Hz (kills room noise)
      // 3. SilenceDetect finds exactly when the 3kHz sound starts
      const cmd = `ffmpeg -i "${filePath}" -map 0:a:${trackIndex} -af "bandpass=f=3000:width_type=h:w=500,silencedetect=noise=-25dB:d=0.1" -f null - 2>&1`;

      exec(cmd, (err, stdout) => {
        // Find all silence_end timestamps
        const matches = [...stdout.matchAll(/silence_end:\s*([\d\.]+)/g)];
        if (matches && matches.length > 0) {
          resolve(parseFloat(matches[0][1])); // Return the first beep timestamp in seconds
        } else {
          resolve(null);
        }
      });
    });
  };

  io.on("connection", (socket) => {
    socket.on("start-beep-sync", async () => {
      if (isSyncing) return;
      isSyncing = true;
      console.log("\n🔊 Starting Audio Beep Sync Workflow...");

      try {
        const originalMuteStates = { ...state.audioMuted };
        const activeSources = [];

        console.log("   🧹 Resetting existing A/V offsets to 0...");

        // Reset Base Audio Sources to 0 so the recording isn't artificially delayed
        await obsMain
          .call("SetInputAudioSyncOffset", {
            inputName: "Logic",
            inputAudioSyncOffset: 0,
          })
          .catch(() => {});
        await obsMain
          .call("SetInputAudioSyncOffset", {
            inputName: "Mic/Aux",
            inputAudioSyncOffset: 0,
          })
          .catch(() => {});

        // Reset Camera Sources
        for (const [sourceName, isConnected] of Object.entries(
          state.sourcesConnected,
        )) {
          if (isConnected) {
            activeSources.push(sourceName);

            if (state.syncOffsets) state.syncOffsets[sourceName] = null;

            await obsMain
              .call("SetSourceFilterSettings", {
                sourceName: sourceName,
                filterName: "Video Delay",
                filterSettings: { delay_ms: 0 },
              })
              .catch(() => {});

            await obsMain
              .call("SetInputAudioSyncOffset", {
                inputName: sourceName,
                inputAudioSyncOffset: 0,
              })
              .catch(() => {});
          }
        }

        io.emit("state-update", state);

        for (const sourceName of activeSources) {
          await obsMain
            .call("SetInputMute", { inputName: sourceName, inputMuted: false })
            .catch(() => {});
          console.log(`   🎤 Unmuted ${sourceName} for calibration`);
        }

        console.log(
          "   ⏺️ Starting OBS multi-track recording (Extended Margins)...",
        );
        await obsMain.call("StartRecord");

        await new Promise((r) => setTimeout(r, 2500));

        console.log("   ▶️ Triggering 'beep' media source...");
        await obsMain.call("TriggerMediaInputAction", {
          inputName: "beep",
          mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
        });

        await new Promise((r) => setTimeout(r, 6000));

        console.log("   ⏹️ Stopping OBS recording...");
        const stopRes = await obsMain.call("StopRecord");
        const outputPath = stopRes.outputPath;

        for (const sourceName of activeSources) {
          if (originalMuteStates[sourceName] !== undefined) {
            await obsMain
              .call("SetInputMute", {
                inputName: sourceName,
                inputMuted: originalMuteStates[sourceName],
              })
              .catch(() => {});
          }
        }

        if (!outputPath)
          throw new Error("Could not retrieve recording output path from OBS.");

        console.log(`   📁 Calibration file saved to: ${outputPath}`);
        console.log("   🔍 Analyzing audio tracks with FFmpeg...");

        // --- FFMPEG ANALYSIS ---
        const timestamps = {};
        const tracksToAnalyze = ["Master Beep", ...activeSources];

        for (const source of tracksToAnalyze) {
          const idx = trackMapping[source];
          if (idx !== undefined) {
            const ts = await analyzeTrack(outputPath, idx);
            if (ts !== null) {
              timestamps[source] = ts;
              console.log(
                `      ⏱️ ${source} Beep Detected at: ${ts.toFixed(3)}s`,
              );
            } else {
              console.log(`      ⚠️ ${source} Beep NOT Detected (Skipping).`);
            }
          }
        }

        const validSources = Object.keys(timestamps);
        if (!timestamps["Master Beep"] || validSources.length < 2) {
          throw new Error(
            "Could not detect beep on Master Track and at least one camera.",
          );
        }

        // --- CALCULATE DELAYS ---
        const allTs = Object.values(timestamps);
        const slowestTs = Math.max(...allTs);
        const masterScene = Object.keys(timestamps).find(
          (s) => timestamps[s] === slowestTs,
        );

        console.log(`\n📐 --- BEEP SYNC CALCULATIONS ---`);
        console.log(`👑 SLOWEST SOURCE: ${masterScene} (Used as baseline)`);

        for (const source of validSources) {
          const delayMs = Math.round((slowestTs - timestamps[source]) * 1000);

          if (source === "Master Beep") {
            console.log(`   💻 Base Audio offset calculated: +${delayMs}ms`);
            console.log(
              `      Applying +${delayMs}ms audio sync offset to 'Logic' and 'Mic/Aux'...`,
            );

            await obsMain
              .call("SetInputAudioSyncOffset", {
                inputName: "Logic",
                inputAudioSyncOffset: delayMs,
              })
              .catch(() =>
                console.log(`      ⚠️ Could not set audio offset for 'Logic'.`),
              );

            await obsMain
              .call("SetInputAudioSyncOffset", {
                inputName: "Mic/Aux",
                inputAudioSyncOffset: delayMs,
              })
              .catch(() =>
                console.log(
                  `      ⚠️ Could not set audio offset for 'Mic/Aux'.`,
                ),
              );

            continue;
          }

          console.log(`   🎥 ${source} Delay needed: +${delayMs}ms`);
          state.syncOffsets[source] = delayMs;

          // Apply to Video Delay Filter
          await obsMain
            .call("SetSourceFilterSettings", {
              sourceName: source,
              filterName: "Video Delay",
              filterSettings: { delay_ms: delayMs },
            })
            .catch(() =>
              console.log(`      ⚠️ Could not set video delay for ${source}`),
            );

          // Apply to Audio Sync Offset
          await obsMain
            .call("SetInputAudioSyncOffset", {
              inputName: source,
              inputAudioSyncOffset: delayMs,
            })
            .catch(() => {});
        }

        console.log("---------------------------\n");
        io.emit("state-update", state);
        io.emit("sync-complete");
        isSyncing = false;
      } catch (err) {
        console.error("❌ CRITICAL BEEP SYNC ERROR:", err.message || err);
        io.emit("sync-failed");

        if (state.audioMuted) {
          for (const [cam, isMuted] of Object.entries(state.audioMuted)) {
            obsMain
              .call("SetInputMute", { inputName: cam, inputMuted: isMuted })
              .catch(() => {});
          }
        }
        isSyncing = false;
      }
    });
  });
}

module.exports = { initBeepSync };
