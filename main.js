/* Seed of Life - retro gravity game */

const DESIGN_WIDTH = 320;   // base pixel canvas
const DESIGN_HEIGHT = 180;  // 16:9

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

// Camera/view
let viewScale = 1;
let viewOffsetX = 0;
let viewOffsetY = 0;

// UI elements (created dynamically)

const banner = document.createElement('div');
banner.id = 'banner';
document.body.appendChild(banner);

// Win banner (top-center, large text)
const winBanner = document.createElement('div');
winBanner.id = 'winBanner';
winBanner.style.display = 'none';
winBanner.innerHTML = '<div class="title">You win!</div><div class="subtitle">Seed planted</div>';
document.body.appendChild(winBanner);

const controls = document.createElement('div');
controls.id = 'controls';
controls.innerHTML = '<button id="btnMute">Mute</button>';
document.body.appendChild(controls);

const btnMute = document.getElementById('btnMute');

// Center action button (appears on win/lose)
const actionBtn = document.createElement('button');
actionBtn.id = 'actionBtn';
actionBtn.style.display = 'none';
document.body.appendChild(actionBtn);
actionBtn.addEventListener('click', () => restart());

// Start button (game pre-start)
const startBtn = document.createElement('button');
startBtn.id = 'startBtn';
startBtn.innerHTML = `<span class="label">Start</span>`;
startBtn.style.display = 'none';
document.body.appendChild(startBtn);
startBtn.addEventListener('click', () => {
  ensureAudio();
  playBeep(420, 80, 'square', 0.02);
  restart();
  startBtn.style.display = 'none';
});

// Start hint: show briefly on entering game, then auto-hide and start
const startHint = document.createElement('div');
startHint.id = 'startHint';
startHint.textContent = 'Click/tap to accelerate';
document.body.appendChild(startHint);
startHint.style.display = 'none';
// No auto-start: we will run a pre-start orbit animation first

// Orientation overlay (shown in portrait on mobile)
const orientationOverlay = document.createElement('div');
orientationOverlay.id = 'orientationOverlay';
orientationOverlay.innerHTML = '<div class="msg">Please rotate your device to landscape\nfor the best experience.</div>';
document.body.appendChild(orientationOverlay);

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

function isLikelyMobile() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function updateOrientationOverlay() {
  const show = isLikelyMobile() && isPortrait();
  orientationOverlay.style.display = show ? 'flex' : 'none';
}

async function attemptOrientationLock() {
  try {
    // Some browsers require fullscreen before locking orientation
    if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (err) {
    // Ignore; many browsers (esp. iOS Safari) don't allow programmatic lock
  }
}

// (removed) start button leaf canvas

// Fill the entire viewport; allow aspect ratio to adapt (may stretch)
function resize() {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);

  // Compute uniform world scale and center offsets so circles stay 1:1
  const scaleX = canvas.width / DESIGN_WIDTH;
  const scaleY = canvas.height / DESIGN_HEIGHT;
  viewScale = Math.min(scaleX, scaleY);
  viewOffsetX = Math.floor((canvas.width - DESIGN_WIDTH * viewScale) / 2);
  viewOffsetY = Math.floor((canvas.height - DESIGN_HEIGHT * viewScale) / 2);
  updateOrientationOverlay();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// RNG helper
function randRange(min, max) { return Math.random() * (max - min) + min; }

// Stable pseudo-random in [0,1) based on integer coords
function hash01(ix, iy) {
  let n = (ix * 374761393 + iy * 668265263) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = (n * 1274126177) | 0;
  return ((n >>> 0) % 1000) / 1000;
}

// Compute centered square crop for an image so draw regions align across variants
function getSquareCrop(img) {
  const s = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - s) / 2);
  const sy = Math.floor((img.height - s) / 2);
  return { sx, sy, sw: s, sh: s };
}

// Audio (tiny retro)
let audioCtx = null;
let isMuted = false;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function playBeep(freq, durationMs, type = 'square', gain = 0.03) {
  if (isMuted) return;
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + durationMs / 1000);
}

btnMute.addEventListener('click', () => {
  isMuted = !isMuted;
  btnMute.textContent = isMuted ? 'Unmute' : 'Mute';
  playBeep(220, 60, 'square', 0.02);
});

