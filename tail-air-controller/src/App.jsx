import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import OBSPanel from "./components/OBSPanel";
import CameraPanel from "./components/CameraPanel";

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
    ytAuthenticated: false,
    ytVideoId: null,
    ytLiveChatId: null,
  });

  const [obsScreenshots, setObsScreenshots] = useState({});
  const [ytChatMessages, setYtChatMessages] = useState([]);
  const [selectedCams, setSelectedCams] = useState(["Tail A"]);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [savingPreset, setSavingPreset] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const holdTimerRef = useRef(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    socket.on("state-update", (newState) => {
      setState((prev) => ({ ...prev, ...newState }));
    });

    socket.on("obs-screenshots", (data) => {
      setObsScreenshots(data);
    });

    socket.on("yt-chat-update", (newMessages) => {
      setYtChatMessages((prev) => {
        const combined = [...prev, ...newMessages];
        const unique = Array.from(
          new Map(combined.map((m) => [m.id, m])).values(),
        );
        return unique.slice(-50);
      });
    });

    return () => {
      socket.off("state-update");
      socket.off("obs-screenshots");
      socket.off("yt-chat-update");
    };
  }, []);

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

  // UPDATED: Now accepts a title
  const handleStartYTStream = (title) => socket.emit("start-yt-stream", title);

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
    <div className="flex w-full h-screen overflow-hidden bg-zinc-950 text-white select-none p-4 gap-4">
      <OBSPanel
        state={state}
        obsScreenshots={obsScreenshots}
        handleSceneChange={handleSceneChange}
        updateAutoSwitch={updateAutoSwitch}
        handleToggleStream={handleToggleStream}
      />
      <CameraPanel
        state={state}
        ytChatMessages={ytChatMessages}
        handleStartYTStream={handleStartYTStream}
        backendUrl={backendUrl}
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
