import React, { useEffect } from "react";
import { X, Loader2 } from "lucide-react";

export default function CameraPreview({
  sceneName,
  displayName,
  screenshot,
  onClose,
}) {
  // Prevent body scrolling while modal is active
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 sm:p-12 transition-all duration-300"
      onClick={onClose}
    >
      <div
        className="relative bg-zinc-950 border border-zinc-800 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden max-w-6xl w-full aspect-video flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Badge */}
        <div className="absolute top-5 left-5 flex items-center gap-2.5 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 z-10 shadow-lg">
          <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></div>
          <span className="text-sm font-black text-white tracking-widest uppercase">
            {displayName}{" "}
            <span className="text-zinc-400 font-normal ml-1">| Preview</span>
          </span>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 bg-black/60 hover:bg-red-600 backdrop-blur-xl p-2.5 rounded-xl border border-white/10 text-white transition-all shadow-lg active:scale-95"
        >
          <X size={24} />
        </button>

        {/* Dynamic Image Payload */}
        {screenshot ? (
          <img
            src={screenshot}
            alt={`${displayName} Preview`}
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-500 gap-4">
            <Loader2 size={48} className="animate-spin text-zinc-600" />
            <span className="text-sm font-bold tracking-widest uppercase animate-pulse">
              Upgrading Resolution...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
