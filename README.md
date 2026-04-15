# DOANE.live - Tail Air Studio Controller

A custom, unified control interface for running a multi-camera streaming studio directly from a browser or tablet. This application bridges OBS Studio, dual OBSBOT Tail Air cameras, a mobile SRT streaming feed, and YouTube Live into a single, cohesive dashboard.

## 🖥️ Platform & Hardware Ecosystem

This system is built for a specific hardware and software stack:

- **Operating System:** macOS (requires Terminal for the startup script).
- **Broadcasting Software:** OBS Studio (must have OBS WebSocket enabled on `127.0.0.1:4455`). **CRITICAL:** For the automated A/V Sync engine to function, you must manually add an "Async Video Delay" filter named exactly **"Video Delay"** to each of your video sources ("Tail A", "Tail B", and "Mobile SRT") in OBS.
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

## 📂 File Structure & Descriptions

### Backend / Server

- **`server.js`**: The main entry point for the backend. It initializes the Express server, sets up Socket.io for real-time frontend-backend communication, serves the built Vite frontend, and initializes the application's core modules.
- **`server.db.js`**: Handles local SQLite database operations, such as storing persistent YouTube OAuth2 tokens and saving camera PTZ presets.
- **`server.obs.js`**: Manages the OBS Studio integration via OBS WebSocket. It handles scene switching, dynamic framerate screenshot polling, remote audio muting, and uses bulletproof native TCP pinging (port 57110) to reliably track hardware connection states. **New:** Dynamically scales screenshot payloads, switching between compressed JPEGs for thumbnails and raw, lossless PNGs for 720p modal previews while bypassing the OBS internal scaler.
- **`server.osc.js`**: Manages Open Sound Control (OSC) UDP communication with the OBSBOT cameras. It sends commands out on port `57110` and listens for hardware callbacks on port `57120`.
- **`server.sync.js`**: The automated A/V Sync Clapperboard engine. It decodes QR timestamps from live OBS screenshots to calculate camera network drift, automatically applying precise video and audio delays to OBS sources to keep multi-camera feeds perfectly synchronized.
- **`server.store.js`**: Holds the shared, global state object for the backend so that the OBS, OSC, and YouTube modules stay perfectly synchronized and emit accurate states to connected clients.
- **`server.youtube.js`**: Manages the YouTube API integration. Handles OAuth2 authentication, creates unlisted live broadcasts, binds them to video streams, and polls for live chat messages and stream health.

### Frontend / React (Vite)

- **`vite.config.js`**: Configuration for the Vite bundler. It explicitly sets the build target to `es2015` and `safari11` to ensure the dashboard runs smoothly on older iPads.
- **`tailwind.config.cjs`**: Configuration file for Tailwind CSS, defining the utility classes used for styling the dashboard.
- **`src/main.jsx`**: The React DOM entry point that renders the `App` component into the HTML root.
- **`src/index.css` & `src/App.css`**: Global stylesheets handling Tailwind imports and any custom CSS base styles.
- **`src/App.jsx`**: The root React component. It establishes the Socket.io connection, manages the global frontend state, listens for real-time updates from the backend, and orchestrates the layout and sync failsafes.
- **`src/assets/static-glitch.gif`**: A fallback animated image used in the OBS panel when a camera source is offline or a screenshot cannot be fetched.

### React Components

- **`src/components/OBSPanel.jsx`**: UI for monitoring and controlling OBS. Displays live screenshots, indicates source connection status, shows A/V sync calibration offsets, displays ZTE Modem health, allows manual scene switching, and controls the Auto-Switch timing logic. **New:** Features an iOS-compatible touch/long-press (600ms) event listener with native WebKit overrides to trigger high-res 720p previews without invoking Safari's context menu. Automatically disables Auto-Switch when a camera is manually selected.
- **`src/components/CameraPreview.jsx`**: **New:** A modal overlay component that displays a high-resolution, uncompressed PNG preview of a selected camera feed at 2fps when the user long-presses a source thumbnail.
- **`src/components/CameraPanel.jsx`**: The command center for the OBSBOT cameras. It features a smart, context-aware segmented tab bar that dynamically adapts to active cameras. It triggers OSC commands to control AI tracking, color temperature, recording states, audio muting, PTZ movements, and presets. Automatically disables controls if no cameras are online or explicitly selected.
- **`src/components/YouTubePanel.jsx`**: The UI for managing the YouTube stream. Handles the OAuth flow, sets stream titles, transitions streams to "Live," and displays incoming chat messages.
- **`src/components/SyncOverlay.jsx`**: A full-screen overlay that flashes rapidly changing QR codes containing Unix timestamps, used by the backend to calculate visual delay and align the cameras.

## 🎮 Complete OBSBOT OSC Command Reference

The Tail Air device supports UDP and TCP by default, using `int32` (i) and `OSC-string` (s) argument types.

**Critical Network Routing:** Commands must be sent to the camera's IP on port `57110`. However, the camera fires its responses back via UDP on port `57120`. Your server must be actively listening on `0.0.0.0:57120` to catch replies. Additionally, the camera will ignore data queries (like position requests) unless a `/Connected` handshake has been established first.

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
