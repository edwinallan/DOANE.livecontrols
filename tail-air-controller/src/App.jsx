import React, { useState, useEffect, useRef } from "react";
import OBSWebSocket from "obs-websocket-js";
import OBSPanel from "./components/OBSPanel";
import CameraPanel from "./components/CameraPanel";

const { ipcRenderer } = window.require("electron");
const obs = new OBSWebSocket();

export default function App() {
  // --- STATE ---
  const [obsConnected, setObsConnected] = useState(false);
  const [activeScene, setActiveScene] = useState("");

  const [sourcesConnected, setSourcesConnected] = useState({
    "Tail A": false,
    "Tail B": false,
    "Mobile SRT": false,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBitrate, setStreamBitrate] = useState(0);
  const streamMetricsRef = useRef({ bytes: 0, time: 0 });

  const [autoSwitch, setAutoSwitch] = useState(false);
  const [autoSwitchMobile, setAutoSwitchMobile] = useState(false);
  const [switchMin, setSwitchMin] = useState(5);
  const [switchMax, setSwitchMax] = useState(15);
  const timerRef = useRef(null);

  const [selectedCams, setSelectedCams] = useState(["Tail A"]);
  const [zoomLevel, setZoomLevel] = useState(0);

  const holdTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const [savingPreset, setSavingPreset] = useState(null);

  // --- REFS ---
  const activeSceneRef = useRef(activeScene);
  const sourcesConnectedRef = useRef(sourcesConnected);
  const autoSwitchMobileRef = useRef(autoSwitchMobile);

  useEffect(() => {
    activeSceneRef.current = activeScene;
  }, [activeScene]);
  useEffect(() => {
    sourcesConnectedRef.current = sourcesConnected;
  }, [sourcesConnected]);
  useEffect(() => {
    autoSwitchMobileRef.current = autoSwitchMobile;
  }, [autoSwitchMobile]);

  // --- RECORDING TIMER ---
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime((prev) => prev + 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // --- IPC LISTENER FOR TAIL A & B (OSC HEARTBEAT) ---
  useEffect(() => {
    const handleCamStatus = (e, statusUpdate) => {
      console.log("[Heartbeat received]", statusUpdate);
      setSourcesConnected((prev) => ({ ...prev, ...statusUpdate }));
    };
    ipcRenderer.on("camera-status", handleCamStatus);
    return () => ipcRenderer.removeAllListeners("camera-status");
  }, []);

  // --- OBS CONNECTION & POLLING ---
  useEffect(() => {
    let isMounted = true;
    let reconnectTimer;
    let pollTimer;
    let isPolling = false;
    let mobileAudioTimeout;

    const onConnectionClosed = () => {
      if (isMounted) {
        setObsConnected(false);
        isPolling = false;
        clearTimeout(pollTimer);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectOBS, 3000);
      }
    };

    const onSceneChanged = (data) => {
      if (isMounted) setActiveScene(data.sceneName);
    };

    const onStreamStateChanged = (data) => {
      if (isMounted) {
        setIsStreaming(data.outputActive);
        if (!data.outputActive) setStreamBitrate(0);
      }
    };

    // --- NEW: MOBILE SRT AUDIO METER HACK ---
    const onInputVolumeMeters = (data) => {
      if (!isMounted) return;

      const mobileInput = data.inputs.find((i) => i.inputName === "Mobile SRT");
      if (mobileInput) {
        // level[1] is the peak audio level. If it's > 0.0001, data is flowing!
        const hasAudioData = mobileInput.inputLevelsMul.some(
          (level) => level[1] > 0.0001,
        );

        if (hasAudioData) {
          // It's ALIVE! Set to true if it isn't already.
          setSourcesConnected((prev) =>
            prev["Mobile SRT"] ? prev : { ...prev, "Mobile SRT": true },
          );

          // Reset the kill-switch timer
          clearTimeout(mobileAudioTimeout);

          // If 2 seconds pass with NO audio data, consider it dead
          mobileAudioTimeout = setTimeout(() => {
            setSourcesConnected((prev) => ({ ...prev, "Mobile SRT": false }));
          }, 2000);
        }
      }
    };

    // We still need to poll stream bitrate manually
    const pollStreamBitrate = async () => {
      if (!isMounted || !isPolling) return;
      try {
        const streamStatus = await obs.call("GetStreamStatus");
        if (streamStatus.outputActive) {
          const now = Date.now();
          const currentBytes = streamStatus.outputBytes;
          const { bytes: lastBytes, time: lastTime } = streamMetricsRef.current;

          if (lastTime > 0 && currentBytes > lastBytes) {
            const timeDiffSec = (now - lastTime) / 1000;
            if (timeDiffSec >= 1) {
              const kbps = Math.round(
                ((currentBytes - lastBytes) * 8) / 1000 / timeDiffSec,
              );
              if (isMounted) setStreamBitrate(kbps);
              streamMetricsRef.current = { bytes: currentBytes, time: now };
            }
          } else if (lastTime === 0) {
            streamMetricsRef.current = { bytes: currentBytes, time: now };
          }
        }
      } catch (err) {}

      if (isPolling) pollTimer = setTimeout(pollStreamBitrate, 1000);
    };

    const connectOBS = async () => {
      clearTimeout(reconnectTimer);
      try {
        // We pass 66559 to subscribe to standard events (1023) PLUS Volume Meters (65536)
        await obs.connect(
          "ws://127.0.0.1:4455",
          import.meta.env.VITE_OBS_PASSWORD,
          {
            eventSubscriptions: 66559,
          },
        );

        if (isMounted) {
          setObsConnected(true);
          const { currentProgramSceneName } = await obs.call(
            "GetCurrentProgramScene",
          );
          setActiveScene(currentProgramSceneName);
          const streamStatus = await obs.call("GetStreamStatus");
          setIsStreaming(streamStatus.outputActive);

          isPolling = true;
          clearTimeout(pollTimer);
          pollTimer = setTimeout(pollStreamBitrate, 1000);
        }
      } catch (err) {
        if (isMounted) {
          setObsConnected(false);
          reconnectTimer = setTimeout(connectOBS, 3000);
        }
      }
    };

    obs.on("ConnectionClosed", onConnectionClosed);
    obs.on("CurrentProgramSceneChanged", onSceneChanged);
    obs.on("StreamStateChanged", onStreamStateChanged);
    obs.on("InputVolumeMeters", onInputVolumeMeters); // Listen for Audio!

    connectOBS();

    return () => {
      isMounted = false;
      isPolling = false;
      clearTimeout(reconnectTimer);
      clearTimeout(pollTimer);
      clearTimeout(mobileAudioTimeout);

      obs.off("ConnectionClosed", onConnectionClosed);
      obs.off("CurrentProgramSceneChanged", onSceneChanged);
      obs.off("StreamStateChanged", onStreamStateChanged);
      obs.off("InputVolumeMeters", onInputVolumeMeters);

      obs.disconnect().catch(() => {});
    };
  }, []);

  // --- ACTIONS ---
  const handleSceneChange = async (sceneName) => {
    if (!obsConnected) {
      console.warn(
        `[Auto-switch / Manual] Skipped scene change to '${sceneName}' because OBS is not connected.`,
      );
      return;
    }
    try {
      await obs.call("SetCurrentProgramScene", { sceneName });
    } catch (err) {
      console.error(err);
    }
  };

  const toggleRecording = () => {
    const newState = !isRecording;
    setIsRecording(newState);
    if (!newState) setRecordingTime(0);
    sendOSC("/OBSBOT/Camera/TailAir/SetRecording", newState ? 1 : 0);
  };

  const handleToggleStream = async () => {
    if (!obsConnected) return;
    try {
      await obs.call("ToggleStream");
    } catch (err) {
      console.error(err);
    }
  };

  const sendOSC = (address, value) => {
    if (selectedCams.length === 0) {
      console.warn(
        `[OSC Blocked] Tried to send ${address} but no cameras are selected!`,
      );
      return;
    }
    console.log(
      `[OSC Send] 📡 Target(s): ${selectedCams.join(", ")} | Command: ${address} | Value: ${value}`,
    );
    ipcRenderer.send("send-osc", { targets: selectedCams, address, value });
  };

  // --- PRESET HANDLERS ---
  const handlePresetDown = (presetId) => {
    if (selectedCams.length === 0) return;
    isSavingRef.current = false;
    console.log(
      `[Preset] Mouse down. Holding to save P${presetId} for ${selectedCams.join(", ")}...`,
    );

    holdTimerRef.current = setTimeout(() => {
      isSavingRef.current = true;
      console.log(
        `[Preset] 💾 1-second hold reached! Sending save request for P${presetId}.`,
      );
      ipcRenderer.send("save-preset", { targets: selectedCams, presetId });
      setSavingPreset(presetId);
      setTimeout(() => setSavingPreset(null), 1500);
    }, 1000);
  };

  const handlePresetUp = (presetId) => {
    if (selectedCams.length === 0) return;
    clearTimeout(holdTimerRef.current);
    if (!isSavingRef.current) {
      console.log(
        `[Preset] 🚀 Mouse released early. Loading P${presetId} for ${selectedCams.join(", ")}.`,
      );
      ipcRenderer.send("load-preset", { targets: selectedCams, presetId });
    } else {
      console.log(
        `[Preset] Mouse released after save completed. (Load action ignored).`,
      );
    }
  };

  // --- AUTO SWITCHER LOGIC ---
  useEffect(() => {
    if (autoSwitch) {
      const scheduleNextSwitch = () => {
        const delay =
          Math.floor(Math.random() * (switchMax - switchMin + 1) + switchMin) *
          1000;
        timerRef.current = setTimeout(async () => {
          if (autoSwitchMobile && sourcesConnected["Mobile SRT"]) {
            await handleSceneChange("Mobile");
          } else {
            const available = ["CAM 1", "CAM 2"].filter(
              (scene) =>
                (scene === "CAM 1" && sourcesConnected["Tail A"]) ||
                (scene === "CAM 2" && sourcesConnected["Tail B"]),
            );
            if (available.length > 0) {
              const nextScene =
                available[Math.floor(Math.random() * available.length)];
              await handleSceneChange(nextScene);
            }
          }
          scheduleNextSwitch();
        }, delay);
      };
      scheduleNextSwitch();
    } else {
      clearTimeout(timerRef.current);
    }
    return () => clearTimeout(timerRef.current);
  }, [autoSwitch, switchMin, switchMax, autoSwitchMobile, sourcesConnected]);

  return (
    <div className="flex flex-wrap gap-5 p-5 min-h-screen bg-zinc-950 text-white select-none">
      <OBSPanel
        obsConnected={obsConnected}
        sourcesConnected={sourcesConnected}
        activeScene={activeScene}
        handleSceneChange={handleSceneChange}
        autoSwitch={autoSwitch}
        setAutoSwitch={setAutoSwitch}
        switchMin={switchMin}
        setSwitchMin={setSwitchMin}
        switchMax={switchMax}
        setSwitchMax={setSwitchMax}
        autoSwitchMobile={autoSwitchMobile}
        setAutoSwitchMobile={setAutoSwitchMobile}
        isStreaming={isStreaming}
        streamBitrate={streamBitrate}
        handleToggleStream={handleToggleStream}
      />

      <CameraPanel
        selectedCams={selectedCams}
        setSelectedCams={setSelectedCams}
        sendOSC={sendOSC}
        isRecording={isRecording}
        toggleRecording={toggleRecording}
        recordingTime={recordingTime}
        formatTime={formatTime}
        isMuted={isMuted}
        setIsMuted={setIsMuted}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        handlePresetDown={handlePresetDown}
        handlePresetUp={handlePresetUp}
        holdTimerRef={holdTimerRef}
        savingPreset={savingPreset}
      />
    </div>
  );
}
