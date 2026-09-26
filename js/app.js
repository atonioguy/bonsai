// Bonsai — boot, routing, shared app state.
import * as db from './db.js';
import { h, icon, treeMark } from './ui.js';
import { retryPending } from './sidequest.js';
import { applyTheme, applyText } from './prefs.js';
import { openRecent } from './recent.js';

export const VERSION = '0.4.0';

const SCREENS = {
  feed: () => import('./screens/feed.js'),
  item: () => import('./screens/item.js'),
  library: () => import('./screens/library.js'),
  read: () => import('./screens/reader.js'),
  saved: () => import('./screens/saved.js'),
  settings: () => import('./screens/settings.js'),
};

const ROUTES = [
  [/^#\/?$/, 'feed'],
  [/^#\/item\/([^/]+)$/, 'item'],
  [/^#\/library$/, 'library'],
  [/^#\/read\/([^/]+)(?:\/(free|[0-9.]+))?$/, 'read'],
  [/^#\/saved(?:\/(list|bookmarks|quotes|folder)(?:\/([^/]+))?)?$/, 'saved'],
  [/^#\/settings$/, 'settings'],
];

const NAV = [
  ['#/', 'feed', 'Feed'],
  ['#/library', 'library', 'Library'],
  ['#/saved', 'saved', 'Saved'],
  ['#/settings', 'settings', 'Settings'],
];

// Shared state handed to every screen.
export const app = {
  settings: null,
  config: { topics: [], sources: [], books: [] }, // sources.json
  feedScroll: 0,
  topic: 'all',
  prevHash: null,
  topicName(id) { return this.config.topics.find((t) => t.id === id)?.name || ''; },
  // Back to wherever you came from inside the app (feed, a folder, Recent…), else the feed.
  back() { if (this.prevHash) history.back(); else location.hash = '#/'; },
  async reloadSettings() { this.settings = await db.settings(); return this.settings; },
};

// How deep a screen sits, for the slide direction of screen changes.
const depthOf = (name, params) => (name === 'item' || name === 'read' || (name === 'saved' && params[0] === 'folder') ? 1 : 0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let depth = 0;

let cleanup = null;
let first = true;
let main;
let lastHash = null;

async function route() {
  const hash = location.hash || '#/';
  app.prevHash = lastHash;
  lastHash = hash;
  let name = 'feed', params = [];
  for (const [re, n] of ROUTES) {
    const m = re.exec(hash);
    if (m) { name = n; params = m.slice(1).map((x) => (x == null ? x : decodeURIComponent(x))); break; }
  }
  if (cleanup) { try { await cleanup(); } catch (e) { console.warn(e); } cleanup = null; }

  document.body.dataset.route = name;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.screen === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  const mod = await SCREENS[name]();
  const nextDepth = depthOf(name, params);
  const dir = nextDepth > depth ? 'forward' : nextDepth < depth ? 'back' : 'fade';
  depth = nextDepth;
  const swap = async () => {
    main.replaceChildren();
    window.scrollTo(0, 0);
    cleanup = (await mod.render(main, app, ...params)) || null;
  };

  // Screen changes slide (deeper = from the right, back = from the left) or cross-fade between
  // tabs. View Transitions where supported, a short fade-in otherwise; none with reduced motion.
  if (first || reducedMotion.matches) {
    await swap();
  } else if (document.startViewTransition) {
    document.documentElement.dataset.nav = dir;
    await document.startViewTransition(swap).updateCallbackDone.catch(() => {});
  } else {
    await swap();
    const x = dir === 'forward' ? 24 : dir === 'back' ? -24 : 0;
    main.animate([{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: 250, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  if (!first) main.focus({ preventScroll: true });
  first = false;
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // screens place the scroll themselves
  applyTheme();
  applyText();
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    NAV.map(([href, screen, label]) => h('a', { href, 'data-screen': screen }, icon(screen), h('span', { text: label }))));
  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Bonsai, feed' }, treeMark(28), h('span', { 'aria-hidden': 'true', text: 'bonsai' })),
    h('div', { class: 'topbar-end' },
      nav,
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Recently opened', onclick: () => openRecent() }, icon('clock'))));
  main = h('main', { id: 'main', tabindex: '-1' });
  document.body.replaceChildren(h('a', { class: 'skip', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content'), topbar, main);

  await app.reloadSettings();
  try {
    const r = await fetch('sources.json', { cache: 'no-cache' });
    if (r.ok) app.config = await r.json();
  } catch { /* offline: sources list stays empty until next load */ }

  window.addEventListener('hashchange', route);
  await route();

  retryPending(app).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
