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

// Start button (leaf-shaped, center)
const startBtn = document.createElement('button');
startBtn.id = 'startBtn';
startBtn.innerHTML = `<span class="label">Start</span>`;
document.body.appendChild(startBtn);
startBtn.addEventListener('click', () => {
  ensureAudio();
  playBeep(420, 80, 'square', 0.02);
  restart();
});

// Start hint (shown below Start button, hidden once game begins)
const startHint = document.createElement('div');
startHint.id = 'startHint';
startHint.textContent = 'Click/tap to accelerate';
document.body.appendChild(startHint);

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

// Draw pixel-art rose leaf on start button canvas
const startLeafCanvas = startBtn.querySelector('#startLeaf');
if (startLeafCanvas) {
  const lc = startLeafCanvas.getContext('2d');
  lc.imageSmoothingEnabled = false;
  // Transparent background by default; draw a pixel leaf silhouette and fill
  // Base silhouette (approximate rose leaf with serrated edge)
  const w = startLeafCanvas.width;
  const h = startLeafCanvas.height;
  const cx = 110, cy = 60;
  const rx = 90, ry = 42; // ellipse radii for body
  // Draw body ellipse pixels
  lc.fillStyle = '#2a7f3a';
  for (let y = -ry; y <= ry; y++) {
    const xr = Math.floor(rx * Math.sqrt(1 - (y*y)/(ry*ry)));
    for (let x = -xr; x <= xr; x++) {
      lc.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  // Add pointed tip on right by extending a triangle
  lc.fillStyle = '#2a7f3a';
  for (let i = 0; i < 24; i++) {
    lc.fillRect(cx + rx + i, cy - Math.floor(i/3), 1, 1);
    lc.fillRect(cx + rx + i, cy + Math.floor(i/3), 1, 1);
  }
  // Serrated edge (teeth)
  lc.fillStyle = '#2f9142';
  for (let t = -Math.PI*0.9; t <= Math.PI*0.9; t += 0.18) {
    const rrx = rx * Math.cos(t);
    const rry = ry * Math.sin(t);
    const ex = Math.round(cx + rrx);
    const ey = Math.round(cy + rry);
    const nx = Math.cos(t);
    const ny = Math.sin(t);
    const tx = Math.round(ex + nx * 3);
    const ty = Math.round(ey + ny * 3);
    lc.fillRect(tx, ty, 1, 1);
  }
  // Center vein
  lc.fillStyle = '#115a26';
  for (let x = -rx - 10; x <= rx + 16; x++) {
    lc.fillRect(cx + x, cy, 1, 1);
  }
  // Side veins
  for (let v = -6; v <= 6; v++) {
    const vy = v * 6;
    for (let k = 0; k < 16; k++) {
      lc.fillRect(cx - 10 + k, cy + Math.round(vy * 0.06 * k), 1, 1);
      lc.fillRect(cx - 10 + k, cy - Math.round(vy * 0.06 * k), 1, 1);
    }
  }
  // Color variation (veins lighter overlay)
  lc.fillStyle = 'rgba(120, 200, 120, 0.25)';
  for (let y = -ry; y <= ry; y += 3) {
    for (let x = -rx; x <= rx; x += 3) {
      lc.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  // Stem on left
  lc.fillStyle = '#1b6e34';
  for (let s = 0; s < 18; s++) {
    lc.fillRect(cx - rx - 14 - s, cy - Math.floor(s/4), 2, 2);
  }
}

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
  off.width = DESIGN_WIDTH;
  off.height = DESIGN_HEIGHT;
  const sctx = off.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, off.width, off.height);
  for (let i = 0; i < 300; i++) {
    const x = Math.floor(Math.random() * off.width);
    const y = Math.floor(Math.random() * off.height);
    const c = Math.random() < 0.85 ? 200 + Math.floor(Math.random() * 55) : 80 + Math.floor(Math.random() * 120);
    sctx.fillStyle = `rgb(${c},${c},${c})`;
    sctx.fillRect(x, y, 1, 1);
  }
  return off;
})();

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
  // base rocky body
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
        let isWater = false;

        // Oceans first (dark blue), then lakes (medium blue)
        if (terraform > 0 && state.terraform && state.terraform.oceans) {
          for (const oc of state.terraform.oceans) {
            const odx = dx - oc.cx;
            const ody = dy - oc.cy;
            const or2 = odx*odx + ody*ody;
            const or = oc.r * Math.max(0, Math.min(1, (terraform - 0.08) / 0.92));
            if (or2 <= or * or) {
              const blue = [20, 70, 160];
              const n2 = Math.floor(randRange(-8, 6));
              rr = Math.max(0, Math.min(255, blue[0] + n2));
              gg = Math.max(0, Math.min(255, blue[1] + n2));
              bb = Math.max(0, Math.min(255, blue[2] + n2));
              isWater = true;
              break;
            }
          }
        }
        if (!isWater && terraform > 0 && state.terraform && state.terraform.lakes) {
          for (const lake of state.terraform.lakes) {
            const ldx = dx - lake.cx;
            const ldy = dy - lake.cy;
            const lr2 = ldx*ldx + ldy*ldy;
            const lr = lake.r * Math.max(0, Math.min(1, (terraform - 0.10) / 0.90));
            if (lr2 <= lr * lr) {
              const blue = [40, 110, 200];
              const n2 = Math.floor(randRange(-8, 8));
              rr = Math.max(0, Math.min(255, blue[0] + n2));
              gg = Math.max(0, Math.min(255, blue[1] + n2));
              bb = Math.max(0, Math.min(255, blue[2] + n2));
              isWater = true;
              break;
            }
          }
        }

        // Grass greening overlay
        if (terraform > 0 && !isWater) {
          const grass = [60, 180, 90];
          const grow = Math.max(0, Math.min(1, terraform));
          // more greening near the surface first
          const surf = Math.max(0, Math.min(1, (q - 0.4) / 0.6));
          const w = grow * (0.4 + 0.6 * surf);
          rr = (rr * (1 - w) + grass[0] * w) | 0;
          gg = (gg * (1 - w) + grass[1] * w) | 0;
          bb = (bb * (1 - w) + grass[2] * w) | 0;
        }

        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(rx, ry, 1, 1);
      }
    }
  }

  // Vines and leaves overlays after base pixels
  if (terraform > 0 && state.terraform) {
    const progress = terraform;
    // vines: draw along arcs inside the surface, extend with progress
    if (state.terraform.vines) {
      ctx.fillStyle = '#3cbf6a';
      for (const vine of state.terraform.vines) {
        const span = vine.maxSpan * progress;
        const steps = Math.ceil(40 * progress);
        for (let i = 0; i < steps; i++) {
          const t = i / Math.max(1, steps - 1);
          const ang = vine.start + span * t;
          const radius = p.radius - 2 - 2 * Math.sin(t * Math.PI * 1.5 + vine.wiggle);
          const px = Math.round(p.pos.x + Math.cos(ang) * radius);
          const py = Math.round(p.pos.y + Math.sin(ang) * radius);
          ctx.fillRect(px, py, 1, 1);
          if (progress > 0.6 && (i % 6 === 0)) {
            // little offshoots
            const offR = radius - 1;
            const offX = Math.round(p.pos.x + Math.cos(ang + 0.25) * offR);
            const offY = Math.round(p.pos.y + Math.sin(ang + 0.25) * offR);
            ctx.fillRect(offX, offY, 1, 1);
          }
        }
      }
    }
    // leaves: small clusters growing outward
    if (state.terraform.leaves) {
      const stemColor = '#63df83';
      const leafColor = '#96ffae';
      for (const leaf of state.terraform.leaves) {
        const len = 2 + Math.floor(1 * progress); // 2-3 px length (less protrusion)
        const ang = leaf.ang;
        const nx = Math.cos(ang + Math.PI / 2);
        const ny = Math.sin(ang + Math.PI / 2);
        for (let j = 0; j < len; j++) {
          const rEdge = p.radius - 1 + Math.min(j, 1); // cap outward growth
          const cx = p.pos.x + Math.cos(ang) * rEdge;
          const cy = p.pos.y + Math.sin(ang) * rEdge;
          // stem pixel
          ctx.fillStyle = stemColor;
          ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
          // wider leaf lobes (left/right of stem) to exaggerate shape
          const spread = (j === 0 ? 1 : 2);
          ctx.fillStyle = leafColor;
          const lx1 = Math.round(cx + nx * spread);
          const ly1 = Math.round(cy + ny * spread);
          const lx2 = Math.round(cx - nx * spread);
          const ly2 = Math.round(cy - ny * spread);
          ctx.fillRect(lx1, ly1, 1, 1);
          ctx.fillRect(lx2, ly2, 1, 1);
        }
      }
    }
  }

  // Atmospheric glow when terraforming progresses (tight to surface, bright, pulsing + strobing)
  if (terraform > 0.2 && p === PLANET_B) {
    const baseAlpha = 0.42 * terraform; // static brightness; brighter atmosphere
    const haloWidth = 5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const maxR = p.radius + haloWidth;
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        const r2 = dx*dx + dy*dy;
        if (r2 <= p.radius * p.radius) continue;
        const r = Math.sqrt(r2);
        if (r > maxR) continue;
        const w = (r - p.radius) / haloWidth; // 0 at surface -> 1 at edge
        const a = baseAlpha * Math.max(0, 1 - w);
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(140,210,255,${a})`;
        ctx.fillRect(p.pos.x + dx, p.pos.y + dy, 1, 1);
      }
    }
    ctx.restore();
  }
}

function drawSun(p) {
  const { x, y } = p.pos;
  const t = (state.timeMs || 0) / 1000;
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.6);
  
  // Draw pixel halo behind the sun with smooth falloff (7px width)
  {
    const tms = (state.timeMs || 0);
    const pulseSlow = 0.5 + 0.5 * Math.sin(tms * 0.006);
    const strobeFast = 0.5 + 0.5 * Math.sin(tms * 0.03);
    const baseA = (0.26 + 0.14 * pulseSlow) * (0.85 + 0.15 * strobeFast);
    const haloWidth = 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const maxR = p.radius + haloWidth;
    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        const r2 = dx*dx + dy*dy;
        if (r2 <= p.radius * p.radius) continue;
        const r = Math.sqrt(r2);
        if (r > maxR) continue;
        const w = (r - p.radius) / haloWidth; // 0 at surface -> 1 at edge
        const a = baseA * Math.max(0, 1 - w);
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(255,205,90,${a})`;
        ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
    ctx.restore();
  }

  // Draw the sun body on top of the halo so the inner edge is crisp
  for (let dy = -p.radius; dy <= p.radius; dy++) {
    for (let dx = -p.radius; dx <= p.radius; dx++) {
      const rx = x + dx;
      const ry = y + dy;
      const r2 = dx*dx + dy*dy;
      if (r2 <= p.radius * p.radius) {
        const r = Math.sqrt(r2);
        const q = r / p.radius;
        // blend from bright yellow (center) to orange (edge)
        const center = [255, 240, 120];
        const edge = [255, 160, 60];
        const noise = randRange(-10, 10);
        const rr = Math.max(0, Math.min(255, (center[0]*(1-q) + edge[0]*q) + noise));
        const gg = Math.max(0, Math.min(255, (center[1]*(1-q) + edge[1]*q) + noise));
        const bb = Math.max(0, Math.min(255, (center[2]*(1-q) + edge[2]*q) + noise));
        ctx.fillStyle = `rgb(${rr|0},${gg|0},${bb|0})`;
        ctx.fillRect(rx, ry, 1, 1);
      }
    }
  }
}

