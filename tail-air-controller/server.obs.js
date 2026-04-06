const { default: OBSWebSocket } = require("obs-websocket-js");
const { updateCameraIP } = require("./server.osc");

const obsMain = new OBSWebSocket();
const obsAudio = new OBSWebSocket();
let globalState;
let globalIo;
let mobileAudioTimeout;
let autoSwitchTimer;
let isFetchingScreenshot = false;

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
      if (match) updateCameraIP(cam, match[0]);
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

  setInterval(async () => {
    if (
      !state.obsConnected ||
      isFetchingScreenshot ||
      io.engine.clientsCount === 0
    )
      return;
    isFetchingScreenshot = true;
    try {
      const scenesToFetch = ["CAM 1", "CAM 2", "Mobile"];
      let screenshots = {};
      for (const scene of scenesToFetch) {
        const res = await obsMain
          .call("GetSourceScreenshot", {
            sourceName: scene,
            imageFormat: "jpeg",
            imageWidth: 480,
            imageHeight: 270,
            imageCompressionQuality: 50,
          })
          .catch(() => null);
        if (res && res.imageData) screenshots[scene] = res.imageData;
      }
      io.emit("obs-screenshots", screenshots);
    } finally {
      isFetchingScreenshot = false;
    }
  }, 1000);

  io.on("connection", (socket) => {
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
