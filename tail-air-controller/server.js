require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const { Client, Server: OSCServer } = require("node-osc");
const sqlite3 = require("sqlite3").verbose();
const { default: OBSWebSocket } = require("obs-websocket-js");
const net = require("net");
const path = require("path");
const { google } = require("googleapis");

// --- SERVER SETUP ---
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Serve the built React app (when running in production)
app.use(express.static(path.join(__dirname, "dist")));

// --- STATE ---
let state = {
  obsConnected: false,
  activeScene: "",
  isStreaming: false,
  streamBitrate: 0,
  isRecording: false,
  sourcesConnected: { "Tail A": false, "Tail B": false, "Mobile SRT": false },
  autoSwitch: { enabled: false, mobile: false, min: 5, max: 15 },
  ytAuthenticated: false,
  ytVideoId: null,
  ytLiveChatId: null,
};

// --- OSC & DB SETUP ---
let oscClients = {};
let camIPs = { "Tail A": null, "Tail B": null };
let pendingPresetSaves = {};

const dbPath = path.join(__dirname, "presets.db");
const db = new sqlite3.Database(dbPath);

// Initialize Tables (File is auto-created if missing)
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS presets (cam TEXT, presetId INTEGER, pan REAL, tilt REAL, zoom REAL, PRIMARY KEY(cam, presetId))",
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS auth_tokens (id INTEGER PRIMARY KEY CHECK (id = 1), tokens TEXT)",
  );
});

const oscServer = new OSCServer(57120, "0.0.0.0", () => {
  console.log("OSC Server listening on port 57120");
});

// OSC Preset Save Listener
oscServer.on("message", (msg, rinfo) => {
  const address = msg[0];
  const args = msg.slice(1);
  let cam = Object.keys(oscClients).find(
    (c) => oscClients[c].host === rinfo.address,
  );
  if (!cam || !pendingPresetSaves[cam]) return;

  const pending = pendingPresetSaves[cam];
  if (address === "/OBSBOT/WebCam/General/GimbalPosInfo") {
    pending.pan = args[0];
    pending.tilt = args[1];
  } else if (address === "/OBSBOT/WebCam/General/ZoomInfo") {
    pending.zoom = args[0];
  }

  if (pending.pan !== undefined && pending.zoom !== undefined) {
    db.run(
      `INSERT OR REPLACE INTO presets (cam, presetId, pan, tilt, zoom) VALUES (?, ?, ?, ?, ?)`,
      [cam, pending.presetId, pending.pan, pending.tilt, pending.zoom],
      (err) => {
        if (!err) console.log(`Saved Preset ${pending.presetId} for ${cam}`);
      },
    );
    delete pendingPresetSaves[cam];
  }
});

function sendOSC(camera, address, ...args) {
  if (oscClients[camera]) {
    oscClients[camera].send(address, ...args, (err) => {
      if (err) console.error(`OSC Error (${camera}):`, err);
    });
  }
}

// --- YOUTUBE API SETUP ---
const youtube = google.youtube("v3");
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:4000";
const oauth2Client = new google.auth.OAuth2(
  process.env.YT_CLIENT_ID,
  process.env.YT_CLIENT_SECRET,
  `${BACKEND_URL}/oauth2callback`,
);

// 1. Load Tokens on Server Boot
db.get("SELECT tokens FROM auth_tokens WHERE id = 1", (err, row) => {
  if (row && row.tokens) {
    try {
      const tokens = JSON.parse(row.tokens);
      oauth2Client.setCredentials(tokens);
      state.ytAuthenticated = true;
      console.log("✅ YouTube OAuth tokens loaded from database.");
    } catch (e) {
      console.error("Failed to parse stored tokens:", e);
    }
  }
});

// 2. Auto-save refreshed tokens to the database
oauth2Client.on("tokens", (tokens) => {
  if (!tokens.refresh_token) {
    const currentCreds = oauth2Client.credentials;
    tokens.refresh_token = currentCreds.refresh_token;
  }

  db.run(
    "INSERT OR REPLACE INTO auth_tokens (id, tokens) VALUES (1, ?)",
    [JSON.stringify(tokens)],
    (err) => {
      if (!err)
        console.log(
          "🔄 YouTube OAuth tokens automatically refreshed and saved.",
        );
    },
  );
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

    db.run(
      "INSERT OR REPLACE INTO auth_tokens (id, tokens) VALUES (1, ?)",
      [JSON.stringify(tokens)],
      (err) => {
        if (err) console.error("Failed to save initial tokens:", err);
      },
    );

    state.ytAuthenticated = true;
    io.emit("state-update", state);
    res.send(
      "<h2>Successfully Authenticated with YouTube!</h2><p>You can close this window and return to the panel.</p>",
    );
  } catch (err) {
    console.error("OAuth Callback Error:", err);
    res.status(500).send("Authentication failed.");
  }
});

let chatPollInterval;
let nextChatPageToken = "";

