#!/bin/bash

echo "Checking system requirements..."

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
# Capture the output of git pull into a variable
GIT_OUTPUT=$(git pull origin main)

# Print the git output so you can still see it in the terminal
echo "$GIT_OUTPUT"

# Navigate into the Vite app directory
cd tail-air-controller || { echo "❌ App directory not found!"; exit 1; }

# Check if git is up to date AND that the build folders actually exist
if [[ "$GIT_OUTPUT" == *"Already up to date."* ]] && [ -d "dist" ] && [ -d "node_modules" ]; then
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

echo "🚀 Starting Studio App..."
npm run start