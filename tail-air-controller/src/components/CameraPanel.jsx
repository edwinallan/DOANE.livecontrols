import React from "react";
import {
  IconAuto,
  IconTrackingUpper,
  IconTrackingCloseup,
  IconTrackingGroup,
  IconTungsten,
  IconSun,
  IconCloudy,
  IconMute,
} from "../icons";

export default function CameraPanel({
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
    "bg-zinc-800 text-zinc-200 p-4 rounded-lg font-bold hover:bg-zinc-700 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-2 text-sm";
  const btnActive =
    "!bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]";
  const btnRound =
    "bg-zinc-800 text-zinc-200 rounded-full w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 p-0 flex items-center justify-center hover:bg-zinc-700 active:scale-95 transition-all";
  const panelInner = "bg-zinc-950 p-4 rounded-xl border border-zinc-800";

  return (
    <div className="flex-[2] min-w-[500px] bg-zinc-900 rounded-2xl p-6 flex flex-col gap-5 border border-zinc-800 shadow-lg">
      {/* Camera Tabs */}
      <div className={`flex gap-2.5 p-2 ${panelInner}`}>
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
            className={`${btnBase} flex-1 !p-3 ${selectedCams.includes(cam) ? btnActive : ""}`}
          >
            {cam}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5 h-full">
        {/* Tracking */}
        <div className={`flex flex-col gap-2.5 ${panelInner}`}>
          <div className="text-xs uppercase tracking-widest text-zinc-400 font-bold mb-2">
            AI Tracking
          </div>
          <button
            onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 0)}
            className={btnBase}
          >
            DISABLE AI
          </button>

          <div className="flex gap-2">
            {["Slow", "Norm", "Fast"].map((speed, idx) => (
              <button
                key={speed}
                onClick={() =>
                  sendOSC("/OBSBOT/Camera/TailAir/SetTrackingSpeed", idx)
                }
                className={`${btnBase} flex-1 !p-2 !text-xs`}
              >
                {speed}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-auto">
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 1)}
              className={`${btnBase} flex-col !p-2 !text-xs`}
            >
              <IconAuto width="20" fill="#3b82f6" /> AUTO
            </button>
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 2)}
              className={`${btnBase} flex-col !p-2 !text-xs`}
            >
              <IconTrackingUpper width="20" fill="#3b82f6" /> UPPER
            </button>
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 3)}
              className={`${btnBase} flex-col !p-2 !text-xs`}
            >
              <IconTrackingCloseup width="20" fill="#3b82f6" /> CLOSE
            </button>
            <button
              onClick={() => sendOSC("/OBSBOT/Camera/TailAir/SetAiMode", 7)}
              className={`${btnBase} flex-col !p-2 !text-xs`}
            >
              <IconTrackingGroup width="20" fill="#3b82f6" /> GROUP
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="flex flex-col gap-2.5">
          <div className={`flex justify-between items-center ${panelInner}`}>
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm">Record</span>
              {isRecording && (
                <span className="text-xs text-red-500 font-bold">
                  {formatTime(recordingTime)}
                </span>
              )}
            </div>
            <button
              onClick={toggleRecording}
              className={`${btnRound} ${isRecording ? "!bg-red-600 !text-white shadow-[0_0_15px_rgba(220,53,69,0.6)]" : ""}`}
            >
              {isRecording ? "⬛" : "⏺"}
            </button>
          </div>

          <div className={`flex justify-between items-center ${panelInner}`}>
            <span className="text-sm">Cam Audio</span>
            <button onClick={() => setIsMuted(!isMuted)} className={btnRound}>
              <IconMute width="18" fill={isMuted ? "#ef4444" : "#fff"} />
            </button>
          </div>

          <div className={`grid grid-cols-2 gap-2 flex-1 ${panelInner}`}>
            <button
              onClick={() =>
                sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 0)
              }
              className={`${btnBase} !p-2`}
            >
              <IconTungsten width="36" fill="#fbbf24" />
            </button>
            <button
              onClick={() =>
                sendOSC("/OBSBOT/WebCam/General/SetAutoWhiteBalance", 1)
              }
              className={`${btnBase} !p-2`}
            >
              <IconAuto width="36" fill="#fff" />
            </button>
            <button
              onClick={() =>
                sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 5500)
              }
              className={`${btnBase} !p-2`}
            >
              <IconSun width="36" fill="#f97316" />
            </button>
            <button
              onClick={() =>
                sendOSC("/OBSBOT/WebCam/General/SetColorTemperature", 6500)
              }
              className={`${btnBase} !p-2`}
            >
              <IconCloudy width="36" fill="#22d3ee" />
            </button>
          </div>
        </div>

        {/* PTZ & Presets */}
        <div className={`flex flex-col justify-between ${panelInner}`}>
          <div className="text-xs uppercase tracking-widest text-zinc-400 font-bold w-full mb-4">
            PTZ & Zoom
          </div>

          <div className="flex justify-between w-full px-2">
            <div className="grid grid-cols-[repeat(3,44px)] grid-rows-[repeat(3,44px)] gap-1.5 justify-center">
              <div />
              <button
                onMouseDown={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 50)
                }
                onMouseUp={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                }
                onMouseLeave={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalUp", 0)
                }
                className={btnRound}
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
                onMouseLeave={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalLeft", 0)
                }
                className={btnRound}
              >
                ◀
              </button>
              <button
                onClick={() => sendOSC("/OBSBOT/WebCam/General/ResetGimbal", 1)}
                className={`${btnRound} ${btnActive}`}
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
                onMouseLeave={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalRight", 0)
                }
                className={btnRound}
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
                onMouseLeave={() =>
                  sendOSC("/OBSBOT/WebCam/General/SetGimbalDown", 0)
                }
                className={btnRound}
              >
                ▼
              </button>
              <div />
            </div>

            <div className="flex flex-col items-center justify-center w-auto">
              <span className="text-sm font-bold mb-1">+</span>
              <div className="relative w-5 h-[100px] flex justify-center items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={zoomLevel}
                  className="w-[100px] -rotate-90 cursor-pointer absolute appearance-none bg-transparent [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-zinc-800 [&::-webkit-slider-runnable-track]:rounded-md [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1.5"
                  onChange={(e) => {
                    setZoomLevel(parseInt(e.target.value));
                    sendOSC(
                      "/OBSBOT/WebCam/General/SetZoom",
                      parseInt(e.target.value),
                    );
                  }}
                />
              </div>
              <span className="text-sm font-bold mt-1">-</span>
            </div>
          </div>

          <div className="w-full border-t border-zinc-800 pt-4 mt-4">
            <div className="flex justify-between mb-2">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest">
                Click to Load / Hold 1s to Save
              </span>
            </div>
            <div className="flex gap-2.5 w-full">
              {[1, 2, 3].map((preset) => (
                <button
                  key={preset}
                  onMouseDown={() => handlePresetDown(preset)}
                  onMouseUp={() => handlePresetUp(preset)}
                  onMouseLeave={() => clearTimeout(holdTimerRef.current)}
                  className={`${btnBase} flex-1 !p-2 !text-xs ${savingPreset === preset ? "!bg-green-600 !text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]" : ""}`}
                >
                  {savingPreset === preset ? "SAVED!" : `P${preset}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