// World config
const G = 120; // base gravitational constant
// Planet A is our sun (yellow/orange, stronger visual glow)
const PLANET_A = { pos: { x: 90, y: 90 }, mass: 1600, radius: 12, gScale: 1.0 };
// Planet B is a rocky planet; reduce its effective gravity by 50%
const PLANET_B = { pos: { x: 230, y: 90 }, mass: 2200, radius: 9, gScale: 0.5 };

// Starfield pre-render to offscreen for performance
const stars = (() => {
  const off = document.createElement('canvas');
  // Render at 2x resolution so stars appear half-size when scaled to screen
  off.width = DESIGN_WIDTH * 2;
  off.height = DESIGN_HEIGHT * 2;
  const sctx = off.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, off.width, off.height);
  for (let i = 0; i < 1200; i++) {
    const x = Math.floor(Math.random() * off.width);
    const y = Math.floor(Math.random() * off.height);
    const c = Math.random() < 0.85 ? 200 + Math.floor(Math.random() * 55) : 80 + Math.floor(Math.random() * 120);
    sctx.fillStyle = `rgb(${c},${c},${c})`;
    sctx.fillRect(x, y, 1, 1);
  }
  return off;
})();

// Optional uploaded planet image (drawn for PLANET_A if available)
let planetImg = null;
let planetImgReady = false;
const planetImgCandidates = [
  './assets/planet.png',
  './assets/volcano-planet.png',
  './assets/planet-volcano.png'
];
let planetImgIdx = 0;
function tryLoadPlanetImage() {
  if (planetImgIdx >= planetImgCandidates.length) return;
  const src = planetImgCandidates[planetImgIdx++] + '?v=' + String(Date.now());
  const img = new Image();
  img.onload = () => { planetImg = img; planetImgReady = true; };
  img.onerror = () => { planetImgReady = false; tryLoadPlanetImage(); };
  img.src = src;
}
tryLoadPlanetImage();

// Destination planet image (PLANET_B)
let planetBImg = null;
let planetBImgReady = false;
function loadPlanetBImage() {
  const src = './assets/planet-b.png?v=' + String(Date.now());
  const img = new Image();
  img.onload = () => { planetBImg = img; planetBImgReady = true; };
  img.onerror = () => { planetBImgReady = false; };
  img.src = src;
}
loadPlanetBImage();

// Terraformed (green) destination image to reveal on win
let planetBGreenImg = null;
let planetBGreenReady = false;
function loadPlanetBGreenImage() {
  const src = './assets/planet-b-green.png?v=' + String(Date.now());
  const img = new Image();
  img.onload = () => { planetBGreenImg = img; planetBGreenReady = true; };
  img.onerror = () => { planetBGreenReady = false; };
  img.src = src;
}
loadPlanetBGreenImage();

function drawPlanet(p) {
  if (p === PLANET_A) {
    drawSun(p);
    return;
  }
  drawRockyPlanet(p);
}

