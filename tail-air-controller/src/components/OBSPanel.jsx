import React, { useState, useRef } from "react";
import { Plus, Minus, Radio, ImageOff } from "lucide-react";
import staticGlitch from "../assets/static-glitch.gif";
import CameraPreview from "./CameraPreview";

const SceneButton = ({
  sceneName,
  displayName,
  sourceKey,
  spanCol,
  isOnline,
  isActive,
  screenshot,
  syncOffset,
  handleSceneChange,
  onLongPress,
}) => {
  const bgImage = isOnline && screenshot ? screenshot : staticGlitch;

  const pressTimer = useRef(null);
  const isLongPress = useRef(false);
  const isTouch = useRef(false);

  const handlePressStart = (e) => {
    if (!isOnline) return;

    if (e.type.startsWith("touch")) {
      isTouch.current = true;
    } else if (e.type === "mousedown") {
      if (isTouch.current) return;
      if (e.button !== 0) return;
    }

    if (pressTimer.current) clearTimeout(pressTimer.current);
    isLongPress.current = false;

    pressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress({ sceneName, displayName });
    }, 600);
  };

  const handlePressEnd = (e) => {
    if (e.type === "mouseup" && isTouch.current) return;

    if (pressTimer.current) clearTimeout(pressTimer.current);

    if (!isLongPress.current && isOnline) {
      handleSceneChange(sceneName);
    }
  };

  const handleCancel = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <button
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchMove={handleCancel}
      onTouchCancel={handleCancel}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handleCancel}
      onContextMenu={(e) => e.preventDefault()}
      disabled={!isOnline}
      style={{
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      className={`relative w-full block h-0 pb-[56.25%] bg-zinc-800 rounded-xl overflow-hidden border-2 transition-all group shrink-0 select-none ${
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
          className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none"
          draggable={false}
          onError={(e) => (e.target.style.display = "none")}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <ImageOff size={32} />
        </div>
      )}

      {/* TOP LEFT: Camera Name Badge */}
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 pointer-events-none">
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

      {/* BOTTOM RIGHT: A/V Sync Offset Badge */}
      {isOnline && syncOffset !== null && syncOffset !== undefined && (
        <div
          className={`absolute bottom-2 right-2 backdrop-blur-md px-1 py-[2px] rounded-[3px] text-[9px] tracking-tight font-mono border shadow-md pointer-events-none ${
            syncOffset === 0
              ? "bg-blue-600/90 text-white border-blue-400/50"
              : "bg-black/80 text-zinc-300 border-white/10"
          }`}
        >
          {syncOffset === 0 ? "MASTER" : `+${syncOffset}ms`}
        </div>
      )}
    </button>
  );
};

export default function OBSPanel({
  state,
  obsScreenshots,
  handleSceneChange,
  updateAutoSwitch,
  handleToggleStream,
  modemStats = { battery: 0, charging: false, signal: 0 },
  isConnected,
  triggerSync,
  triggerBeepSync,
  syncStatus,
  syncMessage,
  handleStartPreview,
  handleStopPreview,
}) {
  const {
    obsConnected,
    sourcesConnected,
    activeScene,
    autoSwitch,
    isStreaming,
    syncOffsets = {},
  } = state;

  const [previewData, setPreviewData] = useState(null);

  const adjustSwitchTime = (key, delta) => {
    let newVal = autoSwitch[key] + delta;
    if (key === "min") {
      newVal = Math.max(1, Math.min(newVal, autoSwitch.max - 1));
    } else {
      newVal = Math.max(autoSwitch.min + 1, Math.min(newVal, 120));
    }
    updateAutoSwitch({ [key]: newVal });
  };

  const handleLongPress = (data) => {
    setPreviewData(data);
    if (handleStartPreview) handleStartPreview(data.sceneName);
  };

  const closePreview = () => {
    setPreviewData(null);
    if (handleStopPreview) handleStopPreview();
  };

  return (
    <>
      <div className="flex flex-col w-[380px] min-w-[380px] bg-zinc-900 rounded-3xl p-5 gap-5 border border-zinc-800 shadow-xl h-full shrink-0 overflow-y-auto relative">
        {/* HEADER SECTION */}
        <div className="flex justify-between items-center bg-zinc-950 rounded-xl px-4 py-3 border border-zinc-800/80 shadow-sm shrink-0">
          <h1 className="text-xl font-bold tracking-widest text-zinc-100 uppercase">
            DOANE<span className="text-zinc-500 font-light">.live</span>
          </h1>

          {isConnected && (
            <div className="flex items-center gap-3">
              <div className="flex items-end gap-[2px] h-3.5">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div
                    key={bar}
                    className={`w-1 rounded-sm ${bar <= modemStats.signal ? "bg-green-500" : "bg-zinc-700"}`}
                    style={{ height: `${bar * 20}%` }}
                  />
                ))}
              </div>
              <div className="w-[1px] h-3.5 bg-zinc-700" />
              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-300">
                <span>{modemStats.battery}%</span>
                <div
                  className={`relative w-5 h-2.5 border rounded-[2px] p-[1px] ${modemStats.battery <= 20 && !modemStats.charging ? "border-red-500" : "border-zinc-400"}`}
                >
                  <div
                    className={`h-full rounded-[1px] ${modemStats.charging ? "bg-green-500" : modemStats.battery <= 20 ? "bg-red-500" : "bg-white"}`}
                    style={{ width: `${modemStats.battery}%` }}
                  />
                  <div
                    className={`absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-1.5 rounded-r-[1px] ${modemStats.battery <= 20 && !modemStats.charging ? "bg-red-500" : "bg-zinc-400"}`}
                  />
                </div>
                {modemStats.charging && (
                  <span className="text-green-500 text-[10px] ml-0.5">⚡</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* SCENE BUTTONS */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <SceneButton
            sceneName="CAM 1"
            displayName="Tail A"
            sourceKey="Tail A"
            isOnline={sourcesConnected["Tail A"]}
            isActive={activeScene === "CAM 1"}
            screenshot={obsScreenshots["CAM 1"]}
            syncOffset={syncOffsets["Tail A"]}
            handleSceneChange={handleSceneChange}
            onLongPress={handleLongPress}
          />
          <SceneButton
            sceneName="CAM 2"
            displayName="Tail B"
            sourceKey="Tail B"
            isOnline={sourcesConnected["Tail B"]}
            isActive={activeScene === "CAM 2"}
            screenshot={obsScreenshots["CAM 2"]}
            syncOffset={syncOffsets["Tail B"]}
            handleSceneChange={handleSceneChange}
            onLongPress={handleLongPress}
          />
          <SceneButton
            sceneName="Mobile"
            displayName="Mobile Full"
            sourceKey="Mobile SRT"
            spanCol
            isOnline={sourcesConnected["Mobile SRT"]}
            isActive={activeScene === "Mobile"}
            screenshot={obsScreenshots["Mobile"]}
            syncOffset={syncOffsets["Mobile SRT"]}
            handleSceneChange={handleSceneChange}
            onLongPress={handleLongPress}
          />
        </div>

        {/* AUTO SWITCH & SYNC SECTION */}
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
                onChange={(e) =>
                  updateAutoSwitch({ enabled: e.target.checked })
                }
              />
              <div className="w-12 h-7 bg-zinc-700 rounded-full peer peer-checked:bg-blue-600 transition-all after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:translate-x-5"></div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="flex flex-col items-center bg-zinc-900 p-2 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">
                Min (s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustSwitchTime("min", -1)}
                  className="p-1 bg-zinc-800 rounded hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="text-sm font-bold font-mono w-6 text-center">
                  {autoSwitch.min}
                </span>
                <button
                  onClick={() => adjustSwitchTime("min", 1)}
                  className="p-1 bg-zinc-800 rounded hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center bg-zinc-900 p-2 rounded-xl border border-zinc-800">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-1">
                Max (s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjustSwitchTime("max", -1)}
                  className="p-1 bg-zinc-800 rounded hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="text-sm font-bold font-mono w-6 text-center">
                  {autoSwitch.max}
                </span>
                <button
                  onClick={() => adjustSwitchTime("max", 1)}
                  className="p-1 bg-zinc-800 rounded hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                >
                  <Plus size={16} />
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

          {/* DYNAMIC SYNC BUTTONS */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={triggerSync}
              disabled={syncStatus === "syncing" || syncStatus === "beep-sync"}
              className={`w-full py-2.5 rounded-lg font-bold text-[11px] tracking-widest uppercase transition-colors ${
                syncStatus === "failed"
                  ? "bg-red-600/20 text-red-400 border border-red-500/50"
                  : syncStatus === "sync-complete"
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/60"
                  : syncStatus === "syncing"
                    ? "bg-zinc-800 text-zinc-500 border border-zinc-700/50 cursor-not-allowed"
                    : "bg-blue-600/10 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30"
              }`}
            >
              {syncStatus === "syncing"
                ? "FLASHING..."
                : syncStatus === "sync-complete"
                  ? "DONE"
                  : "FLASH SYNC"}
            </button>

            <button
              onClick={triggerBeepSync}
              disabled={syncStatus === "syncing" || syncStatus === "beep-sync"}
              className={`w-full py-2.5 rounded-lg font-bold text-[11px] tracking-widest uppercase transition-colors ${
                syncStatus === "failed"
                  ? "bg-red-600/20 text-red-400 border border-red-500/50"
                  : syncStatus === "beep-complete"
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/60"
                  : syncStatus === "beep-sync"
                    ? "bg-zinc-800 text-zinc-500 border border-zinc-700/50 cursor-not-allowed animate-pulse"
                    : "bg-emerald-600/10 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30"
              }`}
            >
              {syncStatus === "beep-sync"
                ? "CALIBRATING..."
                : syncStatus === "beep-complete"
                  ? "DONE"
                  : "BEEP SYNC"}
            </button>
          </div>
          {syncMessage && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-[11px] font-semibold leading-snug text-red-200">
              {syncMessage}
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 shrink-0">
          <button
            onClick={handleToggleStream}
            className={`w-full py-5 rounded-2xl font-black text-lg tracking-wider transition-all flex justify-center items-center gap-3 ${isStreaming ? "bg-red-600 text-white shadow-[0_0_20px_rgba(220,53,69,0.5)]" : "bg-zinc-800 text-zinc-200"}`}
          >
            <Radio size={24} className={isStreaming ? "animate-pulse" : ""} />
            {isStreaming ? "STOP STREAMING" : "START STREAMING"}
          </button>
        </div>
      </div>

      {previewData && (
        <CameraPreview
          sceneName={previewData.sceneName}
          displayName={previewData.displayName}
          screenshot={obsScreenshots[previewData.sceneName]}
          onClose={closePreview}
        />
      )}
    </>
  );
}
