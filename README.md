# DOANE.live - Tail Air Studio Controller

A custom, unified control interface for running a multi-camera streaming studio directly from a browser or tablet. This application bridges OBS Studio, dual OBSBOT Tail Air cameras, a mobile SRT streaming feed, and YouTube Live into a single, cohesive dashboard.

## 🖥️ Platform & Hardware Ecosystem

This system is built for a specific hardware and software stack:

- **Operating System:** macOS (requires Terminal for the startup script).
- **Broadcasting Software:** OBS Studio (must have OBS WebSocket enabled on `127.0.0.1:4455`).
- **Cameras:** 2x OBSBOT Tail Air cameras (designated as "Tail A" and "Tail B").
- **Mobile Feed:** Capacity for an additional Mobile SRT streaming source routed into OBS.
- **Network:** ZTE Modem integration to track connection health, signal strength, and battery directly in the UI header.
- **Output:** Direct integration with the YouTube Live API for stream creation and chat monitoring.

## 📦 Installation & Startup

Installation and execution are handled automatically via the included Mac executable command script (`Start_Studio.command`).

1. Clone the repository to your Mac.
2. Make sure to have your .env file created. Constants are: `VITE_OBS_PASSWORD`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `MODEM_PASSWORD`.
3. Double-click the `Start_Studio.command` file.

To stop the node server from running, open the `Stop_Studio.command` file.

**What the script does:**

- **Checks Dependencies:** It verifies that Homebrew, Git, and Node.js/npm are installed on your macOS system.
- **Guides Installation:** If any dependencies are missing, the script pauses and provides the exact Terminal commands needed to install them.
- **Updates & Builds:** It navigates to the app directory and pulls the latest updates from the `main` branch via Git. If updates are found or build files are missing, it automatically runs `npm install` and `npm run build`.
- **Starts the Server:** Finally, it launches the headless Node server to power the backend and makes sure OBS is running.

## 🎛️ OBS Studio Configuration Guide

For the automated A/V Sync engines (`server.sync.js` and `server.beepsync.js`) to function correctly, OBS Studio **must** be configured with strict routing rules.

### 1. Video Delay Filters

The system dynamically calculates and applies delay milliseconds to your camera feeds.

- You must manually add a **"Video Delay (Async)"** filter to each of your video sources ("Tail A", "Tail B", and "Mobile SRT").
- **CRITICAL:** The filter must be named exactly **"Video Delay"** (case-sensitive) for the WebSocket to find it.

### 2. SRT Latency Buffer

Because SRT over cellular networks fluctuates (rubber-bands), you must force a static buffer on your Mobile SRT source so the calibration math holds true for the entire recording.

- Open the properties for your Mobile SRT source in OBS.
- Increase the **Network Buffering / Latency** to a high, static value (e.g., `3000ms` or `3MB`).

### 3. Advanced Audio Track Routing (The 5-Track Matrix)

The `server.beepsync.js` script uses a 5-track FFmpeg analysis to strip out physical speaker/room latency and calculate pure network drift. If tracks bleed into each other, the math will fail.

1. Go to **Settings > Output > Recording** and ensure **Tracks 1, 2, 3, 4, and 5 are ALL checked**.
2. Open the **Advanced Audio Properties** (gear icon in the audio mixer).
3. Strictly isolate your sources to their dedicated tracks by checking _only_ one box per row:
   - **Tail A:** Check _ONLY_ Track 1
   - **Tail B:** Check _ONLY_ Track 2
   - **Mobile SRT:** Check _ONLY_ Track 3
   - **Internal Mic (Room Mic):** Check _ONLY_ Track 4
   - **Digital Loopback (Logic/System audio):** Check _ONLY_ Track 5

### 4. Audio Monitoring Trap

OBS does **not** apply the "Sync Offset" to Audio Monitoring outputs. If your master microphone is set to "Monitor and Output", the 0ms un-delayed monitoring feed will bleed into your desktop capture and ruin the recording sync.

- In Advanced Audio Properties, ensure all your synchronized sources (especially the Internal Mic and Logic) are set to **"Monitor Off"**.
- Ensure your global audio sources are disabled in OBS Settings, and instead use **"Audio Input Capture"** sources directly in your scenes to prevent buffer bugs.

## 📂 File Structure & Descriptions

### Backend / Server

