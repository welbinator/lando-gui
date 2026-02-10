#!/bin/bash
# Stop Lando GUI Server (Linux/Mac/WSL)

echo "========================================"
echo "  Stop Lando GUI Server"
echo "========================================"
echo

# Check if port 3000 is in use
if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 && ! netstat -tuln 2>/dev/null | grep -q ":3000 "; then
    echo "[*] Lando GUI is not running on port 3000"
    echo
    exit 0
fi

# Try lsof first (more reliable)
if command -v lsof &> /dev/null; then
    PID=$(lsof -Pi :3000 -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "[*] Found process ID: $PID"
        echo "[*] Stopping server..."
        kill $PID 2>/dev/null
        
        # Wait a moment and check if it's really stopped
        sleep 1
        if kill -0 $PID 2>/dev/null; then
            echo "[*] Process still running, forcing termination..."
            kill -9 $PID 2>/dev/null
        fi
        
        echo "[*] Lando GUI server stopped successfully!"
        echo
        exit 0
    fi
fi

# Fallback: try finding by process name
PID=$(ps aux | grep "[n]ode.*server.js" | awk '{print $2}' | head -1)
if [ -n "$PID" ]; then
    echo "[*] Found process ID: $PID"
    echo "[*] Stopping server..."
    kill $PID 2>/dev/null
    
    sleep 1
    if kill -0 $PID 2>/dev/null; then
        echo "[*] Process still running, forcing termination..."
        kill -9 $PID 2>/dev/null
    fi
    
    echo "[*] Lando GUI server stopped successfully!"
    echo
    exit 0
fi

# If we get here, couldn't find the process
echo "[X] Could not find Lando GUI process"
echo "    Port 3000 may be in use by another application"
echo
exit 1
