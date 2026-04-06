const { default: OBSWebSocket } = require("obs-websocket-js");
const { updateCameraIP } = require("./server.osc");
const net = require("net"); // <-- NEW: Native network module

const obsMain = new OBSWebSocket();
const obsAudio = new OBSWebSocket();
let globalState;
let globalIo;
let mobileAudioTimeout;
let autoSwitchTimer;
let isFetchingScreenshot = false;

// --- DYNAMIC LOOP STATE ---
const lastMoveTime = { "CAM 1": 0, "CAM 2": 0, Mobile: 0 };
const lastFetchTime = { "CAM 1": 0, "CAM 2": 0, Mobile: 0 };
const currentScreenshots = {};

// --- NEW: Local IP cache for pinging ---
const localCameraIPs = { "Tail A": null, "Tail B": null };

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
        updateCameraIP(cam, ip); // Sends to server.osc.js
        localCameraIPs[cam] = ip; // Saves locally for our ping loop
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

  async function connectOBS() {
    try {
      const obsPassword = process.env.VITE_OBS_PASSWORD || undefined;
      await obsMain.connect("ws://127.0.0.1:4455", obsPassword);
      await obsAudio.connect("ws://127.0.0.1:4455", obsPassword, {
        eventSubscriptions: 65536,
      });

      state.obsConnected = true;
      const { currentProgramSceneName } = await obsMain.call(
        "GetCurrentProgramScene",
      );
      state.activeScene = currentProgramSceneName;
      const streamStatus = await obsMain.call("GetStreamStatus");
      state.isStreaming = streamStatus.outputActive;
      io.emit("state-update", state);

      fetchCameraIPs();
      console.log("🎬 Connected to OBS WebSocket");
    } catch (err) {
      state.obsConnected = false;
      io.emit("state-update", state);
      setTimeout(connectOBS, 5000);
    }
  }

  connectOBS();

  obsMain.on("ConnectionClosed", () => {
    state.obsConnected = false;
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

  obsAudio.on("InputVolumeMeters", (data) => {
    const mobileInput = data.inputs.find((i) => i.inputName === "Mobile SRT");
    if (mobileInput && mobileInput.inputLevelsMul.some((l) => l[1] > 0.0001)) {
      if (!state.sourcesConnected["Mobile SRT"]) {
        state.sourcesConnected["Mobile SRT"] = true;
        io.emit("state-update", state);
      }
      clearTimeout(mobileAudioTimeout);
      mobileAudioTimeout = setTimeout(() => {
        state.sourcesConnected["Mobile SRT"] = false;
        io.emit("state-update", state);
      }, 2000);
    }
  });

  // --- NEW: Bulletproof TCP Ping Loop ---
  setInterval(async () => {
    let stateChanged = false;

    for (const cam of ["Tail A", "Tail B"]) {
      const ip = localCameraIPs[cam];
      if (!ip) continue;

      // Try to establish a pure TCP connection to the camera's OSC port
      const isOnline = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000); // 1 second timeout

        socket.on("connect", () => {
          socket.destroy();
          resolve(true); // Network connection succeeded!
        });

        socket.on("timeout", () => {
          socket.destroy();
          resolve(false); // Dead
        });

        socket.on("error", () => {
          socket.destroy();
          resolve(false); // Refused or unreachable
        });

        socket.connect(57110, ip);
      });

      // If the real network state differs from our app state, update it
      if (state.sourcesConnected[cam] !== isOnline) {
        state.sourcesConnected[cam] = isOnline;
        stateChanged = true;
      }
    }

    if (stateChanged) {
      io.emit("state-update", state);
    }
  }, 2000); // Checks every 2 seconds

  // --- Smart Dynamic Screenshot Loop ---
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
        const isMoving = now - lastMoveTime[scene] < 1500;
        const timeSinceLastFetch = now - lastFetchTime[scene];
        const intervalTarget = isMoving ? 66 : 1000;

        if (timeSinceLastFetch >= intervalTarget) {
          lastFetchTime[scene] = now;

          const res = await obsMain
            .call("GetSourceScreenshot", {
              sourceName: scene,
              imageFormat: "jpeg",
              imageWidth: 480,
              imageHeight: 270,
              imageCompressionQuality: isMoving ? 25 : 50,
            })
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
        io.emit("obs-screenshots", currentScreenshots);
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
      if (state.obsConnected)
        await obsMain
          .call("SetCurrentProgramScene", { sceneName })
          .catch(() => {});
    });

    socket.on("toggle-stream", async () => {
      if (state.obsConnected)
        await obsMain.call("ToggleStream").catch(() => {});
    });

    socket.on("update-autoswitch", (config) => {
      state.autoSwitch = { ...state.autoSwitch, ...config };
      io.emit("state-update", state);
      scheduleNextSwitch();
    });
  });
}

module.exports = { initOBS, setOBSStreamKey };
