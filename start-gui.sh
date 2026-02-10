#!/bin/bash
# Lando GUI Launcher for Linux/Mac
# This script checks for dependencies, installs if needed, and launches the GUI

echo "========================================"
echo "  Lando GUI Launcher"
echo "========================================"
echo

# Get the directory where this script is located
cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo
    exit 1
fi

echo "[*] Node.js detected: $(node --version)"
echo

# Check if node_modules exists (first run check)
if [ ! -d "node_modules" ]; then
    echo "[*] First time setup - Installing dependencies..."
    echo "This may take a minute..."
    echo
    npm install
    if [ $? -ne 0 ]; then
        echo
        echo "ERROR: Failed to install dependencies!"
        exit 1
    fi
    echo
    echo "[*] Dependencies installed successfully!"
    echo
fi

# Start the server and open browser
echo "[*] Starting Lando GUI server..."
echo "[*] Opening browser at http://localhost:3000"
echo
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo

# Open browser based on OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    (sleep 2 && xdg-open http://localhost:3000) &
elif [[ "$OSTYPE" == "darwin"* ]]; then
    (sleep 2 && open http://localhost:3000) &
fi

# Start the Node.js server
npm start
