/* ─────────────────────────────────────────────
   TubeSnatch — app.js  (redesigned)
   ───────────────────────────────────────────── */

const API = 'http://localhost:3001';
let selectedFormat = null;
let currentChannelData = null;
let currentPage = 1;
const PAGE_SIZE = 50;

/* ── SVG ICONS ── */
const icons = {
  download: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 8V2H7v6H2l8 8 8-8h-5zM0 18h20v2H0v-2z"/></svg>`,
  music:    `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.369 4.369 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z"/></svg>`,
  image:    `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v6l4-2 4 4 2-2 2 2V5H4zm3 3a1 1 0 110-2 1 1 0 010 2z"/></svg>`,
  eye:      `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>`,
  video:    `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"/></svg>`,
  back:     `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>`,
  play:     `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>`,
  check:    `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`,
  playOutline: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>`,
};

/* ── UTILITIES ── */
function fmtDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
function fmtNum(n) {
  if (!n) return '';
  if (n > 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n;
}
function fmtSize(b) {
  if (!b) return '';
  if (b > 1e9) return (b / 1e9).toFixed(1) + 'GB';
  if (b > 1e6) return (b / 1e6).toFixed(0) + 'MB';
  if (b > 1e3) return (b / 1e3).toFixed(0) + 'KB';
  return b + 'B';
}
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

/* ── LIVE URL TYPE DETECTION ── */
function detectUrlType(url) {
  if (!url) return null;
  if (url.includes('list=') && !url.includes('watch?v=')) return 'playlist';
  if (
    (url.includes('/@') || url.includes('/channel/') || url.includes('/c/') || url.includes('/user/')) &&
    !url.includes('watch?v=')
  ) return 'channel';
  if (url.includes('youtu.be/') || url.includes('watch?v=') || url.includes('youtube.com/shorts/')) return 'video';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'unknown';
  return null;
}

function updateUrlTypeIndicator(url) {
  const indicator = document.getElementById('urlTypeIndicator');
  const badge     = document.getElementById('typeBadge');
  const hint      = document.getElementById('typeHint');

  if (!url || !url.trim()) {
    indicator.style.display = 'none';
    return;
  }

  const type = detectUrlType(url.trim());

  if (!type) {
    indicator.style.display = 'none';
    return;
  }

  const config = {
    video:    { label: '📹 Video',    hint: 'Download video, audio, or thumbnail',  cls: 'type-video'    },
    channel:  { label: '📺 Channel',  hint: 'Browse and bulk-download all videos',  cls: 'type-channel'  },
    playlist: { label: '🎵 Playlist', hint: 'Download all or selected videos',      cls: 'type-playlist' },
    unknown:  { label: '🔗 YouTube',  hint: 'Paste the full video or channel URL',  cls: 'type-unknown'  },
  };

  const c = config[type];
  badge.textContent = c.label;
  badge.className   = `type-badge ${c.cls}`;
  hint.textContent  = c.hint;
  indicator.style.display = 'flex';
}

/* ── EXAMPLE PILLS — paste AND auto-analyze ── */
function setExample(type) {
  const examples = {
    video:    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    channel:  'https://www.youtube.com/@veritasium',
    playlist: 'https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Ar_3GPy3workz0zkJ2zHs',
  };
  const input = document.getElementById('urlInput');
  input.value = examples[type];
  updateUrlTypeIndicator(examples[type]);
  fetchInfo();
}

/* ── VIDEO PREVIEW MODAL ── */
function openPreview(videoId, title) {
  const modal  = document.getElementById('previewModal');
  const iframe = document.getElementById('previewIframe');
  const mtitle = document.getElementById('modalTitle');
  iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`;
  mtitle.textContent = title || '';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePreview() {
  const modal  = document.getElementById('previewModal');
  const iframe = document.getElementById('previewIframe');
  modal.classList.remove('open');
  iframe.src = '';
  document.body.style.overflow = '';
}

document.getElementById('previewModal').addEventListener('click', function(e) {
  if (e.target === this) closePreview();
});
document.getElementById('modalCloseBtn').addEventListener('click', closePreview);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePreview();
});

