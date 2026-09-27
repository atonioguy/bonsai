// Bonsai — boot, routing, shared app state.
import * as db from './db.js';
import { h, icon, treeMark } from './ui.js';
import { retryPending } from './sidequest.js';
import { applyTheme, applyText } from './prefs.js';
import { openRecent } from './recent.js';
import { initJump, jumpRefresh } from './jump.js';

export const VERSION = '0.8.3';

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
  [/^#\/(?:collections|saved)(?:\/(list|bookmarks|quotes|notes|folder)(?:\/([^/]+))?)?$/, 'collections'],
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
  // Back to the previous screen in this tab (a post opened from the feed goes back to the feed,
  // even after a trip to another tab), else the tab's own screen.
  back() {
    const stack = stacks[section] || [];
    location.hash = stack.length > 1 ? stack[stack.length - 2] : ROOT[section] || '#/';
  },
  async reloadSettings() { this.settings = await db.settings(); return this.settings; },
};

// How deep a screen sits, for the slide direction of screen changes.
const depthOf = (name, params) => (name === 'item' || name === 'read' || (name === 'collections' && params[0] === 'folder') ? 1 : 0);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let depth = 0;

// Each bottom tab remembers where you were in it, like tabs in iPhone apps: a post opened from the
// feed is still open when you come back to Feed. Posts and books belong to the tab they were
// opened from. Tapping the tab you're in goes back to its own screen, then to the top.
const ROOT = { feed: '#/', library: '#/library', collections: '#/collections', bonsai: '#/bonsai', settings: '#/settings' };
const SECTION = { feed: 'feed', library: 'library', collections: 'collections', bonsai: 'bonsai', settings: 'settings' };
let section = 'feed';
const stacks = {}; // tab → the screens visited in it, oldest first

function track(name, hash) {
  section = SECTION[name] || section; // a post or book stays in the tab it was opened from
  const stack = stacks[section] || (stacks[section] = []);
  if (SECTION[name] && hash === ROOT[section]) stack.length = 0; // the tab's own screen starts it over
  if (stack.length > 1 && stack[stack.length - 2] === hash) stack.pop(); // went back
  else if (stack[stack.length - 1] !== hash) stack.push(hash);
  if (stack.length > 30) stack.splice(0, stack.length - 30);
}

function onNavTap(e) {
  const a = e.currentTarget;
  const tab = a.dataset.screen;
  e.preventDefault();
  const stack = stacks[tab] || [];
  const current = location.hash || '#/';
  if (tab !== section) { // back where you left it, in that tab
    section = tab;
    location.hash = stack[stack.length - 1] || ROOT[tab];
  }
  else if (current !== ROOT[tab] && !(tab === 'feed' && (current === '#' || current === '#/'))) location.hash = ROOT[tab];
  else window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

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
  track(name, hash === '#' ? '#/' : hash);
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
    if (a.dataset.screen === section) a.setAttribute('aria-current', 'page');
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
    NAV.map(([href, screen, label]) => h('a', { href, 'data-screen': screen, onclick: onNavTap }, icon(NAV_ICON[screen] || screen), h('span', { text: label }))));
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
