import React, { useState, useEffect, useRef } from "react";
import {
  PlaySquare,
  Youtube,
  ExternalLink,
  Radio,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export default function YouTubePanel({
  isExpanded,
  onExpand,
  state,
  ytChatMessages,
  handleStartYTStream,
  handleGoLiveYT,
  backendUrl,
}) {
  const [streamTitle, setStreamTitle] = useState("");
  const [localAction, setLocalAction] = useState(false);
  const chatRef = useRef(null);

  // NEW: Check if we are running on the host machine
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [ytChatMessages]);

  useEffect(() => {
    if (!state.ytIsTransitioning && state.ytBroadcastStatus === "live") {
      setLocalAction(false);
    }
    if (!state.ytIsTransitioning && state.ytErrorMessage) {
      setLocalAction(false);
    }
  }, [state.ytIsTransitioning, state.ytBroadcastStatus, state.ytErrorMessage]);

  // Collapsed Vertical Bar UI
  if (!isExpanded) {
    return (
      <button
        onClick={onExpand}
        className="w-16 shrink-0 bg-zinc-900 rounded-3xl flex flex-col items-center justify-center gap-6 border border-zinc-800 hover:bg-zinc-800 transition-colors shadow-xl h-full"
      >
        <Youtube size={28} className="text-zinc-500" />
        <span className="[writing-mode:vertical-lr] rotate-180 text-zinc-500 font-bold tracking-widest text-lg">
          YOUTUBE STUDIO
        </span>
      </button>
    );
  }

  const handleGoLiveClick = () => {
    setLocalAction(true);
    handleGoLiveYT();
  };

  const isHealthAcceptable =
    state.ytStreamHealth === "good" || state.ytStreamHealth === "ok";
  const isStreamActive = state.ytStreamStatus === "active";

  let goLiveBtnText = "AWAITING STREAMING";
  let isGoLiveReady = false;

  if (state.ytIsTransitioning || localAction) {
    goLiveBtnText = "STARTING...";
    isGoLiveReady = false;
  } else if (state.isStreaming) {
    if (isStreamActive && isHealthAcceptable) {
      goLiveBtnText = "GO LIVE";
      isGoLiveReady = true;
    } else {
      goLiveBtnText = "YT SYNCING...";
    }
  }

  const getHealthUI = () => {
    switch (state.ytStreamHealth) {
      case "good":
        return (
          <span className="flex items-center gap-1.5 text-green-400 font-bold">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>{" "}
            Excellent
          </span>
        );
      case "ok":
        return (
          <span className="flex items-center gap-1.5 text-yellow-400 font-bold">
            <div className="w-2 h-2 rounded-full bg-yellow-400"></div>{" "}
            Acceptable
          </span>
        );
      case "bad":
        return (
          <span className="flex items-center gap-1.5 text-red-500 font-bold">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>{" "}
            Bad
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-zinc-500 font-bold">
            <div className="w-2 h-2 rounded-full bg-zinc-600"></div> No Data
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-zinc-900 rounded-3xl p-5 gap-4 border border-zinc-800 shadow-xl h-full overflow-y-auto relative">
      {state.ytErrorMessage && (
        <div className="absolute top-4 left-4 right-4 bg-red-950/90 border border-red-500/50 text-red-200 text-xs px-3 py-2 rounded-lg z-50 shadow-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug font-medium">
            {state.ytErrorMessage}
          </span>
        </div>
      )}

      <div className="flex justify-between items-center shrink-0">
        <h2 className="text-xl font-bold flex items-center gap-2">YouTube</h2>
        {!state.ytAuthenticated ? (
          isLocalhost ? (
            <a
              href={`${backendUrl}/auth/youtube`}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-red-600 px-3 py-1.5 rounded-md font-bold text-white flex items-center gap-1 hover:bg-red-500 transition-colors"
            >
              <Youtube size={14} /> AUTHENTICATE
            </a>
          ) : (
            <div
              className="text-[10px] bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded-md font-bold border border-zinc-700 flex items-center gap-1.5 cursor-not-allowed uppercase"
              title="Google limits OAuth to localhost. Please authenticate directly on the Mac running the server."
            >
              <AlertTriangle size={14} className="text-yellow-600" /> AUTH ON
              DESKTOP
            </div>
          )
        ) : !state.ytVideoId ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Stream Title..."
              value={streamTitle}
              onChange={(e) => setStreamTitle(e.target.value)}
              disabled={state.ytIsCreating}
              className="text-xs bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-zinc-200 outline-none focus:border-blue-500 w-32 shadow-inner disabled:opacity-50"
            />
            <button
              onClick={() =>
                handleStartYTStream(
                  streamTitle ||
                    `Live Stream - ${new Date().toLocaleDateString()}`,
                )
              }
              disabled={state.ytIsCreating}
              className="text-xs bg-blue-600 px-3 py-1.5 rounded-md font-bold text-white flex items-center gap-1 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-wait transition-colors"
            >
              {state.ytIsCreating ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <PlaySquare size={14} />
              )}
              {state.ytIsCreating ? "CREATING..." : "CREATE"}
            </button>
          </div>
        ) : state.ytBroadcastStatus === "ready" ? (
          <div className="flex items-center gap-2">
            <a
              href={`https://youtu.be/${state.ytVideoId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded-md font-bold hover:bg-zinc-700 flex items-center gap-1.5 transition-all"
            >
              <ExternalLink size={14} /> APP
            </a>
            <button
              onClick={handleGoLiveClick}
              disabled={!isGoLiveReady || localAction}
              className={`text-xs px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all ${
                isGoLiveReady && !localAction
                  ? "bg-red-600 text-white animate-pulse hover:bg-red-500 shadow-[0_0_15px_rgba(220,53,69,0.5)]"
                  : "bg-zinc-800 text-zinc-400 cursor-not-allowed border border-zinc-700"
              }`}
            >
              {localAction || state.ytIsTransitioning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isGoLiveReady ? (
                <Radio size={14} />
              ) : (
                <Loader2
                  size={14}
                  className={state.isStreaming ? "animate-spin" : ""}
                />
              )}
              {goLiveBtnText}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <a
              href={`https://youtu.be/${state.ytVideoId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1.5 rounded-md font-bold hover:bg-zinc-700 flex items-center gap-1.5 transition-all"
            >
              <ExternalLink size={14} /> APP
            </a>
            <span className="text-xs bg-green-600/20 text-green-400 px-3 py-1.5 rounded-md font-bold border border-green-500/20 flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,197,94,0.2)]">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>{" "}
              LIVE
            </span>
          </div>
        )}
      </div>

      {state.ytVideoId && (
        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider border-b border-zinc-800 pb-2 shrink-0">
          <div
            className="font-bold text-zinc-300 truncate max-w-[200px]"
            title={state.ytStreamTitle}
          >
            {state.ytStreamTitle}
          </div>
          {getHealthUI()}
        </div>
      )}

      {state.ytVideoId ? (
        <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shrink-0 border border-zinc-800 shadow-lg">
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
        <div className="w-full aspect-video bg-zinc-950 rounded-xl flex flex-col items-center justify-center shrink-0 border border-zinc-800 shadow-inner">
          <Youtube size={32} className="text-zinc-800 mb-2" />
          <span className="text-zinc-600 text-xs font-bold tracking-widest uppercase">
            Offline
          </span>
        </div>
      )}

      <div className="flex-1 bg-zinc-950 rounded-2xl border border-zinc-800 p-4 overflow-hidden flex flex-col min-h-0 shadow-inner relative">
        <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-zinc-950 to-transparent z-10 pointer-events-none"></div>
        <div
          ref={chatRef}
          className="flex-1 overflow-y-auto pr-2 space-y-3 flex flex-col scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent pb-2 pt-2"
        >
          {ytChatMessages.length === 0 ? (
            <div className="m-auto text-zinc-600 text-sm italic font-medium flex items-center gap-2">
              Waiting for messages...
            </div>
          ) : (
            ytChatMessages.map((msg, i) => (
              <div key={i} className="text-sm leading-snug">
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
  );
}