/* ── FETCH INFO ── */
async function fetchInfo() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) { showToast('Please paste a YouTube URL', 'error'); return; }

  document.getElementById('errorBox').classList.remove('show');
  document.getElementById('result').classList.remove('show');
  document.getElementById('loader').classList.add('show');
  document.getElementById('fetchBtn').disabled = true;
  document.getElementById('loaderText').textContent = 'Analyzing URL...';
  currentChannelData = null;

  try {
    const res  = await fetch(`${API}/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch');

    document.getElementById('loader').classList.remove('show');
    document.getElementById('result').classList.add('show');

    if (data.type === 'video') renderVideo(data);
    else renderChannel(data);

  } catch (err) {
    document.getElementById('loader').classList.remove('show');
    const eb = document.getElementById('errorBox');
    eb.textContent = '⚠ ' + (err.message || 'Failed to connect. Make sure server is running on :3001');
    eb.classList.add('show');
  } finally {
    document.getElementById('fetchBtn').disabled = false;
  }
}

/* ── RENDER — SINGLE VIDEO ── */
function renderVideo(data, fromChannel = false) {
  selectedFormat = null;

  const videoId = (data.url || '').match(/[?&]v=([^&]+)/)?.[1] || data.id || '';

  const videoFormats = (data.formats || [])
    .filter(f => f.vcodec !== 'none' && f.height)
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .filter((f, i, arr) => arr.findIndex(x => x.height === f.height) === i)
    .slice(0, 6);

  const formatOptions = videoFormats.map(f => `
    <div class="dl-option" onclick="selectFormat('${f.format_id}', this)">
      <div class="opt-label">${f.height}p ${f.ext.toUpperCase()}</div>
      <div class="opt-sub">${fmtSize(f.filesize) || 'size varies'}</div>
    </div>
  `).join('');

  const backBtn = fromChannel ? `
    <button class="btn-back" onclick="renderChannel(currentChannelData)">
      ${icons.back} Back to Channel
    </button>
  ` : '';

  const safeTitle = (data.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  document.getElementById('result').innerHTML = `
    <div class="fade-up">
      ${backBtn}
      <div class="video-card">
        <div class="video-hero">

          <div class="video-thumb-wrap" onclick="openPreview('${videoId}', '${safeTitle}')">
            <img src="${data.thumbnail}" alt="${data.title}" onerror="this.style.display='none'">
            <div class="thumb-overlay"></div>
            <div class="thumb-play-btn">
              <div class="thumb-play-circle">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
              </div>
            </div>
            <div class="thumb-preview-badge">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
              Watch Preview
            </div>
          </div>

          <div class="video-info">
            <div class="video-channel">${icons.video} ${data.channel || 'YouTube'}</div>
            <div class="video-title">${data.title}</div>
            <div class="video-meta">
              ${data.duration   ? `<span class="meta-chip">⏱ ${fmtDuration(data.duration)}</span>` : ''}
              ${data.view_count ? `<span class="meta-chip">${icons.eye} ${fmtNum(data.view_count)} views</span>` : ''}
              ${data.like_count ? `<span class="meta-chip">👍 ${fmtNum(data.like_count)}</span>` : ''}
            </div>
            ${data.description ? `<div class="desc">${data.description}</div>` : ''}
            ${videoId ? `
              <button class="btn-watch-preview" onclick="openPreview('${videoId}', '${safeTitle}')">
                ${icons.playOutline} Watch Preview
              </button>
            ` : ''}
          </div>
        </div>

        <div class="dl-section">
          ${videoFormats.length ? `
            <div class="format-label">SELECT QUALITY</div>
            <div class="dl-grid">${formatOptions}</div>
          ` : ''}

          <div class="quick-actions">
            <button class="btn-action btn-video" onclick="startDownload('${data.url}', 'video')">
              ${icons.download} Download Video
            </button>
            <button class="btn-action btn-audio" onclick="startDownload('${data.url}', 'audio')">
              ${icons.music} MP3 Audio
            </button>
            <button class="btn-action btn-thumb" onclick="downloadThumb('${data.url}', '${safeTitle}')">
              ${icons.image} Thumbnail
            </button>
          </div>

          <div class="dl-progress-panel" id="dlProgress" style="display:none;">
            <div class="dp-stages" id="dpStages"></div>
            <div class="dp-bar-row">
              <div class="dp-bar-track">
                <div class="dp-bar-fill" id="dpFill"></div>
              </div>
              <div class="dp-pct" id="dpPct">0%</div>
            </div>
            <div class="dp-meta" id="dpMeta"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ── RENDER — CHANNEL (paginated) ── */
function renderChannel(data, page = 1) {
  currentChannelData = data;
  currentPage = page;
  const initial = (data.channel || 'Y').charAt(0).toUpperCase();

  const totalPages = Math.ceil(data.videos.length / PAGE_SIZE);
  const start      = (page - 1) * PAGE_SIZE;
  const pageVideos = data.videos.slice(start, start + PAGE_SIZE);

  const videoCards = pageVideos.map((v, localIdx) => {
    const globalIdx = start + localIdx;
    const safeTitle = (v.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const videoId   = (v.url || '').match(/[?&]v=([^&]+)/)?.[1] || v.id || '';
    return `
    <div class="vcard" onclick="openChannelVideo(${globalIdx})" title="Click to see download options">
      <div class="vcard-thumb" onclick="event.stopPropagation(); ${videoId ? `openPreview('${videoId}', '${safeTitle}')` : ''}">
        <img src="${v.thumbnail}" alt="${v.title}" loading="lazy"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 9%22><rect fill=%22%23111%22 width=%2216%22 height=%229%22/></svg>'">
        <div class="vcard-play-overlay">
          <div class="vcard-play-icon">${icons.play}</div>
        </div>
        ${v.duration ? `<div class="vcard-duration">${fmtDuration(v.duration)}</div>` : ''}
      </div>
      <div class="vcard-body">
        <div class="vcard-title">${v.title}</div>
        ${v.view_count ? `<div class="vcard-views">${fmtNum(v.view_count)} views</div>` : ''}
        ${videoId ? `
        <button class="vcard-preview-btn" onclick="event.stopPropagation(); openPreview('${videoId}', '${safeTitle}')">
          <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
          Watch Preview
        </button>
        ` : ''}
        <div class="vcard-actions" onclick="event.stopPropagation()">
          <button class="vcard-btn v" onclick="startChannelDownload('${v.url}', 'video', this)" title="Download video">
            ${icons.download} Video
          </button>
          <button class="vcard-btn a" onclick="startChannelDownload('${v.url}', 'audio', this)" title="Download MP3">
            ${icons.music} MP3
          </button>
          <button class="vcard-btn t" onclick="downloadThumb('${v.url}', '${v.title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" title="Download thumbnail">
            ${icons.image}
          </button>
        </div>
        <div class="vcard-progress" id="vp_${globalIdx}" style="display:none;">
          <div class="vp-bar-track"><div class="vp-bar-fill" id="vpf_${globalIdx}"></div></div>
          <div class="vp-meta"><span id="vpm_${globalIdx}">Starting...</span></div>
        </div>
      </div>
    </div>
  `}).join('');

  let pageButtons = '';
  if (totalPages > 1) {
    const delta = 2;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pages.push(i);
      }
    }
    const withGaps = [];
    let prev = 0;
    for (const p of pages) {
      if (prev && p - prev > 1) withGaps.push('...');
      withGaps.push(p);
      prev = p;
    }
    pageButtons = withGaps.map(p =>
      p === '...'
        ? `<span class="pg-ellipsis">…</span>`
        : `<button class="pg-btn ${p === page ? 'active' : ''}" onclick="renderChannel(currentChannelData, ${p})">${p}</button>`
    ).join('');
  }

  document.getElementById('result').innerHTML = `
    <div class="fade-up">
      <div class="channel-header">
        <div class="channel-icon">
          ${data.channel_avatar ? `<img src="${data.channel_avatar}" alt="${data.channel}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
          <span style="${data.channel_avatar ? 'display:none' : ''}">${initial}</span>
        </div>
        <div style="flex:1">
          <div class="channel-name">${data.channel}</div>
          <div class="channel-count">
            ${data.videos.length} videos
            ${totalPages > 1 ? `— page ${page} of ${totalPages}` : ''}
          </div>
        </div>
        ${totalPages > 1 ? `
        <div class="pg-top">
          <button class="pg-btn pg-arrow" onclick="renderChannel(currentChannelData, ${page - 1})" ${page === 1 ? 'disabled' : ''}>← Prev</button>
          <span class="pg-top-label">${page} / ${totalPages}</span>
          <button class="pg-btn pg-arrow" onclick="renderChannel(currentChannelData, ${page + 1})" ${page === totalPages ? 'disabled' : ''}>Next →</button>
        </div>
        ` : ''}
      </div>

      <div class="video-grid" id="videoGrid">${videoCards}</div>

      ${totalPages > 1 ? `
        <div class="pagination">
          <button class="pg-btn pg-arrow" onclick="renderChannel(currentChannelData, ${page - 1})" ${page === 1 ? 'disabled' : ''}>
            ← Prev
          </button>
          <div class="pg-pages">${pageButtons}</div>
          <button class="pg-btn pg-arrow" onclick="renderChannel(currentChannelData, ${page + 1})" ${page === totalPages ? 'disabled' : ''}>
            Next →
          </button>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── OPEN CHANNEL VIDEO ── */
async function openChannelVideo(idx) {
  const v = currentChannelData.videos[idx];
  if (!v) return;

  document.getElementById('result').innerHTML = `
    <div style="text-align:center; padding: 60px 0;">
      <div class="spinner"></div>
      <p style="color:var(--muted); margin-top:16px; font-size:0.85rem;">Loading video info...</p>
    </div>
  `;

  try {
    const res  = await fetch(`${API}/api/info?url=${encodeURIComponent(v.url)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch video info');
    renderVideo(data, true);
  } catch (err) {
    showToast('✗ Failed to load video: ' + err.message, 'error');
    renderChannel(currentChannelData);
  }
}

/* ── FORMAT SELECTION ── */
function selectFormat(fid, el) {
  document.querySelectorAll('.dl-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedFormat = fid;
}

/* ── STAGE HELPERS ── */
const STAGES_VIDEO = ['Fetching', 'Downloading', 'Merging'];
const STAGES_AUDIO = ['Fetching', 'Downloading', 'Converting', 'Embedding'];

function renderStages(stages, activeIdx) {
  return stages.map((s, i) => {
    const cls = i < activeIdx ? 'done' : i === activeIdx ? 'active' : '';
    const dot = i < activeIdx ? icons.check.replace('viewBox', 'width="8" height="8" viewBox') : '<span class="dp-stage-dot"></span>';
    return `<div class="dp-stage ${cls}">${dot} ${s}</div>`;
  }).join('');
}

function getStageIndex(label, type) {
  if (!label) return 1;
  const l = label.toLowerCase();
  if (l.includes('starting') || l.includes('fetching')) return 0;
  if (l.includes('converting') || l.includes('extracting')) return type === 'audio' ? 2 : 2;
  if (l.includes('embedding') || l.includes('thumbnail')) return 3;
  if (l.includes('merging')) return 2;
  if (l.includes('complete') || l.includes('saved')) return (type === 'audio' ? STAGES_AUDIO : STAGES_VIDEO).length;
  return 1;
}

function updateProgressPanel(type, { label, percent, speed, eta, size, done, error }) {
  const stages   = type === 'audio' ? STAGES_AUDIO : STAGES_VIDEO;
  const stagesEl = document.getElementById('dpStages');
  const fill     = document.getElementById('dpFill');
  const pct      = document.getElementById('dpPct');
  const meta     = document.getElementById('dpMeta');
  if (!stagesEl) return;

  const stageIdx = done ? stages.length : error ? 0 : getStageIndex(label, type);
  stagesEl.innerHTML = renderStages(stages, stageIdx);

  const p = Math.min(Math.round(percent || 0), 100);
  fill.style.width = p + '%';
  pct.textContent  = p + '%';

  if (done) {
    fill.className = 'dp-bar-fill done';
    pct.style.color = 'var(--success)';
  } else if (error) {
    fill.className = 'dp-bar-fill error';
    pct.style.color = 'var(--accent)';
  } else {
    fill.className = 'dp-bar-fill';
    pct.style.color = '';
  }

  const items = [];
  if (label) items.push(`<div class="dp-meta-item highlight"><span class="dp-meta-icon">●</span>${label}</div>`);
  if (speed) items.push(`<div class="dp-meta-item"><span class="dp-meta-icon">⚡</span>${speed}</div>`);
  if (eta)   items.push(`<div class="dp-meta-item"><span class="dp-meta-icon">⏱</span>ETA ${eta}</div>`);
  if (size)  items.push(`<div class="dp-meta-item"><span class="dp-meta-icon">📦</span>${size}</div>`);
  meta.innerHTML = items.join('');
}

/* ── CORE: startDownload ── */
async function startDownload(url, type) {
  const panel = document.getElementById('dlProgress');
  panel.style.display = 'block';
  panel.className = 'dl-progress-panel';

  document.getElementById('dpStages').innerHTML = renderStages(
    type === 'audio' ? STAGES_AUDIO : STAGES_VIDEO, 0
  );
  document.getElementById('dpFill').style.width = '0%';
  document.getElementById('dpFill').className = 'dp-bar-fill';
  document.getElementById('dpPct').textContent = '0%';
  document.getElementById('dpPct').style.color = '';
  document.getElementById('dpMeta').innerHTML = `<div class="dp-meta-item">Starting download...</div>`;

  document.querySelectorAll('.btn-action').forEach(b => b.disabled = true);

  try {
    const startRes = await fetch(`${API}/api/start-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type, format: selectedFormat }),
    });
    const { jobId } = await startRes.json();

    let doneFileName = null;
    await trackProgress(jobId, {
      onProgress(data) {
        updateProgressPanel(type, {
          label:   data.label,
          percent: data.percent,
          speed:   data.speed,
          eta:     data.eta,
          size:    data.size,
        });
      },
      onDone(data) {
        doneFileName = data.fileName || (type === 'audio' ? 'audio.mp3' : 'video.mp4');
        updateProgressPanel(type, { label: '✓ Saved to Downloads!', percent: 100, done: true });
      },
      onError(msg) {
        updateProgressPanel(type, { label: '✗ ' + msg, percent: 0, error: true });
        panel.classList.add('error');
        showToast('✗ Download failed: ' + msg, 'error');
      }
    });

    if (doneFileName) {
      showDownloadBanner(doneFileName, type);
      setTimeout(() => { panel.style.display = 'none'; }, 5000);
    }

  } catch (err) {
    updateProgressPanel(type, { label: '✗ ' + err.message, error: true });
    showToast('✗ ' + err.message, 'error');
  } finally {
    document.querySelectorAll('.btn-action').forEach(b => b.disabled = false);
  }
}

/* ── CHANNEL CARD DOWNLOAD ── */
async function startChannelDownload(url, type, btnEl) {
  const card = btnEl.closest('.vcard');
  const allCards = Array.from(document.querySelectorAll('.vcard'));
  const idx = allCards.indexOf(card);

  const progressEl = document.getElementById(`vp_${idx}`);
  const fillEl     = document.getElementById(`vpf_${idx}`);
  const metaEl     = document.getElementById(`vpm_${idx}`);

  if (!progressEl) { showToast('⬇ Download starting...', 'info'); return; }

  progressEl.style.display = 'block';
  fillEl.style.width = '0%';
  metaEl.textContent = 'Starting...';
  card.querySelectorAll('.vcard-btn').forEach(b => b.disabled = true);

  try {
    const startRes = await fetch(`${API}/api/start-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type, format: null }),
    });
    const { jobId } = await startRes.json();

    let doneFileName = null;
    await trackProgress(jobId, {
      onProgress(data) {
        const p = Math.min(Math.round(data.percent || 0), 100);
        fillEl.style.width = p + '%';
        metaEl.textContent = `${data.label || ''}${data.speed ? ' · ' + data.speed : ''}${data.eta ? ' · ETA ' + data.eta : ''}` || p + '%';
      },
      onDone(data) {
        doneFileName = data.fileName || (type === 'audio' ? 'audio.mp3' : 'video.mp4');
        fillEl.style.width = '100%';
        fillEl.classList.add('done');
        metaEl.textContent = '✓ Saved!';
      },
      onError(msg) {
        metaEl.textContent = '✗ ' + msg;
        fillEl.classList.add('error');
        showToast('✗ ' + msg, 'error');
      }
    });

    if (doneFileName) {
      showDownloadBanner(doneFileName, type);
      metaEl.textContent = '✓ Saved to Downloads!';
    }
    setTimeout(() => {
      progressEl.style.display = 'none';
      fillEl.className = 'vp-bar-fill';
      card.querySelectorAll('.vcard-btn').forEach(b => b.disabled = false);
    }, 4000);

  } catch (err) {
    metaEl.textContent = '✗ ' + err.message;
    showToast('✗ ' + err.message, 'error');
    card.querySelectorAll('.vcard-btn').forEach(b => b.disabled = false);
  }
}

