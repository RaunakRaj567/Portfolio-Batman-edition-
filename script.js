/* ═══════════════════════════════════════════════════════════════
   SCROLL CINEMA — script.js
   Scroll-driven frame animation engine
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────
   CONFIG  — tweak these to match your frames
────────────────────────────────────────────*/
const CONFIG = {
  totalFrames:   69,            // total number of real unique frames (002–070)
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

// While the portfolio sections are on screen, advance frames ONLY when the user scrolls.
// Frame numbers here match the *file* numbering (002–074).
const PORTFOLIO_SCROLL = {
  startFrame: 44,
  endFrame: 70,
  // Smaller = slower / smoother transitions while scrolling the portfolio.
  lerp: 0.03,
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
const viewPortfolioOverlay = document.getElementById('view-portfolio');
const viewPortfolioBtn     = document.getElementById('view-portfolio-btn');
const sceneOverlayEl  = document.getElementById('scene-overlay');
const sceneTextEl     = document.getElementById('scene-text');
const sceneChapterEl  = document.getElementById('scene-chapter');
const hudEl           = document.getElementById('hud');
const hudFrame        = document.getElementById('hud-frame');
const scrollContainer = document.getElementById('scroll-container');
const portfolioEl     = document.getElementById('portfolio');
const loadingFx       = document.getElementById('loading-fx');
const fallingBatsEl   = document.getElementById('falling-bats');
const loaderVideo     = document.getElementById('loader-video');
const loaderAudio     = document.getElementById('loader-audio');
const musicToggle     = document.getElementById('music-toggle');

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
let autoPlayProgress = 0;
let isAutoplaying    = false;
let hasEntered       = false;
let hasFinished      = false;
let lastSceneIdx     = -1;
let sceneVisible     = false;

let resolveAllFramesLoaded;
const allFramesLoaded = new Promise((resolve) => {
  resolveAllFramesLoaded = resolve;
});

const loadingBats = {
  bats: [],
  targets: [], // normalized points in [-1..1]
  inited: false,
};

const LOADER_MIN_MS = 1600;
let loaderStartTime = 0;

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

  let targetFloat;
  let currentLerp = 0.07;

  // Use autoPlayProgress if animating, otherwise use manual scrollFraction
  const activeFrac = isAutoplaying ? autoPlayProgress : scrollFraction;
  targetFloat = activeFrac * (CONFIG.totalFrames - 1);
  
  if (hasFinished && !isAutoplaying) {
    const zoneHeight = scrollContainer.offsetHeight;
    const maxAnimScroll = Math.max(zoneHeight - window.innerHeight, 1);
    
    if (window.scrollY >= maxAnimScroll) {
       const popUpScroll = maxAnimScroll + (window.innerHeight * 0.5);
       const relScroll = window.scrollY - popUpScroll;
       
       if (relScroll > 0) {
          // Scrolling down into the portfolio
          const halfLoop = window.innerHeight * 1.5;
          const loopProgress = (relScroll % (halfLoop * 2)) / (halfLoop * 2);
          
          let p = 0;
          if (loopProgress < 0.5) {
             p = loopProgress * 2; // 0 to 1
          } else {
             p = 2 - (loopProgress * 2); // 1 to 0
          }
          
          const startIdx = CONFIG.totalFrames - 1; // Start at 72 (end of anim)
          const endIdx = PORTFOLIO_SCROLL.startFrame - 2; // Go down to 42
          
          targetFloat = startIdx - p * (startIdx - endIdx);
       } else {
          // In the gap between end of animation and portfolio pop-up
          targetFloat = CONFIG.totalFrames - 1; 
       }
       
       currentLerp = PORTFOLIO_SCROLL.lerp || 0.03;
    }
  }

  // Smooth lerp optimized for high refresh rates (like 144hz)
  currentFrameFloat += (targetFloat - currentFrameFloat) * currentLerp; 

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
   SCROLL HANDLER
────────────────────────────────────────────*/

function onScroll() {
  if (isAutoplaying) return;

  const zoneTop = scrollContainer.offsetTop;
  const zoneHeight = scrollContainer.offsetHeight;
  const maxAnimScroll = Math.max(zoneHeight - window.innerHeight, 1);
  const within = Math.min(Math.max(window.scrollY - zoneTop, 0), maxAnimScroll);
  scrollFraction = within / maxAnimScroll;

  // Fade canvas only when portfolio covers most of the screen
  const animZoneBottom = zoneTop + zoneHeight;
  const inPortfolio = window.scrollY >= animZoneBottom - (window.innerHeight * 0.1);

  if (inPortfolio) {
    sceneOverlayEl.classList.add('hidden');
  } else {
    updateSceneOverlay(scrollFraction);
  }
  
  updateHUD();
}

/* ──────────────────────────────────────────
   HUD UPDATE
────────────────────────────────────────────*/

function updateHUD() {
  // Match actual filenames/sequence: index 0 => frame 002
  if (hudFrame) hudFrame.textContent  = pad(currentFrameIdx + 2, 3);
}



/* ──────────────────────────────────────────
   AUTOPLAY (View Portfolio)
────────────────────────────────────────────*/

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function startAutoplayToPortfolio() {
  if (isAutoplaying || hasEntered) return;

  hasEntered = true;
  isAutoplaying = true;

  if (!allLoaded) {
    if (viewPortfolioBtn) {
      viewPortfolioBtn.disabled = true;
      viewPortfolioBtn.textContent = 'Preparing…';
    }
    await allFramesLoaded;
  }

  // Lock scroll during transition
  document.body.style.overflow = 'hidden';
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (hudEl) hudEl.classList.add('visible');
  if (viewPortfolioOverlay) viewPortfolioOverlay.classList.add('hidden');

  const durationMs = 6000;
  const start = performance.now();
  const zoneHeight = scrollContainer.offsetHeight;
  const maxScroll = Math.max(zoneHeight - window.innerHeight, 0);

  return new Promise((resolve) => {
    function step(now) {
      const t = Math.min(Math.max((now - start) / durationMs, 0), 1);
      
      autoPlayProgress = easeInOutCubic(t);
      updateSceneOverlay(autoPlayProgress);

      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }

      autoPlayProgress = 1;
      scrollFraction = 1;
      isAutoplaying = false;
      hasFinished = true;
      
      if (sceneOverlayEl) sceneOverlayEl.classList.add('hidden');
      
      if (portfolioEl) {
        portfolioEl.style.display = 'block';
        setTimeout(() => {
          portfolioEl.classList.add('visible');
        }, 50);
      }
      
      // Unlock scroll and rise portfolio to 50% of the screen
      document.body.style.overflow = 'auto';
      const targetScroll = zoneHeight - (window.innerHeight * 0.5);
      window.scrollTo({ top: targetScroll, behavior: 'instant' });
      resolve();
    }

    requestAnimationFrame(step);
  });
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

  updateLoadingEffects(pct);
}

function updateLoadingEffects(pct) {
  if (loadingFx) loadingFx.style.setProperty('--load-progress', String(Math.min(Math.max(pct, 0), 1)));
  if (!fallingBatsEl) return;
  if (!loadingBats.inited) initLoadingBats();

  const p = Math.min(Math.max(pct, 0), 1);
  const rect = fallingBatsEl.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const scale = Math.min(rect.width, rect.height) * 0.33;

  // Ease makes the "form logo" moment more cinematic near the end.
  const ease = p < 0.8 ? p * 0.85 : 0.68 + ((p - 0.8) / 0.2) * 0.32;

  for (let i = 0; i < loadingBats.bats.length; i++) {
    const bat = loadingBats.bats[i];
    const start = bat.__start;
    const target = loadingBats.targets[i % loadingBats.targets.length];
    const tx = cx + target.x * scale;
    const ty = cy + target.y * (scale * 0.62);

    // Interpolate from random sky positions to logo points.
    const x = start.x + (tx - start.x) * ease;
    const y = start.y + (ty - start.y) * ease;

    // Slight settle at end
    const settle = (1 - p) * 6;
    bat.style.setProperty('--x', `${x}px`);
    bat.style.setProperty('--y', `${y + settle}px`);
    bat.style.setProperty('--s', String(start.s + (1.05 - start.s) * ease));
    bat.style.setProperty('--r', `${start.r + (0 - start.r) * ease}deg`);
    bat.style.opacity = String(0.2 + (0.8 * p));
  }
}

function initLoadingBats() {
  if (!fallingBatsEl) return;

  // Stylized bat-logo point cloud (normalized) — simple, symmetric silhouette.
  // (Enough points to read as the logo without heavy SVG/path sampling.)
  const leftWing = [
    [-1.00, 0.02], [-0.92, -0.02], [-0.85, 0.01], [-0.78, -0.04],
    [-0.70, 0.02], [-0.62, -0.06], [-0.54, 0.03], [-0.46, -0.05],
    [-0.38, 0.04], [-0.32, -0.02], [-0.26, 0.06], [-0.20, 0.00],
  ];
  const body = [
    [-0.14, 0.06], [-0.10, -0.06], [-0.06, 0.00], [-0.03, 0.10],
    [ 0.00, -0.08], [ 0.03, 0.10], [ 0.06, 0.00], [ 0.10, -0.06], [ 0.14, 0.06],
  ];
  const ears = [
    [-0.08, -0.20], [-0.04, -0.32], [0.04, -0.32], [0.08, -0.20],
  ];
  const tail = [
    [-0.22, 0.22], [-0.14, 0.26], [-0.08, 0.20], [0.00, 0.28],
    [ 0.08, 0.20], [ 0.14, 0.26], [0.22, 0.22],
  ];

  const points = [];
  for (const p of leftWing) points.push({ x: p[0], y: p[1] });
  for (const p of body) points.push({ x: p[0], y: p[1] });
  for (const p of ears) points.push({ x: p[0], y: p[1] });
  for (const p of tail) points.push({ x: p[0], y: p[1] });
  // Mirror left wing to right wing
  for (const p of leftWing) points.push({ x: -p[0], y: p[1] });

  loadingBats.targets = points;

  const BAT_COUNT = 64;
  fallingBatsEl.innerHTML = '';
  loadingBats.bats = [];

  const rect = fallingBatsEl.getBoundingClientRect();
  const w = Math.max(rect.width, window.innerWidth);
  const h = Math.max(rect.height, window.innerHeight);

  for (let i = 0; i < BAT_COUNT; i++) {
    const bat = document.createElement('div');
    bat.className = 'bat';
    // Random sky start
    const start = {
      x: (Math.random() * w) - (w * 0.1),
      y: (Math.random() * h) - (h * 0.2),
      s: 0.7 + Math.random() * 0.8,
      r: (Math.random() * 40) - 20,
    };
    bat.__start = start;
    bat.style.animationDelay = `${Math.random() * 0.4}s`;
    fallingBatsEl.appendChild(bat);
    loadingBats.bats.push(bat);
  }

  loadingBats.inited = true;
  updateLoadingEffects(loadedCount / CONFIG.totalFrames);
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

  loaderStartTime = performance.now();

  // Load everything once, then allow entry.
  // This avoids a "second loading" phase when the user clicks View Portfolio.
  for (let start = 0; start < CONFIG.totalFrames; start += CONFIG.batchSize) {
    await loadBatch(start, CONFIG.batchSize);
  }

  allLoaded = true;
  if (resolveAllFramesLoaded) resolveAllFramesLoaded();

  // Keep loader up briefly so the loading FX is visible (dramatic).
  const elapsed = performance.now() - loaderStartTime;
  if (elapsed < LOADER_MIN_MS) {
    await new Promise((r) => setTimeout(r, LOADER_MIN_MS - elapsed));
  }

  // Hide loader and reveal the entry button.
  loadingScreen.classList.add('hidden');
  if (viewPortfolioOverlay) viewPortfolioOverlay.classList.remove('hidden');

  // Stop the loader video and audio once they are not visible.
  if (loaderVideo) {
    loaderVideo.pause();
    loaderVideo.currentTime = 0;
  }
  if (loaderAudio) {
    loaderAudio.pause();
    loaderAudio.currentTime = 0;
  }

  // Draw the first frame and initial overlay text.
  drawFrame(0);
  updateSceneOverlay(0);
}

/* ──────────────────────────────────────────
   RESIZE OBSERVER — handles viewport changes
   (device rotation, browser chrome resize)
────────────────────────────────────────────*/

const resizeObserver = new ResizeObserver(() => {
  resizeCanvas();
  if (loadingBats.inited) {
    // Re-seed start positions on resize so the formation stays centered.
    loadingBats.inited = false;
  }
});
resizeObserver.observe(document.documentElement);

/* ──────────────────────────────────────────
   INIT
────────────────────────────────────────────*/

function init() {
  // Initial canvas size
  resizeCanvas();

  // Set scroll container height from config
  if (scrollContainer) scrollContainer.style.height = CONFIG.scrollHeight;

  // Scroll listener
  window.addEventListener('scroll', onScroll, { passive: true });

  // Show frame counter immediately
  if (hudEl) hudEl.classList.add('visible');

  if (viewPortfolioBtn) {
    const handleStart = (e) => {
      e.preventDefault();
      startAutoplayToPortfolio();
    };
    viewPortfolioBtn.addEventListener('click', handleStart);
    viewPortfolioBtn.addEventListener('touchstart', handleStart, { passive: false });
  }

  // Start render loop
  renderLoop();

  // Begin loading frames
  preloadAllFrames();

  // ── Music Toggle Logic ──
  if (musicToggle && loaderAudio) {
    musicToggle.addEventListener('click', () => {
      const isPaused = loaderAudio.paused;
      const icon = musicToggle.querySelector('.music-icon');
      const text = musicToggle.querySelector('.music-text');
      
      if (isPaused) {
        loaderAudio.play().catch(err => console.warn("Audio play failed:", err));
        musicToggle.classList.add('active');
        if (icon) icon.textContent = '🔊';
        if (text) text.textContent = 'Music On';
      } else {
        loaderAudio.pause();
        musicToggle.classList.remove('active');
        if (icon) icon.textContent = '🔇';
        if (text) text.textContent = 'Play Music';
      }
    });
  }
}

// Wait for DOM then init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
