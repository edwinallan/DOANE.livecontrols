const { exec } = require("child_process");

function initBeepSync(io, state, obsMain) {
  let isSyncing = false;

  // Track map corresponding to your OBS Audio Matrix
  const trackMapping = {
    "Tail A": 0, // Track 1
    "Tail B": 1, // Track 2
    "Mobile SRT": 2, // Track 3
    "Acoustic Master": 3, // Track 4 (Physical Mic in the room)
    "Digital Loopback": 4, // Track 5 (Direct digital feed from Logic/System)
  };

  // Helper function to extract the peak timestamp using Two-Pass FFmpeg
  const analyzeTrack = async (filePath, trackIndex) => {
    // --- PASS 1: Find the Loudest 3kHz Peak ---
    const peakVolume = await new Promise((resolve) => {
      const cmd = `ffmpeg -i "${filePath}" -map 0:a:${trackIndex} -af "bandpass=f=3000:width_type=h:w=500,volumedetect" -f null - 2>&1`;
      exec(cmd, (err, stdout) => {
        const match = stdout.match(/max_volume:\s*([-0-9.]+)\s*dB/);
        if (match && match[1]) {
          resolve(parseFloat(match[1]));
        } else {
          resolve(0); // If it fails to find a peak, default to 0
        }
      });
    });

    // --- CALCULATE GAIN ---
    // Push the peak volume up to a healthy -2.0 dB
    let gainDb = 0;
    if (peakVolume < -2.0) {
      gainDb = Math.abs(peakVolume) - 2.0;
    }

    // --- PASS 2: Apply Gain & Run Rhythm Detection ---
    return new Promise((resolve) => {
      const filterStr = `bandpass=f=3000:width_type=h:w=500,volume=${gainDb}dB,silencedetect=noise=-15dB:d=0.25`;
      const cmd = `ffmpeg -i "${filePath}" -map 0:a:${trackIndex} -af "${filterStr}" -f null - 2>&1`;

      exec(cmd, (err, stdout) => {
        // Find all silence_end timestamps and parse them into an array of floats
        const rawBeeps = [...stdout.matchAll(/silence_end:\s*([\d\.]+)/g)].map(
          (m) => parseFloat(m[1]),
        );

        if (rawBeeps.length < 3) {
          resolve(null); // Not enough spikes to form a pattern
          return;
        }

        let foundRhythm = false;

        // SLIDING WINDOW RHYTHM CHECK
        for (let i = 0; i < rawBeeps.length - 2; i++) {
          const intervalA = rawBeeps[i + 1] - rawBeeps[i];
          const intervalB = rawBeeps[i + 2] - rawBeeps[i + 1];
          const variance = Math.abs(intervalA - intervalB);

          // Criteria:
          // 1. Intervals must be similar (variance <= 0.15s)
          // 2. Beeps shouldn't be insanely close or far (between 0.2s and 1.5s apart)
          if (variance <= 0.15 && intervalA > 0.2 && intervalA < 1.5) {
            resolve(rawBeeps[i]); // Return the timestamp of the FIRST beep in the valid sequence
            foundRhythm = true;
            break;
          }
        }

        if (!foundRhythm) {
          // Found spikes, but none matched the rhythm
          resolve(null);
        }
      });
    });
  };

  io.on("connection", (socket) => {
    socket.on("start-beep-sync", async () => {
      if (isSyncing) return;
      isSyncing = true;
      console.log(
        "\n🔊 Starting Audio Beep Sync Workflow (5-Track Speaker Latency Analysis)...",
      );

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
            inputName: "Internal Mic",
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

        await new Promise((r) => setTimeout(r, 10));

        console.log("   ▶️ Triggering 'beep' media source...");
        await obsMain.call("TriggerMediaInputAction", {
          inputName: "beep",
          mediaAction: "OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART",
        });

        // AUGMENTED WAIT TIME: Gives heavily delayed SRT mobile streams time to catch the 3 beeps
        await new Promise((r) => setTimeout(r, 12000));

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
        const tracksToAnalyze = [
          "Acoustic Master",
          "Digital Loopback",
          ...activeSources,
        ];

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

        if (!timestamps["Digital Loopback"] || !timestamps["Acoustic Master"]) {
          throw new Error(
            "CRITICAL: Could not detect rhythm sequence on Digital Loopback or Acoustic Master track.",
          );
        }

        const validSources = Object.keys(timestamps).filter((s) =>
          activeSources.includes(s),
        );
        if (validSources.length === 0) {
          throw new Error("Could not detect rhythm sequence on any camera.");
        }

        // --- LATENCY MATH & DIAGNOSTICS ---
        console.log(`\n📐 === LATENCY & OFFSET CALCULATIONS ===`);

        const digitalTs = timestamps["Digital Loopback"];
        const acousticTs = timestamps["Acoustic Master"];

        // Calculate the physical speaker/room delay
        const speakerDelayMs = Math.round((acousticTs - digitalTs) * 1000);
        console.log(`🔊 SPEAKER / ROOM DELAY: ${speakerDelayMs}ms`);
        console.log(`   (Time sound spent traveling through hardware and air)`);
        console.log(`--------------------------------------------------`);

        for (const cam of activeSources) {
          if (timestamps[cam]) {
            const netDelayMs = Math.round(
              (timestamps[cam] - acousticTs) * 1000,
            );
            console.log(`📡 ${cam} True Network Latency: ${netDelayMs}ms`);
          } else {
            console.log(
              `   ⚠️ ${cam}: Sequence undetected. Sync offset left at default (0ms).`,
            );
          }
        }
        console.log(`--------------------------------------------------`);

        // Find the slowest acoustic source to use as our baseline for OBS offsets
        const allAcousticTs = [acousticTs];
        for (const cam of validSources) {
          allAcousticTs.push(timestamps[cam]);
        }

        const slowestTs = Math.max(...allAcousticTs);

        let slowestSource = "Acoustic Master";
        for (const [name, ts] of Object.entries(timestamps)) {
          if (ts === slowestTs && name !== "Digital Loopback") {
            slowestSource = name;
          }
        }

        console.log(
          `👑 SLOWEST ACOUSTIC SOURCE: ${slowestSource} (Used as baseline)`,
        );

        // Calculate Logic/Mic offset based on the Acoustic Master
        const baseAudioDelayMs = Math.round((slowestTs - acousticTs) * 1000);
        console.log(
          `   💻 Base Audio offset calculated: +${baseAudioDelayMs}ms`,
        );
        console.log(
          `      Applying +${baseAudioDelayMs}ms audio sync offset to 'Logic' and 'Internal Mic'...`,
        );

        await obsMain
          .call("SetInputAudioSyncOffset", {
            inputName: "Logic",
            inputAudioSyncOffset: baseAudioDelayMs,
          })
          .catch(() =>
            console.log(`      ⚠️ Could not set audio offset for 'Logic'.`),
          );

        await obsMain
          .call("SetInputAudioSyncOffset", {
            inputName: "Internal Mic",
            inputAudioSyncOffset: baseAudioDelayMs,
          })
          .catch(() =>
            console.log(
              `      ⚠️ Could not set audio offset for 'Internal Mic'.`,
            ),
          );

        // Calculate camera offsets based on their respective acoustic delays
        for (const source of validSources) {
          const delayMs = Math.round((slowestTs - timestamps[source]) * 1000);
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
