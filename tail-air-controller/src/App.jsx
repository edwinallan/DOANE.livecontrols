import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import OBSPanel from "./components/OBSPanel";
import CameraPanel from "./components/CameraPanel";
import YouTubePanel from "./components/YouTubePanel";
import SyncOverlay from "./components/SyncOverlay";

const backendUrl = `http://${window.location.hostname}:4000`;
const socket = io(backendUrl);

export default function App() {
  const [state, setState] = useState({
    obsConnected: false,
    activeScene: "",
    isStreaming: false,
    streamBitrate: 0,
    sourcesConnected: { "Tail A": false, "Tail B": false, "Mobile SRT": false },
    audioMuted: { "Tail A": true, "Tail B": true },
    syncOffsets: { "Tail A": null, "Tail B": null, "Mobile SRT": null },
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

  const [selectedCams, setSelectedCams] = useState([]);

  const [zoomLevel, setZoomLevel] = useState(0);
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

  const [showSyncOverlay, setShowSyncOverlay] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncMessage, setSyncMessage] = useState("");

  const holdTimerRef = useRef(null);
  const syncStatusRef = useRef(syncStatus);
  const syncResetTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const selectedCamsRef = useRef(selectedCams);

  useEffect(() => {
    selectedCamsRef.current = selectedCams;
  }, [selectedCams]);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  const clearSyncResetTimer = useCallback(() => {
    if (syncResetTimerRef.current) {
      clearTimeout(syncResetTimerRef.current);
      syncResetTimerRef.current = null;
    }
  }, []);

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

    socket.on("sync-complete", () => {
      const completedStatus =
        syncStatusRef.current === "beep-sync"
          ? "beep-complete"
          : "sync-complete";

      clearSyncResetTimer();
      setShowSyncOverlay(false);
      setSyncMessage("");
      setSyncStatus(completedStatus);
      syncResetTimerRef.current = setTimeout(() => {
        setSyncStatus("idle");
        syncResetTimerRef.current = null;
      }, 3000);
    });

    socket.on("sync-failed", (data) => {
      clearSyncResetTimer();
      setShowSyncOverlay(false);
      setSyncStatus("failed");
      setSyncMessage(data?.message || "Sync failed. Try again.");
      syncResetTimerRef.current = setTimeout(() => {
        setSyncStatus("idle");
        setSyncMessage("");
        syncResetTimerRef.current = null;
      }, 5000);
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state-update");
      socket.off("obs-screenshots");
      socket.off("config-update");
      socket.off("yt-chat-update");
      socket.off("modem-update");
      socket.off("sync-complete");
      socket.off("sync-failed");
      clearSyncResetTimer();
    };
  }, [clearSyncResetTimer]);

  useEffect(() => {
    const primaryCam = selectedCams[0];
    if (primaryCam && camConfigs[primaryCam]) {
      const z = camConfigs[primaryCam].zoom;
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
        return [];
      }

      if (onlineCams.length === 1) {
        return [...onlineCams];
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

      return ["Tail A", "Tail B"];
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

  useEffect(() => {
    let timeout;
    if (syncStatus === "syncing") {
      timeout = setTimeout(() => {
        setShowSyncOverlay(false);
        setSyncStatus("failed");
        setTimeout(() => setSyncStatus("idle"), 3000);
      }, 7000);
    }
    return () => clearTimeout(timeout);
  }, [syncStatus]);

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

  const triggerSync = () => {
    if (syncStatus === "syncing" || syncStatus === "beep-sync") return;
    clearSyncResetTimer();
    setSyncMessage("");
    setShowSyncOverlay(true);
    setSyncStatus("syncing");
    socket.emit("start-sync");
  };

  const triggerBeepSync = () => {
    if (syncStatus === "syncing" || syncStatus === "beep-sync") return;
    clearSyncResetTimer();
    setSyncMessage("");
    setSyncStatus("beep-sync");
    socket.emit("start-beep-sync");
  };

  // UPDATED: Supports arrays and forcing a specific state to sync multiple cameras perfectly
  const toggleMute = (camNames, forceMuteState) => {
    const targets = Array.isArray(camNames) ? camNames : [camNames];
    targets.forEach((cam) => {
      if (forceMuteState !== undefined) {
        socket.emit("set-mute", { camName: cam, isMuted: forceMuteState });
      } else {
        socket.emit("toggle-mute", cam);
      }
    });
  };

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
    <>
      {!isConnected && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="p-8 text-center bg-red-950 border border-red-500 rounded-2xl shadow-2xl flex flex-col items-center max-w-md">
            <svg
              className="w-16 h-16 text-red-500 mb-4 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-2xl font-bold text-white mb-2">
              Connection Lost
            </h2>
            <p className="text-zinc-300 mb-6">
              The Node server has been disconnected.
            </p>
            <div className="bg-black/50 p-4 rounded-lg w-full text-center border border-zinc-800">
              <p className="text-zinc-400 text-sm mb-1">
                Run the startup script to reconnect:
              </p>
              <code className="text-red-400 font-mono text-lg font-bold select-all">
                Start_Studio.command
              </code>
            </div>
          </div>
        </div>
      )}

      {showSyncOverlay && (
        <SyncOverlay
          onCancel={() => {
            setShowSyncOverlay(false);
            setSyncStatus("idle");
          }}
        />
      )}

      <div className="flex w-full h-screen overflow-hidden bg-zinc-950 text-white select-none p-4 gap-4">
        <OBSPanel
          state={state}
          obsScreenshots={obsScreenshots}
          handleSceneChange={handleSceneChange}
          updateAutoSwitch={updateAutoSwitch}
          handleToggleStream={handleToggleStream}
          modemStats={modemStats}
          isConnected={isConnected}
          triggerSync={triggerSync}
          triggerBeepSync={triggerBeepSync}
          syncStatus={syncStatus}
          syncMessage={syncMessage}
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
            audioMuted={state.audioMuted}
            toggleMute={toggleMute}
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
    </>
  );
}
