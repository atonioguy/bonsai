// Shorts play in the feed. One YouTube player serves every Short: it sits in a layer over the Short
// that's on screen and swaps videos in place. Keeping one player is what lets the sound stay on once
// you've turned it on (phones only allow sound in a player you've already touched).
//   Autoplay on (Settings): the Short most on screen plays, muted until you turn the sound on.
//   Autoplay off: a Short plays when you tap it.
// Sound starts off every time the app opens (it's only kept in memory).
import { h, icon } from './ui.js';

const API = 'https://www.youtube.com/iframe_api';
const PLAY_AT = 0.6;  // share of a Short on screen before it starts
const STOP_AT = 0.25; // below this it stops
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

// Settings → Autoplay Shorts. Unset: on, unless the phone asks for reduced motion.
export const autoplayOn = (settings) => (settings.autoplayShorts == null ? !reduced.matches : Boolean(settings.autoplayShorts));

let sound = false;
let apiP = null;
let layer = null, frameHost = null, soundBtn = null;
let player = null, ready = false, loadedId = null, broken = false;
let current = null;       // the .short-slot the player is over
let wantPlaying = false;
let soundSetAt = 0;       // when Bonsai last changed the sound (the player reports it a moment later)
let pollTimer = 0;

function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiP) return apiP;
  apiP = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(window.YT); };
    const s = h('script', { src: API, async: true });
    s.onerror = () => { apiP = null; s.remove(); reject(new Error('YouTube player unavailable')); };
    document.head.appendChild(s);
  });
  return apiP;
}

function ensureLayer() {
  if (layer) return;
  frameHost = h('div', { class: 'short-frame' });
  soundBtn = h('button', { type: 'button', class: 'short-sound', onclick: () => setSound(!sound) });
  layer = h('div', { class: 'short-layer', hidden: true }, frameHost, soundBtn);
  document.body.appendChild(layer);
  paintSound();
}

function paintSound() {
  if (!soundBtn) return;
  soundBtn.replaceChildren(icon(sound ? 'soundOn' : 'soundOff', 22));
  soundBtn.setAttribute('aria-label', sound ? 'Turn sound off' : 'Turn sound on');
  soundBtn.setAttribute('aria-pressed', String(sound));
}

function setSound(on) {
  sound = on;
  soundSetAt = Date.now();
  if (player && ready) {
    if (on) { player.unMute(); if (wantPlaying) player.playVideo(); } else player.mute();
  }
  paintSound();
}

async function ensurePlayer(videoId) {
  if (player) return;
  const YT = await loadApi();
  if (player) return;
  const target = h('div');
  frameHost.replaceChildren(target);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('YouTube player didn’t start')), 15_000);
    player = new YT.Player(target, {
      host: 'https://www.youtube-nocookie.com',
      videoId,
      width: '100%',
      height: '100%',
      playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, controls: 1, origin: location.origin },
      events: {
        onReady: () => { clearTimeout(timer); ready = true; resolve(); },
        onStateChange: onState,
        onError: () => { if (current) fail(current); }, // e.g. the channel doesn't allow playing elsewhere
      },
    });
  }).catch((e) => { player = null; ready = false; throw e; });
  loadedId = videoId;
}

function onState(e) {
  const s = e.data;
  if (s === 0 && current && wantPlaying) { player.seekTo(0, true); player.playVideo(); } // loop, like YouTube
  else if (s === 1 && !wantPlaying) player.pauseVideo();                              // scrolled away meanwhile
  else if (s === 2 && wantPlaying && sound && Date.now() - soundSetAt < 1500) {
    // The phone stopped it for starting with sound: play muted and show the sound as off.
    sound = false;
    player.mute();
    player.playVideo();
    paintSound();
  } else if (s === 2) wantPlaying = false; // paused with the player's own button
}

// The player's own mute button changes the sound too; follow it.
function poll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!player || !ready || !current || Date.now() - soundSetAt < 1500) return;
    const on = !player.isMuted();
    if (on !== sound) { sound = on; paintSound(); }
  }, 500);
}

