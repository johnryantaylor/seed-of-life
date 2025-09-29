/* Start page animation: background image with seed launch */

const DESIGN_WIDTH = 320;
const DESIGN_HEIGHT = 180;

const startCanvas = document.getElementById('start');
const sctx = startCanvas.getContext('2d', { alpha: false });
sctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  startCanvas.style.width = cssW + 'px';
  startCanvas.style.height = cssH + 'px';
  startCanvas.width = Math.floor(cssW * dpr);
  startCanvas.height = Math.floor(cssH * dpr);
  const scaleX = startCanvas.width / DESIGN_WIDTH;
  const scaleY = startCanvas.height / DESIGN_HEIGHT;
  viewScale = Math.min(scaleX, scaleY);
  viewOffsetX = Math.floor((startCanvas.width - DESIGN_WIDTH * viewScale) / 2);
  viewOffsetY = Math.floor((startCanvas.height - DESIGN_HEIGHT * viewScale) / 2);
}

let viewScale = 1, viewOffsetX = 0, viewOffsetY = 0;
window.addEventListener('resize', fitCanvas);
fitCanvas();

// Background image (try multiple common paths)
let bg = new Image();
let bgReady = false;
const bgCandidates = [
  './assets/start-bg.png',
  './start-bg.png',
  './assets/start.png',
  './start.png'
];
let bgIndex = 0;
function tryLoadNextBg() {
  if (bgIndex >= bgCandidates.length) {
    // Give up; continue animation without bg
    requestAnimationFrame(frameStart);
    return;
  }
  const src = bgCandidates[bgIndex++];
  const img = new Image();
  img.onload = () => {
    bg = img;
    bgReady = true;
    requestAnimationFrame(frameStart);
  };
  img.onerror = () => {
    bgReady = false;
    tryLoadNextBg();
  };
  // Cache-bust to avoid stale 404s after upload
  img.src = src + '?v=' + String(Date.now());
}
tryLoadNextBg();

function drawScene(t) {
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, startCanvas.width, startCanvas.height);
  sctx.setTransform(viewScale, 0, 0, viewScale, viewOffsetX, viewOffsetY);
  sctx.imageSmoothingEnabled = false;
  if (bgReady && bg.width && bg.height) {
    // Cover-fit the image into DESIGN dimensions with nearest-neighbor
    const scale = Math.max(DESIGN_WIDTH / bg.width, DESIGN_HEIGHT / bg.height);
    const drawW = Math.floor(bg.width * scale);
    const drawH = Math.floor(bg.height * scale);
    const dx = Math.floor((DESIGN_WIDTH - drawW) / 2);
    const dy = Math.floor((DESIGN_HEIGHT - drawH) / 2);
    sctx.drawImage(bg, 0, 0, bg.width, bg.height, dx, dy, drawW, drawH);
  }
}

// Seed launch animation state
// Seed arc animation to star, then show title/button
let animPhase = 'delay'; // 'delay' -> 'seed' -> 'star' -> 'title'
let animT = 0; // 0..1 along curve
let lastMs = performance.now();
let delayStartMs = null;
const P0 = { x: DESIGN_WIDTH * 0.5, y: DESIGN_HEIGHT * 0.5 };
const P2 = { x: DESIGN_WIDTH * 0.8, y: DESIGN_HEIGHT * 0.2 };
// Early motion should be mostly rightward: keep control point near same Y as start
const P1 = { x: DESIGN_WIDTH * 0.72, y: DESIGN_HEIGHT * 0.50 }; // control for arc

const trail = [];
function bezier(t, p0, p1, p2) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * p0.x + 2 * u * t * p1.x + tt * p2.x,
    y: uu * p0.y + 2 * u * t * p1.y + tt * p2.y,
  };
}

let prevPos = { x: P0.x, y: P0.y };
let starStartMs = 0;

