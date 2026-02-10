# Quick Start Guide

## Easy Launch (Double-Click)

### Windows
1. **Double-click `start-gui.bat`**
2. A console window will open and automatically:
   - Check if Node.js is installed
   - Install dependencies (first time only)
   - Start the server
   - Open your browser to http://localhost:3000

### Linux/Mac
1. **Double-click `start-gui.sh`** (or run `./start-gui.sh` in terminal)
2. Same auto-setup and launch process

## What It Does

- **First Run:** Automatically runs `npm install` to set up dependencies
- **Every Run:** Starts the server and opens your browser
- **Stop:** Press `Ctrl+C` in the console window

## Manual Installation (if preferred)

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

## Troubleshooting

### "Node.js is not installed"
Download and install Node.js from https://nodejs.org/

### Windows: "Cannot run scripts"
Right-click `start-gui.bat` and select "Run as administrator"

### Linux/Mac: "Permission denied"
Run: `chmod +x start-gui.sh`

### Port 3000 already in use
Another app is using port 3000. Stop it or edit `server.js` to use a different port.

---

**That's it!** Just double-click the launcher for your OS and start managing your Lando sites. 🦙