function drawRockyPlanet(p) {
  const { x, y } = p.pos;
  const terraform = p === PLANET_B ? getTerraformProgress() : 0;
  // Base: if a custom image is provided for PLANET_B, draw it instead of procedural pixels
  if (p === PLANET_B && planetBImgReady && planetBImg) {
    const d = Math.max(2, Math.floor(2 * p.radius));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(planetBImg, 0, 0, planetBImg.width, planetBImg.height, Math.floor(x - d/2), Math.floor(y - d/2), d, d);
  } else {
    // Procedural base rocky body
    for (let dy = -p.radius; dy <= p.radius; dy++) {
      for (let dx = -p.radius; dx <= p.radius; dx++) {
        const rx = x + dx;
        const ry = y + dy;
        const r2 = dx*dx + dy*dy;
        if (r2 <= p.radius * p.radius) {
          const r = Math.sqrt(r2);
          const q = r / p.radius;
          const edge = Math.max(0, Math.min(1, (p.radius - r) / p.radius));
          const base = [100, 110, 100];
          const noise = Math.floor(randRange(-18, 18));
          const shade = Math.floor(60 + 120 * edge) + noise;
          let rr = Math.max(30, Math.min(200, base[0] + (shade - 100)));
          let gg = Math.max(30, Math.min(200, base[1] + (shade - 100)));
          let bb = Math.max(30, Math.min(200, base[2] + (shade - 100)));
          ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
          ctx.fillRect(rx, ry, 1, 1);
        }
      }
    }
  }

  // Reveal terraformed image in pieces instead of vines/atmosphere
  if (p === PLANET_B && terraform > 0 && state.terraform && planetBGreenReady && planetBGreenImg) {
    const progress = terraform;
    const cols = state.terraform.cols;
    const rows = state.terraform.rows;
    const d = Math.max(2, Math.floor(2 * p.radius));
    // Use exact fractional partition so tiles cover full destination without gaps
    const elapsed = state.timeMs - state.terraform.startedAt;
    // Determine how many pieces to reveal based on elapsed time and jittered order
    const revealMs = 2000; // ~2s total
    const cutoff = elapsed;
    const srcW = planetBGreenImg.width;
    const srcH = planetBGreenImg.height;
    for (let idx = 0; idx < state.terraform.revealPieces.length; idx++) {
      const piece = state.terraform.revealPieces[idx];
      const appearAt = piece.order * (revealMs / (cols * rows)) + piece.jitter;
      if (cutoff >= appearAt) {
        const sx0 = Math.floor(srcW * (piece.i) / cols);
        const sx1 = Math.floor(srcW * (piece.i + 1) / cols);
        const sy0 = Math.floor(srcH * (piece.j) / rows);
        const sy1 = Math.floor(srcH * (piece.j + 1) / rows);
        const sw = Math.max(1, sx1 - sx0);
        const sh = Math.max(1, sy1 - sy0);

        const dx0 = Math.floor(x - d/2) + Math.floor(d * (piece.i) / cols);
        const dx1 = Math.floor(x - d/2) + Math.floor(d * (piece.i + 1) / cols);
        const dy0 = Math.floor(y - d/2) + Math.floor(d * (piece.j) / rows);
        const dy1 = Math.floor(y - d/2) + Math.floor(d * (piece.j + 1) / rows);
        const dw = Math.max(1, dx1 - dx0);
        const dh = Math.max(1, dy1 - dy0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(planetBGreenImg, sx0, sy0, sw, sh, dx0, dy0, dw, dh);
      }
    }
  }

  // Atmosphere halo removed for destination planet
}

function drawSun(p) {
  // Draw a planet (image if provided) with a red halo
  const { x, y } = p.pos;

  // Halo removed for main planet

  if (planetImgReady && planetImg) {
    const d = Math.max(2, Math.floor(2 * p.radius));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(planetImg, 0, 0, planetImg.width, planetImg.height, Math.floor(x - d/2), Math.floor(y - d/2), d, d);
  } else {
    // Fallback: simple rocky planet without lava/smoke
    for (let dy = -p.radius; dy <= p.radius; dy++) {
      for (let dx = -p.radius; dx <= p.radius; dx++) {
        const rx = x + dx;
        const ry = y + dy;
        const r2 = dx*dx + dy*dy;
        if (r2 <= p.radius * p.radius) {
          const r = Math.sqrt(r2);
          const edge = Math.max(0, Math.min(1, (p.radius - r) / p.radius));
          let rr = 70 + Math.floor(60 * edge + randRange(-10, 10));
          let gg = 60 + Math.floor(55 * edge + randRange(-10, 10));
          let bb = 65 + Math.floor(50 * edge + randRange(-10, 10));
          ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
          ctx.fillRect(rx, ry, 1, 1);
        }
      }
    }
  }
}

// Seed (player)
const seed = {
  pos: { x: PLANET_A.pos.x + PLANET_A.radius + 24, y: PLANET_A.pos.y },
  vel: { x: 0, y: 0 },
  radius: 1,
};

// Compute original start state (position and velocity) away from the planet
function computeOriginalStart() {
  const startPos = { x: PLANET_A.pos.x + PLANET_A.radius + 24, y: PLANET_A.pos.y };
  const dx0 = startPos.x - PLANET_A.pos.x;
  const dy0 = startPos.y - PLANET_A.pos.y;
  const r0 = Math.hypot(dx0, dy0);
  const v0 = Math.sqrt(G * PLANET_A.mass / r0) * 0.95;
  const startVel = { x: 0, y: -v0 };
  return { startPos, startVel };
}
const ORIG = computeOriginalStart();

// Input: thrust along velocity
let thrustCooldown = 0;
const THRUST_IMPULSE = 6.0; // ~5x stronger thrust per click
const THRUST_COOLDOWN_MS = 180;
// Visual tails created on thrust
const thrustTails = [];

function onThrust() {
  if (state.phase !== 'play') return;
  if (thrustCooldown > 0) return;
  const speed = Math.hypot(seed.vel.x, seed.vel.y);
  if (speed > 0) {
    const ux = seed.vel.x / speed;
    const uy = seed.vel.y / speed;
    seed.vel.x += ux * THRUST_IMPULSE;
    seed.vel.y += uy * THRUST_IMPULSE;
    thrustCooldown = THRUST_COOLDOWN_MS;
    playBeep(480, 50, 'square', 0.02);
    // Spawn a comet-like tail opposite the thrust direction
    spawnThrustTail(seed.pos.x, seed.pos.y, -ux, -uy);
  }
}

canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onThrust(); });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onThrust(); });

