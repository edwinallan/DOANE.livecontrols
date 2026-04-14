#!/bin/bash

echo "🛑 Stopping DOANE.live Studio Server..."

# Forcefully kill any process matching 'node server.js'
pkill -f "node server.js"

echo "✅ Server successfully stopped!"
sleep 2

# Smart close
osascript -e 'tell application "Terminal"' \
          -e 'if (count of windows) is less than or equal to 1 then' \
          -e 'quit' \
          -e 'else' \
          -e 'close front window' \
          -e 'end if' \
          -e 'end tell' & exit