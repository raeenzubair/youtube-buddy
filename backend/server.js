const express = require("express");
const cors = require("cors");
const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const app = express();
app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

// ─────────────────────────────────────────────
// Binary paths
// ─────────────────────────────────────────────
const IS_WINDOWS = process.platform === "win32";
const YT_DLP    = IS_WINDOWS ? path.join(__dirname, "yt-dlp.exe") : "yt-dlp";
const FFMPEG    = IS_WINDOWS ? path.join(__dirname, "ffmpeg.exe") : "ffmpeg";
const FFMPEG_EXISTS = fs.existsSync(FFMPEG) || !IS_WINDOWS;

if (IS_WINDOWS && !fs.existsSync(YT_DLP)) {
  console.warn("⚠  yt-dlp.exe not found — download it into backend/");
} else {
  console.log("✅ yt-dlp  :", YT_DLP);
}
if (IS_WINDOWS && !fs.existsSync(FFMPEG)) {
  console.warn("⚠  ffmpeg.exe not found — videos will have NO AUDIO");
} else {
  console.log("✅ ffmpeg   :", FFMPEG);
}

// ─────────────────────────────────────────────
// In-memory job store
// ─────────────────────────────────────────────
const jobs = new Map();
// job shape: { status, percent, speed, eta, label, filePath, fileName, mimeType, error }

// ─────────────────────────────────────────────
// Helper: run yt-dlp, collect all stdout, parse JSON
// ─────────────────────────────────────────────
function ytdlpJSON(args) {
  return new Promise((resolve, reject) => {
    execFile(YT_DLP, args, { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || "").split("\n").find(l => l.trim()) || err.message;
        return reject(new Error(msg));
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("Failed to parse yt-dlp output")); }
    });
  });
}

// ─────────────────────────────────────────────
// Detect channel vs single video
// ─────────────────────────────────────────────
function isChannelUrl(url) {
  return (
    url.includes("/@") ||
    url.includes("/channel/") ||
    url.includes("/c/") ||
    url.includes("/user/")
  ) && !url.includes("watch?v=");
}

function isPlaylistUrl(url) {
  return url.includes("list=") && !url.includes("watch?v=");
}

function getChannelVideosUrl(url) {
  let base = url
    .replace(/\/$/, "")
    .replace(/\/(videos|shorts|streams|playlists|community|about)$/, "");
  return base + "/videos";
}

async function fetchChannelVideos(originalUrl) {
  const videosUrl = getChannelVideosUrl(originalUrl);
  console.log("[channel] fetching:", videosUrl);

  const data = await ytdlpJSON([
    "--flat-playlist",
    "--dump-single-json",
    "--extractor-args", "youtube:skip=authcheck",
    videosUrl,
  ]);

  let videos = [];

  for (const entry of (data.entries || [])) {
    if (entry._type === "playlist" || entry.ie_key === "YoutubeTab") continue;
    if (entry.id && (entry.url?.includes("watch?v=") || entry.id.length === 11)) {
      videos.push({
        id:         entry.id,
        title:      entry.title || "Untitled",
        url:        entry.url?.startsWith("http") ? entry.url : `https://www.youtube.com/watch?v=${entry.id}`,
        thumbnail:  getBestThumbnail(entry),
        duration:   entry.duration   || null,
        view_count: entry.view_count || null,
      });
    }
  }

  if (videos.length === 0 && data.entries?.length > 0) {
    const firstPlaylist = data.entries.find(e => e._type === "playlist" && (
      e.url?.includes("/videos") || e.title?.toLowerCase().includes("video")
    ));
    if (firstPlaylist && firstPlaylist.url) {
      const inner = await ytdlpJSON([
        "--flat-playlist",
        "--dump-single-json",
        firstPlaylist.url,
      ]);
      for (const e of (inner.entries || [])) {
        if (e.id && e.id.length === 11) {
          videos.push({
            id:         e.id,
            title:      e.title || "Untitled",
            url:        `https://www.youtube.com/watch?v=${e.id}`,
            thumbnail:  getBestThumbnail(e),
            duration:   e.duration   || null,
            view_count: e.view_count || null,
          });
        }
      }
    }
  }

  const channelName = data.uploader || data.channel || data.title || "Channel";

  let channelAvatar = null;
  if (data.thumbnails && data.thumbnails.length > 0) {
    const avatars = data.thumbnails.filter(t => {
      if (!t.url) return false;
      if (!t.width || !t.height) return true;
      const ratio = t.width / t.height;
      return ratio > 0.8 && ratio < 1.25;
    });
    const sorted = avatars.sort((a, b) => (a.width || 999) - (b.width || 999));
    const pick = sorted.find(t => (t.width || 0) >= 88) || sorted[sorted.length - 1];
    if (pick) channelAvatar = pick.url;
  }

  return { channelName, channelAvatar, videos };
}