// Try to lock orientation on first user interaction
let triedLock = false;
function onFirstUserGesture() {
  if (triedLock) return;
  triedLock = true;
  attemptOrientationLock();
}
['click','touchstart','keydown'].forEach((evt) => {
  window.addEventListener(evt, onFirstUserGesture, { once: true, passive: true });
});

// Physics integration (semi-implicit Euler)
function applyGravity(body, dt) {
  const planets = [PLANET_A, PLANET_B];
  let ax = 0, ay = 0;
  for (const p of planets) {
    const dx = p.pos.x - body.pos.x;
    const dy = p.pos.y - body.pos.y;
    const dist2 = dx*dx + dy*dy;
    const minR = (p.radius + body.radius + 0.5);
    const minR2 = minR * minR;
    const safeDist2 = Math.max(dist2, minR2);
    const invDist = 1 / Math.sqrt(safeDist2);
    const invDist3 = invDist * invDist * invDist;
    const factor = (G * (p.gScale || 1)) * p.mass * invDist3;
    ax += dx * factor;
    ay += dy * factor;
  }
  body.vel.x += ax * dt;
  body.vel.y += ay * dt;
  body.pos.x += body.vel.x * dt;
  body.pos.y += body.vel.y * dt;
}

function kineticEnergy(mass, vx, vy) {
  return 0.5 * mass * (vx*vx + vy*vy);
}

function potentialEnergy(mass, pos) {
  // sum of -G M m / r
  let U = 0;
  const planets = [PLANET_A, PLANET_B];
  for (const p of planets) {
    const dx = pos.x - p.pos.x;
    const dy = pos.y - p.pos.y;
    const r = Math.max(2, Math.hypot(dx, dy));
    U += -(G * (p.gScale || 1)) * p.mass * mass / r;
  }
  return U;
}

// Game state
const state = {
  phase: 'start', // 'start' | 'play' | 'win' | 'lose'
  timeMs: 0,
  unboundMs: 0,
  seedMass: 1,
};

function restart() {
  state.phase = 'play';
  state.timeMs = 0;
  state.unboundMs = 0;
  state.terraform = null; // clear any previous terraforming state
  // Restore original starting position and velocity
  seed.pos.x = ORIG.startPos.x;
  seed.pos.y = ORIG.startPos.y;
  seed.vel.x = ORIG.startVel.x;
  seed.vel.y = ORIG.startVel.y;
  banner.textContent = '';
  actionBtn.style.display = 'none';
  winBanner.style.display = 'none';
  startHint.style.display = 'none';
}

// Rendering helpers
function clear() {
  // Draw starfield stretched to fill entire canvas (changes viewable size)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(stars, 0, 0, stars.width, stars.height, 0, 0, canvas.width, canvas.height);
}

function drawSeed() {
  ctx.fillStyle = '#fff9a8';
  for (let dy = -seed.radius; dy <= seed.radius; dy++) {
    for (let dx = -seed.radius; dx <= seed.radius; dx++) {
      if (dx*dx + dy*dy <= seed.radius * seed.radius) {
        ctx.fillRect(Math.floor(seed.pos.x + dx), Math.floor(seed.pos.y + dy), 1, 1);
      }
    }
  }
}

function drawPlanets() {
  drawPlanet(PLANET_A);
  drawPlanet(PLANET_B);
}

function drawHUD() {
  // HUD removed
}

