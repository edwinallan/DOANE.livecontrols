import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client"; // FIXED: Destructured import
import OBSPanel from "./components/OBSPanel";
import CameraPanel from "./components/CameraPanel";

// FIXED: Dynamically connect to wherever the page was loaded from!
const backendUrl = `http://${window.location.hostname}:4000`;
const socket = io(backendUrl);

export default function App() {
  const [state, setState] = useState({
    obsConnected: false,
    activeScene: "",
    isStreaming: false,
    streamBitrate: 0,
    sourcesConnected: { "Tail A": false, "Tail B": false, "Mobile SRT": false },
    autoSwitch: { enabled: false, mobile: false, min: 5, max: 15 },
  });

  const [obsScreenshot, setObsScreenshot] = useState("");
  const [selectedCams, setSelectedCams] = useState(["Tail A"]);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [savingPreset, setSavingPreset] = useState(null);

  // RESTORED: Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const holdTimerRef = useRef(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    socket.on("state-update", (newState) => {
      setState((prev) => ({ ...prev, ...newState }));
    });

    socket.on("obs-screenshot", (base64Data) => {
      setObsScreenshot(base64Data);
    });

    return () => {
      socket.off("state-update");
      socket.off("obs-screenshot");
    };
  }, []);

  // RESTORED: Recording timer logic
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

  const handleSceneChange = (sceneName) => socket.emit("set-scene", sceneName);
  const handleToggleStream = () => socket.emit("toggle-stream");
  const updateAutoSwitch = (newConfig) =>
    socket.emit("update-autoswitch", newConfig);

  const sendOSC = (address, value) => {
    if (selectedCams.length > 0) {
      socket.emit("send-osc", { targets: selectedCams, address, value });
    }
  };

  const toggleRecording = () => {
    const newState = !isRecording;
    setIsRecording(newState);
    if (!newState) setRecordingTime(0);
    sendOSC("/OBSBOT/Camera/TailAir/SetRecording", newState ? 1 : 0);
  };

  const handlePresetDown = (presetId) => {
    if (selectedCams.length === 0) return;
    isSavingRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      isSavingRef.current = true;
      socket.emit("save-preset", { targets: selectedCams, presetId });
      setSavingPreset(presetId);
      setTimeout(() => setSavingPreset(null), 1500);
    }, 1000);
  };

  const handlePresetUp = (presetId) => {
    if (selectedCams.length === 0) return;
    clearTimeout(holdTimerRef.current);
    if (!isSavingRef.current) {
      socket.emit("load-preset", { targets: selectedCams, presetId });
    }
  };

  return (
    <div className="flex w-full h-screen overflow-hidden gap-4 p-4 bg-zinc-950 text-white select-none">
      <OBSPanel
        state={state}
        obsScreenshot={obsScreenshot}
        handleSceneChange={handleSceneChange}
        updateAutoSwitch={updateAutoSwitch}
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