// Where a slot sits on the page (offsets ignore the screen's slide-in animation).
function place() {
  if (!current || !layer) return;
  let x = 0, y = 0;
  for (let n = current; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  Object.assign(layer.style, { left: x + 'px', top: y + 'px', width: current.offsetWidth + 'px', height: current.offsetHeight + 'px' });
}

// One Short that can't play here opens as a post instead; if the player can't load at all, they all do.
function fail(slot, all = false) {
  if (all) broken = true;
  slot.dataset.failed = '1';
  if (current === slot) stop();
}

async function start(slot) {
  if (current === slot) {
    if (!wantPlaying && player && ready) { wantPlaying = true; player.playVideo(); }
    return;
  }
  stop();
  ensureLayer();
  current = slot;
  wantPlaying = true;
  slot.classList.add('is-playing');
  place();
  layer.hidden = false;
  const id = slot.dataset.video;
  try {
    await ensurePlayer(id);
  } catch {
    fail(slot, true);
    return;
  }
  if (current !== slot) return; // moved on while the player loaded
  if (loadedId !== id) { player.loadVideoById(id); loadedId = id; } else player.playVideo();
  soundSetAt = Date.now();
  if (sound) player.unMute(); else player.mute();
  poll();
}

function stop() {
  wantPlaying = false;
  clearInterval(pollTimer);
  if (player && ready) player.pauseVideo();
  if (layer) layer.hidden = true;
  if (current) current.classList.remove('is-playing');
  current = null;
}

/**
 * Turn the Shorts in a list into playable ones.
 * @param {HTMLElement} list
 * @param {{ autoplay: boolean }} opts
 * @returns {{ scan: () => void, detach: () => void }}  scan after the list is redrawn
 */
export function enableShorts(list, { autoplay }) {
  list.classList.add('shorts-on');
  const ratios = new Map();
  const css = getComputedStyle(document.documentElement);
  const bar = parseFloat(css.getPropertyValue('--bar-h')) || 56;
  const nav = innerWidth >= 900 ? 0 : parseFloat(css.getPropertyValue('--nav-h')) || 64;

  const pick = () => {
    if (current && (!current.isConnected || (ratios.get(current) || 0) < STOP_AT || current.closest('.swiping'))) stop();
    if (!autoplay || broken || document.visibilityState !== 'visible') return;
    let best = null, top = PLAY_AT;
    for (const [slot, r] of ratios) if (r >= top && slot.isConnected && !slot.dataset.failed && !slot.closest('.swiping')) { best = slot; top = r; }
    if (best && best !== current) start(best);
  };

  const io = new IntersectionObserver((records) => {
    for (const r of records) ratios.set(r.target, r.isIntersecting ? r.intersectionRatio : 0);
    pick();
  }, { threshold: [0, STOP_AT, PLAY_AT, 0.8, 1], rootMargin: `-${bar}px 0px -${nav}px 0px` });

  const scan = () => {
    io.disconnect();
    ratios.clear();
    if (current && !current.isConnected) stop();
    list.querySelectorAll('.short-slot').forEach((s) => io.observe(s));
  };

  // A tap on a Short plays it here (or opens the post when YouTube can't be reached).
  const onClick = (e) => {
    const slot = e.target.closest && e.target.closest('.short-slot');
    if (!slot || !list.contains(slot)) return;
    e.preventDefault();
    if (broken || slot.dataset.failed) { location.hash = '#/item/' + encodeURIComponent(slot.closest('[data-post]').dataset.post); return; }
    start(slot);
  };
  // Swiping a post slides it sideways: the player steps aside until it closes.
  const swipes = new MutationObserver(() => pick());
  swipes.observe(list, { attributes: true, attributeFilter: ['class'], subtree: true });
  const ro = new ResizeObserver(() => place());
  ro.observe(list);
  const onResize = () => place();
  const onVisible = () => { if (document.visibilityState === 'visible') pick(); else stop(); };

  list.addEventListener('click', onClick);
  addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisible);
  scan();
  return {
    scan,
    detach() {
      io.disconnect();
      ro.disconnect();
      swipes.disconnect();
      list.removeEventListener('click', onClick);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
      list.classList.remove('shorts-on');
      stop();
    },
  };
}