function checkCollisions() {
  const planets = [PLANET_A, PLANET_B];
  for (const p of planets) {
    const dx = seed.pos.x - p.pos.x;
    const dy = seed.pos.y - p.pos.y;
    const r = Math.hypot(dx, dy);
    if (r <= p.radius) {
      if (p === PLANET_B) {
        // win
        state.phase = 'win';
        banner.textContent = '';
        playBeep(660, 120, 'triangle', 0.03);
        playBeep(880, 160, 'triangle', 0.03);
        beginTerraform(p);
        winBanner.style.display = 'block';
        showActionButton('Play again');
      } else {
        // crash into original planet => lose
        state.phase = 'lose';
        banner.textContent = 'You crashed...';
        playBeep(180, 200, 'sawtooth', 0.03);
        showActionButton('Try again');
      }
      return true;
    }
  }
  return false;
}

function checkUnbound(dtMs) {
  // Determine if seed is unbound by total energy > 0
  const E = kineticEnergy(state.seedMass, seed.vel.x, seed.vel.y) + potentialEnergy(state.seedMass, seed.pos);
  const outOfBounds = seed.pos.x < -40 || seed.pos.x > DESIGN_WIDTH + 40 || seed.pos.y < -40 || seed.pos.y > DESIGN_HEIGHT + 40;
  if (E > 0 || outOfBounds) {
    state.unboundMs += dtMs;
    if (state.unboundMs >= 3000) {
      state.phase = 'lose';
      banner.textContent = 'Lost to the void...';
      playBeep(140, 220, 'sawtooth', 0.03);
      showActionButton('Try again');
    }
  } else {
    state.unboundMs = 0;
  }
}

function showActionButton(label) {
  actionBtn.textContent = label;
  actionBtn.style.display = 'block';
}