- **`server.js`**: The main entry point for the backend. It initializes the Express server, sets up Socket.io for real-time frontend-backend communication, serves the built Vite frontend, and initializes the application's core modules.
- **`server.db.js`**: Handles local SQLite database operations, such as storing persistent YouTube OAuth2 tokens and saving camera PTZ presets.
- **`server.obs.js`**: Manages the OBS Studio integration via OBS WebSocket. It handles scene switching, dynamic framerate screenshot polling, remote audio muting, and uses bulletproof native TCP pinging (port 57110) to reliably track hardware connection states. Dynamically scales screenshot payloads between compressed JPEGs and raw PNGs.
- **`server.osc.js`**: Manages Open Sound Control (OSC) UDP communication with the OBSBOT cameras. It sends commands out on port `57110` and listens for hardware callbacks on port `57120`.
- **`server.sync.js`**: The automated A/V Sync Clapperboard engine. It decodes QR timestamps from live OBS screenshots to calculate visual camera network drift.
- **`server.beepsync.js`**: The automated Audio Beep Sync engine. It triggers an audio media source in OBS, captures a multi-track recording, and uses a Two-Pass Normalized FFmpeg sliding-window algorithm to detect the 3-beep sync rhythm. It cross-references an Internal Mic against a Digital Loopback to calculate true physical speaker/room latency, strips it out, and automatically applies precise audio offsets and video delays to OBS.
- **`server.store.js`**: Holds the shared, global state object for the backend so that the OBS, OSC, and YouTube modules stay perfectly synchronized.
- **`server.youtube.js`**: Manages the YouTube API integration. Handles OAuth2 authentication, creates unlisted live broadcasts, binds them to video streams, and polls for live chat messages and stream health.

### Frontend / React (Vite)

- **`vite.config.js`**: Configuration for the Vite bundler. It explicitly sets the build target to `es2015` and `safari11` to ensure the dashboard runs smoothly on older iPads.
- **`tailwind.config.cjs`**: Configuration file for Tailwind CSS.
- **`src/main.jsx`**: The React DOM entry point.
- **`src/index.css` & `src/App.css`**: Global stylesheets handling Tailwind imports.
- **`src/App.jsx`**: The root React component establishing Socket.io connections and orchestrating layouts.
- **`src/components/OBSPanel.jsx`**: UI for monitoring and controlling OBS. Displays live screenshots, indicates source connection status, shows A/V sync calibration offsets, and controls Auto-Switch timing logic. Features long-press native WebKit overrides for high-res previews.
- **`src/components/CameraPreview.jsx`**: A modal overlay component that displays a high-resolution, uncompressed PNG preview of a selected camera feed.
- **`src/components/CameraPanel.jsx`**: The command center for the OBSBOT cameras featuring a context-aware segmented tab bar for AI tracking, PTZ movements, and presets.
- **`src/components/YouTubePanel.jsx`**: The UI for managing the YouTube stream.
- **`src/components/SyncOverlay.jsx`**: A full-screen overlay that flashes rapidly changing QR codes containing Unix timestamps.

## 🎮 Complete OBSBOT OSC Command Reference

The Tail Air device supports UDP and TCP by default, using `int32` (i) and `OSC-string` (s) argument types.

**Critical Network Routing:** Commands must be sent to the camera's IP on port `57110`. However, the camera fires its responses back via UDP on port `57120`. Your server must be actively listening on `0.0.0.0:57120` to catch replies. Additionally, the camera will ignore data queries unless a `/Connected` handshake has been established first.

_(Note: "x" below denotes variables reserved for future use, where `0` is recommended)_.

### 1. Connection & General Device Control

| Command Address                        | Type | Value Range | Description                                                         |
| :------------------------------------- | :--- | :---------- | :------------------------------------------------------------------ |
| `/OBSBOT/WebCam/General/Connected`     | `i`  | `x`         | **Required Handshake.** Must be sent before querying position data. |
| `/OBSBOT/WebCam/General/ConnectedResp` | `i`  | `1`         | Reply from the server to the client.                                |
| `/OBSBOT/WebCam/General/Disconnected`  | `i`  | `x`         | Notifies server when a client stops working.                        |

### 2. PTZ (Pan, Tilt, Zoom) & Gimbal Control

| Command Address                            | Type  | Value Range              | Description                                                                  |
| :----------------------------------------- | :---- | :----------------------- | :--------------------------------------------------------------------------- |
| `/OBSBOT/WebCam/General/ResetGimbal`       | `i`   | `x`                      | Resets the gimbal to center.                                                 |
| `/OBSBOT/WebCam/General/SetZoom`           | `i`   | `0-100`                  | 0-100 corresponds to 0%\~100% of full zoom range.                            |
| `/OBSBOT/WebCam/General/SetZoomSpeed`      | `ii`  | `0-100, 0-11`            | Arg 1: Target zoom (0-100). Arg 2: Speed (0 is default, 1-11 is faster).     |
| `/OBSBOT/WebCam/General/SetZoomMax`        | `i`   | `x`                      | Sets maximum zoom limit.                                                     |
| `/OBSBOT/WebCam/General/SetZoomMin`        | `i`   | `x`                      | Sets minimum zoom limit.                                                     |
| `/OBSBOT/WebCam/General/SetGimbalUp`       | `i`   | `0-100`                  | `0`=Stop; `1-100`=Move up (higher=faster).                                   |
| `/OBSBOT/WebCam/General/SetGimbalDown`     | `i`   | `0-100`                  | `0`=Stop; `1-100`=Move down (higher=faster).                                 |
| `/OBSBOT/WebCam/General/SetGimbalLeft`     | `i`   | `0-100`                  | `0`=Stop; `1-100`=Move left (higher=faster).                                 |
| `/OBSBOT/WebCam/General/SetGimbalRight`    | `i`   | `0-100`                  | `0`=Stop; `1-100`=Move right (higher=faster).                                |
| `/OBSBOT/WebCam/General/SetGimMotorDegree` | `iii` | `0-90, -129-129, -59-59` | Sets absolute position. Arg 1: Speed. Arg 2: Pan (Yaw). Arg 3: Tilt (Pitch). |

