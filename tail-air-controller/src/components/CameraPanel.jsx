import React, { useState, useEffect, useRef } from "react";
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
  RotateCcw,
  Plus,
  Minus,
  Bookmark,
  Lightbulb,
  PlaySquare,
  Youtube,
  ExternalLink,
} from "lucide-react";

export default function CameraPanel({
  state,
  ytChatMessages,
  handleStartYTStream,
  backendUrl,
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
  const btnBase =
    "bg-zinc-800 text-zinc-200 rounded-xl font-bold hover:bg-zinc-700 active:bg-zinc-600 active:scale-95 transition-all flex items-center justify-center gap-2 flex-col select-none touch-manipulation";
  const btnActive =
    "!bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]";
  const panelInner =
    "bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shrink-0";

  const [streamTitle, setStreamTitle] = useState("");
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [ytChatMessages]);

  return (
    <div className="flex-1 bg-zinc-900 rounded-3xl p-5 flex flex-col gap-5 border border-zinc-800 shadow-xl overflow-y-auto min-h-0">
      <div className="flex bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shrink-0">
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
            className={`flex-1 py-4 text-lg tracking-wide rounded-xl font-black transition-all ${selectedCams.includes(cam) ? btnActive : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {cam}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
        {/* COL 1: AI TRACKING & COLOR */}
        <div className="flex flex-col gap-5 min-h-0">
          <div className={`flex flex-col gap-4 ${panelInner} flex-1`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              AI Tracking
            </div>
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0)}
              className={`${btnBase} py-4 !bg-red-950/40 !text-red-400 border border-red-900/50 shrink-0`}
            >
              <Target size={24} /> DISABLE AI
            </button>
            <div className="flex gap-2 shrink-0">
              {["Slow", "Norm", "Fast"].map((speed, idx) => (
                <button
                  key={speed}
                  onClick={() =>
                    sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", idx)
                  }
                  className={`${btnBase} flex-1 py-3 text-sm`}
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
            <div className="grid grid-cols-2 gap-2 flex-1">
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 0)
                }
                className={btnBase}
              >
                <Lightbulb size={32} className="text-amber-400" /> TUNGSTEN
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
                }
                className={btnBase}
              >
                <Aperture size={32} className="text-white" /> AUTO
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
                }
                className={btnBase}
              >
                <Sun size={32} className="text-orange-500" /> DAY
              </button>
              <button
                onClick={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
                }
                className={btnBase}
              >
                <Cloud size={32} className="text-cyan-400" /> CLOUD
              </button>
            </div>
          </div>
        </div>

        {/* COL 2: CAPTURE, PTZ & PRESETS */}
        <div className="flex flex-col gap-5 min-h-0">
          <div className={`flex flex-col gap-3 ${panelInner}`}>
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              Capture
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleRecording}
                className={`flex-1 py-5 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all ${isRecording ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,53,69,0.5)]" : "bg-zinc-800 text-zinc-300"}`}
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
                className={`flex-1 py-5 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all ${isMuted ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
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
            <div className="flex gap-4 flex-1 items-center justify-center min-h-0 py-2">
              <div className="grid grid-cols-3 grid-rows-3 gap-2 w-48 h-48 shrink-0">
                <div />
                <button
                  onTouchStart={() =>
                    sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 50)
                  }
                  onTouchEnd={() =>
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
                  className={`${btnBase} !rounded-lg`}
                >
                  <MoveLeft size={32} />
                </button>
                <button
                  onClick={() =>
                    sendOSC("/OBSBOT/WebCam/General/ResetGimbal", 1)
                  }
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
                  className={`${btnBase} !rounded-lg`}
                >
                  <MoveDown size={32} />
                </button>
                <div />
              </div>
              <div className="flex flex-col items-center justify-between h-[200px] bg-zinc-900 rounded-2xl py-3 w-16 shadow-inner border border-zinc-800 shrink-0">
                <Plus size={24} className="text-zinc-400 shrink-0" />
                <div className="relative w-10 flex-1 flex items-center justify-center my-2">
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
                    className="absolute w-[120px] h-8 -rotate-90 appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-zinc-800 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-3 [&::-webkit-slider-thumb]:shadow-lg"
                  />
                </div>
                <Minus size={24} className="text-zinc-400 shrink-0" />
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
                  className={`${btnBase} py-4 text-base flex-row !gap-1.5 transition-all ${savingPreset === preset ? "!bg-green-600 !text-white" : ""}`}
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

        {/* COL 3: YOUTUBE PLAYER & CHAT */}
        <div className={`flex flex-col gap-4 ${panelInner} min-h-0`}>
          <div className="flex justify-between items-center shrink-0">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
              Live Community
            </div>
            {!state.ytAuthenticated ? (
              <a
                href={`${backendUrl}/auth/youtube`}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-red-600 px-3 py-1.5 rounded-md font-bold text-white flex items-center gap-1 hover:bg-red-500"
              >
                <Youtube size={14} /> AUTHENTICATE
              </a>
            ) : !state.ytVideoId ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Stream Title..."
                  value={streamTitle}
                  onChange={(e) => setStreamTitle(e.target.value)}
                  className="text-xs bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-zinc-200 outline-none focus:border-blue-500 w-32"
                />
                <button
                  onClick={() =>
                    handleStartYTStream(
                      streamTitle ||
                        `Live Stream - ${new Date().toLocaleDateString()}`,
                    )
                  }
                  className="text-xs bg-blue-600 px-3 py-1.5 rounded-md font-bold text-white flex items-center gap-1 hover:bg-blue-500"
                >
                  <PlaySquare size={14} /> CREATE
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-bold text-zinc-300 max-w-[120px] truncate"
                  title={state.ytStreamTitle}
                >
                  {state.ytStreamTitle}
                </span>
                <a
                  href={`https://youtu.be/${state.ytVideoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded-md font-bold hover:bg-zinc-700 flex items-center gap-1.5 transition-all"
                >
                  <ExternalLink size={14} /> APP
                </a>
                <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1.5 rounded-md font-bold border border-green-500/20 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>{" "}
                  LIVE
                </span>
              </div>
            )}
          </div>

          {state.ytVideoId ? (
            <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shrink-0 border border-zinc-800">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${state.ytVideoId}?autoplay=1&mute=1`}
                title="YouTube Stream"
                frameBorder="0"
                allowFullScreen
              ></iframe>
            </div>
          ) : (
            <div className="w-full aspect-video bg-zinc-900 rounded-xl flex items-center justify-center shrink-0 border border-zinc-800">
              <Youtube size={32} className="text-zinc-700" />
            </div>
          )}

          <div className="flex-1 bg-zinc-900 rounded-xl border border-zinc-800 p-3 overflow-hidden flex flex-col min-h-0">
            <div
              ref={chatRef}
              className="flex-1 overflow-y-auto pr-2 space-y-3 flex flex-col scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
            >
              {ytChatMessages.length === 0 ? (
                <div className="m-auto text-zinc-600 text-sm italic font-medium">
                  No live comments yet...
                </div>
              ) : (
                ytChatMessages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-bold text-zinc-300 mr-2">
                      {msg.authorDetails?.displayName}
                    </span>
                    <span className="text-zinc-400">
                      {msg.snippet?.displayMessage}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
