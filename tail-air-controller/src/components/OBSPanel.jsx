import React from "react";
import { Plus, Minus, Radio, ImageOff } from "lucide-react";
import staticGlitch from "../assets/static-glitch.gif";

const SceneButton = ({
  sceneName,
  displayName,
  sourceKey,
  spanCol,
  isOnline,
  isActive,
  screenshot,
  handleSceneChange,
}) => {
  const bgImage = isOnline && screenshot ? screenshot : staticGlitch;

  return (
    <button
      onClick={() => isOnline && handleSceneChange(sceneName)}
      disabled={!isOnline}
      className={`relative w-full block h-0 pb-[56.25%] bg-zinc-800 rounded-xl overflow-hidden border-2 transition-all group shrink-0 ${
        spanCol ? "col-span-2" : "col-span-1"
      } ${
        isActive
          ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]"
          : "border-zinc-700 hover:border-zinc-500"
      } ${!isOnline ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
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
          isOnline={sourcesConnected["Tail A"]}
          isActive={activeScene === "CAM 1"}
          screenshot={obsScreenshots["CAM 1"]}
          handleSceneChange={handleSceneChange}
        />
        <SceneButton
          sceneName="CAM 2"
          displayName="Tail B"
          sourceKey="Tail B"
          isOnline={sourcesConnected["Tail B"]}
          isActive={activeScene === "CAM 2"}
          screenshot={obsScreenshots["CAM 2"]}
          handleSceneChange={handleSceneChange}
        />
        <SceneButton
          sceneName="Mobile"
          displayName="Mobile Full"
          sourceKey="Mobile SRT"
          spanCol
          isOnline={sourcesConnected["Mobile SRT"]}
          isActive={activeScene === "Mobile"}
          screenshot={obsScreenshots["Mobile"]}
          handleSceneChange={handleSceneChange}
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

        {/* HORIZONTAL MIN/MAX CONTROLS */}
        <div className="flex flex-col w-full gap-2">
          <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest pl-1">
              Min
            </span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => adjustSwitchTime("min", -1)}
                className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
              >
                <Minus size={18} />
              </button>
              <span className="text-base font-bold font-mono w-8 text-center">
                {autoSwitch.min}s
              </span>
              <button
                onClick={() => adjustSwitchTime("min", 1)}
                className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest pl-1">
              Max
            </span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => adjustSwitchTime("max", -1)}
                className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
              >
                <Minus size={18} />
              </button>
              <span className="text-base font-bold font-mono w-8 text-center">
                {autoSwitch.max}s
              </span>
              <button
                onClick={() => adjustSwitchTime("max", 1)}
                className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
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
