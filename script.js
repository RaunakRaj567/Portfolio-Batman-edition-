/* ═══════════════════════════════════════════════════════════════
   SCROLL CINEMA — script.js
   Scroll-driven frame animation engine
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────
   CONFIG  — tweak these to match your frames
────────────────────────────────────────────*/
const CONFIG = {
  totalFrames:   73,            // total number of real unique frames (002–074)
  framePath:     './',          // folder containing frames (trailing slash)
  framePrefix:   '',            // prefix before the number, e.g. "frame_"
  frameSuffix:   '.png',        // file extension
  framePadding:  3,             // zero-padding digits (001 → 3)
  batchSize:     20,            // frames loaded in parallel per batch
  scrollHeight:  '700vh',       // height of scroll container

  // URL param override: ?src=./myframes/
  get resolvedPath() {
    const params = new URLSearchParams(window.location.search);
    return params.get('src') || this.framePath;
  },
};

/* ──────────────────────────────────────────
   SCENE DEFINITIONS
   at: scroll fraction (0–1) where scene appears
   zone: fraction of scroll during which text is visible
────────────────────────────────────────────*/
const SCENES = [
  { at: 0.00, chapter: 'Hello, World 👋', text: 'Raunak Raj— Aspiring Data Scientist & ML Engineer', zone: 0.14 },
  { at: 0.20, chapter: 'The Mission',     text: 'Building software that thinks.', zone: 0.28 },
  { at: 0.55, chapter: 'The Work',        text: 'ML · Deep Learning · Full-Stack', zone: 0.12 },
  { at: 0.82, chapter: 'The Record',      text: '5× Hackathon Finalist',          zone: 0.18 },
];

/* ──────────────────────────────────────────
   DOM REFS
────────────────────────────────────────────*/
const canvas          = document.getElementById('frame-canvas');
const ctx             = canvas.getContext('2d', { alpha: false });
const loadingScreen   = document.getElementById('loading-screen');
const loadingBar      = document.getElementById('loading-bar');
const progressGlow    = document.getElementById('progress-glow');
const loadedCountEl   = document.getElementById('loaded-count');
const totalCountEl    = document.getElementById('total-count');
const loaderPct       = document.getElementById('loader-percentage');
const playbackBar     = document.getElementById('playback-bar');
const playbackGlow    = document.getElementById('playback-bar-glow');
const scrollHint      = document.getElementById('scroll-hint');
const sceneOverlayEl  = document.getElementById('scene-overlay');
const sceneTextEl     = document.getElementById('scene-text');
const sceneChapterEl  = document.getElementById('scene-chapter');
const hudEl           = document.getElementById('hud'); // null now
const hudFrame        = document.getElementById('hud-frame'); // null now
const hudScroll       = document.getElementById('hud-scroll'); // null now
const scrollContainer = document.getElementById('scroll-container');

/* ──────────────────────────────────────────
   STATE
────────────────────────────────────────────*/
const frames         = new Array(CONFIG.totalFrames);   // Image objects
let loadedCount      = 0;
let allLoaded        = false;
let currentFrameIdx  = 0;
let targetFrameIdx   = 0;
let currentFrameFloat= 0; // for lerping frame transition
let rafId            = null;
let lastTime         = 0;
const fpsInterval    = 1000 / 120; // 90 FPS target

let scrollFraction   = 0;
let hasScrolled      = false;
let lastSceneIdx     = -1;
let sceneVisible     = false;

/* ──────────────────────────────────────────
   HELPERS
────────────────────────────────────────────*/

/** Zero-pad a number to N digits */
function pad(n, digits) {
  return String(n).padStart(digits, '0');
}

/** Build a frame src URL */
function frameSrc(index) {
  // index is 0-based; frames are 1-based, but we skip frame 001 so we start at 002
  const num = index + 2;
  return `${CONFIG.resolvedPath}${CONFIG.framePrefix}${pad(num, CONFIG.framePadding)}${CONFIG.frameSuffix}`;
}

/** Resize canvas to match viewport exactly */
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  drawFrame(currentFrameFloat);  // redraw using exact blended frame after resize
}

/* ──────────────────────────────────────────
   DRAWING
────────────────────────────────────────────*/

