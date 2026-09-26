// Bonsai — boot, routing, shared app state.
import * as db from './db.js';
import { h, icon, treeMark } from './ui.js';
import { retryPending } from './sidequest.js';
import { applyTheme, applyText } from './prefs.js';
import { openRecent } from './recent.js';
import { initJump, jumpRefresh } from './jump.js';

export const VERSION = '0.7.2';

const SCREENS = {
  feed: () => import('./screens/feed.js'),
  item: () => import('./screens/item.js'),
  library: () => import('./screens/library.js'),
  read: () => import('./screens/reader.js'),
  collections: () => import('./screens/collections.js'),
  bonsai: () => import('./screens/bonsai.js'),
  settings: () => import('./screens/settings.js'),
};

const ROUTES = [
  [/^#\/?$/, 'feed'],
  [/^#\/item\/([^/]+)$/, 'item'],
  [/^#\/library$/, 'library'],
  [/^#\/read\/([^/]+)(?:\/(free|[0-9.]+))?$/, 'read'],
  [/^#\/(?:collections|saved)(?:\/(list|bookmarks|quotes|folder)(?:\/([^/]+))?)?$/, 'collections'],
  [/^#\/bonsai$/, 'bonsai'],
  [/^#\/settings$/, 'settings'],
];

const NAV_ICON = { collections: 'bookmark', bonsai: 'saved' };
const NAV = [
  ['#/', 'feed', 'Feed'],
  ['#/library', 'library', 'Library'],
  ['#/collections', 'collections', 'Collections'],
  ['#/bonsai', 'bonsai', 'Bonsai'],
  ['#/settings', 'settings', 'Settings'],
];

// Shared state handed to every screen.
export const app = {
  settings: null,
  config: { topics: [], sources: [], books: [] }, // sources.json
  feedView: undefined, // the feed's order and your place in it (screens/feed.js)
  topic: 'all',
  prevHash: null,
  onShown: null, // a screen can set this to run once it's on screen (e.g. restore a scroll position)
  topicName(id) { return this.config.topics.find((t) => t.id === id)?.name || ''; },
  // Back to wherever you came from inside the app (feed, a folder, Recent…), else the feed.
  back() { if (this.prevHash) history.back(); else location.hash = '#/'; },
  async reloadSettings() { this.settings = await db.settings(); return this.settings; },
};

// How deep a screen sits, for the slide direction of screen changes.
const depthOf = (name, params) => (name === 'item' || name === 'read' || (name === 'collections' && params[0] === 'folder') ? 1 : 0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let depth = 0;

let cleanup = null;
let first = true;
let main;
let lastHash = null;

// Screen changes run one at a time, so a quick second tap can't interleave with the first.
let routing = Promise.resolve();
function route() {
  routing = routing.then(doRoute).catch((e) => console.error(e));
  return routing;
}

async function doRoute() {
  const hash = location.hash || '#/';
  if (hash === lastHash && !first) return; // already showing it (a queued duplicate)
  app.prevHash = lastHash;
  lastHash = hash;
  let name = 'feed', params = [];
  for (const [re, n] of ROUTES) {
    const m = re.exec(hash);
    if (m) { name = n; params = m.slice(1).map((x) => (x == null ? x : decodeURIComponent(x))); break; }
  }
  if (cleanup) { try { await cleanup(); } catch (e) { console.warn(e); } cleanup = null; }

  const mod = await SCREENS[name]();
  const nextDepth = depthOf(name, params);
  const dir = nextDepth > depth ? 'forward' : nextDepth < depth ? 'back' : 'fade';
  depth = nextDepth;

  // Build the next screen off the page while the current one stays visible, then swap it in
  // in one step with its scroll position already set: no blank frame, no jump to the top and back.
  const screen = h('div', { class: 'screen' });
  // Screens build with append(a, cond ? b : null); skip empty slots instead of printing "null".
  for (const m of ['append', 'replaceChildren']) {
    const native = screen[m].bind(screen);
    screen[m] = (...kids) => native(...kids.flat().filter((k) => k != null && k !== false));
  }
  app.onShown = null;
  cleanup = (await mod.render(screen, app, ...params)) || null;
  document.body.dataset.route = name;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.screen === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  main.replaceChildren(screen);
  if (!first) main.focus({ preventScroll: true }); // focus first: some browsers scroll on focus
  window.scrollTo(0, 0);
  const shown = app.onShown;
  app.onShown = null;
  if (shown) shown(); // e.g. back to your place in an article, before the first paint

  // A short slide (deeper from the right, back from the left) or fade between tabs.
  if (!first && !reducedMotion.matches) {
    const x = dir === 'forward' ? 20 : dir === 'back' ? -20 : 0;
    screen.animate([{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }],
      { duration: dir === 'fade' ? 160 : 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  first = false;
  jumpRefresh();
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // screens place the scroll themselves
  applyTheme();
  applyText();
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    NAV.map(([href, screen, label]) => h('a', { href, 'data-screen': screen }, icon(NAV_ICON[screen] || screen), h('span', { text: label }))));
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

  initJump();
  window.addEventListener('hashchange', route);
  await route();

  retryPending(app).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
