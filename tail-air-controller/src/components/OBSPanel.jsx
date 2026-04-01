import React from "react";

export default function OBSPanel({
  state,
  obsScreenshot,
  handleSceneChange,
  updateAutoSwitch,
  handleToggleStream,
}) {
  const {
    obsConnected,
    sourcesConnected,
    activeScene,
    autoSwitch,
    isStreaming,
  } = state;
  const btnBase =
    "p-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-sm";

  return (
    <div className="flex flex-col w-[350px] min-w-[350px] bg-zinc-900 rounded-2xl p-4 gap-4 border border-zinc-800 shadow-lg h-full overflow-y-auto">
      {/* OBS PREVIEW IMAGE */}
      <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative border border-zinc-700 shadow-inner flex items-center justify-center">
        {obsScreenshot ? (
          <img
            src={obsScreenshot}
            alt="OBS Program"
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-zinc-600 text-xs font-bold uppercase tracking-widest">
            No Signal
          </span>
        )}
        <div
          className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${obsConnected ? "bg-green-500 shadow-[0_0_8px_#28a745]" : "bg-red-500"}`}
        ></div>
      </div>

      <div className="flex gap-1.5">
        {["Tail A", "Tail B", "Mobile SRT"].map((src) => (
          <div
            key={src}
            className={`text-[10px] py-1 px-2 rounded font-bold text-center flex-1 ${sourcesConnected[src] ? "bg-green-600" : "bg-red-600"}`}
          >
            {src.replace(" SRT", "")}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {["CAM 1", "CAM 2", "Mobile"].map((scene) => (
          <button
            key={scene}
            onClick={() => handleSceneChange(scene)}
            className={`${btnBase} ${activeScene === scene ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}`}
          >
            {scene}
          </button>
        ))}
      </div>

      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col gap-3">
        <label className="flex justify-between items-center cursor-pointer">
          <span className="text-sm">Random Auto Switch</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSwitch.enabled}
              onChange={(e) => updateAutoSwitch({ enabled: e.target.checked })}
            />
            <div className="w-10 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4"></div>
          </div>
        </label>

        <div className="flex flex-col w-full">
          <div className="flex justify-between text-[10px] mb-1.5 text-zinc-400">
            <span>MIN: {autoSwitch.min}s</span>
            <span>MAX: {autoSwitch.max}s</span>
          </div>
          <div className="relative w-full h-5">
            <div className="absolute w-full h-1.5 bg-zinc-700 rounded-md top-1.5 pointer-events-none"></div>
            <input
              type="range"
              min="1"
              max="120"
              value={autoSwitch.min}
              onChange={(e) =>
                updateAutoSwitch({
                  min: Math.min(Number(e.target.value), autoSwitch.max - 1),
                })
              }
              className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:mt-[-2px] top-0"
            />
            <input
              type="range"
              min="1"
              max="120"
              value={autoSwitch.max}
              onChange={(e) =>
                updateAutoSwitch({
                  max: Math.max(Number(e.target.value), autoSwitch.min + 1),
                })
              }
              className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:mt-[-2px] top-0"
            />
          </div>
        </div>

        <label className="flex justify-between items-center cursor-pointer border-t border-zinc-800 pt-3">
          <span className="text-xs">Force Mobile on connect</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSwitch.mobile}
              onChange={(e) => updateAutoSwitch({ mobile: e.target.checked })}
            />
            <div className="w-10 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4"></div>
          </div>
        </label>
      </div>

      <div className="mt-auto">
        <button
          onClick={handleToggleStream}
          className={`${btnBase} w-full py-4 ${isStreaming ? "bg-red-600 text-white shadow-[0_0_15px_rgba(220,53,69,0.5)]" : "bg-zinc-800 text-zinc-200"}`}
        >
          <span className="text-base font-bold">
            {isStreaming ? "STOP STREAMING" : "START STREAMING"}
          </span>
        </button>
      </div>
    </div>
  );
}
