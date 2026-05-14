#!/bin/bash
# Kill anything on port 8000
lsof -i :8000 -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# Find the Python that has the backend deps (3.12 from Homebrew)
PYTHON=/opt/homebrew/bin/python3.12
# Fallback: use whichever python3 has uvicorn
if [ ! -f "$PYTHON" ]; then
    PYTHON=$(which python3 2>/dev/null || echo python3)
fi

echo "Using: $PYTHON"
$PYTHON -m pip install slowapi -q 2>/dev/null
nohup $PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
echo "PID: $!"
sleep 3
curl -s http://localhost:8000/health