// Seed (player)
const seed = {
  pos: { x: PLANET_A.pos.x + PLANET_A.radius + 24, y: PLANET_A.pos.y },
  vel: { x: 0, y: 0 },
  radius: 2,
};

// Initialize circular-ish orbit around planet A
(function initOrbit() {
  // v = sqrt(G*M/r)
  const dx = seed.pos.x - PLANET_A.pos.x;
  const dy = seed.pos.y - PLANET_A.pos.y;
  const r = Math.hypot(dx, dy);
  const v = Math.sqrt(G * PLANET_A.mass / r) * 0.95; // slightly under for stability
  // perpendicular velocity (counter-clockwise)
  seed.vel.x = 0;
  seed.vel.y = -v;
})();

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
  seed.pos.x = PLANET_A.pos.x + PLANET_A.radius + 24;
  seed.pos.y = PLANET_A.pos.y;
  const dx = seed.pos.x - PLANET_A.pos.x;
  const dy = seed.pos.y - PLANET_A.pos.y;
  const r = Math.hypot(dx, dy);
  const v = Math.sqrt(G * PLANET_A.mass / r) * 0.95;
  seed.vel.x = 0;
  seed.vel.y = -v;
  banner.textContent = '';
  actionBtn.style.display = 'none';
  startBtn.style.display = 'none';
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
  drawPlanets();
  drawThrustTails();
  drawSeed();
  ctx.restore();
  // HUD removed

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Thrust tail effect
function spawnThrustTail(/* x, y, dx, dy (ignored) */) {
  const len = 25; // base length in pixels (75% longer)
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
      const baseWidth = 6; // thickness near seed
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
  state.terraform = {
    startedAt: state.timeMs,
    oceans: generateOceans(p),
    lakes: generateLakes(p),
    vines: generateVines(p),
    leaves: generateLeaves(p),
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


