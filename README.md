# YouTube_Buddy — YouTube Downloader

A full-stack YouTube downloader with a slick dark UI. Paste any YouTube video or channel URL to download video, audio (MP3), or thumbnails.

## Features
- 📹 **Video download** — choose quality (1080p, 720p, 480p, etc.)
- 🎵 **Audio extraction** — downloads as MP3
- 🖼 **Thumbnail download** — saves the video thumbnail
- 📺 **Channel support** — loads up to 50 videos from any channel/playlist
- ⚡ **Streams directly to browser** — no temp files on server

## Requirements
- **Node.js** v16+ → https://nodejs.org
- **Python 3** + **yt-dlp** → `pip install yt-dlp`
- **ffmpeg** (for audio extraction) → https://ffmpeg.org

## Install ffmpeg
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html and add to PATH
```

## Run
```bash
chmod +x start.sh
./start.sh
```

Or manually:
```bash
# Terminal 1 - Backend
cd backend
npm install
node server.js

# Terminal 2 - Open frontend
open frontend/index.html   # macOS
xdg-open frontend/index.html  # Linux
# Windows: just double-click frontend/index.html
```

## Project Structure
```
ytdl-app/
├── backend/
│   ├── server.js       # Express API (port 3001)
│   └── package.json
├── frontend/
│   └── index.html      # Single-file UI
├── start.sh            # Startup script
└── README.md
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/info?url=...` | Fetch video/channel metadata |
| POST | `/api/download` | Stream download to client |

## Notes
- Downloads are streamed directly to your browser's downloads folder
- Channel mode loads max 50 videos (configurable in server.js)
- For best quality, yt-dlp merges video+audio using ffmpeg

frontend start - npx live-server