function drawSeedAndTrail(pos, prev) {
  const vx = pos.x - prev.x;
  const vy = pos.y - prev.y;
  const speed = Math.max(0.0001, Math.hypot(vx, vy));
  const ux = vx / speed;
  const uy = vy / speed;
  const nx = -uy;
  const ny = ux;
  // append to trail
  trail.push({ x: pos.x, y: pos.y, createdAt: performance.now() });
  // keep recent 300ms
  const now = performance.now();
  for (let i = trail.length - 1; i >= 0; i--) {
    if (now - trail[i].createdAt > 300) { trail.splice(0, i); break; }
  }
  // draw trail similar to main game
  const baseWidth = 6;
  sctx.fillStyle = '#9fe7ff';
  for (let i = 0; i < trail.length; i++) {
    const age = now - trail[i].createdAt;
    const a = Math.max(0, 1 - age / 300);
    const tfrac = i / Math.max(1, trail.length - 1);
    const w = Math.max(1, Math.floor(baseWidth * (1 - tfrac)));
    const half = Math.floor(w / 2);
    sctx.save();
    sctx.globalAlpha = 0.8 * a * (1 - tfrac);
    for (let k = -half; k <= half; k++) {
      const rx = Math.round(trail[i].x + nx * k);
      const ry = Math.round(trail[i].y + ny * k);
      sctx.fillRect(rx, ry, 1, 1);
    }
    sctx.restore();
  }
  // draw seed shrinking along the path (3px -> 1px)
  const size = Math.max(1, 3 - Math.floor(animT * 2.5));
  sctx.fillStyle = '#fff9a8';
  sctx.fillRect(Math.floor(pos.x - Math.floor(size/2)), Math.floor(pos.y - Math.floor(size/2)), size, size);
}

function drawStar(cx, cy, scale, alpha) {
  sctx.save();
  sctx.globalAlpha = alpha;
  sctx.fillStyle = '#ffffff';
  const s = Math.max(1, Math.floor(scale));
  // plus shape with small diagonals
  sctx.fillRect(Math.floor(cx - s), Math.floor(cy), s*2+1, 1);
  sctx.fillRect(Math.floor(cx), Math.floor(cy - s), 1, s*2+1);
  if (s >= 2) {
    sctx.fillRect(cx - 1, cy - 1, 1, 1);
    sctx.fillRect(cx + 1, cy - 1, 1, 1);
    sctx.fillRect(cx - 1, cy + 1, 1, 1);
    sctx.fillRect(cx + 1, cy + 1, 1, 1);
  }
  sctx.restore();
}

function frameStart(nowMs) {
  const tsec = nowMs / 1000;
  drawScene(tsec);

  sctx.setTransform(viewScale, 0, 0, viewScale, viewOffsetX, viewOffsetY);
  sctx.imageSmoothingEnabled = false;

  if (animPhase === 'delay') {
    if (delayStartMs == null) delayStartMs = nowMs;
    // Pause for 2 seconds before starting seed movement
    if (nowMs - delayStartMs >= 2000) {
      animPhase = 'seed';
      lastMs = nowMs;
      prevPos = { x: P0.x, y: P0.y };
      trail.length = 0;
    }
  } else if (animPhase === 'seed') {
    // advance along curve
    const dt = Math.min(50, nowMs - lastMs);
    lastMs = nowMs;
    animT += dt / 1600; // ~1.6s duration
    if (animT > 1) { animT = 1; }
    const pos = bezier(animT, P0, P1, P2);
    drawSeedAndTrail(pos, prevPos);
    prevPos = pos;
    if (animT >= 1) {
      animPhase = 'star';
      starStartMs = nowMs;
    }
  } else if (animPhase === 'star') {
    // show star at destination: 0.5s shine then 0.35s shrink
    const elapsed = (nowMs - starStartMs);
    const cx = Math.floor(P2.x);
    const cy = Math.floor(P2.y);
    if (elapsed <= 500) {
      const alpha = 0.8 + 0.2 * Math.sin(elapsed * 0.02);
      drawStar(cx, cy, 3, alpha);
    } else if (elapsed <= 850) {
      const k = 1 - (elapsed - 500) / 350;
      drawStar(cx, cy, 1 + 2 * Math.max(0, k), 0.9 * k);
    } else {
      animPhase = 'title';
      document.getElementById('startTitle').style.display = 'block';
      document.getElementById('startSubtitle').style.display = 'block';
      setTimeout(() => {
        document.getElementById('enterBtn').style.display = 'block';
      }, 400);
    }
  }

  requestAnimationFrame(frameStart);
}
// Start animation after image load; if it fails, we still run

// Button interaction -> go to game page
const enterBtn = document.getElementById('enterBtn');
enterBtn.addEventListener('click', () => {
  window.location.href = './game.html';
});


