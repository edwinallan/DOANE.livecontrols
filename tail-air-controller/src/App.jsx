import React, { useState, useEffect, useRef } from "react";
import OBSWebSocket from "obs-websocket-js";
import "./App.css"; // This replaces Tailwind!
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
  const [obsConnected, setObsConnected] = useState(false);
  const [activeScene, setActiveScene] = useState("");
  const [sourcesActive, setSourcesActive] = useState({
    "Tail A": false,
    "Tail B": false,
    "Mobile SRT": false,
  });
  const [isMuted, setIsMuted] = useState(false);

  const [autoSwitch, setAutoSwitch] = useState(false);
  const [autoSwitchMobile, setAutoSwitchMobile] = useState(false);
  const [switchMin, setSwitchMin] = useState(5);
  const [switchMax, setSwitchMax] = useState(15);
  const timerRef = useRef(null);

  const [selectedCams, setSelectedCams] = useState(["Tail A"]);
  const [zoomLevel, setZoomLevel] = useState(0);
  const holdTimerRef = useRef(null);

  useEffect(() => {
    const connectOBS = async () => {
      try {
        await obs.connect(
          "ws://127.0.0.1:4455",
          import.meta.env.VITE_OBS_PASSWORD,
        );
        setObsConnected(true);
        const { currentProgramSceneName } = await obs.call(
          "GetCurrentProgramScene",
        );
        setActiveScene(currentProgramSceneName);

        obs.on("CurrentProgramSceneChanged", (data) =>
          setActiveScene(data.sceneName),
        );
        obs.on("SourceActiveStateChanged", (data) => {
          if (["Tail A", "Tail B", "Mobile SRT"].includes(data.sourceName)) {
            setSourcesActive((prev) => ({
              ...prev,
              [data.sourceName]: data.videoActive,
            }));
          }
        });
      } catch (err) {
        setObsConnected(false);
        console.error("OBS Connection failed.", err);
      }
    };
    connectOBS();
    return () => obs.disconnect();
  }, []);

  // Safe scene switching
  const handleSceneChange = async (sceneName) => {
    if (!obsConnected) return alert("OBS is not connected!");
    try {
      await obs.call("SetCurrentProgramScene", { sceneName });
    } catch (err) {
      alert(
        `Failed to switch scene. Does a scene named EXACTLY "${sceneName}" exist in OBS?`,
      );
      console.error(err);
    }
  };

  // ... [Keep your Auto-switch useEffect exact same as before] ...
  useEffect(() => {
    if (autoSwitch) {
      const scheduleNextSwitch = () => {
        const delay =
          Math.floor(Math.random() * (switchMax - switchMin + 1) + switchMin) *
          1000;
        timerRef.current = setTimeout(async () => {
          if (autoSwitchMobile && sourcesActive["Mobile SRT"]) {
            await handleSceneChange("Mobile");
          } else {
            const available = ["CAM 1", "CAM 2"].filter(
              (scene) =>
                (scene === "CAM 1" && sourcesActive["Tail A"]) ||
                (scene === "CAM 2" && sourcesActive["Tail B"]),
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
  }, [autoSwitch, switchMin, switchMax, autoSwitchMobile, sourcesActive]);

  const sendOSC = (address, value) => {
    if (selectedCams.length === 0) return;
    ipcRenderer.send("send-osc", { targets: selectedCams, address, value });
  };

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

          <div className="flex-row">
            <div className="flex-col" style={{ flex: 1 }}>
              <span style={{ fontSize: "10px" }}>MIN: {switchMin}s</span>
              <input
                type="range"
                min="1"
                max="60"
                value={switchMin}
                onChange={(e) => setSwitchMin(Number(e.target.value))}
              />
            </div>
            <div className="flex-col" style={{ flex: 1 }}>
              <span style={{ fontSize: "10px" }}>MAX: {switchMax}s</span>
              <input
                type="range"
                min={switchMin}
                max="120"
                value={switchMax}
                onChange={(e) => setSwitchMax(Number(e.target.value))}
              />
            </div>
          </div>

          <div
            className="space-between"
            style={{
              borderTop: "1px solid #333",
              paddingTop: "10px",
              marginTop: "10px",
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

        <div className="flex-row" style={{ marginTop: "auto" }}>
          <button className="btn red" style={{ flex: 1 }}>
            YOUTUBE
          </button>
          <button className="btn" style={{ flex: 1 }} disabled>
            INSTA
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
              <span>Rec on Cam</span>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/Camera/TailAir/SetRecording", 1)
                }
                className="btn btn-round red"
              ></button>
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
                <IconTungsten width="24" fill="#ffc107" />
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className="btn btn-small"
              >
                <IconAuto width="24" fill="#fff" />
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
                }
                className="btn btn-small"
              >
                <IconSun width="24" fill="#fd7e14" />
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
                }
                className="btn btn-small"
              >
                <IconCloudy width="24" fill="#0dcaf0" />
              </button>
            </div>
          </div>

          {/* PTZ */}
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
                  className="btn btn-round"
                >
                  ▼
                </button>
                <div />
              </div>

              <div
                className="flex-col"
                style={{ alignItems: "center", width: "auto" }}
              >
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>+</span>
                <input
                  type="range"
                  className="vertical-slider"
                  min="0"
                  max="100"
                  value={zoomLevel}
                  onChange={(e) => {
                    setZoomLevel(parseInt(e.target.value));
                    sendOSC(
                      "/OBSBOT/WebCam/General/SetZoom",
                      parseInt(e.target.value),
                    );
                  }}
                />
                <span style={{ fontSize: "12px", fontWeight: "bold" }}>-</span>
              </div>
            </div>

            <div
              style={{
                width: "100%",
                borderTop: "1px solid #333",
                paddingTop: "15px",
                marginTop: "10px",
              }}
            >
              <div className="flex-row">
                {[1, 2, 3].map((preset) => (
                  <button
                    key={preset}
                    className="btn"
                    style={{ flex: 1, padding: "10px" }}
                  >
                    P{preset}
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
