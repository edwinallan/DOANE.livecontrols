const { exec } = require("child_process");
const fs = require("fs/promises");

function initBeepSync(io, state, obsMain) {
  let isSyncing = false;
  const cameraSources = ["Tail A", "Tail B", "Mobile SRT"];
  const localSyncSources = ["Logic", "Internal Mic"];

  const trackMapping = {
    "Tail A": [0],
    "Tail B": [1],
    "Mobile SRT": [2],
    "Internal Mic": [3],
    Logic: [4],
  };

  const ensureSyncOffsets = () => {
    if (!state.syncOffsets) {
      state.syncOffsets = {
        "Tail A": null,
        "Tail B": null,
        "Mobile SRT": null,
      };
    }
  };

  const normalizeOffsets = (offsets, sources) => {
    const validOffsets = sources.map((source) => offsets[source] || 0);
    const sharedDelay = Math.min(...validOffsets);

    for (const source of sources) {
      offsets[source] = Math.max(0, (offsets[source] || 0) - sharedDelay);
    }

    return sharedDelay;
  };

  const normalizeOffsetValue = (offsetMs) => Math.max(0, Math.round(offsetMs));

  const setAudioInputSyncOffset = async (inputName, offsetMs) => {
    const normalizedOffset = normalizeOffsetValue(offsetMs);

    await obsMain
      .call("SetInputAudioSyncOffset", {
        inputName,
        inputAudioSyncOffset: normalizedOffset,
      })
      .catch(() => {});
  };

  const setSourceSyncOffset = async (source, offsetMs) => {
    const normalizedOffset = normalizeOffsetValue(offsetMs);

    if (!cameraSources.includes(source)) return;

    ensureSyncOffsets();
    state.syncOffsets[source] = normalizedOffset;

    await obsMain
      .call("SetSourceFilterSettings", {
        sourceName: source,
        filterName: "Video Delay",
        filterSettings: { delay_ms: normalizedOffset },
      })
      .catch(() => {});
    await setAudioInputSyncOffset(source, normalizedOffset);
  };

  const setLogicSyncOffset = async (offsetMs) => {
    const normalizedOffset = Math.max(0, Math.round(offsetMs));

    await setAudioInputSyncOffset("Logic", normalizedOffset);
    await setAudioInputSyncOffset("beep", normalizedOffset);
  };

  const setInternalMicSyncOffset = async (offsetMs) => {
    const normalizedOffset = Math.max(0, Math.round(offsetMs));

    await setAudioInputSyncOffset("Internal Mic", normalizedOffset);
  };

  const applySyncOffsets = async (offsets, sources) => {
    for (const source of sources) {
      await setSourceSyncOffset(source, offsets[source] || 0);
    }
  };

  const applyLocalSyncOffsets = async (localOffsets) => {
    await setLogicSyncOffset(localOffsets.Logic || 0);
    await setInternalMicSyncOffset(localOffsets["Internal Mic"] || 0);
  };

  const restoreCameraMuteStates = async (originalMuteStates) => {
    for (const sourceName of cameraSources) {
      if (originalMuteStates[sourceName] !== undefined) {
        await obsMain
          .call("SetInputMute", {
            inputName: sourceName,
            inputMuted: originalMuteStates[sourceName],
          })
          .catch(() => {});
      }
    }
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

  const analyzeSource = async (filePath, source) => {
    const trackCandidates = trackMapping[source] || [];

    for (const trackIndex of trackCandidates) {
      const ts = await analyzeTrack(filePath, trackIndex);
      if (ts !== null) return { ts, trackIndex };
    }

    return null;
  };

  const recordAndAnalyzeBeepPass = async (
    tracksToAnalyze,
    recordTimeMs,
    passLabel,
  ) => {
    let recCheck = await obsMain.call("GetRecordStatus");
    while (recCheck.outputActive) {
      console.log("   ⏳ Waiting for OBS to finish writing previous file...");
      await new Promise((r) => setTimeout(r, 1000));
      recCheck = await obsMain.call("GetRecordStatus");
    }

    console.log(`\n==================================================`);
    console.log(
      `🔄 ${passLabel} (Recording Time: ${(recordTimeMs / 1000).toFixed(1)}s)`,
    );
    console.log(`==================================================`);

    console.log("   ⏺️ Starting recording...");
    await obsMain.call("StartRecord");
    await new Promise((r) => setTimeout(r, 100));

    console.log("   ▶️ Triggering beep...");
    await obsMain.call("TriggerMediaInputAction", {
      inputName: "beep",
      mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
    });

    await new Promise((r) => setTimeout(r, recordTimeMs));

    console.log("   ⏹️ Stopping recording...");
    const stopRes = await obsMain.call("StopRecord");
    const outputPath = stopRes.outputPath;

    try {
      console.log("   🔍 Analyzing active sync tracks...");
      const analyzedTracks = await Promise.all(
        tracksToAnalyze.map(async (source) => {
          const result = await analyzeSource(outputPath, source);
          return [source, result];
        }),
      );

      const timestamps = {};
      const trackIndexes = {};
      for (const [source, result] of analyzedTracks) {
        if (result !== null) {
          timestamps[source] = result.ts;
          trackIndexes[source] = result.trackIndex;
          console.log(
            `      ⏱️ ${source}: Rhythm Locked! (Track ${result.trackIndex}, Start: ${result.ts.toFixed(3)}s)`,
          );
        } else {
          console.log(`      ⚠️ ${source}: Sequence NOT Detected!`);
        }
      }

      return { timestamps, trackIndexes };
    } finally {
      if (outputPath) {
        await fs
          .unlink(outputPath)
          .then(() => console.log(`   🧹 Deleted recording: ${outputPath}`))
          .catch((err) =>
            console.log(
              `   ⚠️ Could not delete recording ${outputPath}: ${
                err.message || err
              }`,
            ),
          );
      }
    }
  };

  io.on("connection", (socket) => {
    socket.on("start-beep-sync", async () => {
      if (isSyncing) return;

      console.log("\n🔊 Starting Camera Beep Sync Workflow...");

      try {
        const recordStatus = await obsMain.call("GetRecordStatus");
        if (recordStatus.outputActive) {
          console.log(
            "   ❌ ABORTED: OBS is currently recording. Please stop your recording before calibrating.",
          );
          io.emit("sync-failed", {
            message: "Stop OBS recording before running Beep Sync.",
          });
          return;
        }

        isSyncing = true;
        const originalMuteStates = { ...(state.audioMuted || {}) };

        console.log(
          "   🧹 Pre-flight: Resetting all offsets to 0ms for baseline...",
        );
        const localOffsets = { Logic: 0, "Internal Mic": 0 };
        await applyLocalSyncOffsets(localOffsets);

        for (const cam of cameraSources) {
          await setSourceSyncOffset(cam, 0);
          await obsMain
            .call("SetInputMute", { inputName: cam, inputMuted: false })
            .catch(() => {});
        }
        io.emit("state-update", state);

        const currentActiveSources = cameraSources.filter(
          (sourceName) => state.sourcesConnected?.[sourceName],
        );

        if (currentActiveSources.length < 1) {
          console.log(
            "   ❌ Beep Sync needs at least one connected camera source.",
          );
          io.emit("sync-failed", {
            message: "Connect at least one camera source before Beep Sync.",
          });
          await restoreCameraMuteStates(originalMuteStates);
          isSyncing = false;
          return;
        }

        const cameraOffsets = {};
        for (const source of currentActiveSources) {
          cameraOffsets[source] = 0;
        }

        let isAligned = false;
        let iteration = 1;
        const maxIterations = 8;
        const toleranceMs = 80;
        const cameraCorrectionGain = 0.5;
        let dynamicWaitTime = 12000;
        let hasAnyLocalMeasurement = false;
        let logicToInternalMicBaselineMs = null;

        console.log(
          `   🎯 Iterative camera calibration: ${currentActiveSources.join(", ")}`,
        );
        console.log(
          "   🎚️ Logic and Internal Mic will be delayed to the slowest camera.",
        );

        while (!isAligned && iteration <= maxIterations) {
          const { timestamps } = await recordAndAnalyzeBeepPass(
            [...currentActiveSources, ...localSyncSources],
            dynamicWaitTime,
            `ITERATION ${iteration} / ${maxIterations}`,
          );
          const validSources = currentActiveSources.filter(
            (source) => timestamps[source] !== undefined,
          );

          if (validSources.length < 1) {
            console.log(`   ⚠️ Pass skipped: not enough camera sequences found.`);
            iteration++;
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }

          const allTs = validSources.map((source) => timestamps[source]);
          const slowestTs = Math.max(...allTs);
          const cameraDeltas = {};
          const localDeltas = {};

          for (const source of validSources) {
            cameraDeltas[source] = Math.round(
              (slowestTs - timestamps[source]) * 1000,
            );
          }

          const referenceSource = validSources.find(
            (source) => cameraDeltas[source] === 0,
          );
          const cameraMaxDeltaMs = Math.max(...Object.values(cameraDeltas));
          const maxDeltaMs = cameraMaxDeltaMs;

          for (const source of localSyncSources) {
            if (timestamps[source] === undefined) continue;

            localDeltas[source] = Math.round(
              (slowestTs - timestamps[source]) * 1000,
            );
            hasAnyLocalMeasurement = true;
          }

          console.log(`\n   📐 === LOOP ${iteration} RESULTS ===`);
          console.log(
            `   Target Tolerance: < ${toleranceMs}ms | Camera Delta Found: ${maxDeltaMs}ms`,
          );
          console.log(`   👑 Camera Reference: ${referenceSource} at 0ms`);

          for (const source of validSources) {
            console.log(
              `      -> ${source}: Camera delta ${cameraDeltas[source]}ms`,
            );
          }

          for (const source of localSyncSources) {
            if (localDeltas[source] === undefined) {
              console.log(`      ⚠️ ${source}: Local beep not detected.`);
              continue;
            }

            console.log(
              `      -> ${source}: Local delta ${localDeltas[source]}ms`,
            );
          }

          if (
            timestamps.Logic !== undefined &&
            timestamps["Internal Mic"] !== undefined
          ) {
            const speakerDelta = Math.round(
              (timestamps["Internal Mic"] - timestamps.Logic) * 1000,
            );
            if (logicToInternalMicBaselineMs === null) {
              logicToInternalMicBaselineMs = speakerDelta;
              console.log(
                `      🔒 Logic -> Internal Mic baseline: ${logicToInternalMicBaselineMs}ms`,
              );
            }
            console.log(
              `      🧪 Internal Mic vs Logic diagnostic: ${speakerDelta}ms`,
            );
          }

          if (localDeltas["Internal Mic"] !== undefined) {
            const nextInternalMicOffset =
              (localOffsets["Internal Mic"] || 0) +
              localDeltas["Internal Mic"];
            localOffsets["Internal Mic"] = Math.max(0, nextInternalMicOffset);
            console.log(
              `      -> Internal Mic: Residual-corrected target ${localOffsets["Internal Mic"]}ms`,
            );
          }

          if (
            logicToInternalMicBaselineMs !== null &&
            localDeltas["Internal Mic"] !== undefined
          ) {
            localOffsets.Logic = Math.max(
              0,
              (localOffsets["Internal Mic"] || 0) +
                logicToInternalMicBaselineMs,
            );
            console.log(
              `      -> Logic: Following Internal Mic target ${localOffsets.Logic}ms`,
            );
          } else if (localDeltas.Logic !== undefined) {
            localOffsets.Logic = Math.max(0, localDeltas.Logic);
            console.log(
              `      -> Logic: Absolute offset target ${localOffsets.Logic}ms`,
            );
          }

          if (
            localDeltas.Logic !== undefined &&
            localDeltas["Internal Mic"] === undefined
          ) {
            if (logicToInternalMicBaselineMs === null) {
              localOffsets["Internal Mic"] = localOffsets.Logic;
            }
            console.log(
              "      -> Internal Mic: No mic residual this pass; keeping previous target.",
            );
          }

          if (
            localDeltas.Logic === undefined &&
            localDeltas["Internal Mic"] !== undefined
          ) {
            if (logicToInternalMicBaselineMs !== null) {
              localOffsets.Logic = Math.max(
                0,
                (localOffsets["Internal Mic"] || 0) +
                  logicToInternalMicBaselineMs,
              );
              console.log(
                `      -> Logic: Inferred from Internal Mic target ${localOffsets.Logic}ms`,
              );
            } else {
              localOffsets.Logic = localOffsets["Internal Mic"];
              console.log(
                "      -> Logic: Mirroring Internal Mic target because Logic was not detected.",
              );
            }
          }

          const internalMicResidual = Math.abs(
            localDeltas["Internal Mic"] || 0,
          );
          const localIsAcceptable =
            localDeltas["Internal Mic"] !== undefined
              ? internalMicResidual <= toleranceMs
              : Object.keys(localDeltas).length > 0;

          if (localIsAcceptable && maxDeltaMs <= toleranceMs) {
            console.log(
              `   ✅ ALIGNMENT ACHIEVED IN ${iteration} ITERATION(S)!`,
            );
            isAligned = true;
            break;
          }

          console.log("   ❌ Tolerance missed. Applying new offsets...");

          for (const source of validSources) {
            cameraOffsets[source] =
              (cameraOffsets[source] || 0) +
              Math.round(cameraDeltas[source] * cameraCorrectionGain);
          }
          const sharedCameraDelay = normalizeOffsets(
            cameraOffsets,
            currentActiveSources,
          );

          console.log(
            `   👑 Camera offsets normalized; removed ${sharedCameraDelay}ms shared camera delay.`,
          );
          for (const source of currentActiveSources) {
            console.log(
              `      -> ${source}: Swapping to ${cameraOffsets[source] || 0}ms`,
            );
          }

          for (const source of localSyncSources) {
            console.log(
              `      -> ${source}: Swapping to ${localOffsets[source] || 0}ms`,
            );
          }

          await applySyncOffsets(cameraOffsets, currentActiveSources);
          await applyLocalSyncOffsets(localOffsets);

          const maxCameraOffset = Math.max(
            0,
            ...Object.values(cameraOffsets),
          );
          dynamicWaitTime = Math.max(10000, maxCameraOffset + 6000);
          const bufferRebuildWait = Math.min(
            15000,
            Math.max(10000, maxCameraOffset + 9000),
          );

          console.log(
            `   ⏳ Waiting ${(bufferRebuildWait / 1000).toFixed(1)}s for OBS audio/video buffers to rebuild...`,
          );
          await new Promise((r) => setTimeout(r, bufferRebuildWait));

          iteration++;
        }

        if (!isAligned) {
          console.log(
            `\n⚠️ Maximum iterations reached (${maxIterations}). Locked in closest approximation.`,
          );
        }

        if (!hasAnyLocalMeasurement) {
          console.log(
            "\n❌ Beep Sync failed: no Logic or Internal Mic local beep samples.",
          );
          io.emit("sync-failed", {
            message: "Beep Sync could not detect Logic or Internal Mic.",
          });
          await restoreCameraMuteStates(originalMuteStates);
          isSyncing = false;
          return;
        }

        console.log(`\n   📐 === FINAL OFFSETS ===`);
        for (const source of currentActiveSources) {
          console.log(
            `      -> ${source}: ${cameraOffsets[source] || 0}ms audio + video`,
          );
        }
        console.log(`      -> Logic: ${localOffsets.Logic || 0}ms audio`);
        console.log(
          `      -> Internal Mic: ${localOffsets["Internal Mic"] || 0}ms audio`,
        );

        await applySyncOffsets(cameraOffsets, currentActiveSources);
        await applyLocalSyncOffsets(localOffsets);

        console.log(
          `   ⏳ Final alignment wait: Letting OBS solidify buffers for 3.0s...`,
        );
        await new Promise((r) => setTimeout(r, 3000));

        await restoreCameraMuteStates(originalMuteStates);

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