/* ── SSE PROGRESS TRACKER ── */
function trackProgress(jobId, { onProgress, onDone, onError }) {
  return new Promise((resolve) => {
    const es = new EventSource(`${API}/api/progress/${jobId}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.status === 'downloading' || data.status === 'starting') {
        onProgress(data);
      } else if (data.status === 'done') {
        onDone(data);
        es.close();
        resolve();
      } else if (data.status === 'error') {
        onError(data.error || 'Unknown error');
        es.close();
        resolve();
      }
    };

    es.onerror = () => {
      es.close();
      onError('Connection lost');
      resolve();
    };
  });
}

/* ── DOWNLOAD THUMBNAIL ── */
async function downloadThumb(url, title) {
  showToast('🖼 Fetching thumbnail...', 'info');
  try {
    const res  = await fetch(`${API}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'thumbnail' }),
    });
    const data = await res.json();
    if (data.thumbnail_url) {
      const imgRes = await fetch(data.thumbnail_url);
      const blob   = await imgRes.blob();
      const safe   = (title || 'thumbnail').replace(/[^\w\s-]/g, '').trim();
      triggerDownload(blob, safe + '.jpg');
      showToast('✓ Thumbnail saved!', 'success');
    }
  } catch (err) {
    showToast('✗ Failed: ' + err.message, 'error');
  }
}

/* ── DOWNLOAD COMPLETE BANNER ── */
function showDownloadBanner(fileName, type) {
  const old = document.getElementById('dlBanner');
  if (old) old.remove();

  const icon  = type === 'audio' ? '🎵' : type === 'video' ? '🎬' : '🖼';
  const label = type === 'audio' ? 'MP3 Audio' : type === 'video' ? 'Video' : 'Thumbnail';

  const banner = document.createElement('div');
  banner.id = 'dlBanner';
  banner.className = 'dl-banner';
  banner.innerHTML = `
    <div class="dl-banner-icon">${icon}</div>
    <div class="dl-banner-info">
      <div class="dl-banner-title">Download Complete!</div>
      <div class="dl-banner-file">${label} · ${fileName}</div>
      <div class="dl-banner-hint">Check your Downloads folder</div>
    </div>
    <button class="dl-banner-close" onclick="this.closest('.dl-banner').remove()">✕</button>
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('show'));
  setTimeout(() => {
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 400);
  }, 6000);
}

/* ── HELPER: trigger browser download ── */
function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── INPUT LISTENERS ── */
document.getElementById('urlInput').addEventListener('input', e => {
  updateUrlTypeIndicator(e.target.value);
});

document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchInfo();
});