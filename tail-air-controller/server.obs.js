const { default: OBSWebSocket } = require("obs-websocket-js");
const { updateCameraIP } = require("./server.osc");
const net = require("net");
const db = require("./server.db");
const { exec } = require("child_process");

const obsMain = new OBSWebSocket();
let globalState;
let globalIo;
let autoSwitchTimer;
let isFetchingScreenshot = false;
let wasStreamingBeforeCrash = false;

// --- DYNAMIC LOOP STATE ---
const lastMoveTime = { "CAM 1": 0, "CAM 2": 0, Mobile: 0 };
const lastFetchTime = { "CAM 1": 0, "CAM 2": 0, Mobile: 0 };
const currentScreenshots = {};

// Track which scene is currently being high-res previewed
let highResScene = null;

// --- Connection Tracking Caches ---
const localCameraIPs = { "Tail A": null, "Tail B": null };
const connectionStrikes = { "Tail A": 0, "Tail B": 0 };
const MAX_STRIKES = 3;

// --- SRT Cursor Tracking ---
let lastMobileCursor = -1;
let mobileStuckStrikes = 0;
const MAX_MOBILE_STRIKES = 2;

async function setOBSStreamKey(url, key) {
  if (globalState && globalState.obsConnected) {
    await obsMain
      .call("SetStreamServiceSettings", {
        streamServiceType: "rtmp_custom",
        streamServiceSettings: { server: url, key: key, use_auth: false },
      })
      .catch((err) => console.error("OBS Stream Key Set Error:", err));
  }
}

async function fetchCameraIPs() {
  const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  for (const cam of ["Tail A", "Tail B"]) {
    try {
      const { inputSettings } = await obsMain.call("GetInputSettings", {
        inputName: cam,
      });
      const match = JSON.stringify(inputSettings).match(ipv4Regex);
      if (match) {
        const ip = match[0];
        updateCameraIP(cam, ip);
        localCameraIPs[cam] = ip;
      }
    } catch (e) {}
  }
}

function scheduleNextSwitch() {
  clearTimeout(autoSwitchTimer);
  if (!globalState.autoSwitch.enabled) return;

  const delay =
    Math.floor(
      Math.random() *
        (globalState.autoSwitch.max - globalState.autoSwitch.min + 1) +
        globalState.autoSwitch.min,
    ) * 1000;

  autoSwitchTimer = setTimeout(async () => {
    if (
      globalState.autoSwitch.mobile &&
      globalState.sourcesConnected["Mobile SRT"]
    ) {
      await obsMain
        .call("SetCurrentProgramScene", { sceneName: "Mobile" })
        .catch(() => {});
    } else {
      const available = ["CAM 1", "CAM 2"].filter(
        (scene) =>
          (scene === "CAM 1" && globalState.sourcesConnected["Tail A"]) ||
          (scene === "CAM 2" && globalState.sourcesConnected["Tail B"]),
      );
      if (available.length > 0) {
        const nextScene =
          available[Math.floor(Math.random() * available.length)];
        await obsMain
          .call("SetCurrentProgramScene", { sceneName: nextScene })
          .catch(() => {});
      }
    }
    scheduleNextSwitch();
  }, delay);
}

