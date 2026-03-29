import React, { useState, useEffect, useRef } from "react";
import OBSWebSocket from "obs-websocket-js";
import "./App.css";
import {
  IconAuto,
  IconTrackingUpper,
  IconTrackingCloseup,
  IconTrackingGroup,
  IconTungsten,
  IconSun,
  IconCloudy,
  IconMute,
} from "./icons";

const { ipcRenderer } = window.require("electron");
const obs = new OBSWebSocket();

export default function App() {
  // --- STATE ---
  const [obsConnected, setObsConnected] = useState(false);
  const [activeScene, setActiveScene] = useState("");

  // Track SRT Connections (Media Source Status)
  const [sourcesConnected, setSourcesConnected] = useState({
    "Tail A": false,
    "Tail B": false,
    "Mobile SRT": false,
  });

  const [isMuted, setIsMuted] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBitrate, setStreamBitrate] = useState(0);
  const streamMetricsRef = useRef({ bytes: 0, time: 0 });

  // Auto-Switcher State
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [autoSwitchMobile, setAutoSwitchMobile] = useState(false);
  const [switchMin, setSwitchMin] = useState(5);
  const [switchMax, setSwitchMax] = useState(15);
  const timerRef = useRef(null);

  // Camera Control State
  const [selectedCams, setSelectedCams] = useState(["Tail A"]);
  const [zoomLevel, setZoomLevel] = useState(0);

  // Preset Holding State
  const holdTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const [savingPreset, setSavingPreset] = useState(null); // For visual feedback

  // --- REFS FOR EVENT LISTENERS ---
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

  // --- OBS CONNECTION & POLLING ---
  useEffect(() => {
    let isMounted = true;
    let reconnectTimer;
    let pollTimer;
    let isPolling = false;

    // Named event handlers so we can remove them safely
    const onConnectionClosed = () => {
      if (isMounted) {
        console.log("[OBS] Connection lost. Retrying in 3 seconds...");
        setObsConnected(false);
        isPolling = false;
        clearTimeout(pollTimer);
        reconnectTimer = setTimeout(connectOBS, 3000);
      }
    };

    const onSceneChanged = (data) => {
      if (isMounted) setActiveScene(data.sceneName);
    };

    const onStreamStateChanged = (data) => {
      if (isMounted) {
        setIsStreaming(data.outputActive);
        if (!data.outputActive) {
          setStreamBitrate(0);
          streamMetricsRef.current = { bytes: 0, time: 0 };
        }
      }
    };

    const pollMediaStatus = async () => {
      if (!isMounted || !isPolling) return;

      // 1. Poll Source Connection States
      const sources = ["Tail A", "Tail B", "Mobile SRT"];
      let updated = false;
      const nextState = { ...sourcesConnectedRef.current };

      for (const source of sources) {
        try {
          const { mediaState } = await obs.call("GetMediaInputStatus", {
            inputName: source,
          });
          const isPlaying = mediaState === "OBS_MEDIA_STATE_PLAYING";

          if (nextState[source] !== isPlaying) {
            console.log(
              `[Media Status Change] ${source} changed to: ${mediaState}`,
            );
            nextState[source] = isPlaying;
            updated = true;

            // Force Mobile switch on connect
            if (
              isPlaying &&
              source === "Mobile SRT" &&
              autoSwitchMobileRef.current
            ) {
              console.log(
                "[Auto-Switch] Forcing Mobile SRT because it started playing.",
              );
              handleSceneChange("Mobile");
            }

            // Auto-switch away if the active camera disconnects
            if (!isPlaying) {
              const currentScene = activeSceneRef.current;
              if (
                source === "Tail A" &&
                currentScene === "CAM 1" &&
                nextState["Tail B"]
              ) {
                console.log(
                  "[Auto-Switch] Tail A died. Falling back to CAM 2.",
                );
                handleSceneChange("CAM 2");
              } else if (
                source === "Tail B" &&
                currentScene === "CAM 2" &&
                nextState["Tail A"]
              ) {
                console.log(
                  "[Auto-Switch] Tail B died. Falling back to CAM 1.",
                );
                handleSceneChange("CAM 1");
              }
            }
          }
        } catch (err) {
          // Source missing/offline, just ignore
        }
      }

      if (updated && isMounted) {
        setSourcesConnected(nextState);
      }

      // 2. Poll Stream Bitrate
      try {
        const streamStatus = await obs.call("GetStreamStatus");
        if (streamStatus.outputActive) {
          const now = Date.now();
          const currentBytes = streamStatus.outputBytes;
          const { bytes: lastBytes, time: lastTime } = streamMetricsRef.current;

          if (lastTime > 0 && currentBytes > lastBytes) {
            const timeDiffSec = (now - lastTime) / 1000;
            if (timeDiffSec >= 1) {
              // Calculate approx every 1+ seconds
              const bits = (currentBytes - lastBytes) * 8;
              const kbps = Math.round(bits / 1000 / timeDiffSec);
              if (isMounted) setStreamBitrate(kbps);
              streamMetricsRef.current = { bytes: currentBytes, time: now };
            }
          } else if (lastTime === 0) {
            streamMetricsRef.current = { bytes: currentBytes, time: now };
          }
        }
      } catch (err) {}

      // Recursively queue the next poll only after this one finishes
      if (isPolling) {
        pollTimer = setTimeout(pollMediaStatus, 1000);
      }
    };

    const connectOBS = async () => {
      try {
        await obs.connect(
          "ws://127.0.0.1:4455",
          import.meta.env.VITE_OBS_PASSWORD,
        );

        if (isMounted) {
          console.log("[OBS] ✅ Successfully connected to OBS WebSocket!");
          setObsConnected(true);

          // Get Initial Scene
          const { currentProgramSceneName } = await obs.call(
            "GetCurrentProgramScene",
          );
          setActiveScene(currentProgramSceneName);

          // Get Initial Stream Status
          const streamStatus = await obs.call("GetStreamStatus");
          setIsStreaming(streamStatus.outputActive);

          // Start polling once connected
          isPolling = true;
          pollTimer = setTimeout(pollMediaStatus, 1000);
        }
      } catch (err) {
        console.warn("[OBS] Connection failed:", err.message);
        try {
          await obs.disconnect();
        } catch (e) {}

        if (isMounted) {
          setObsConnected(false);
          reconnectTimer = setTimeout(connectOBS, 3000);
        }
      }
    };

    obs.on("ConnectionClosed", onConnectionClosed);
    obs.on("CurrentProgramSceneChanged", onSceneChanged);
    obs.on("StreamStateChanged", onStreamStateChanged);

    connectOBS();

    return () => {
      isMounted = false;
      isPolling = false;
      clearTimeout(reconnectTimer);
      clearTimeout(pollTimer);

      // CAREFUL REMOVAL: Only strip the events we explicitly attached!
      obs.off("ConnectionClosed", onConnectionClosed);
      obs.off("CurrentProgramSceneChanged", onSceneChanged);
      obs.off("StreamStateChanged", onStreamStateChanged);

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
      console.error("Failed to toggle stream:", err);
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

    // Hold for 1 second to save
    holdTimerRef.current = setTimeout(() => {
      isSavingRef.current = true;
      console.log(
        `[Preset] 💾 1-second hold reached! Sending save request for P${presetId}.`,
      );
      ipcRenderer.send("save-preset", { targets: selectedCams, presetId });

      // Visual feedback
      setSavingPreset(presetId);
      setTimeout(() => setSavingPreset(null), 1500);
    }, 1000);
  };

  const handlePresetUp = (presetId) => {
    if (selectedCams.length === 0) return;
    clearTimeout(holdTimerRef.current);

    // If we didn't hold long enough to trigger a save, it's a load request
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
    <div className="app-container">
      {/* ----------------- OBS PANEL (Left) ----------------- */}
      <div className="panel panel-left">
        <div className="space-between">
          <div className="section-title">OBS Controls</div>
          <div style={{ fontSize: "12px", color: "#888" }}>
            <span
              className={`status-dot ${obsConnected ? "connected" : "disconnected"}`}
            ></span>
            {obsConnected ? "Connected" : "Disconnected"}
          </div>
        </div>

        {/* Source Connection Indicators */}
        <div className="flex-row" style={{ gap: "5px", marginBottom: "10px" }}>
          {["Tail A", "Tail B", "Mobile SRT"].map((src) => (
            <div
              key={src}
              style={{
                fontSize: "10px",
                padding: "4px 8px",
                borderRadius: "4px",
                backgroundColor: sourcesConnected[src] ? "#28a745" : "#dc3545",
                color: "#fff",
                fontWeight: "bold",
                textAlign: "center",
                flex: 1,
              }}
            >
              {src.replace(" SRT", "")}
            </div>
          ))}
        </div>

        <div className="flex-col">
          {["CAM 1", "CAM 2", "Mobile"].map((scene) => (
            <button
              key={scene}
              onClick={() => handleSceneChange(scene)}
              className={`btn ${activeScene === scene ? "active" : ""}`}
            >
              {scene}
            </button>
          ))}
        </div>

        <div className="inner-panel flex-col">
          <div className="space-between">
            <span>Random Auto Switch</span>
            <input
              type="checkbox"
              className="toggle-switch"
              checked={autoSwitch}
              onChange={(e) => setAutoSwitch(e.target.checked)}
            />
          </div>

          <div
            className="flex-col"
            style={{ width: "100%", marginTop: "10px" }}
          >
            <div
              className="space-between"
              style={{ fontSize: "10px", marginBottom: "5px" }}
            >
              <span>MIN: {switchMin}s</span>
              <span>MAX: {switchMax}s</span>
            </div>
            {/* Dual Range Slider */}
            <div className="dual-slider-container">
              <input
                type="range"
                min="1"
                max="120"
                value={switchMin}
                className="dual-slider thumb-1"
                onChange={(e) =>
                  setSwitchMin(Math.min(Number(e.target.value), switchMax - 1))
                }
              />
              <input
                type="range"
                min="1"
                max="120"
                value={switchMax}
                className="dual-slider thumb-2"
                onChange={(e) =>
                  setSwitchMax(Math.max(Number(e.target.value), switchMin + 1))
                }
              />
            </div>
          </div>

          <div
            className="space-between"
            style={{
              borderTop: "1px solid #333",
              paddingTop: "10px",
              marginTop: "15px",
            }}
          >
            <span style={{ fontSize: "13px" }}>Force Mobile on connect</span>
            <input
              type="checkbox"
              className="toggle-switch"
              checked={autoSwitchMobile}
              onChange={(e) => setAutoSwitchMobile(e.target.checked)}
            />
          </div>
        </div>

        {/* Streaming Toggle Button */}
        <div style={{ marginTop: "auto" }}>
          <button
            onClick={handleToggleStream}
            className={`btn flex-col ${isStreaming ? "red active" : ""}`}
            style={{ width: "100%", gap: "2px", padding: "12px" }}
          >
            <span style={{ fontSize: "16px", fontWeight: "bold" }}>
              {isStreaming ? "STOP STREAMING" : "START STREAMING"}
            </span>
            {isStreaming && (
              <span style={{ fontSize: "12px", fontWeight: "normal" }}>
                {streamBitrate} kbps
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ----------------- CAMERA PANEL (Right) ----------------- */}
      <div className="panel panel-right">
        {/* Camera Tabs */}
        <div className="flex-row inner-panel" style={{ padding: "8px" }}>
          {["Tail A", "Tail B"].map((cam) => (
            <button
              key={cam}
              onClick={() =>
                setSelectedCams((prev) =>
                  prev.includes(cam)
                    ? prev.filter((c) => c !== cam)
                    : [...prev, cam],
                )
              }
              className={`btn ${selectedCams.includes(cam) ? "active" : ""}`}
              style={{ flex: 1, padding: "10px" }}
            >
              {cam}
            </button>
          ))}
        </div>

        <div className="grid-3" style={{ height: "100%" }}>
          {/* Tracking */}
          <div className="inner-panel flex-col">
            <div className="section-title">AI Tracking</div>
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0)}
              className="btn"
            >
              DISABLE AI
            </button>
            <div className="flex-row">
              {["Slow", "Norm", "Fast"].map((speed, idx) => (
                <button
                  key={speed}
                  onClick={() =>
                    sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", idx)
                  }
                  className="btn btn-small"
                  style={{ flex: 1 }}
                >
                  {speed}
                </button>
              ))}
            </div>
            <div className="grid-2" style={{ marginTop: "auto" }}>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 1)}
                className="btn flex-col btn-small"
              >
                <IconAuto width="20" fill="#0066ff" /> AUTO
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 2)}
                className="btn flex-col btn-small"
              >
                <IconTrackingUpper width="20" fill="#0066ff" /> UPPER
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 3)}
                className="btn flex-col btn-small"
              >
                <IconTrackingCloseup width="20" fill="#0066ff" /> CLOSE
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 7)}
                className="btn flex-col btn-small"
              >
                <IconTrackingGroup width="20" fill="#0066ff" /> GROUP
              </button>
            </div>
          </div>

          {/* Settings */}
          <div className="flex-col">
            <div className="inner-panel space-between">
              <div
                className="flex-col"
                style={{ alignItems: "flex-start", gap: "2px" }}
              >
                <span>Record</span>
                {isRecording && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#ff4444",
                      fontWeight: "bold",
                    }}
                  >
                    {formatTime(recordingTime)}
                  </span>
                )}
              </div>
              <button
                onClick={toggleRecording}
                className={`btn btn-round ${isRecording ? "red active" : ""}`}
              >
                {isRecording ? "⬛" : "⏺"}
              </button>
            </div>
            <div className="inner-panel space-between">
              <span>Cam Audio</span>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="btn btn-round"
              >
                <IconMute width="18" fill={isMuted ? "#dc3545" : "#fff"} />
              </button>
            </div>
            <div className="inner-panel grid-2" style={{ flex: 1 }}>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 0)
                }
                className="btn btn-small"
              >
                <IconTungsten width="36" fill="#ffc107" />
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className="btn btn-small"
              >
                <IconAuto width="36" fill="#fff" />
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
                }
                className="btn btn-small"
              >
                <IconSun width="36" fill="#fd7e14" />
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
                }
                className="btn btn-small"
              >
                <IconCloudy width="36" fill="#0dcaf0" />
              </button>
            </div>
          </div>

          {/* PTZ & Presets */}
          <div className="inner-panel flex-col space-between">
            <div className="section-title" style={{ width: "100%" }}>
              PTZ & Zoom
            </div>
            <div
              className="space-between"
              style={{ width: "100%", padding: "0 10px" }}
            >
              <div className="joystick-container">
                <div />
                <button
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                  }
                  className="btn btn-round"
                >
                  ▲
                </button>
                <div />
                <button
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                  }
                  className="btn btn-round"
                >
                  ◀
                </button>
                <button
                  onClick={() =>
                    sendOSC("/OBSBOT/WebCam/General/ResetGimbal", 1)
                  }
                  className="btn btn-round active"
                >
                  O
                </button>
                <button
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 0)
                  }
                  className="btn btn-round"
                >
                  ▶
                </button>
                <div />
                <button
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                  }
                  className="btn btn-round"
                >
                  ▼
                </button>
                <div />
              </div>

              {/* Vertical Zoom Slider */}
              <div
                className="flex-col"
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  width: "auto",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    marginBottom: "5px",
                  }}
                >
                  +
                </span>

                <div
                  style={{
                    position: "relative",
                    width: "20px",
                    height: "100px",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={zoomLevel}
                    className="vertical-slider"
                    onChange={(e) => {
                      setZoomLevel(parseInt(e.target.value));
                      sendOSC(
                        "/OBSBOT/WebCam/General/SetZoom",
                        parseInt(e.target.value),
                      );
                    }}
                  />
                </div>

                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    marginTop: "5px",
                  }}
                >
                  -
                </span>
              </div>
            </div>

            {/* Presets */}
            <div
              style={{
                width: "100%",
                borderTop: "1px solid #333",
                paddingTop: "15px",
                marginTop: "10px",
              }}
            >
              <div className="space-between" style={{ marginBottom: "8px" }}>
                <span
                  style={{
                    fontSize: "9px",
                    color: "#888",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Click to Load / Hold 1s to Save
                </span>
              </div>
              <div className="flex-row">
                {[1, 2, 3].map((preset) => (
                  <button
                    key={preset}
                    onMouseDown={() => handlePresetDown(preset)}
                    onMouseUp={() => handlePresetUp(preset)}
                    onMouseLeave={() => clearTimeout(holdTimerRef.current)}
                    className={`btn ${savingPreset === preset ? "active" : ""}`}
                    style={{
                      flex: 1,
                      padding: "10px",
                      fontSize: "12px",
                      transition: "all 0.2s",
                    }}
                  >
                    {savingPreset === preset ? "SAVED!" : `P${preset}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