### 3. General Image Settings

| Command Address                                | Type | Value Range   | Description                                                                                 |
| :--------------------------------------------- | :--- | :------------ | :------------------------------------------------------------------------------------------ |
| `/OBSBOT/WebCam/General/SetMirror`             | `i`  | `0` / `1`     | `0`=Not Mirror; `1`=Mirror.                                                                 |
| `/OBSBOT/WebCam/General/SetAutoFocus`          | `i`  | `0` / `1`     | `0`=Manual Focus; `1`=Auto Focus.                                                           |
| `/OBSBOT/WebCam/General/SetManualFocus`        | `i`  | `0-100`       | Manual focus value.                                                                         |
| `/OBSBOT/WebCam/General/SetAutoExposure`       | `i`  | `0` / `1`     | `0`=Manual Exposure; `1`=Auto Exposure.                                                     |
| `/OBSBOT/WebCam/General/SetExposureCompensate` | `i`  | `-30` to `30` | Valid values step incrementally (e.g., -30, -27, -23... up to 30) representing -3.0 to 3.0. |
| `/OBSBOT/WebCam/General/SetShutterSpeed`       | `i`  | `1-6400`      | E.g., `6400` = 1/6400s shutter. Limited to specific traditional steps.                      |
| `/OBSBOT/WebCam/General/SetISO`                | `i`  | `100-6400`    | ISO sensitivity value.                                                                      |
| `/OBSBOT/WebCam/General/SetAutoWhiteBalance`   | `i`  | `0` / `1`     | `0`=Manual WhiteBalance; `1`=Auto WhiteBalance.                                             |
| `/OBSBOT/WebCam/General/SetColorTemperature`   | `i`  | `2000-10000`  | Kelvin color temperature value.                                                             |

### 4. Tail Air Specific Features

| Command Address                           | Type | Value Range   | Description                                                               |
| :---------------------------------------- | :--- | :------------ | :------------------------------------------------------------------------ |
| `/OBSBOT/Camera/TailAir/SetAiMode`        | `i`  | `0,1,2,3,6,7` | `0`=Off, `1`=Normal, `2`=Upper Body, `3`=Close-up, `6`=Animal, `7`=Group. |
| `/OBSBOT/Camera/TailAir/SetTrackingSpeed` | `i`  | `0,1,2`       | `0`=Slow, `1`=Standard, `2`=Fast.                                         |
| `/OBSBOT/Camera/TailAir/SetRecording`     | `i`  | `0` / `1`     | `0`=Stop Recording, `1`=Start Recording.                                  |
| `/OBSBOT/Camera/TailAir/Snapshot`         | `i`  | `1`           | `1`=Take Snapshot.                                                        |
| `/OBSBOT/Camera/TailAir/TriggerPreset`    | `i`  | `0,1,2`       | `0`=Preset 1, `1`=Preset 2, `2`=Preset 3.                                 |

### 5. Get Device Information Querying

| Command Address                               | Type          | Value Range | Description                                                                                           |
| :-------------------------------------------- | :------------ | :---------- | :---------------------------------------------------------------------------------------------------- |
| `/OBSBOT/WebCam/General/GetDeviceInfo`        | `i`           | `x`         | Requests device info; triggers "DeviceInfo" response.                                                 |
| `/OBSBOT/WebCam/General/DeviceInfo`           | `isisisisiii` | Reply       | Returns connection state, names, run states, and device types (0=Tiny, 1=Tiny 4K, 2=Meet, 3=Meet 4K). |
| `/OBSBOT/WebCam/General/GetZoomInfo`          | `i`           | `x`         | Requests zoom info; triggers "ZoomInfo" response.                                                     |
| `/OBSBOT/WebCam/General/ZoomInfo`             | `ii`          | Reply       | Returns zoom value (0-100) and FOV value (0=86°, 1=78°, 2=65°).                                       |
| `/OBSBOT/WebCam/General/GetGimbalPosInfo`     | `i`           | `x`         | Requests motor degrees; triggers "GetGimbalPosInfoResp".                                              |
| `/OBSBOT/WebCam/General/GetGimbalPosInfoResp` | `ii`          | Reply       | **Corrected:** Returns only pitch (Tilt) and yaw (Pan). The Tail Air omits the 'roll' variable.       |
