import React from "react";
import { ChevronUp, ChevronDown, Radio, ImageOff } from "lucide-react";

// Robust SVG Data URI for the offline static effect (No need to host or bundle images)
const staticGlitch =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

export default function OBSPanel({
  state,
  obsScreenshots,
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

  const SceneButton = ({ sceneName, displayName, sourceKey, spanCol }) => {
    const isOnline = sourcesConnected[sourceKey];
    const bgImage =
      isOnline && obsScreenshots[sceneName]
        ? obsScreenshots[sceneName]
        : staticGlitch;
    const isActive = activeScene === sceneName;

    return (
      <button
        onClick={() => isOnline && handleSceneChange(sceneName)}
        disabled={!isOnline}
        className={`relative w-full aspect-video bg-zinc-800 rounded-xl overflow-hidden border-2 transition-all group shrink-0 ${
          spanCol ? "col-span-2" : "col-span-1"
        } ${isActive ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]" : "border-zinc-700 hover:border-zinc-500"} ${
          !isOnline ? "opacity-50 grayscale cursor-not-allowed" : ""
        }`}
      >
        {bgImage ? (
          <img
            src={bgImage}
            alt={displayName}
            className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
            draggable={false}
            onError={(e) => (e.target.style.display = "none")}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
            <ImageOff size={32} />
          </div>
        )}

        <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10">
          <div
            className={`w-2.5 h-2.5 rounded-full shadow-lg shrink-0 ${
              isOnline
                ? "bg-green-500 shadow-[0_0_8px_#22c55e]"
                : "bg-red-500 shadow-[0_0_8px_#ef4444]"
            }`}
          ></div>
          <span className="text-xs font-bold text-white drop-shadow-md truncate">
            {displayName}
          </span>
        </div>
      </button>
    );
  };

  const adjustSwitchTime = (key, delta) => {
    let newVal = autoSwitch[key] + delta;
    if (key === "min") {
      newVal = Math.max(1, Math.min(newVal, autoSwitch.max - 1));
    } else {
      newVal = Math.max(autoSwitch.min + 1, Math.min(newVal, 120));
    }
    updateAutoSwitch({ [key]: newVal });
  };

  return (
    <div className="flex flex-col w-[380px] min-w-[380px] bg-zinc-900 rounded-3xl p-5 gap-5 border border-zinc-800 shadow-xl h-full shrink-0 overflow-y-auto">
      <div className="flex justify-between items-center px-1 shrink-0">
        <h2 className="text-xl font-bold flex items-center gap-2">
          DOANE.live
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 shrink-0">
        <SceneButton
          sceneName="CAM 1"
          displayName="Tail A"
          sourceKey="Tail A"
        />
        <SceneButton
          sceneName="CAM 2"
          displayName="Tail B"
          sourceKey="Tail B"
        />
        <SceneButton
          sceneName="Mobile"
          displayName="Mobile Full"
          sourceKey="Mobile SRT"
          spanCol
        />
      </div>

      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800/80 flex flex-col gap-4 shrink-0 mt-2">
        <div className="flex justify-between items-center">
          <span className="text-base font-semibold text-zinc-200">
            Auto Switch
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSwitch.enabled}
              onChange={(e) => updateAutoSwitch({ enabled: e.target.checked })}
            />
            <div className="w-12 h-7 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-5"></div>
          </label>
        </div>

        <div className="flex justify-around items-center bg-zinc-900 p-3 rounded-xl border border-zinc-800">
          <div className="flex flex-col items-center">
            <button
              onClick={() => adjustSwitchTime("min", 1)}
              className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 mb-1"
            >
              <ChevronUp size={24} />
            </button>
            <span className="text-lg font-bold font-mono">
              {autoSwitch.min}s
            </span>
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
              Min
            </span>
            <button
              onClick={() => adjustSwitchTime("min", -1)}
              className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 mt-1"
            >
              <ChevronDown size={24} />
            </button>
          </div>
          <div className="flex flex-col items-center">
            <button
              onClick={() => adjustSwitchTime("max", 1)}
              className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 mb-1"
            >
              <ChevronUp size={24} />
            </button>
            <span className="text-lg font-bold font-mono">
              {autoSwitch.max}s
            </span>
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
              Max
            </span>
            <button
              onClick={() => adjustSwitchTime("max", -1)}
              className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 mt-1"
            >
              <ChevronDown size={24} />
            </button>
          </div>
        </div>

        <label className="flex justify-between items-center cursor-pointer pt-3 border-t border-zinc-800/80">
          <span className="text-sm font-medium text-zinc-400">
            Auto switch to mobile
          </span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={autoSwitch.mobile}
              onChange={(e) => updateAutoSwitch({ mobile: e.target.checked })}
            />
            <div className="w-12 h-7 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-5"></div>
          </div>
        </label>
      </div>

      <div className="mt-auto pt-4 shrink-0">
        <button
          onClick={handleToggleStream}
          className={`w-full py-5 rounded-2xl font-black text-lg tracking-wider transition-all flex justify-center items-center gap-3 ${
            isStreaming
              ? "bg-red-600 text-white shadow-[0_0_20px_rgba(220,53,69,0.5)]"
              : "bg-zinc-800 text-zinc-200"
          }`}
        >
          <Radio size={24} className={isStreaming ? "animate-pulse" : ""} />
          {isStreaming ? "STOP STREAMING" : "START STREAMING"}
        </button>
      </div>
    </div>
  );
}
