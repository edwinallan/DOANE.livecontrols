const { exec } = require("child_process");

function initBeepSync(io, state, obsMain) {
  let isSyncing = false;

  const trackMapping = {
    "Tail A": 0,
    "Tail B": 1,
    "Mobile SRT": 2,
    "Internal Mic": 3,
  };

  const analyzeTrack = async (filePath, trackIndex) => {
    const peakVolume = await new Promise((resolve) => {
      const cmd = `ffmpeg -i "${filePath}" -map 0:a:${trackIndex} -af "bandpass=f=3000:width_type=h:w=500,volumedetect" -f null - 2>&1`;
      exec(cmd, (err, stdout) => {
        const match = stdout.match(/max_volume:\s*([-0-9.]+)\s*dB/);
        resolve(match && match[1] ? parseFloat(match[1]) : 0);
      });
    });

    let gainDb = peakVolume < -2.0 ? Math.abs(peakVolume) - 2.0 : 0;

    return new Promise((resolve) => {
      const filterStr = `bandpass=f=3000:width_type=h:w=500,volume=${gainDb}dB,silencedetect=noise=-15dB:d=0.25`;
      const cmd = `ffmpeg -i "${filePath}" -map 0:a:${trackIndex} -af "${filterStr}" -f null - 2>&1`;

      exec(cmd, (err, stdout) => {
        const rawBeeps = [...stdout.matchAll(/silence_end:\s*([\d\.]+)/g)].map(
          (m) => parseFloat(m[1]),
        );

        if (rawBeeps.length < 3) return resolve(null);

        for (let i = 0; i < rawBeeps.length - 2; i++) {
          const intervalA = rawBeeps[i + 1] - rawBeeps[i];
          const intervalB = rawBeeps[i + 2] - rawBeeps[i + 1];
          const variance = Math.abs(intervalA - intervalB);

          if (variance <= 0.15 && intervalA > 0.2 && intervalA < 1.5) {
            return resolve(rawBeeps[i]);
          }
        }
        resolve(null);
      });
    });
  };

  io.on("connection", (socket) => {
    socket.on("start-beep-sync", async () => {
      if (isSyncing) return;

      console.log("\n🔊 Starting BALANCED Audio Beep Sync Workflow...");

      try {
        const recordStatus = await obsMain.call("GetRecordStatus");
        if (recordStatus.outputActive) {
          console.log(
            "   ❌ ABORTED: OBS is currently recording. Please stop your recording before calibrating.",
          );
          io.emit("sync-failed");
          return;
        }

        isSyncing = true;
        const originalMuteStates = { ...state.audioMuted };

        const cumulativeOffsets = { "Internal Mic": 0 };
        for (const cam of ["Tail A", "Tail B", "Mobile SRT"]) {
          cumulativeOffsets[cam] = 0;
        }

        console.log(
          "   🧹 Pre-flight: Resetting all offsets to 0ms for baseline...",
        );
        await obsMain
          .call("SetInputAudioSyncOffset", {
            inputName: "Internal Mic",
            inputAudioSyncOffset: 0,
          })
          .catch(() => {});
        await obsMain
          .call("SetInputAudioSyncOffset", {
            inputName: "Logic",
            inputAudioSyncOffset: 0,
          })
          .catch(() => {});

        for (const cam of ["Tail A", "Tail B", "Mobile SRT"]) {
          if (state.syncOffsets) state.syncOffsets[cam] = 0;
          await obsMain
            .call("SetSourceFilterSettings", {
              sourceName: cam,
              filterName: "Video Delay",
              filterSettings: { delay_ms: 0 },
            })
            .catch(() => {});
          await obsMain
            .call("SetInputAudioSyncOffset", {
              inputName: cam,
              inputAudioSyncOffset: 0,
            })
            .catch(() => {});
          await obsMain
            .call("SetInputMute", { inputName: cam, inputMuted: false })
            .catch(() => {});
        }
        io.emit("state-update", state);

        let isAligned = false;
        let iteration = 1;
        const maxIterations = 8;
        const toleranceMs = 80;

        // Start Loop 1 at 12 seconds to guarantee a clean baseline
        let dynamicWaitTime = 12000;

        while (!isAligned && iteration <= maxIterations) {
          console.log(`\n==================================================`);
          console.log(
            `🔄 ITERATION ${iteration} / ${maxIterations} (Recording Time: ${(dynamicWaitTime / 1000).toFixed(1)}s)`,
          );
          console.log(`==================================================`);

          const currentActiveSources = [];
          for (const [sourceName, isConnected] of Object.entries(
            state.sourcesConnected,
          )) {
            if (isConnected) currentActiveSources.push(sourceName);
          }
          const tracksToAnalyze = ["Internal Mic", ...currentActiveSources];

          let recCheck = await obsMain.call("GetRecordStatus");
          while (recCheck.outputActive) {
            console.log(
              "   ⏳ Waiting for OBS to finish writing previous file...",
            );
            await new Promise((r) => setTimeout(r, 1000));
            recCheck = await obsMain.call("GetRecordStatus");
          }

          console.log("   ⏺️ Starting recording...");
          await obsMain.call("StartRecord");
          await new Promise((r) => setTimeout(r, 100));

          console.log("   ▶️ Triggering beep...");
          await obsMain.call("TriggerMediaInputAction", {
            inputName: "beep",
            mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
          });

          await new Promise((r) => setTimeout(r, dynamicWaitTime));

          console.log("   ⏹️ Stopping recording...");
          const stopRes = await obsMain.call("StopRecord");
          const outputPath = stopRes.outputPath;

          console.log("   🔍 Analyzing active tracks...");
          const timestamps = {};

          for (const source of tracksToAnalyze) {
            const idx = trackMapping[source];
            if (idx !== undefined) {
              const ts = await analyzeTrack(outputPath, idx);
              if (ts !== null) {
                timestamps[source] = ts;
                console.log(
                  `      ⏱️ ${source}: Rhythm Locked! (Start: ${ts.toFixed(3)}s)`,
                );
              } else {
                console.log(`      ⚠️ ${source}: Sequence NOT Detected!`);
              }
            }
          }

          const validSources = Object.keys(timestamps);

          if (validSources.length === 0) {
            console.log(`   ❌ No sequences found. Retrying iteration...`);
            iteration++;
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }

          const allTs = Object.values(timestamps);
          const slowestTs = Math.max(...allTs);

          let maxDeltaMs = 0;
          const loopDeltas = {};

          for (const source of validSources) {
            const delta = Math.round((slowestTs - timestamps[source]) * 1000);
            loopDeltas[source] = delta;
            if (delta > maxDeltaMs) maxDeltaMs = delta;
          }

          console.log(`\n   📐 === LOOP ${iteration} RESULTS ===`);
          console.log(
            `   Target Tolerance: < ${toleranceMs}ms | Max Delta Found: ${maxDeltaMs}ms`,
          );

          if (maxDeltaMs <= toleranceMs) {
            console.log(
              `   ✅ ALIGNMENT ACHIEVED IN ${iteration} ITERATION(S)!`,
            );
            isAligned = true;
            break;
          } else {
            console.log(
              `   ❌ Tolerance missed. Swapping OBS values with new absolute offsets...`,
            );

            for (const source of validSources) {
              const newAbsoluteOffset =
                cumulativeOffsets[source] + loopDeltas[source];
              cumulativeOffsets[source] = newAbsoluteOffset;

              console.log(
                `      -> ${source}: Swapping to ${newAbsoluteOffset}ms`,
              );

              if (source === "Internal Mic") {
                await obsMain
                  .call("SetInputAudioSyncOffset", {
                    inputName: source,
                    inputAudioSyncOffset: newAbsoluteOffset,
                  })
                  .catch(() => {});
                await obsMain
                  .call("SetInputAudioSyncOffset", {
                    inputName: "Logic",
                    inputAudioSyncOffset: newAbsoluteOffset,
                  })
                  .catch(() => {});
              } else {
                state.syncOffsets[source] = newAbsoluteOffset;
                await obsMain
                  .call("SetSourceFilterSettings", {
                    sourceName: source,
                    filterName: "Video Delay",
                    filterSettings: { delay_ms: newAbsoluteOffset },
                  })
                  .catch(() => {});
                await obsMain
                  .call("SetInputAudioSyncOffset", {
                    inputName: source,
                    inputAudioSyncOffset: newAbsoluteOffset,
                  })
                  .catch(() => {});
              }
            }

            // BALANCED DYNAMIC WAIT TIME
            // Wait Time = Highest Delay Applied + 4s sequence duration + 2s safety padding
            // Floor set to 10s to ensure baseline safety.
            const maxAppliedOffset = Math.max(
              ...Object.values(cumulativeOffsets),
            );
            dynamicWaitTime = Math.max(10000, maxAppliedOffset + 6000);

            console.log(
              `   ⏳ Waiting 4.5s for OBS audio buffers to safely rebuild...`,
            );
            await new Promise((r) => setTimeout(r, 4500));

            iteration++;
          }
        }

        if (!isAligned) {
          console.log(
            `\n⚠️ Maximum iterations reached (${maxIterations}). Locked in closest approximation.`,
          );
        }

        console.log(
          `   ⏳ Final alignment wait: Letting OBS solidify buffers for 3.0s...`,
        );
        await new Promise((r) => setTimeout(r, 3000));

        for (const sourceName of ["Tail A", "Tail B", "Mobile SRT"]) {
          if (originalMuteStates[sourceName] !== undefined) {
            await obsMain
              .call("SetInputMute", {
                inputName: sourceName,
                inputMuted: originalMuteStates[sourceName],
              })
              .catch(() => {});
          }
        }

        console.log("\n🎯 BEEP SYNC COMPLETE.");
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
