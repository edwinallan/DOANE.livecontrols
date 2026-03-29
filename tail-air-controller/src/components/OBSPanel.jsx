import React from "react";

export default function OBSPanel({
  obsConnected,
  sourcesConnected,
  activeScene,
  handleSceneChange,
  autoSwitch,
  setAutoSwitch,
  switchMin,
  setSwitchMin,
  switchMax,
  setSwitchMax,
  autoSwitchMobile,
  setAutoSwitchMobile,
  isStreaming,
  streamBitrate,
  handleToggleStream,
}) {
  const btnBase =
    "p-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-sm";

  return (
    <div className="flex-1 min-w-[300px] bg-zinc-900 rounded-2xl p-6 flex flex-col gap-5 border border-zinc-800 shadow-lg">
      <div className="flex justify-between items-center">
        <div className="text-xs uppercase tracking-widest text-zinc-400 font-bold">
          OBS Controls
        </div>
        <div className="text-xs text-zinc-400 flex items-center">
          <span
            className={`w-2.5 h-2.5 rounded-full inline-block mr-2 ${obsConnected ? "bg-green-500 shadow-[0_0_8px_#28a745]" : "bg-red-500 shadow-[0_0_8px_#dc3545]"}`}
          ></span>
          {obsConnected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <div className="flex gap-1.5 mb-2">
        {["Tail A", "Tail B", "Mobile SRT"].map((src) => (
          <div
            key={src}
            className={`text-[10px] py-1 px-2 rounded font-bold text-center flex-1 ${sourcesConnected[src] ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
          >
            {src.replace(" SRT", "")}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {["CAM 1", "CAM 2", "Mobile"].map((scene) => (
          <button
            key={scene}
            onClick={() => handleSceneChange(scene)}
            className={`${btnBase} ${activeScene === scene ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 active:scale-95"}`}
          >
            {scene}
          </button>
        ))}
      </div>

      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col gap-4">
        <label className="flex justify-between items-center cursor-pointer">
          <span className="text-sm">Random Auto Switch</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSwitch}
              onChange={(e) => setAutoSwitch(e.target.checked)}
            />
            <div className="w-10 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4"></div>
          </div>
        </label>

        <div className="flex flex-col w-full mt-2">
          <div className="flex justify-between text-[10px] mb-1.5 text-zinc-400">
            <span>MIN: {switchMin}s</span>
            <span>MAX: {switchMax}s</span>
          </div>

          <div className="relative w-full h-5">
            {/* Base track */}
            <div className="absolute w-full h-1.5 bg-zinc-700 rounded-md top-1.5 pointer-events-none"></div>
            {/* Sliders */}
            <input
              type="range"
              min="1"
              max="120"
              value={switchMin}
              className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:mt-[-2px] top-0"
              onChange={(e) =>
                setSwitchMin(Math.min(Number(e.target.value), switchMax - 1))
              }
            />
            <input
              type="range"
              min="1"
              max="120"
              value={switchMax}
              className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:mt-[-2px] top-0"
              onChange={(e) =>
                setSwitchMax(Math.max(Number(e.target.value), switchMin + 1))
              }
            />
          </div>
        </div>

        <label className="flex justify-between items-center cursor-pointer border-t border-zinc-800 pt-4 mt-2">
          <span className="text-[13px]">Force Mobile on connect</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSwitchMobile}
              onChange={(e) => setAutoSwitchMobile(e.target.checked)}
            />
            <div className="w-10 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4"></div>
          </div>
        </label>
      </div>

      <div className="mt-auto">
        <button
          onClick={handleToggleStream}
          className={`${btnBase} w-full flex-col !gap-0.5 p-4 ${isStreaming ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,53,69,0.5)] hover:bg-red-700" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
        >
          <span className="text-base font-bold">
            {isStreaming ? "STOP STREAMING" : "START STREAMING"}
          </span>
          {isStreaming && (
            <span className="text-xs font-normal text-red-100">
              {streamBitrate} kbps
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