async function startYouTubeChatPolling(liveChatId) {
  clearInterval(chatPollInterval);
  chatPollInterval = setInterval(async () => {
    try {
      const res = await youtube.liveChatMessages.list({
        auth: oauth2Client,
        liveChatId: liveChatId,
        part: "snippet,authorDetails",
        pageToken: nextChatPageToken || undefined,
      });
      nextChatPageToken = res.data.nextPageToken;
      if (res.data.items && res.data.items.length > 0) {
        io.emit("yt-chat-update", res.data.items);
      }
    } catch (e) {
      console.error("YouTube Chat Poll Error:", e.message);
    }
  }, 5000);
}

// --- TCP HEARTBEAT ---
function checkDeviceAlive(ip) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(554, ip);
  });
}

setInterval(async () => {
  let updated = false;
  for (const cam of Object.keys(camIPs)) {
    const isAlive = camIPs[cam] ? await checkDeviceAlive(camIPs[cam]) : false;
    if (state.sourcesConnected[cam] !== isAlive) {
      state.sourcesConnected[cam] = isAlive;
      updated = true;
    }
  }
  if (updated) io.emit("state-update", state);
}, 2000);

// --- OBS CONNECTION & LOGIC ---
const obsMain = new OBSWebSocket();
const obsAudio = new OBSWebSocket();
let mobileAudioTimeout;
let autoSwitchTimer;

async function connectOBS() {
  try {
    const obsPassword = process.env.VITE_OBS_PASSWORD || undefined;

    await obsMain.connect("ws://127.0.0.1:4455", obsPassword);
    await obsAudio.connect("ws://127.0.0.1:4455", obsPassword, {
      eventSubscriptions: 65536,
    });

    state.obsConnected = true;

    const { currentProgramSceneName } = await obsMain.call(
      "GetCurrentProgramScene",
    );
    state.activeScene = currentProgramSceneName;
    const streamStatus = await obsMain.call("GetStreamStatus");
    state.isStreaming = streamStatus.outputActive;
    io.emit("state-update", state);

    fetchCameraIPs();
  } catch (err) {
    state.obsConnected = false;
    io.emit("state-update", state);
    setTimeout(connectOBS, 5000);
  }
}

async function fetchCameraIPs() {
  const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  for (const cam of ["Tail A", "Tail B"]) {
    try {
      const { inputSettings } = await obsMain.call("GetInputSettings", {
        inputName: cam,
      });
      const match = JSON.stringify(inputSettings).match(ipv4Regex);
      if (match) {
        camIPs[cam] = match[0];
        if (oscClients[cam]) oscClients[cam].close();
        oscClients[cam] = new Client(match[0], 57110);

        sendOSC(cam, "/OBSBOT/WebCam/General/SetZoomMin", 1);
        sendOSC(cam, "/OBSBOT/WebCam/General/ResetGimbal", 1);
      }
    } catch (e) {}
  }
}

obsMain.on("ConnectionClosed", () => {
  state.obsConnected = false;
  io.emit("state-update", state);
  setTimeout(connectOBS, 3000);
});

obsMain.on("CurrentProgramSceneChanged", (data) => {
  state.activeScene = data.sceneName;
  io.emit("state-update", state);
});

obsMain.on("StreamStateChanged", (data) => {
  state.isStreaming = data.outputActive;
  io.emit("state-update", state);
});

obsAudio.on("InputVolumeMeters", (data) => {
  const mobileInput = data.inputs.find((i) => i.inputName === "Mobile SRT");
  if (mobileInput && mobileInput.inputLevelsMul.some((l) => l[1] > 0.0001)) {
    if (!state.sourcesConnected["Mobile SRT"]) {
      state.sourcesConnected["Mobile SRT"] = true;
      io.emit("state-update", state);
    }
    clearTimeout(mobileAudioTimeout);
    mobileAudioTimeout = setTimeout(() => {
      state.sourcesConnected["Mobile SRT"] = false;
      io.emit("state-update", state);
    }, 2000);
  }
});

let isFetchingScreenshot = false;

setInterval(async () => {
  if (
    !state.obsConnected ||
    isFetchingScreenshot ||
    io.engine.clientsCount === 0
  )
    return;
  isFetchingScreenshot = true;

  try {
    const scenesToFetch = ["CAM 1", "CAM 2", "Mobile"];
    let screenshots = {};

    for (const scene of scenesToFetch) {
      const res = await obsMain
        .call("GetSourceScreenshot", {
          sourceName: scene,
          imageFormat: "jpeg",
          imageWidth: 480,
          imageHeight: 270,
          imageCompressionQuality: 50,
        })
        .catch(() => null);

      if (res && res.imageData) {
        screenshots[scene] = res.imageData;
      }
    }

    io.emit("obs-screenshots", screenshots);
  } finally {
    isFetchingScreenshot = false;
  }
}, 1000);

