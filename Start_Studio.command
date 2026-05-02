#!/bin/bash

echo "Checking system requirements..."
MODEM_WIFI_DEVICE="en0"
MODEM_WIFI_SSID="ZTE_910DD4"
MODEM_WIFI_PASSWORD="8N6N682386"

CURRENT_SSID=$(sudo ipconfig getsummary "$MODEM_WIFI_DEVICE" | sed -n 's/^[[:space:]]*SSID[[:space:]]*: //p')
if [ "$CURRENT_SSID" = "<redacted>" ]; then
    echo "Enabling verbose Wi-Fi SSID reporting..."
    sudo ipconfig setverbose 1
    CURRENT_SSID=$(ipconfig getsummary "$MODEM_WIFI_DEVICE" | sed -n 's/^[[:space:]]*SSID[[:space:]]*: //p')
fi

if [ "$CURRENT_SSID" != "$MODEM_WIFI_SSID" ]; then
    echo "Connecting Wi-Fi to $MODEM_WIFI_SSID..."
    networksetup -setairportnetwork "$MODEM_WIFI_DEVICE" "$MODEM_WIFI_SSID" "$MODEM_WIFI_PASSWORD"

    for i in {1..15}; do
        CURRENT_SSID=$(ipconfig getsummary "$MODEM_WIFI_DEVICE" | sed -n 's/^[[:space:]]*SSID[[:space:]]*: //p')
        if [ "$CURRENT_SSID" = "$MODEM_WIFI_SSID" ]; then
            break
        fi
        sleep 1
    done

    if [ "$CURRENT_SSID" != "$MODEM_WIFI_SSID" ]; then
        echo "❌ ERROR: Could not connect to $MODEM_WIFI_SSID. Current SSID: ${CURRENT_SSID:-unknown}"
        read -p "Press any key to exit..."
        exit 1
    fi
fi
echo "✅ Wi-Fi connected to $MODEM_WIFI_SSID"

# 1. Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "❌ ERROR: Homebrew is not installed."
    echo "Please open your Terminal and run this exact command to install it:"
    echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    read -p "Press any key to exit..."
    exit 1
fi

# 2. Check if Git is installed
if ! command -v git &> /dev/null; then
    echo "❌ ERROR: Git is not installed."
    echo "Please open your Terminal and run:"
    echo "brew install git"
    read -p "Press any key to exit..."
    exit 1
fi

# 3. Check if Node.js and npm are installed
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "❌ ERROR: Node.js / NPM are not installed."
    echo "Please open your Terminal and run:"
    echo "brew install node"
    read -p "Press any key to exit..."
    exit 1
fi

echo "✅ All required tools are installed!"
echo "-----------------------------------"

# Get the directory of the script and navigate to the Git root
cd "$(dirname "$0")" || exit 1

echo "Checking for updates..."

# --- NEW FORCE UPDATE LOGIC ---
# 1. Fetch the latest info from the remote without merging
git fetch origin main > /dev/null 2>&1

# 2. Compare local version to remote version
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    echo "📦 Updates found. Discarding local changes (including .DS_Store) and syncing..."
    
    # 3. Force the local branch to match the remote exactly
    git reset --hard origin/main
    
    # 4. Remove untracked files (this nukes .DS_Store files if they aren't in the repo)
    git clean -fd
    
    GIT_OUTPUT="Updated"
else
    GIT_OUTPUT="Already up to date."
    echo "$GIT_OUTPUT"
fi
# ------------------------------

# Navigate into the app directory
cd tail-air-controller || { echo "❌ App directory not found!"; exit 1; }

# Check if we updated OR if the build folders are missing
if [[ "$GIT_OUTPUT" == "Already up to date." ]] && [ -d "dist" ] && [ -d "node_modules" ]; then
    echo "-----------------------------------"
    echo "⚡ No new updates. Skipping install and build..."
    echo "-----------------------------------"
else
    echo "-----------------------------------"
    echo "📦 Updates found (or missing build files). Installing and building..."
    echo "-----------------------------------"
    
    echo "Installing dependencies..."
    npm install
    
    echo "Building React frontend..."
    npm run build
fi

echo "Checking if OBS Studio is running..."
if ! pgrep -i "obs" > /dev/null; then
    echo "OBS is not running. Launching OBS Studio..."
    open -a "OBS"
    sleep 5
else
    echo "✅ OBS Studio is already running."
fi

echo "🚀 Starting Headless Node Server in the background..."
nohup node server.js > server.log 2>&1 &
disown

sleep 1

# Smart close: Quit Terminal if it's the only window
osascript -e 'tell application "Terminal"' \
          -e 'if (count of windows) is less than or equal to 1 then' \
          -e 'quit' \
          -e 'else' \
          -e 'close front window' \
          -e 'end if' \
          -e 'end tell' & exit