// Main loop
let lastTime = performance.now();
function frame(now) {
  const dtMs = Math.min(50, now - lastTime);
  lastTime = now;
  const dt = dtMs / 1000;
  state.timeMs += dtMs;
  if (thrustCooldown > 0) thrustCooldown -= dtMs;

  if (state.phase === 'play') {
    applyGravity(seed, dt);
    if (!checkCollisions()) {
      checkUnbound(dtMs);
    }
  }

  clear();
  // World draw at uniform scale so circles remain circles
  ctx.save();
  ctx.setTransform(viewScale, 0, 0, viewScale, viewOffsetX, viewOffsetY);
  ctx.imageSmoothingEnabled = false;
  // Pre-start orbit animation when in start phase
  if (state.phase === 'start') {
    // Animate seed orbiting CCW from planet surface to original start
    const totalMs = 1800; // ~1.8s animation
    const t = Math.max(0, Math.min(1, state.timeMs / totalMs));
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; // ease-in-out
    // Start at bottom of planet, rotate CCW to the right side while radius grows linearly
    const angStart = Math.PI / 2; // bottom
    const angEnd = 0;             // right side after sweeping 90° (as requested)
    const ang = angStart + (angEnd - angStart) * ease;
    const rStart = PLANET_A.radius + 1;
    const rEnd = Math.hypot(ORIG.startPos.x - PLANET_A.pos.x, ORIG.startPos.y - PLANET_A.pos.y);
    const radius = rStart + (rEnd - rStart) * ease;
    const px = PLANET_A.pos.x + Math.cos(ang) * radius;
    const py = PLANET_A.pos.y + Math.sin(ang) * radius;
    // Draw glowly growing seed: core stays 1px, glow grows with ease
    const coreSize = 1;
    const glowRings = Math.max(1, Math.floor(1 + 3 * ease));
    // Halo glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,240,160,0.25)';
    for (let r = 1; r <= glowRings; r++) {
      ctx.fillRect(Math.floor(px - r), Math.floor(py), r*2+1, 1);
      ctx.fillRect(Math.floor(px), Math.floor(py - r), 1, r*2+1);
    }
    ctx.restore();
    // Core seed
    ctx.fillStyle = '#fff9a8';
    for (let dy = -coreSize; dy <= coreSize; dy++) {
      for (let dx = -coreSize; dx <= coreSize; dx++) {
        if (dx*dx + dy*dy <= coreSize*coreSize) ctx.fillRect(Math.floor(px + dx), Math.floor(py + dy), 1, 1);
      }
    }
    // When finished, show Start button and the brief hint
    if (t >= 1) {
      startBtn.style.display = 'block';
      startHint.style.display = 'block';
      setTimeout(() => { startHint.style.display = 'none'; }, 2000);
    }
  }
  drawPlanets();
  drawThrustTails();
  if (state.phase !== 'start') {
    drawSeed();
  }
  ctx.restore();
  // HUD removed

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Thrust tail effect
function spawnThrustTail(/* x, y, dx, dy (ignored) */) {
  const len = 12; // shorter to match smaller seed
  const now = state.timeMs;
  thrustTails.push({ createdAt: now, lifeMs: 500, len });
}

function drawThrustTails() {
  if (thrustTails.length === 0) return;
  const now = state.timeMs;
  for (let i = thrustTails.length - 1; i >= 0; i--) {
    const t = thrustTails[i];
    const age = now - t.createdAt;
    if (age >= t.lifeMs) {
      thrustTails.splice(i, 1);
      continue;
    }
    const a = 1 - (age / t.lifeMs);
    const length = t.len * (0.9 + 0.1 * a);
    const speed = Math.hypot(seed.vel.x, seed.vel.y);
    if (speed <= 0.0001) continue;
    const ux = seed.vel.x / speed;
    const uy = seed.vel.y / speed;
    const baseX = seed.pos.x;
    const baseY = seed.pos.y;
    // Draw pixelated tapered ribbon using 1px rects
    const nx = -uy; // perpendicular normal for width
    const ny = ux;
    const steps = Math.max(1, Math.floor(length));
    ctx.fillStyle = '#9fe7ff';
    for (let s = 0; s < steps; s++) {
      const tfrac = s / steps;
      const px = baseX - ux * s;
      const py = baseY - uy * s;
      // width tapers to a point away from seed
    const baseWidth = 3; // half thickness to match smaller seed
      const w = Math.max(1, Math.floor(baseWidth * (1 - tfrac)));
      const half = Math.floor(w / 2);
      const localAlpha = 0.8 * a * (1 - tfrac); // twice as bright
      ctx.save();
      ctx.globalAlpha = localAlpha;
      for (let k = -half; k <= half; k++) {
        const rx = Math.round(px + nx * k);
        const ry = Math.round(py + ny * k);
        ctx.fillRect(rx, ry, 1, 1);
      }
      ctx.restore();
    }
  }
}

// Terraforming system for Planet B
function beginTerraform(p) {
  // Initialize piecewise reveal of planet-b-green image instead of animated vines/atmosphere
  const pieces = [];
  const cols = 8, rows = 8; // 64 pieces to reveal
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const order = i + j * cols;
      const jitter = Math.floor(hash01(i, j) * 800); // up to 0.8s jitter per piece
      pieces.push({ i, j, order, jitter });
    }
  }
  // Shuffle slightly by order + jitter
  pieces.sort((a, b) => (a.order + a.jitter) - (b.order + b.jitter));
  state.terraform = {
    startedAt: state.timeMs,
    revealPieces: pieces,
    cols,
    rows,
  };
}

function getTerraformProgress() {
  if (!state.terraform || state.phase !== 'win') return 0;
  const t = (state.timeMs - state.terraform.startedAt) / 2000; // ~2.0s to full (~2.5x slower)
  return Math.max(0, Math.min(1, t));
}

function generateLakes(p) {
  const lakes = [];
  const count = 8; // more water bodies
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = p.radius * (0.25 + Math.random() * 0.45);
    lakes.push({ cx: Math.round(Math.cos(ang) * rad), cy: Math.round(Math.sin(ang) * rad), r: 3 + Math.floor(Math.random() * 3) });
  }
  return lakes;
}

function generateOceans(p) {
  const oceans = [];
  const count = 3; // multiple distinct oceans
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = p.radius * (0.15 + Math.random() * 0.25);
    oceans.push({ cx: Math.round(Math.cos(ang) * rad), cy: Math.round(Math.sin(ang) * rad), r: 5 + Math.floor(Math.random() * 3) });
  }
  return oceans;
}

function generateVines(p) {
  const vines = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    vines.push({ start: Math.random() * Math.PI * 2, maxSpan: (0.6 + Math.random() * 1.1) * Math.PI, wiggle: Math.random() * Math.PI * 2 });
  }
  return vines;
}

function generateLeaves(p) {
  const leaves = [];
  const count = 24;
  for (let i = 0; i < count; i++) {
    leaves.push({ ang: Math.random() * Math.PI * 2 });
  }
  return leaves;
}


