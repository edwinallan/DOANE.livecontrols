import React from "react";
import {
  Mic,
  MicOff,
  Sun,
  Cloud,
  Aperture,
  Video,
  Square,
  Target,
  User,
  MonitorUp,
  Users,
  Focus,
  MoveUp,
  MoveDown,
  MoveLeft,
  MoveRight,
  Plus,
  Minus,
  Bookmark,
  Lightbulb,
} from "lucide-react";

export default function CameraPanel({
  isExpanded,
  onExpand,
  sourcesConnected,
  selectedCams,
  setSelectedCams,
  sendOSC,
  isRecording,
  toggleRecording,
  recordingTime,
  formatTime,
  isMuted,
  setIsMuted,
  zoomLevel,
  setZoomLevel,
  handlePresetDown,
  handlePresetUp,
  holdTimerRef,
  savingPreset,
  camConfigs,
}) {
  if (!isExpanded) {
    return (
      <button
        onClick={onExpand}
        className="w-16 shrink-0 bg-zinc-900 rounded-3xl flex flex-col items-center justify-center gap-6 border border-zinc-800 hover:bg-zinc-800 transition-colors shadow-xl h-full"
      >
        <Video size={28} className="text-zinc-500" />
        <span className="[writing-mode:vertical-lr] rotate-180 text-zinc-500 font-bold tracking-widest text-lg">
          CAMERA SETTINGS
        </span>
      </button>
    );
  }

  const onlineCams = ["Tail A", "Tail B"].filter((c) => sourcesConnected?.[c]);
  const allOffline = onlineCams.length === 0;

  // Grab the config for the primary selected camera
  const primaryCam = selectedCams[0];
  const activeConfig = camConfigs?.[primaryCam] || {};

  const btnBase =
    "bg-zinc-800 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 active:bg-zinc-600 active:scale-95 transition-all flex items-center justify-center gap-2 flex-col select-none touch-manipulation";
  const btnActive =
    "!bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]";
  const panelInner =
    "bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shrink-0";

  return (
    <div className="flex-1 bg-zinc-900 rounded-3xl p-5 flex flex-col space-y-5 border border-zinc-800 shadow-xl overflow-y-auto min-h-0">
      {/* --- SMART SEGMENTED TAB BAR --- */}
      <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shrink-0">
        {allOffline ? (
          <button className="w-full py-4 text-lg tracking-wide rounded-xl font-black text-zinc-700 bg-zinc-950 cursor-not-allowed">
            Offline
          </button>
        ) : onlineCams.length === 1 ? (
          <button
            className={`w-full py-4 text-lg tracking-wide rounded-xl font-black ${btnActive} cursor-default`}
          >
            {onlineCams[0]}
          </button>
        ) : (
          <>
            <button
              onClick={() => setSelectedCams(["Tail A"])}
              className={`flex-1 py-3 text-base tracking-wide rounded-xl font-black transition-all ${
                selectedCams.length === 1 && selectedCams[0] === "Tail A"
                  ? btnActive
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              Tail A
            </button>
            <button
              onClick={() => setSelectedCams(["Tail A", "Tail B"])}
              className={`flex-1 py-3 text-base tracking-wide rounded-xl font-black transition-all ${
                selectedCams.length === 2
                  ? btnActive
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              Tail A & B
            </button>
            <button
              onClick={() => setSelectedCams(["Tail B"])}
              className={`flex-1 py-3 text-base tracking-wide rounded-xl font-black transition-all ${
                selectedCams.length === 1 && selectedCams[0] === "Tail B"
                  ? btnActive
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              Tail B
            </button>
          </>
        )}
      </div>

      {/* Control Grid */}
      <div
        className={`grid grid-cols-2 gap-5 flex-1 min-h-0 transition-opacity duration-300 ${allOffline ? "opacity-30 pointer-events-none" : ""}`}
      >
        {/* COL 1: AI TRACKING & COLOR */}
        <div className="flex flex-col space-y-5 min-h-0">
          <div className={`flex flex-col gap-4 ${panelInner} flex-1`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              AI Tracking
            </div>

            <div className="grid grid-cols-4 gap-2 shrink-0">
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0)}
                className={`${btnBase} py-3 text-sm transition-all ${
                  activeConfig.aiMode === 0
                    ? "!bg-red-600 !text-white shadow-[0_0_15px_rgba(220,53,69,0.5)]"
                    : "border border-red-900/50 text-red-400 hover:bg-red-950/40"
                }`}
              >
                OFF
              </button>
              {["Slow", "Norm", "Fast"].map((speed, idx) => (
                <button
                  key={speed}
                  onClick={() =>
                    sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", idx)
                  }
                  className={`${btnBase} py-3 text-sm transition-all ${
                    activeConfig.trackingSpeed === idx ? btnActive : ""
                  }`}
                >
                  {speed}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto pb-4 border-b border-zinc-800/80">
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 1)}
                className={`${btnBase} py-4 text-xs ${activeConfig.aiMode === 1 ? btnActive : ""}`}
              >
                <Focus size={28} className="text-blue-400 mb-1" /> AUTO
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 2)}
                className={`${btnBase} py-4 text-xs ${activeConfig.aiMode === 2 ? btnActive : ""}`}
              >
                <MonitorUp size={28} className="text-blue-400 mb-1" /> UPPER
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 3)}
                className={`${btnBase} py-4 text-xs ${activeConfig.aiMode === 3 ? btnActive : ""}`}
              >
                <User size={28} className="text-blue-400 mb-1" /> CLOSE
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 7)}
                className={`${btnBase} py-4 text-xs ${activeConfig.aiMode === 7 ? btnActive : ""}`}
              >
                <Users size={28} className="text-blue-400 mb-1" /> GROUP
              </button>
            </div>

            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black mt-2">
              Color
            </div>
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 0)
                }
                className={`${btnBase} py-4 text-xs ${activeConfig.wbMode === 0 && activeConfig.colorTemp < 4000 ? btnActive : ""}`}
              >
                <Lightbulb size={28} className="text-amber-400 mb-1" /> TUNGSTEN
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className={`${btnBase} py-4 text-xs ${activeConfig.wbMode === 1 ? btnActive : ""}`}
              >
                <Aperture size={28} className="text-white mb-1" /> AUTO
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
                }
                className={`${btnBase} py-4 text-xs ${activeConfig.wbMode === 0 && activeConfig.colorTemp === 5500 ? btnActive : ""}`}
              >
                <Sun size={28} className="text-orange-500 mb-1" /> DAY
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
                }
                className={`${btnBase} py-4 text-xs ${activeConfig.wbMode === 0 && activeConfig.colorTemp === 6500 ? btnActive : ""}`}
              >
                <Cloud size={28} className="text-cyan-400 mb-1" /> CLOUD
              </button>
            </div>
          </div>
        </div>

        {/* COL 2: CAPTURE, PTZ & PRESETS */}
        <div className="flex flex-col space-y-5 min-h-0">
          <div className={`flex flex-col gap-3 ${panelInner}`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              Capture
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleRecording}
                className={`py-5 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all ${
                  isRecording
                    ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,53,69,0.5)]"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {isRecording ? (
                  <Square fill="currentColor" size={24} />
                ) : (
                  <Video size={24} />
                )}
                {isRecording ? formatTime(recordingTime) : "REC"}
              </button>
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`py-5 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all ${
                  isMuted
                    ? "bg-orange-600 text-white"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}{" "}
                {isMuted ? "MUTE" : "ON"}
              </button>
            </div>
          </div>

          <div className={`flex flex-col gap-4 ${panelInner} flex-1 min-h-0`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              PTZ & Presets
            </div>

            <div className="flex flex-col items-center justify-center space-y-4 flex-1 min-h-0 py-2">
              <div className="grid grid-cols-3 grid-rows-3 gap-2 w-48 h-48 shrink-0">
                <div />
                <button
                  onTouchStart={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 50)
                  }
                  onTouchEnd={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                  }
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                  }
                  className={`${btnBase} !rounded-lg`}
                >
                  <MoveUp size={32} />
                </button>
                <div />
                <button
                  onTouchStart={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 50)
                  }
                  onTouchEnd={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                  }
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                  }
                  className={`${btnBase} !rounded-lg`}
                >
                  <MoveLeft size={32} />
                </button>
                <button
                  onClick={() => {
                    sendOSC("/OBSBOT/WebCam/General/ResetGimbal", 1);
                    sendOSC("/OBSBOT/WebCam/General/SetZoom", 0);
                    setZoomLevel(0);
                  }}
                  className={`${btnBase} !bg-zinc-700 !rounded-lg`}
                >
                  <Target size={28} />
                </button>
                <button
                  onTouchStart={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 50)
                  }
                  onTouchEnd={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 0)
                  }
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 0)
                  }
                  className={`${btnBase} !rounded-lg`}
                >
                  <MoveRight size={32} />
                </button>
                <div />
                <button
                  onTouchStart={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 50)
                  }
                  onTouchEnd={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                  }
                  onMouseDown={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 50)
                  }
                  onMouseUp={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                  }
                  onMouseLeave={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                  }
                  className={`${btnBase} !rounded-lg`}
                >
                  <MoveDown size={32} />
                </button>
                <div />
              </div>

              <div className="grid grid-cols-[auto_1fr_auto] items-center w-full max-w-[240px] bg-zinc-900 rounded-full px-4 py-2.5 shadow-inner border border-zinc-800 shrink-0 gap-3 mt-1">
                <Minus size={20} className="text-zinc-500 shrink-0" />
                <input
                  type="range"
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
                  className="w-full h-2 appearance-none bg-zinc-800 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
                />
                <Plus size={20} className="text-zinc-500 shrink-0" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-auto pt-2 border-t border-zinc-800/80">
              {[1, 2, 3].map((preset) => (
                <button
                  key={preset}
                  onTouchStart={() => handlePresetDown(preset)}
                  onTouchEnd={() => handlePresetUp(preset)}
                  onMouseDown={() => handlePresetDown(preset)}
                  onMouseUp={() => handlePresetUp(preset)}
                  onMouseLeave={() => clearTimeout(holdTimerRef.current)}
                  className={`${btnBase} py-4 text-base flex-row !gap-1.5 transition-all ${
                    savingPreset === preset ? "!bg-green-600 !text-white" : ""
                  }`}
                >
                  <Bookmark
                    size={18}
                    fill={savingPreset === preset ? "white" : "transparent"}
                  />
                  {savingPreset === preset ? "SAVED" : `P${preset}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