// ─────────────────────────────────────────────
// Wait for file to exist AND stop growing (fully written)
// ─────────────────────────────────────────────
function waitForFile(filePath, cb, attempts = 0) {
  const MAX_ATTEMPTS = 30;
  const INTERVAL     = 500;

  if (!fs.existsSync(filePath)) {
    if (attempts >= MAX_ATTEMPTS) return cb(new Error('Timed out waiting for file'));
    return setTimeout(() => waitForFile(filePath, cb, attempts + 1), INTERVAL);
  }

  const size1 = fs.statSync(filePath).size;
  setTimeout(() => {
    if (!fs.existsSync(filePath)) return cb(new Error('File disappeared'));
    const size2 = fs.statSync(filePath).size;
    if (size2 === size1 && size2 > 0) {
      cb(null);
    } else {
      if (attempts >= MAX_ATTEMPTS) return cb(new Error('File never stabilized'));
      waitForFile(filePath, cb, attempts + 1);
    }
  }, INTERVAL);
}

function getBestThumbnail(entry) {
  if (entry.thumbnails && entry.thumbnails.length > 0) {
    const sorted = [...entry.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
    const best = sorted.find(t => t.url);
    if (best) return best.url;
  }
  if (entry.id) return `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
  return "";
}

// ─────────────────────────────────────────────
// GET /api/info
// ─────────────────────────────────────────────
app.get("/api/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL required" });
  console.log("\n[info]", url);

  try {
    if (isChannelUrl(url) || isPlaylistUrl(url)) {
      const { channelName, channelAvatar, videos } = await fetchChannelVideos(url);

      if (videos.length === 0) {
        return res.status(404).json({
          error: "No videos found. This channel may be private, empty, or the URL format is not supported."
        });
      }

      return res.json({
        type:           "channel",
        channel:        channelName,
        channel_avatar: channelAvatar,
        channel_url:    url,
        video_count:    videos.length,
        videos,
      });

    } else {
      const data = await ytdlpJSON(["--dump-single-json", "--no-playlist", url]);

      const formats = (data.formats || [])
        .filter(f => f.ext !== "mhtml" && (f.vcodec !== "none" || f.acodec !== "none"))
        .map(f => ({
          format_id: f.format_id,
          ext:       f.ext,
          quality:   f.height ? `${f.height}p` : f.abr ? `${f.abr}kbps` : f.format_note || f.format_id,
          filesize:  f.filesize || f.filesize_approx || null,
          vcodec:    f.vcodec,
          acodec:    f.acodec,
          height:    f.height || null,
          abr:       f.abr    || null,
        }))
        .filter((f, i, arr) => arr.findIndex(x => x.quality === f.quality && x.ext === f.ext) === i);

      return res.json({
        type:        "video",
        id:          data.id,
        title:       data.title,
        channel:     data.uploader || data.channel,
        duration:    data.duration,
        view_count:  data.view_count,
        like_count:  data.like_count,
        description: (data.description || "").slice(0, 300),
        thumbnail:   data.thumbnail,
        url:         data.webpage_url || url,
        formats,
        ffmpeg_available: FFMPEG_EXISTS,
      });
    }

  } catch (err) {
    console.error("[/api/info error]", err.message);
    res.status(500).json({ error: err.message || "Failed to fetch info" });
  }
});

// ─────────────────────────────────────────────
// POST /api/start-download
// ─────────────────────────────────────────────
app.post("/api/start-download", async (req, res) => {
  const { url, format, type } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  const jobId = randomUUID();
  const os = require("os");
  const downloadsDir = IS_WINDOWS
    ? path.join(os.homedir(), 'Downloads')
    : path.join(os.homedir(), 'Downloads');
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
  const tmpDir = downloadsDir;

  // Initialize job
  jobs.set(jobId, {
    status:   "starting",
    percent:  0,
    speed:    "",
    eta:      "",
    label:    "Starting...",
    filePath: null,
    fileName: null,
    mimeType: null,
    error:    null,
  });

  res.json({ jobId });

  // ── Thumbnail (instant) ──
  if (type === "thumbnail") {
    try {
      const data = await ytdlpJSON(["--dump-single-json", "--no-playlist", url]);
      const job = jobs.get(jobId);
      job.status = "done";
      job.thumbnailUrl = data.thumbnail;
    } catch (err) {
      const job = jobs.get(jobId);
      job.status = "error";
      job.error = err.message;
    }
    return;
  }

  // ── Get title first ──
  const safeTitle = await new Promise(resolve => {
    execFile(YT_DLP, ["--get-title", "--no-playlist", url], { timeout: 15000 }, (err, stdout) => {
      const safe = (stdout || "video").trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "video";
      resolve(safe);
    });
  });

  const ext      = type === "audio" ? "mp3" : "mp4";
  const fileName = `${safeTitle}.${ext}`;
  const filePath = path.join(tmpDir, fileName);

  const job = jobs.get(jobId);
  job.fileName = fileName;
  job.filePath = filePath;
  job.mimeType = type === "audio" ? "audio/mpeg" : "video/mp4";
  job.label    = type === "audio" ? "Extracting MP3..." : "Downloading video...";
  job.status   = "downloading";

  // ── Build yt-dlp args ──
  let args;
  if (type === "audio") {
    args = [
      "-x", "--audio-format", "mp3", "--audio-quality", "0",
      "--embed-thumbnail",           // ✅ embed video thumbnail as MP3 cover art
      "--convert-thumbnails", "jpg", // ✅ convert webp → jpg (required for MP3 ID3 tags)
      "--ffmpeg-location", FFMPEG,
      "--newline",
      "-o", filePath,
      "--no-playlist", url,
    ];
  } else {
    const fmtArg = FFMPEG_EXISTS
      ? (format ? `${format}+bestaudio/best` : "bestvideo+bestaudio/best")
      : "best[ext=mp4]/best";
    args = [
      "-f", fmtArg,
      "--merge-output-format", "mp4",
      "--ffmpeg-location", FFMPEG,
      "--newline",
      "-o", filePath,
      "--no-playlist", url,
    ];
  }

  const proc = spawn(YT_DLP, args);

  // ── Parse yt-dlp progress ──
  const parseLine = (line) => {
    const pctMatch   = line.match(/(\d+\.?\d*)%/);
    const speedMatch = line.match(/at\s+([\d.]+\w+\/s)/);
    const etaMatch   = line.match(/ETA\s+([\d:]+)/);
    const sizeMatch  = line.match(/of\s+([\d.]+\s*\w+iB)/);

    if (pctMatch) {
      const j = jobs.get(jobId);
      if (!j) return;
      j.percent = parseFloat(pctMatch[1]);
      j.speed   = speedMatch ? speedMatch[1] : j.speed;
      j.eta     = etaMatch   ? etaMatch[1]   : j.eta;
      j.size    = sizeMatch  ? sizeMatch[1]  : j.size;

      if (line.includes("[Merger]") || line.includes("Merging")) {
        j.label = "Merging audio & video...";
      } else if (line.includes("[ExtractAudio]") || line.includes("Destination")) {
        j.label = "Converting to MP3...";
      } else if (line.includes("[EmbedThumbnail]")) {
        j.label = "Embedding thumbnail..."; // ✅ new label for thumbnail embed phase
      }
    }
  };

  proc.stdout.on("data", d => d.toString().split("\n").forEach(parseLine));
  proc.stderr.on("data", d => {
    const lines = d.toString().split("\n");
    lines.forEach(l => {
      parseLine(l);
      if (l.trim()) console.log("[yt-dlp]", l);
    });
  });

  proc.on("close", code => {
    const j = jobs.get(jobId);
    if (!j) return;
    if (code !== 0) {
      j.status = "error";
      j.error  = `yt-dlp exited with code ${code}`;
      console.error(`[job ${jobId}] failed, code=${code}`);
      return;
    }
    waitForFile(filePath, (err) => {
      if (err) {
        j.status = "error";
        j.error  = "File not found after download: " + err.message;
        console.error(`[job ${jobId}] file missing:`, err.message);
      } else {
        j.status  = "done";
        j.percent = 100;
        j.label   = "Complete!";
        console.log(`[job ${jobId}] done →`, filePath);
      }
    });
  });

  proc.on("error", err => {
    const j = jobs.get(jobId);
    if (j) { j.status = "error"; j.error = err.message; }
  });
});

// ─────────────────────────────────────────────
// GET /api/progress/:jobId  (SSE stream)
// ─────────────────────────────────────────────
app.get("/api/progress/:jobId", (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const interval = setInterval(() => {
    const job = jobs.get(jobId);
    if (!job) {
      send({ status: "error", error: "Job not found" });
      clearInterval(interval);
      res.end();
      return;
    }

    send({
      status:  job.status,
      percent: job.percent,
      speed:   job.speed,
      eta:     job.eta,
      size:    job.size,
      label:   job.label,
      error:   job.error,
    });

    if (job.status === "done" || job.status === "error") {
      clearInterval(interval);
      setTimeout(() => res.end(), 200);
    }
  }, 400);

  req.on("close", () => clearInterval(interval));
});

// ─────────────────────────────────────────────
// GET /api/download-file/:jobId
// ─────────────────────────────────────────────
app.get("/api/download-file/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || job.status !== "done") {
    return res.status(404).json({ error: "File not ready" });
  }

  if (job.thumbnailUrl) {
    return res.json({ thumbnail_url: job.thumbnailUrl });
  }

  if (!job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(404).json({ error: "File not found on disk" });
  }

  res.setHeader("Content-Type", job.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${job.fileName}"`);
  res.setHeader("Content-Length", fs.statSync(job.filePath).size);

  const stream = fs.createReadStream(job.filePath);
  stream.pipe(res);

  stream.on("close", () => {
    setTimeout(() => {
      try { fs.unlinkSync(job.filePath); } catch {}
      jobs.delete(jobId);
    }, 30000);
  });
});

// ─────────────────────────────────────────────
// Legacy POST /api/download (thumbnail only)
// ─────────────────────────────────────────────
app.post("/api/download", (req, res) => {
  const { url, type } = req.body;
  if (type === "thumbnail") {
    return ytdlpJSON(["--dump-single-json", "--no-playlist", url])
      .then(data => res.json({ thumbnail_url: data.thumbnail }))
      .catch(err => res.status(500).json({ error: err.message }));
  }
  res.status(400).json({ error: "Use /api/start-download instead" });
});

// ─────────────────────────────────────────────
// Silence browser auto-probe 404s
// ─────────────────────────────────────────────
app.get('/', (req, res) => res.send('TubeSnatch API running ✅'));
app.use((req, res, next) => {
  if (req.path.startsWith('/.well-known/')) return res.status(204).end();
  next();
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
const PORT = 3001;
app.listen(PORT, () => {
  console.log("\n═══════════════════════════════════════");
  console.log("  🎬 TubeSnatch API is running!");
  console.log(`  📡 http://localhost:${PORT}`);
  if (!FFMPEG_EXISTS) console.log("  ⚠  ffmpeg missing — videos will have no audio!");
  console.log("═══════════════════════════════════════\n");
});