/** Draw a frame — smoothly crossfades between two adjacent frames for 144Hz monitors */
function drawFrame(floatIdx) {
  const idx1 = Math.floor(floatIdx);
  const idx2 = Math.min(idx1 + 1, CONFIG.totalFrames - 1);
  const blend = floatIdx - idx1;

  const img1 = frames[idx1];
  const img2 = frames[idx2];

  if (!img1 || !img1.complete || img1.naturalWidth === 0) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const iw = img1.naturalWidth;
  const ih = img1.naturalHeight;

  ctx.clearRect(0, 0, cw, ch);

  // ── Layer 1: solid background to hide letterbox bars ──
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, cw, ch);

  // Ensure high-quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ── Layer 2: crisp contain (full image, centred on top) ──
  const containScale = Math.min(cw / iw, ch / ih);
  const fw = iw * containScale;
  const fh = ih * containScale;
  const fx = (cw - fw) / 2;
  const fy = (ch - fh) / 2;

  // Base frame
  ctx.globalAlpha = 1;
  ctx.drawImage(img1, fx, fy, fw, fh);

  // Blend the next frame on top to create perfect optical smoothness
  if (blend > 0.001 && img2 && img2.complete && img2.naturalWidth > 0) {
    ctx.globalAlpha = blend;
    ctx.drawImage(img2, fx, fy, fw, fh);
  }
  
  ctx.globalAlpha = 1; // restore opacity
}

/* ──────────────────────────────────────────
   RAF RENDER LOOP
────────────────────────────────────────────*/

function renderLoop(time) {
  rafId = requestAnimationFrame(renderLoop);

  if (!allLoaded) return;

  // Calculate target float frame based on scroll fraction
  const targetFloat = scrollFraction * (CONFIG.totalFrames - 1);
  
  // Smooth lerp optimized for high refresh rates (like 144hz)
  currentFrameFloat += (targetFloat - currentFrameFloat) * 0.07; 

  // Only draw if there's an actual optical difference to save GPU cycles
  if (Math.abs(targetFloat - currentFrameFloat) > 0.001) {
    drawFrame(currentFrameFloat);

    // Update HUD with visually closest discrete frame
    const newIdx = Math.round(currentFrameFloat);
    if (newIdx !== currentFrameIdx) {
      currentFrameIdx = newIdx;
      updateHUD();
    }
  }
}

/* ──────────────────────────────────────────
   SCROLL HANDLER
────────────────────────────────────────────*/

function onScroll() {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) return;

  scrollFraction = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);

  // Determine if we are past the animation zone (into portfolio sections)
  const animZoneBottom = scrollContainer.offsetTop + scrollContainer.offsetHeight;
  const inPortfolio    = window.scrollY >= animZoneBottom - 50;

  // Hide scroll hint after first scroll
  if (!hasScrolled && window.scrollY > 10) {
    hasScrolled = true;
    scrollHint.classList.add('hidden');
    if (hudEl) hudEl.classList.add('visible');
  }

  // Hide HUD + scene overlay inside portfolio, restore in animation zone
  if (inPortfolio) {
    if (hudEl) hudEl.classList.remove('visible');
    sceneOverlayEl.classList.add('hidden');   // hide the whole box
    sceneTextEl.classList.remove('visible');
    sceneChapterEl.classList.remove('visible');
    lastSceneIdx = -2; // Force update when scrolling back up
    sceneVisible = false;
  } else if (hasScrolled) {
    if (hudEl) hudEl.classList.add('visible');
  }

  // Update top progress bar (only during animation)
  const animFrac = inPortfolio ? 1 : scrollFraction;
  const pct = (animFrac * 100).toFixed(2) + '%';
  playbackBar.style.width  = pct;
  playbackGlow.style.width = pct;

  // Scene overlay logic (only during animation)
  if (!inPortfolio) updateSceneOverlay(scrollFraction);
}

/* ──────────────────────────────────────────
   SCENE OVERLAY
────────────────────────────────────────────*/

function updateSceneOverlay(frac) {
  let activeIdx = -1;

  for (let i = SCENES.length - 1; i >= 0; i--) {
    const s = SCENES[i];
    if (frac >= s.at && frac < s.at + s.zone) {
      activeIdx = i;
      break;
    }
  }

  if (activeIdx === lastSceneIdx) return;
  lastSceneIdx = activeIdx;

  if (activeIdx === -1) {
    // Hide text elements and the box container
    sceneOverlayEl.classList.add('hidden');
    sceneTextEl.classList.remove('visible');
    sceneChapterEl.classList.remove('visible');
    sceneTextEl.classList.add('exiting');
    sceneChapterEl.classList.add('exiting');
    setTimeout(() => {
      sceneTextEl.classList.remove('exiting');
      sceneChapterEl.classList.remove('exiting');
    }, 700);
    sceneVisible = false;
  } else {
    const scene = SCENES[activeIdx];
    // Show the box container
    sceneOverlayEl.classList.remove('hidden');
    // First exit if already visible, then swap text
    if (sceneVisible) {
      sceneTextEl.classList.add('exiting');
      sceneChapterEl.classList.add('exiting');
      setTimeout(() => {
        sceneTextEl.textContent    = scene.text;
        sceneChapterEl.textContent = scene.chapter;
        sceneTextEl.classList.remove('exiting', 'visible');
        sceneChapterEl.classList.remove('exiting', 'visible');
        // Force reflow
        void sceneTextEl.offsetWidth;
        sceneTextEl.classList.add('visible');
        sceneChapterEl.classList.add('visible');
      }, 350);
    } else {
      sceneTextEl.textContent    = scene.text;
      sceneChapterEl.textContent = scene.chapter;
      sceneTextEl.classList.add('visible');
      sceneChapterEl.classList.add('visible');
    }
    sceneVisible = true;
  }
}

