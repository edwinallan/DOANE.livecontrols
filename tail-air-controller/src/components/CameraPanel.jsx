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

  const btnBase =
    "bg-zinc-800 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 active:bg-zinc-600 active:scale-95 transition-all flex items-center justify-center gap-2 flex-col select-none touch-manipulation";
  const btnActive =
    "!bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]";
  const panelInner =
    "bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shrink-0";

  return (
    <div className="flex-1 bg-zinc-900 rounded-3xl p-5 flex flex-col space-y-5 border border-zinc-800 shadow-xl overflow-y-auto min-h-0">
      <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shrink-0">
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
            className={`py-4 text-lg tracking-wide rounded-xl font-black transition-all ${
              selectedCams.includes(cam)
                ? btnActive
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {cam}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5 flex-1 min-h-0">
        {/* COL 1: AI TRACKING & COLOR */}
        <div className="flex flex-col space-y-5 min-h-0">
          <div className={`flex flex-col gap-4 ${panelInner} flex-1`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              AI Tracking
            </div>

            {/* AI Speeds & OFF: 4-column grid */}
            <div className="grid grid-cols-4 gap-2 shrink-0">
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0)}
                className={`${btnBase} py-3 text-sm !bg-red-950/40 !text-red-400 border border-red-900/50`}
              >
                OFF
              </button>
              {["Slow", "Norm", "Fast"].map((speed, idx) => (
                <button
                  key={speed}
                  onClick={() =>
                    sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", idx)
                  }
                  className={`${btnBase} py-3 text-sm`}
                >
                  {speed}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-auto pb-4 border-b border-zinc-800/80">
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 1)}
                className={`${btnBase} py-4 text-xs`}
              >
                <Focus size={28} className="text-blue-400 mb-1" /> AUTO
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 2)}
                className={`${btnBase} py-4 text-xs`}
              >
                <MonitorUp size={28} className="text-blue-400 mb-1" /> UPPER
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 3)}
                className={`${btnBase} py-4 text-xs`}
              >
                <User size={28} className="text-blue-400 mb-1" /> CLOSE
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 7)}
                className={`${btnBase} py-4 text-xs`}
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
                className={`${btnBase} py-4 text-xs`}
              >
                <Lightbulb size={28} className="text-amber-400 mb-1" /> TUNGSTEN
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className={`${btnBase} py-4 text-xs`}
              >
                <Aperture size={28} className="text-white mb-1" /> AUTO
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
                }
                className={`${btnBase} py-4 text-xs`}
              >
                <Sun size={28} className="text-orange-500 mb-1" /> DAY
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
                }
                className={`${btnBase} py-4 text-xs`}
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
                {/* UP */}
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
                {/* LEFT */}
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
                {/* CENTER / RESET */}
                <button
                  onClick={() =>
                    sendOSC("/OBSBOT/WebCam/General/ResetGimbal", 1)
                  }
                  className={`${btnBase} !bg-zinc-700 !rounded-lg`}
                >
                  <Target size={28} />
                </button>
                {/* RIGHT */}
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
                {/* DOWN */}
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
