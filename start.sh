#!/bin/bash
echo "🎬 Starting TubeSnatch YouTube Downloader..."

# Check dependencies
if ! command -v yt-dlp &> /dev/null; then
  echo "Installing yt-dlp..."
  pip install yt-dlp --break-system-packages
fi

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org"
  exit 1
fi

# Install npm packages if needed
cd "$(dirname "$0")/backend"
if [ ! -d node_modules ]; then
  echo "📦 Installing Node dependencies..."
  npm install
fi

# Start backend
echo "🚀 Starting backend on http://localhost:3001"
node server.js &
BACKEND_PID=$!

# Open frontend
sleep 1
echo "🌐 Opening frontend..."
FRONTEND_PATH="$(dirname "$0")/frontend/index.html"

if command -v xdg-open &> /dev/null; then
  xdg-open "$FRONTEND_PATH"
elif command -v open &> /dev/null; then
  open "$FRONTEND_PATH"
else
  echo "Open this file in your browser: $FRONTEND_PATH"
fi

echo ""
echo "✅ TubeSnatch is running!"
echo "   Backend: http://localhost:3001"
echo "   Frontend: $FRONTEND_PATH"
echo ""
echo "Press Ctrl+C to stop..."

wait $BACKEND_PID