/* ──────────────────────────────────────────
   HUD UPDATE
────────────────────────────────────────────*/

function updateHUD() {
  if (hudFrame) hudFrame.textContent  = pad(currentFrameIdx + 1, 3);
  if (hudScroll) hudScroll.textContent = Math.round(scrollFraction * 100) + '%';
}

/* ──────────────────────────────────────────
   KEYBOARD SCRUBBING
   Arrow keys → ±5 frames
   Page Up/Down → ±20 frames
────────────────────────────────────────────*/

function onKeyDown(e) {
  if (!allLoaded) return;

  const maxScroll = document.body.scrollHeight - window.innerHeight;
  let delta = 0;

  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight': delta = +5;  break;
    case 'ArrowUp':
    case 'ArrowLeft':  delta = -5;  break;
    case 'PageDown':   delta = +20; break;
    case 'PageUp':     delta = -20; break;
    default: return;
  }

  e.preventDefault();

  const newFrame = Math.min(
    Math.max(currentFrameIdx + delta, 0),
    CONFIG.totalFrames - 1
  );

  // Scroll the page proportionally so state stays in sync
  const newFrac = newFrame / (CONFIG.totalFrames - 1);
  window.scrollTo({ top: newFrac * maxScroll, behavior: 'instant' });
}

/* ──────────────────────────────────────────
   MOBILE TOUCH — passive for performance
────────────────────────────────────────────*/
// Native scroll on mobile already works through the onScroll handler.
// We add touch listeners with { passive: true } so the browser
// doesn't block the thread for touch-action checks.
window.addEventListener('touchstart', () => {}, { passive: true });
window.addEventListener('touchmove',  () => {}, { passive: true });

/* ──────────────────────────────────────────
   FRAME PRELOADING (batched)
────────────────────────────────────────────*/

function updateLoadingUI(loaded, total) {
  const pct = loaded / total;
  const pctStr = Math.round(pct * 100) + '%';

  loadingBar.style.width   = pctStr;
  progressGlow.style.width = pctStr;
  loadedCountEl.textContent = loaded;
  loaderPct.textContent     = pctStr;
}

function loadBatch(startIdx, batchSize) {
  return new Promise((resolve) => {
    const end  = Math.min(startIdx + batchSize, CONFIG.totalFrames);
    let done   = 0;
    const count = end - startIdx;

    if (count === 0) { resolve(); return; }

    for (let i = startIdx; i < end; i++) {
      const img = new Image();
      img.decoding = 'async';

      img.onload = img.onerror = () => {
        loadedCount++;
        done++;
        updateLoadingUI(loadedCount, CONFIG.totalFrames);

        // Draw first frame as soon as it's ready
        if (i === 0 && img.complete) {
          frames[0] = img;
          drawFrame(0);
        }

        if (done === count) resolve();
      };

      frames[i] = img;
      img.src = frameSrc(i);
    }
  });
}

async function preloadAllFrames() {
  totalCountEl.textContent = CONFIG.totalFrames;
  updateLoadingUI(0, CONFIG.totalFrames);

  for (let start = 0; start < CONFIG.totalFrames; start += CONFIG.batchSize) {
    await loadBatch(start, CONFIG.batchSize);
  }

  // All frames loaded — hide loader, reveal experience
  allLoaded = true;
  loadingScreen.classList.add('hidden');

  // Draw frame 0 immediately
  drawFrame(0);

  // Trigger initial scene text
  updateSceneOverlay(0);
}

/* ──────────────────────────────────────────
   RESIZE OBSERVER — handles viewport changes
   (device rotation, browser chrome resize)
────────────────────────────────────────────*/

const resizeObserver = new ResizeObserver(() => {
  resizeCanvas();
});
resizeObserver.observe(document.documentElement);

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────────*/

function init() {
  // Initial canvas size
  resizeCanvas();

  // Set scroll container height from config
  scrollContainer.style.height = CONFIG.scrollHeight;

  // Scroll listener (throttled by rAF — state is read in loop)
  window.addEventListener('scroll', onScroll, { passive: true });

  // Keyboard scrubbing
  window.addEventListener('keydown', onKeyDown);

  // Start render loop
  renderLoop();

  // Begin loading frames
  preloadAllFrames();
}

// Wait for DOM then init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
