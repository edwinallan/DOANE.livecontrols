#!/bin/bash
# Get the directory of the script and navigate to it
cd "$(dirname "$0")"

echo "Checking for updates..."
# Pull latest code from the public repo
git pull origin main

echo "Installing dependencies..."
npm install

echo "Building React frontend..."
npm run build

echo "Starting Studio App..."
npm run start