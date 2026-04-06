const { google } = require("googleapis");
const db = require("./db");
const { setOBSStreamKey } = require("./server.obs");

const youtube = google.youtube("v3");
let chatPollInterval;
let healthPollInterval;
let nextChatPageToken = "";

function initYouTube(app, io, state) {
  const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:4000";
  const oauth2Client = new google.auth.OAuth2(
    process.env.YT_CLIENT_ID,
    process.env.YT_CLIENT_SECRET,
    `${BACKEND_URL}/oauth2callback`,
  );

  function emitYtError(msg) {
    state.ytErrorMessage = msg;
    io.emit("state-update", state);
    setTimeout(() => {
      if (state.ytErrorMessage === msg) {
        state.ytErrorMessage = "";
        io.emit("state-update", state);
      }
    }, 7000);
  }

  db.get("SELECT tokens FROM auth_tokens WHERE id = 1", (err, row) => {
    if (row && row.tokens) {
      try {
        const tokens = JSON.parse(row.tokens);
        oauth2Client.setCredentials(tokens);
        state.ytAuthenticated = true;
        console.log("✅ YouTube OAuth tokens loaded.");
        // FIX: Tell all currently connected clients that we are authenticated!
        io.emit("state-update", state);
      } catch (e) {
        console.error("Failed to parse stored tokens:", e);
      }
    }
  });

  oauth2Client.on("tokens", (tokens) => {
    if (!tokens.refresh_token) {
      tokens.refresh_token = oauth2Client.credentials.refresh_token;
    }
    db.run("INSERT OR REPLACE INTO auth_tokens (id, tokens) VALUES (1, ?)", [
      JSON.stringify(tokens),
    ]);
  });

  app.get("/auth/youtube", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/youtube",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ],
    });
    res.redirect(url);
  });

  app.get("/oauth2callback", async (req, res) => {
    try {
      const { tokens } = await oauth2Client.getToken(req.query.code);
      oauth2Client.setCredentials(tokens);
      db.run("INSERT OR REPLACE INTO auth_tokens (id, tokens) VALUES (1, ?)", [
        JSON.stringify(tokens),
      ]);
      state.ytAuthenticated = true;
      io.emit("state-update", state);
      res.send(
        "<h2>Successfully Authenticated with YouTube!</h2><p>You can close this window.</p>",
      );
    } catch (err) {
      res.status(500).send("Authentication failed.");
    }
  });

  function startYouTubeChatPolling(liveChatId) {
    clearInterval(chatPollInterval);
    chatPollInterval = setInterval(async () => {
      if (!state.ytAuthenticated) return;
      try {
        const res = await youtube.liveChatMessages.list({
          auth: oauth2Client,
          liveChatId: liveChatId,
          part: "snippet,authorDetails",
          pageToken: nextChatPageToken || undefined,
        });
        nextChatPageToken = res.data.nextPageToken;
        if (res.data.items && res.data.items.length > 0)
          io.emit("yt-chat-update", res.data.items);
      } catch (e) {}
    }, 5000);
  }

  function startStreamHealthPolling(streamId) {
    clearInterval(healthPollInterval);
    healthPollInterval = setInterval(async () => {
      if (!state.ytAuthenticated) return;
      try {
        const res = await youtube.liveStreams.list({
          auth: oauth2Client,
          part: "status",
          id: streamId,
        });
        if (res.data.items && res.data.items.length > 0) {
          const statusObj = res.data.items[0].status;
          if (
            state.ytStreamHealth !== statusObj.healthStatus.status ||
            state.ytStreamStatus !== statusObj.streamStatus
          ) {
            state.ytStreamHealth = statusObj.healthStatus.status;
            state.ytStreamStatus = statusObj.streamStatus;
            io.emit("state-update", state);
          }
        }
      } catch (e) {}
    }, 5000);
  }

  io.on("connection", (socket) => {
    socket.on("start-yt-stream", async (title) => {
      if (!state.ytAuthenticated) return;
      state.ytIsCreating = true;
      io.emit("state-update", state);

      try {
        const actualTitle =
          title || `Stream - ${new Date().toLocaleDateString()}`;

        const broadcastRes = await youtube.liveBroadcasts.insert({
          auth: oauth2Client,
          part: "snippet,status,contentDetails",
          requestBody: {
            snippet: {
              title: actualTitle,
              scheduledStartTime: new Date().toISOString(),
            },
            status: {
              privacyStatus: "unlisted",
              selfDeclaredMadeForKids: false,
            },
            contentDetails: { monitorStream: { enableMonitorStream: false } },
          },
        });

        const broadcastId = broadcastRes.data.id;
        const liveChatId = broadcastRes.data.snippet.liveChatId;

        let streamId, streamKey, ingestUrl;
        const streamsRes = await youtube.liveStreams.list({
          auth: oauth2Client,
          part: "snippet,cdn",
          mine: true,
        });
        const existingStream = streamsRes.data.items?.find(
          (s) => s.snippet.title === "DOANE.live",
        );

        if (existingStream) {
          streamId = existingStream.id;
          streamKey = existingStream.cdn.ingestionInfo.streamName;
          ingestUrl = existingStream.cdn.ingestionInfo.ingestionAddress;
        } else {
          const newStreamRes = await youtube.liveStreams.insert({
            auth: oauth2Client,
            part: "snippet,cdn",
            requestBody: {
              snippet: { title: "DOANE.live" },
              cdn: {
                ingestionType: "rtmp",
                resolution: "1080p",
                frameRate: "60fps",
              },
            },
          });
          streamId = newStreamRes.data.id;
          streamKey = newStreamRes.data.cdn.ingestionInfo.streamName;
          ingestUrl = newStreamRes.data.cdn.ingestionInfo.ingestionAddress;
        }

        await youtube.liveBroadcasts.bind({
          auth: oauth2Client,
          part: "id,contentDetails",
          id: broadcastId,
          streamId: streamId,
        });
        await setOBSStreamKey(ingestUrl, streamKey);

        state.ytVideoId = broadcastId;
        state.ytLiveChatId = liveChatId;
        state.ytStreamTitle = actualTitle;
        state.ytBroadcastStatus = "ready";
        state.ytIsCreating = false;

        io.emit("state-update", state);
        startYouTubeChatPolling(liveChatId);
        startStreamHealthPolling(streamId);
      } catch (err) {
        state.ytIsCreating = false;
        emitYtError(`Creation Failed: ${err.message}`);
      }
    });

    socket.on("go-live-yt", async () => {
      if (!state.ytAuthenticated || !state.ytVideoId) return;
      if (state.ytStreamStatus !== "active") {
        emitYtError("YouTube stream is not stable yet. Please wait.");
        return;
      }
      try {
        state.ytIsTransitioning = true;
        io.emit("state-update", state);

        await youtube.liveBroadcasts.transition({
          auth: oauth2Client,
          part: "id,status",
          id: state.ytVideoId,
          broadcastStatus: "live",
        });

        state.ytBroadcastStatus = "live";
        state.ytIsTransitioning = false;
        io.emit("state-update", state);
        console.log("🟢 YouTube Stream is now LIVE!");
      } catch (err) {
        state.ytIsTransitioning = false;
        io.emit("state-update", state);
        emitYtError(`Transition Error: ${err.message}`);
      }
    });
  });
}

module.exports = { initYouTube };
