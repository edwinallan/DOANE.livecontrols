import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import OBSPanel from "./components/OBSPanel";
import CameraPanel from "./components/CameraPanel";
import YouTubePanel from "./components/YouTubePanel";

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
    ytStreamTitle: "",
    ytBroadcastStatus: null,
    ytIsCreating: false,
    ytIsTransitioning: false,
    ytStreamHealth: "noData",
    ytStreamStatus: "inactive",
    ytErrorMessage: "",
  });

  const [obsScreenshots, setObsScreenshots] = useState({});
  const [ytChatMessages, setYtChatMessages] = useState([]);
  const [selectedCams, setSelectedCams] = useState(["Tail A"]);

  // Local zoom state for immediate visual slider feedback
  const [zoomLevel, setZoomLevel] = useState(0);

  const [isMuted, setIsMuted] = useState(false);
  const [savingPreset, setSavingPreset] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [camConfigs, setCamConfigs] = useState({});
  const [modemStats, setModemStats] = useState({
    battery: 0,
    charging: false,
    signal: 0,
  });
  const [expandedPanel, setExpandedPanel] = useState("camera");

  const [isConnected, setIsConnected] = useState(socket.connected);

  const holdTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const selectedCamsRef = useRef(selectedCams);

  useEffect(() => {
    selectedCamsRef.current = selectedCams;
  }, [selectedCams]);

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.on("state-update", (newState) => {
      setState((prev) => ({ ...prev, ...newState }));
    });

    socket.on("obs-screenshots", (data) => {
      setObsScreenshots(data);
    });

    socket.on("config-update", (configs) => {
      setCamConfigs(configs);
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

    socket.on("modem-update", (data) => {
      setModemStats(data);
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state-update");
      socket.off("obs-screenshots");
      socket.off("config-update");
      socket.off("yt-chat-update");
      socket.off("modem-update");
    };
  }, []);

  // Sync zoom level purely from backend memory when tab changes or data updates
  useEffect(() => {
    const primaryCam = selectedCams[0];
    if (primaryCam && camConfigs[primaryCam]) {
      const z = camConfigs[primaryCam].zoom;
      // THE FIX: Provide a strict fallback to 0 if zoom is null/undefined.
      // This forces the slider to update visually when you switch tabs, even if no data is present yet.
      setZoomLevel(z !== undefined && z !== null ? z : 0);
    }
  }, [selectedCams, camConfigs]);

  const tailAOnline = state.sourcesConnected["Tail A"];
  const tailBOnline = state.sourcesConnected["Tail B"];

  useEffect(() => {
    const onlineCams = [];
    if (tailAOnline) onlineCams.push("Tail A");
    if (tailBOnline) onlineCams.push("Tail B");

    setSelectedCams((prevSelected) => {
      if (onlineCams.length === 0) {
        return prevSelected.length === 0 ? prevSelected : [];
      }
      if (onlineCams.length === 1) {
        return prevSelected.length === 1 && prevSelected[0] === onlineCams[0]
          ? prevSelected
          : [...onlineCams];
      }

      const validSelected = prevSelected.filter((cam) =>
        onlineCams.includes(cam),
      );

      if (
        validSelected.length === prevSelected.length &&
        validSelected.every((val, i) => val === prevSelected[i])
      ) {
        return prevSelected;
      }

      if (validSelected.length > 0) return validSelected;
      return ["Tail A"];
    });
  }, [tailAOnline, tailBOnline]);

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
  const handleStartYTStream = (title) => socket.emit("start-yt-stream", title);
  const handleGoLiveYT = () => socket.emit("go-live-yt");

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
        modemStats={modemStats}
        isConnected={isConnected}
      />

      <div className="flex flex-1 gap-4 min-w-0">
        <CameraPanel
          isExpanded={expandedPanel === "camera"}
          onExpand={() => setExpandedPanel("camera")}
          sourcesConnected={state.sourcesConnected}
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
          camConfigs={camConfigs}
        />

        <YouTubePanel
          isExpanded={expandedPanel === "youtube"}
          onExpand={() => setExpandedPanel("youtube")}
          state={state}
          ytChatMessages={ytChatMessages}
          handleStartYTStream={handleStartYTStream}
          handleGoLiveYT={handleGoLiveYT}
          backendUrl={backendUrl}
        />
      </div>
    </div>
  );
}
