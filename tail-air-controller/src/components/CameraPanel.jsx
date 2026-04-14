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
  audioMuted, // NEW PROP: state.audioMuted from backend
  toggleMute, // NEW PROP: Function to emit toggle to backend
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

  // Base and Active style strings
  const btnBase =
    "bg-zinc-800 border-[3px] border-transparent text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 active:bg-zinc-600 active:scale-95 transition-all flex items-center justify-center gap-2 flex-col select-none touch-manipulation";
  const btnActive =
    "!bg-blue-600 !border-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]";
  const panelInner =
    "bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shrink-0";

  const getBtnStyle = (valFn, activeClass, defaultClass = "") => {
    const isA = valFn(camConfigs["Tail A"] || {});
    const isB = valFn(camConfigs["Tail B"] || {});

    if (selectedCams.length === 1) {
      const isActive = selectedCams[0] === "Tail A" ? isA : isB;
      return isActive ? activeClass : defaultClass;
    }

    if (isA && isB) return activeClass;
    if (isA || isB)
      return "!bg-zinc-900 !border-dashed !border-[3px] !border-zinc-400 !text-zinc-300 !shadow-none";
    return defaultClass;
  };

  const zoomMixed =
    selectedCams.length === 2 &&
    camConfigs["Tail A"]?.zoom !== camConfigs["Tail B"]?.zoom;
  const thumbFilled =
    "[&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-blue-500";
  const thumbDashed =
    "[&::-webkit-slider-thumb]:bg-zinc-900 [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-dashed [&::-webkit-slider-thumb]:border-zinc-400 [&::-webkit-slider-thumb]:shadow-none";
  const sliderClass = `w-full h-2 appearance-none bg-zinc-800 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full transition-all ${
    zoomMixed ? thumbDashed : thumbFilled
  }`;

  // AUDIO LOGIC: If both selected, default to Tail A's status. If one selected, use it.
  const activeAudioCam = selectedCams.includes("Tail A")
    ? "Tail A"
    : selectedCams.includes("Tail B")
      ? "Tail B"
      : null;

  // Safe check if audioMuted hasn't populated yet
  const isMuted = activeAudioCam
    ? (audioMuted?.[activeAudioCam] ?? true)
    : true;

  return (
    <div className="flex-1 bg-zinc-900 rounded-3xl p-5 flex flex-col space-y-5 border border-zinc-800 shadow-xl overflow-y-auto min-h-0">
      {/* SMART SEGMENTED TAB BAR */}
      <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shrink-0">
        {allOffline ? (
          <button className="w-full py-4 text-lg tracking-wide rounded-xl font-black text-zinc-700 bg-zinc-950 cursor-not-allowed">
            Offline
          </button>
        ) : onlineCams.length === 1 ? (
          <button
            className={`w-full py-4 text-lg tracking-wide rounded-xl font-black ${btnActive} !border-transparent cursor-default`}
          >
            {onlineCams[0]}
          </button>
        ) : (
          <>
            <button
              onClick={() => setSelectedCams(["Tail A"])}
              className={`flex-1 py-3 text-base tracking-wide rounded-xl font-black transition-all ${
                selectedCams.length === 1 && selectedCams[0] === "Tail A"
                  ? `${btnActive} !border-transparent`
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-[3px] border-transparent"
              }`}
            >
              Tail A
            </button>
            <button
              onClick={() => setSelectedCams(["Tail A", "Tail B"])}
              className={`flex-1 py-3 text-base tracking-wide rounded-xl font-black transition-all ${
                selectedCams.length === 2
                  ? `${btnActive} !border-transparent`
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-[3px] border-transparent"
              }`}
            >
              Tail A & B
            </button>
            <button
              onClick={() => setSelectedCams(["Tail B"])}
              className={`flex-1 py-3 text-base tracking-wide rounded-xl font-black transition-all ${
                selectedCams.length === 1 && selectedCams[0] === "Tail B"
                  ? `${btnActive} !border-transparent`
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-[3px] border-transparent"
              }`}
            >
              Tail B
            </button>
          </>
        )}
      </div>

      {/* Control Grid */}
      <div
        className={`grid grid-cols-2 gap-5 flex-1 min-h-0 transition-opacity duration-300 ${
          allOffline ? "opacity-30 pointer-events-none" : ""
        }`}
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
                className={`${btnBase} py-3 text-sm transition-all ${getBtnStyle(
                  (c) => c.aiMode === 0,
                  "!bg-red-600 !border-red-600 !text-white shadow-[0_0_15px_rgba(220,53,69,0.5)]",
                  "text-red-400 border-[3px] border-transparent hover:bg-red-950/40",
                )}`}
              >
                OFF
              </button>
              {["Slow", "Norm", "Fast"].map((speed, idx) => (
                <button
                  key={speed}
                  onClick={() =>
                    sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", idx)
                  }
                  className={`${btnBase} py-3 text-sm transition-all ${getBtnStyle(
                    (c) => c.trackingSpeed === idx,
                    btnActive,
                  )}`}
                >
                  {speed}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto pb-4 border-b border-zinc-800/80">
              <button
                onClick={() => {
                  sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 1);
                  sendOSC("/OBSBOT/WebCam/General/SetZoom", 0);
                  setZoomLevel(0);
                }}
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.aiMode === 1,
                  btnActive,
                )}`}
              >
                <Focus size={28} className="text-blue-400 mb-1" /> AUTO
              </button>
              <button
                onClick={() => {
                  sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 2);
                  sendOSC("/OBSBOT/WebCam/General/SetZoom", 0);
                  setZoomLevel(0);
                }}
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.aiMode === 2,
                  btnActive,
                )}`}
              >
                <MonitorUp size={28} className="text-blue-400 mb-1" /> UPPER
              </button>
              <button
                onClick={() => {
                  sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 3);
                  sendOSC("/OBSBOT/WebCam/General/SetZoom", 0);
                  setZoomLevel(0);
                }}
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.aiMode === 3,
                  btnActive,
                )}`}
              >
                <User size={28} className="text-blue-400 mb-1" /> CLOSE
              </button>
              <button
                onClick={() => {
                  sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 7);
                  sendOSC("/OBSBOT/WebCam/General/SetZoom", 0);
                  setZoomLevel(0);
                }}
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.aiMode === 7,
                  btnActive,
                )}`}
              >
                <Users size={28} className="text-blue-400 mb-1" /> GROUP
              </button>
            </div>

            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black mt-2">
              Color
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 3200)
                }
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.wbMode === 0 && c.colorTemp === 3200,
                  btnActive,
                )}`}
              >
                <Lightbulb size={28} className="text-amber-400 mb-1" /> TUNGSTEN
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.wbMode === 1,
                  btnActive,
                )}`}
              >
                <Aperture size={28} className="text-white mb-1" /> AUTO
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
                }
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.wbMode === 0 && c.colorTemp === 5500,
                  btnActive,
                )}`}
              >
                <Sun size={28} className="text-orange-500 mb-1" /> DAY
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
                }
                className={`${btnBase} py-4 text-xs ${getBtnStyle(
                  (c) => c.wbMode === 0 && c.colorTemp === 6500,
                  btnActive,
                )}`}
              >
                <Cloud size={28} className="text-cyan-400 mb-1" /> CLOUD
              </button>
            </div>

            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black mt-3">
              Exposure
            </div>
            <div className="grid grid-cols-5 gap-1 mt-auto">
              {[
                { label: "-3", val: -30 },
                { label: "-1.5", val: -15 },
                { label: "0", val: 0 },
                { label: "+1.5", val: 15 },
                { label: "+3", val: 30 },
              ].map((btn) => (
                <button
                  key={btn.val}
                  onClick={() =>
                    sendOSC(
                      "/OBSBOT/WebCam/General/SetExposureCompensate",
                      btn.val,
                    )
                  }
                  className={`${btnBase} py-2 text-[11px] sm:text-xs transition-all ${getBtnStyle(
                    (c) => (c.expComp ?? 0) === btn.val,
                    btnActive,
                  )}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* COL 2: CAPTURE, PTZ & PRESETS */}
        <div className="flex flex-col space-y-5 min-h-0">
          <div className={`flex flex-col gap-3 ${panelInner}`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              Capture
            </div>
            {/* UPDATED REC AND MUTE BUTTONS */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleRecording}
                className={`py-4 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all ${
                  isRecording
                    ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,53,69,0.5)]"
                    : "bg-zinc-800 text-zinc-300 border-[3px] border-transparent"
                }`}
              >
                {isRecording ? (
                  <Square fill="currentColor" size={20} />
                ) : (
                  <Video size={20} />
                )}
                {isRecording ? formatTime(recordingTime) : "REC"}
              </button>
              <button
                onClick={() => {
                  if (activeAudioCam) toggleMute(activeAudioCam);
                }}
                disabled={!activeAudioCam}
                className={`py-4 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all ${
                  !isMuted
                    ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                    : "bg-zinc-800 text-zinc-500 border-[3px] border-transparent"
                } ${!activeAudioCam ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {!isMuted ? <Mic size={20} /> : <MicOff size={20} />}
                {!isMuted ? "ON" : "MUTED"}
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
                    sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0);
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
                    const val = parseInt(e.target.value);
                    setZoomLevel(val);
                    sendOSC("/OBSBOT/WebCam/General/SetZoom", val);
                    sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0);
                  }}
                  className={sliderClass}
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
                    savingPreset === preset
                      ? "!bg-green-600 !border-green-600 !text-white"
                      : ""
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