function initOBS(io, state) {
  globalIo = io;
  globalState = state;

  db.get("SELECT * FROM auto_switch WHERE id = 1", (err, row) => {
    if (row) {
      state.autoSwitch = {
        enabled: !!row.enabled,
        mobile: !!row.mobile,
        min: row.min,
        max: row.max,
      };
      scheduleNextSwitch();
    }
  });

  async function connectOBS() {
    try {
      const obsPassword = process.env.VITE_OBS_PASSWORD || undefined;
      await obsMain.connect("ws://127.0.0.1:4455", obsPassword);

      state.obsConnected = true;
      const { currentProgramSceneName } = await obsMain.call(
        "GetCurrentProgramScene",
      );
      state.activeScene = currentProgramSceneName;

      if (wasStreamingBeforeCrash) {
        console.log("🔄 Recovering stream state: Restarting Stream...");
        await obsMain.call("StartStream").catch(() => {});
        wasStreamingBeforeCrash = false;
      }

      const streamStatus = await obsMain.call("GetStreamStatus");
      state.isStreaming = streamStatus.outputActive;

      // FETCH INITIAL MUTE STATES
      if (!state.audioMuted) state.audioMuted = {};
      for (const cam of ["Tail A", "Tail B"]) {
        try {
          const res = await obsMain.call("GetInputMute", { inputName: cam });
          state.audioMuted[cam] = res.inputMuted;
        } catch (e) {
          state.audioMuted[cam] = true;
        }
      }

      if (!state.syncOffsets)
        state.syncOffsets = {
          "Tail A": null,
          "Tail B": null,
          "Mobile SRT": null,
        };

      for (const source of ["Tail A", "Tail B", "Mobile SRT"]) {
        try {
          const filterRes = await obsMain.call("GetSourceFilter", {
            sourceName: source,
            filterName: "Video Delay",
          });

          if (
            filterRes &&
            filterRes.filterSettings &&
            filterRes.filterSettings.delay_ms !== undefined
          ) {
            state.syncOffsets[source] = filterRes.filterSettings.delay_ms;
          }
        } catch (e) {
          state.syncOffsets[source] = null;
        }
      }

      io.emit("state-update", state);

      fetchCameraIPs();
      console.log("🎬 Connected to OBS WebSocket");
    } catch (err) {
      state.obsConnected = false;
      io.emit("state-update", state);
      exec('open -a "OBS"');
      setTimeout(connectOBS, 5000);
    }
  }

  connectOBS();

  obsMain.on("InputMuteStateChanged", (data) => {
    if (data.inputName === "Tail A" || data.inputName === "Tail B") {
      state.audioMuted[data.inputName] = data.inputMuted;
      io.emit("state-update", state);
    }
  });

  obsMain.on("ConnectionClosed", () => {
    console.log("⚠️ OBS Connection Closed or Crashed.");
    state.obsConnected = false;
    wasStreamingBeforeCrash = state.isStreaming;
    exec('open -a "OBS"');
    io.emit("state-update", state);
    setTimeout(connectOBS, 3000);
  });

  obsMain.on("CurrentProgramSceneChanged", (data) => {
    state.activeScene = data.sceneName;
    io.emit("state-update", state);
  });

  obsMain.on("StreamStateChanged", (data) => {
    state.isStreaming = data.outputActive;
    io.emit("state-update", state);
  });

  setInterval(async () => {
    if (!state.obsConnected) return;
    let stateChanged = false;

    for (const cam of ["Tail A", "Tail B"]) {
      const ip = localCameraIPs[cam];
      if (!ip) continue;

      const isOnline = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);

        const cleanup = () => {
          socket.removeAllListeners();
          socket.destroy();
        };

        socket.on("connect", () => {
          cleanup();
          resolve(true);
        });

        socket.on("timeout", () => {
          cleanup();
          resolve(false);
        });

        socket.on("error", () => {
          cleanup();
          resolve(false);
        });

        socket.connect(57110, ip);
      });

      if (isOnline) {
        connectionStrikes[cam] = 0;
        if (!state.sourcesConnected[cam]) {
          state.sourcesConnected[cam] = true;
          stateChanged = true;
        }
      } else {
        connectionStrikes[cam]++;
        if (
          connectionStrikes[cam] >= MAX_STRIKES &&
          state.sourcesConnected[cam]
        ) {
          state.sourcesConnected[cam] = false;
          stateChanged = true;
        }
      }
    }

    try {
      const mediaStatus = await obsMain.call("GetMediaInputStatus", {
        inputName: "Mobile SRT",
      });

      let isMobileOnline = false;

      if (mediaStatus.mediaState === "OBS_MEDIA_STATE_PLAYING") {
        if (mediaStatus.mediaCursor > lastMobileCursor) {
          isMobileOnline = true;
          mobileStuckStrikes = 0;
        } else {
          mobileStuckStrikes++;
          if (mobileStuckStrikes < MAX_MOBILE_STRIKES) {
            isMobileOnline = state.sourcesConnected["Mobile SRT"];
          }
        }
        lastMobileCursor = mediaStatus.mediaCursor;
      } else {
        lastMobileCursor = -1;
        mobileStuckStrikes = MAX_MOBILE_STRIKES;
      }

      if (state.sourcesConnected["Mobile SRT"] !== isMobileOnline) {
        state.sourcesConnected["Mobile SRT"] = isMobileOnline;
        stateChanged = true;

        if (!isMobileOnline) {
          if (state.activeScene === "Mobile") {
            const fallbackScene = state.sourcesConnected["Tail A"]
              ? "CAM 1"
              : state.sourcesConnected["Tail B"]
                ? "CAM 2"
                : null;
            if (fallbackScene) {
              obsMain
                .call("SetCurrentProgramScene", { sceneName: fallbackScene })
                .catch(() => {});
            }
          }
        } else {
          if (state.autoSwitch.mobile && state.activeScene !== "Mobile") {
            obsMain
              .call("SetCurrentProgramScene", { sceneName: "Mobile" })
              .catch(() => {});
          }
        }
      }
    } catch (e) {
      if (state.sourcesConnected["Mobile SRT"]) {
        state.sourcesConnected["Mobile SRT"] = false;
        stateChanged = true;

        if (state.activeScene === "Mobile") {
          const fallbackScene = state.sourcesConnected["Tail A"]
            ? "CAM 1"
            : state.sourcesConnected["Tail B"]
              ? "CAM 2"
              : null;
          if (fallbackScene) {
            obsMain
              .call("SetCurrentProgramScene", { sceneName: fallbackScene })
              .catch(() => {});
          }
        }
      }
    }

    if (stateChanged) {
      io.emit("state-update", state);
    }
  }, 2500);

  async function screenshotLoop() {
    if (
      !state.obsConnected ||
      isFetchingScreenshot ||
      io.engine.clientsCount === 0
    ) {
      setTimeout(screenshotLoop, 100);
      return;
    }

    isFetchingScreenshot = true;
    try {
      const now = Date.now();
      const scenesToFetch = ["CAM 1", "CAM 2", "Mobile"];
      let hasUpdates = false;

      for (const scene of scenesToFetch) {
        const isPreviewing = highResScene === scene;
        const isMoving = now - lastMoveTime[scene] < 1500;

        let intervalTarget = 1000;

        const reqPayload = {
          sourceName: scene,
          imageFormat: "jpeg",
        };

        if (isPreviewing) {
          intervalTarget = 500;
          reqPayload.imageCompressionQuality = 85;
        } else {
          reqPayload.imageWidth = 480;
          reqPayload.imageHeight = 270;

          if (isMoving) {
            intervalTarget = 66;
            reqPayload.imageCompressionQuality = 25;
          } else {
            reqPayload.imageCompressionQuality = 50;
          }
        }

        const timeSinceLastFetch = now - lastFetchTime[scene];

        if (timeSinceLastFetch >= intervalTarget) {
          lastFetchTime[scene] = now;

          const res = await obsMain
            .call("GetSourceScreenshot", reqPayload)
            .catch(() => null);

          if (res && res.imageData) {
            currentScreenshots[scene] = res.imageData;
            hasUpdates = true;
          } else if (currentScreenshots[scene]) {
            delete currentScreenshots[scene];
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        io.volatile.emit("obs-screenshots", currentScreenshots);
      }
    } finally {
      isFetchingScreenshot = false;
      setTimeout(screenshotLoop, 20);
    }
  }

  screenshotLoop();

  io.on("connection", (socket) => {
    socket.on("send-osc", ({ targets, address }) => {
      const isMovement =
        address.includes("SetGimbal") ||
        address.includes("SetZoom") ||
        address.includes("ResetGimbal");
      if (isMovement) {
        targets.forEach((cam) => {
          const scene =
            cam === "Tail A" ? "CAM 1" : cam === "Tail B" ? "CAM 2" : null;
          if (scene) lastMoveTime[scene] = Date.now();
        });
      }
    });

    socket.on("load-preset", ({ targets }) => {
      targets.forEach((cam) => {
        const scene =
          cam === "Tail A" ? "CAM 1" : cam === "Tail B" ? "CAM 2" : null;
        if (scene) lastMoveTime[scene] = Date.now() + 1000;
      });
    });

    socket.on("set-scene", async (sceneName) => {
      if (state.obsConnected) {
        await obsMain
          .call("SetCurrentProgramScene", { sceneName })
          .catch(() => {});

        if (state.autoSwitch.enabled) {
          state.autoSwitch.enabled = false;
          io.emit("state-update", state);
          clearTimeout(autoSwitchTimer);

          db.run("UPDATE auto_switch SET enabled = 0 WHERE id = 1");
        }
      }
    });

    socket.on("toggle-stream", async () => {
      if (state.obsConnected)
        await obsMain.call("ToggleStream").catch(() => {});
    });

    socket.on("toggle-mute", async (camName) => {
      if (state.obsConnected) {
        await obsMain
          .call("ToggleInputMute", { inputName: camName })
          .catch(() => {});
      }
    });

    // NEW: Listen for explicitly forced mute states (fixes multi-camera array grouping)
    socket.on("set-mute", async ({ camName, isMuted }) => {
      if (state.obsConnected) {
        await obsMain
          .call("SetInputMute", { inputName: camName, inputMuted: isMuted })
          .catch(() => {});
      }
    });

    socket.on("start-preview", (sceneName) => {
      highResScene = sceneName;
    });

    socket.on("stop-preview", () => {
      highResScene = null;
    });

    socket.on("update-autoswitch", (config) => {
      state.autoSwitch = { ...state.autoSwitch, ...config };
      io.emit("state-update", state);
      scheduleNextSwitch();

      db.run(
        "UPDATE auto_switch SET enabled = ?, mobile = ?, min = ?, max = ? WHERE id = 1",
        [
          state.autoSwitch.enabled ? 1 : 0,
          state.autoSwitch.mobile ? 1 : 0,
          state.autoSwitch.min,
          state.autoSwitch.max,
        ],
      );
    });
  });
}

function getCurrentScreenshots() {
  return currentScreenshots;
}

module.exports = { initOBS, setOBSStreamKey, obsMain, getCurrentScreenshots };
