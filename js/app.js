// Bonsai — boot, routing, shared app state.
import * as db from './db.js';
import { h, icon, treeMark } from './ui.js';
import { retryPending } from './sidequest.js';

export const VERSION = '0.1.0';

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
  [/^#\/read\/([^/]+)$/, 'read'],
  [/^#\/saved$/, 'saved'],
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
  topicName(id) { return this.config.topics.find((t) => t.id === id)?.name || ''; },
  async reloadSettings() { this.settings = await db.settings(); return this.settings; },
};

let cleanup = null;
let first = true;
let main;

async function route() {
  const hash = location.hash || '#/';
  let name = 'feed', params = [];
  for (const [re, n] of ROUTES) {
    const m = re.exec(hash);
    if (m) { name = n; params = m.slice(1).map(decodeURIComponent); break; }
  }
  if (cleanup) { try { await cleanup(); } catch (e) { console.warn(e); } cleanup = null; }

  document.body.dataset.route = name;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.screen === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  const mod = await SCREENS[name]();
  main.replaceChildren();
  window.scrollTo(0, 0);
  cleanup = (await mod.render(main, app, ...params)) || null;
  if (!first) main.focus({ preventScroll: true });
  first = false;
}

async function boot() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    NAV.map(([href, screen, label]) => h('a', { href, 'data-screen': screen }, icon(screen), h('span', { text: label }))));
  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/', 'aria-label': 'Bonsai, feed' }, treeMark(28), h('span', { 'aria-hidden': 'true', text: 'bonsai' })),
    nav);
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