// --- AUTO SWITCHER LOGIC ---
function scheduleNextSwitch() {
  clearTimeout(autoSwitchTimer);
  if (!state.autoSwitch.enabled) return;

  const delay =
    Math.floor(
      Math.random() * (state.autoSwitch.max - state.autoSwitch.min + 1) +
        state.autoSwitch.min,
    ) * 1000;

  autoSwitchTimer = setTimeout(async () => {
    if (state.autoSwitch.mobile && state.sourcesConnected["Mobile SRT"]) {
      await obsMain
        .call("SetCurrentProgramScene", { sceneName: "Mobile" })
        .catch(() => {});
    } else {
      const available = ["CAM 1", "CAM 2"].filter(
        (scene) =>
          (scene === "CAM 1" && state.sourcesConnected["Tail A"]) ||
          (scene === "CAM 2" && state.sourcesConnected["Tail B"]),
      );
      if (available.length > 0) {
        const nextScene =
          available[Math.floor(Math.random() * available.length)];
        await obsMain
          .call("SetCurrentProgramScene", { sceneName: nextScene })
          .catch(() => {});
      }
    }
    scheduleNextSwitch();
  }, delay);
}

// --- SOCKET.IO CLIENT HANDLERS ---
io.on("connection", (socket) => {
  console.log("Client connected");
  socket.emit("state-update", state);

  socket.on("set-scene", async (sceneName) => {
    if (state.obsConnected)
      await obsMain
        .call("SetCurrentProgramScene", { sceneName })
        .catch(() => {});
  });

  socket.on("toggle-stream", async () => {
    if (state.obsConnected) await obsMain.call("ToggleStream").catch(() => {});
  });

  socket.on("update-autoswitch", (config) => {
    state.autoSwitch = { ...state.autoSwitch, ...config };
    io.emit("state-update", state);
    scheduleNextSwitch();
  });

  socket.on("send-osc", ({ targets, address, value }) => {
    targets.forEach((target) => sendOSC(target, address, value));
  });

  socket.on("save-preset", ({ targets, presetId }) => {
    targets.forEach((cam) => {
      pendingPresetSaves[cam] = {
        presetId,
        pan: undefined,
        tilt: undefined,
        zoom: undefined,
      };
      sendOSC(cam, "/OBSBOT/WebCam/General/GetGimbalPosInfo", 1);
      sendOSC(cam, "/OBSBOT/WebCam/General/GetZoomInfo", 1);
    });
  });

  socket.on("load-preset", ({ targets, presetId }) => {
    targets.forEach((cam) => {
      db.get(
        "SELECT pan, tilt, zoom FROM presets WHERE cam = ? AND presetId = ?",
        [cam, presetId],
        (err, row) => {
          if (row) {
            sendOSC(
              cam,
              "/OBSBOT/WebCam/General/SetGimMotorDegree",
              row.pan,
              row.tilt,
              0,
            );
            sendOSC(cam, "/OBSBOT/WebCam/General/SetZoom", row.zoom);
          }
        },
      );
    });
  });

  socket.on("start-yt-stream", async (title) => {
    if (!state.ytAuthenticated) return;
    try {
      const actualTitle =
        title || `Stream via Controller - ${new Date().toLocaleString()}`;

      // 1. Create Broadcast with custom title
      const broadcastRes = await youtube.liveBroadcasts.insert({
        auth: oauth2Client,
        part: "snippet,status,contentDetails",
        requestBody: {
          snippet: {
            title: actualTitle,
            scheduledStartTime: new Date().toISOString(),
          },
          status: { privacyStatus: "unlisted" },
        },
      });

      const broadcastId = broadcastRes.data.id;
      const liveChatId = broadcastRes.data.snippet.liveChatId;

      // 2. Find or Create "DOANE.live" reusable Stream Key
      let streamId;
      let streamKey;
      let ingestUrl;

      // Fetch existing streams for this account
      const streamsRes = await youtube.liveStreams.list({
        auth: oauth2Client,
        part: "snippet,cdn",
        mine: true,
      });

      // Look for our specific reusable key
      const existingStream = streamsRes.data.items?.find(
        (s) => s.snippet.title === "DOANE.live",
      );

      if (existingStream) {
        streamId = existingStream.id;
        streamKey = existingStream.cdn.ingestionInfo.streamName;
        ingestUrl = existingStream.cdn.ingestionInfo.ingestionAddress;
        console.log("♻️ Reusing existing DOANE.live stream key.");
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
        console.log("✨ Created new DOANE.live stream key.");
      }

      // 3. Bind Stream to Broadcast
      await youtube.liveBroadcasts.bind({
        auth: oauth2Client,
        part: "id,contentDetails",
        id: broadcastId,
        streamId: streamId,
      });

      // 4. INJECT STREAM KEY INTO OBS
      if (state.obsConnected) {
        await obsMain
          .call("SetStreamServiceSettings", {
            streamServiceType: "rtmp_custom",
            streamServiceSettings: {
              server: ingestUrl,
              key: streamKey,
              use_auth: false,
            },
          })
          .catch((err) => console.error("OBS Stream Key Set Error:", err));
      }

      state.ytVideoId = broadcastId;
      state.ytLiveChatId = liveChatId;
      state.ytStreamTitle = actualTitle; // Update title in state for the UI
      io.emit("state-update", state);
      startYouTubeChatPolling(liveChatId);
    } catch (err) {
      console.error("Failed to start YouTube Stream:", err.message);
    }
  });
});

server.listen(4000, "0.0.0.0", () => {
  console.log("🚀 Server running on port 4000");
  connectOBS();
});
