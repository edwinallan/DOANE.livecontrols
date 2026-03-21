import React, { useState, useEffect, useRef } from "react";
import OBSWebSocket from "obs-websocket-js";
// Import your SVGs here: import { SvgIconCloudy } from './icons'
const { ipcRenderer } = window.require("electron");

const obs = new OBSWebSocket();

export default function App() {
  // OBS State
  const [activeScene, setActiveScene] = useState("");
  const [sourcesActive, setSourcesActive] = useState({
    "Tail A": false,
    "Tail B": false,
    "Mobile SRT": false,
  });

  // Auto-switch State
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [autoSwitchMobile, setAutoSwitchMobile] = useState(false);
  const [switchMin, setSwitchMin] = useState(5);
  const [switchMax, setSwitchMax] = useState(15);
  const timerRef = useRef(null);

  // Camera Control State
  const [selectedCams, setSelectedCams] = useState(["Tail A"]);

  useEffect(() => {
    const connectOBS = async () => {
      try {
        await obs.connect("ws://127.0.0.1:4455", "QPFA0A9lbb1BVH3x");
        const { currentProgramSceneName } = await obs.call(
          "GetCurrentProgramScene",
        );
        setActiveScene(currentProgramSceneName);

        // Setup listeners for scene changes and source active status
        obs.on("CurrentProgramSceneChanged", (data) =>
          setActiveScene(data.sceneName),
        );
        // You would add SourceActiveStateChanged listeners here to update `sourcesActive`
      } catch (err) {
        console.error("OBS Connection failed", err);
      }
    };
    connectOBS();
    return () => obs.disconnect();
  }, []);

  // Auto Switching Logic
  useEffect(() => {
    if (autoSwitch) {
      const scheduleNextSwitch = () => {
        const delay =
          Math.floor(Math.random() * (switchMax - switchMin + 1) + switchMin) *
          1000;
        timerRef.current = setTimeout(async () => {
          // Logic: Auto switch to mobile if setting is on and mobile is active
          if (autoSwitchMobile && sourcesActive["Mobile SRT"]) {
            await obs.call("SetCurrentProgramScene", { sceneName: "Mobile" });
          } else {
            // Otherwise randomly pick an active camera
            const available = ["CAM 1", "CAM 2"].filter(
              (scene) =>
                (scene === "CAM 1" && sourcesActive["Tail A"]) ||
                (scene === "CAM 2" && sourcesActive["Tail B"]),
            );
            if (available.length > 0) {
              const nextScene =
                available[Math.floor(Math.random() * available.length)];
              await obs.call("SetCurrentProgramScene", {
                sceneName: nextScene,
              });
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
    ipcRenderer.send("send-osc", { targets: selectedCams, address, value });
  };

  const toggleCamSelection = (cam) => {
    setSelectedCams((prev) =>
      prev.includes(cam) ? prev.filter((c) => c !== cam) : [...prev, cam],
    );
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4 font-sans select-none flex flex-wrap lg:flex-nowrap gap-4">
      {/* ROW/COLUMN 1: OBS Controls */}
      <div className="flex-1 bg-neutral-800 p-4 rounded-xl flex flex-col gap-4">
        <h2 className="text-xl font-bold border-b border-neutral-700 pb-2">
          OBS Controls
        </h2>

        <div className="flex gap-2">
          {["CAM 1", "CAM 2", "Mobile"].map((scene) => (
            <button
              key={scene}
              onClick={() =>
                obs.call("SetCurrentProgramScene", { sceneName: scene })
              }
              className={`flex-1 py-3 rounded-lg font-bold transition-colors ${activeScene === scene ? "bg-red-600" : "bg-neutral-700 hover:bg-neutral-600"}`}
            >
              {scene}
            </button>
          ))}
        </div>

        <div className="bg-neutral-700 p-3 rounded-lg flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span>Random Auto Switch</span>
            <input
              type="checkbox"
              className="toggle"
              checked={autoSwitch}
              onChange={(e) => setAutoSwitch(e.target.checked)}
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-neutral-400">Min (s):</span>
            <input
              type="range"
              min="1"
              max="60"
              value={switchMin}
              onChange={(e) => setSwitchMin(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-neutral-400">Max (s):</span>
            <input
              type="range"
              min={switchMin}
              max="120"
              value={switchMax}
              onChange={(e) => setSwitchMax(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex justify-between items-center border-t border-neutral-600 pt-2">
            <span className="text-sm">Auto switch to Mobile when active</span>
            <input
              type="checkbox"
              className="toggle"
              checked={autoSwitchMobile}
              onChange={(e) => setAutoSwitchMobile(e.target.checked)}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-auto">
          <button className="flex-1 bg-red-600 py-3 rounded-lg font-bold">
            Live YouTube
          </button>
          <button
            className="flex-1 bg-neutral-700 text-neutral-500 py-3 rounded-lg font-bold cursor-not-allowed"
            disabled
          >
            Live Insta
          </button>
        </div>
      </div>

      {/* ROW/COLUMN 2: Camera OSC Controls */}
      <div className="flex-[2] bg-neutral-800 p-4 rounded-xl flex flex-col gap-4">
        {/* Top Tabs */}
        <div className="flex gap-2 border-b border-neutral-700 pb-2">
          {["Tail A", "Tail B"].map((cam) => (
            <button
              key={cam}
              onClick={() => toggleCamSelection(cam)}
              className={`px-6 py-2 rounded-t-lg font-bold ${selectedCams.includes(cam) ? "bg-blue-600" : "bg-neutral-700 hover:bg-neutral-600"}`}
            >
              {cam}
            </button>
          ))}
        </div>

        {/* Control Grid */}
        <div className="grid grid-cols-3 gap-4 h-full">
          {/* Tracking Section */}
          <div className="bg-neutral-700 p-3 rounded-lg flex flex-col gap-3">
            <h3 className="font-bold text-sm text-neutral-400">Tracking</h3>
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0)}
              className="bg-neutral-600 p-2 rounded"
            >
              AI OFF
            </button>
            <div className="flex gap-1">
              {[0, 1, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() =>
                    sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", speed)
                  }
                  className="flex-1 bg-neutral-600 p-1 text-xs rounded"
                >
                  Speed {speed}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 1)}
                className="bg-neutral-600 p-2 rounded text-xs"
              >
                Auto
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 2)}
                className="bg-neutral-600 p-2 rounded text-xs"
              >
                Upper
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 3)}
                className="bg-neutral-600 p-2 rounded text-xs"
              >
                Close
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 7)}
                className="bg-neutral-600 p-2 rounded text-xs"
              >
                Group
              </button>
            </div>
          </div>

          {/* Settings Section (Rec, Audio, WB) */}
          <div className="flex flex-col gap-4">
            <div className="bg-neutral-700 p-3 rounded-lg flex justify-between items-center">
              <span className="text-sm font-bold">Record</span>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/Camera/TailAir/SetRecording", 1)
                }
                className="w-8 h-8 rounded-full bg-red-600"
              ></button>
            </div>
            <div className="bg-neutral-700 p-3 rounded-lg flex justify-between items-center">
              <span className="text-sm font-bold">Mute Audio</span>
              {/* Note: Map this to obs.call('SetInputMute', { inputName: 'Tail A', inputMuted: true }) */}
              <input type="checkbox" className="toggle" />
            </div>
            <div className="bg-neutral-700 p-3 rounded-lg grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 0)
                }
                className="bg-neutral-600 p-2 rounded text-xs"
              >
                Tungsten
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className="bg-neutral-600 p-2 rounded text-xs"
              >
                Auto
              </button>
            </div>
          </div>

          {/* PTZ Section */}
          <div className="bg-neutral-700 p-3 rounded-lg flex flex-col items-center relative">
            <h3 className="font-bold text-sm text-neutral-400 absolute top-3 left-3">
              PTZ
            </h3>
            {/* Joystick Stand-in */}
            <div className="grid grid-cols-3 gap-1 mt-6">
              <div />
              <button
                onMouseDown={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 50)
                }
                onMouseUp={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                }
                className="bg-neutral-600 w-10 h-10 rounded"
              >
                U
              </button>
              <div />
              <button
                onMouseDown={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 50)
                }
                onMouseUp={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                }
                className="bg-neutral-600 w-10 h-10 rounded"
              >
                L
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/WebCam/General/ResetGimbal", 1)}
                className="bg-blue-600 w-10 h-10 rounded rounded-full"
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
                className="bg-neutral-600 w-10 h-10 rounded"
              >
                R
              </button>
              <div />
              <button
                onMouseDown={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 50)
                }
                onMouseUp={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                }
                className="bg-neutral-600 w-10 h-10 rounded"
              >
                D
              </button>
              <div />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
