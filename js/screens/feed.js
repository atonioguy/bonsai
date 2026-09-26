import * as db from '../db.js';
import {
  mixFeed, composeFeed, dueThrowbacks, afterShown, relTime, normalizeFeed, SESSION_CHOICES,
  dueListed, afterListShown, newCounts, splitNew, pickBrief, dayKey, BRIEF_SIZE, serverHealth,
} from '../logic.js';
import { h, enso, icon } from '../ui.js';
import { currentBook, percent } from '../books.js';
import { openedMap, seenMap, markSeen, allPosts, savePost, hiddenMap, setHidden } from '../posts.js';
import { entryEl, hiddenEl } from '../entries.js';
import { enablePostMenu } from '../postmenu.js';
import { enableSwipe } from '../swipe.js';

const STALE = 10 * 60_000; // refetch the feed when the cached copy is older than this

export async function render(main, app) {
  const s = app.settings;
  let cache = await db.get('kv', 'feed');          // { updatedAt, fetchedAt, items, status }
  const muted = new Set(s.muted);

  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Topics' });
  const list = h('div', { class: 'feed' });
  const pill = h('button', { type: 'button', class: 'new-pill', hidden: true, onclick: () => {
    pill.hidden = true;
    draw();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } });
  main.append(h('h1', { class: 'visually-hidden', text: 'Feed' }), tabs, pill, list);

  const topics = [{ id: 'all', name: 'All' }, { id: '_list', name: 'Reading list' }, ...app.config.topics];
  if (!topics.some((t) => t.id === app.topic)) app.topic = 'all';
  const tabEls = topics.map((t) => {
    const count = h('span', { class: 'tab-count' });
    const tab = h('button', {
      type: 'button', class: 'tab', 'aria-pressed': String(app.topic === t.id), 'data-topic': t.id,
      onclick: () => {
        app.topic = t.id;
        tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
        pill.hidden = true;
        draw();
      },
    }, h('span', { text: t.name }), count);
    tab._name = t.name;
    tab._count = count;
    tabs.appendChild(tab);
    return tab;
  });

  let [book, saved, posts, opened, hidden] = await Promise.all([currentBook(), db.all('saved'), allPosts(), openedMap(), hiddenMap()]);
  const throwbacks = dueThrowbacks(saved, Date.now(), 3);
  const listed = dueListed(posts, Date.now(), 2);
  let seen = await seenMap();
  let loading = false, error = '';

  // First run with "new" tracking: everything already here counts as seen, so it doesn't open on "240 new".
  async function initSeen() {
    if (seen || !cache) return;
    seen = {};
    for (const i of cache.items) seen[i.id] = 1;
    await markSeen(cache.items.map((i) => i.id));
  }

  // Topics marked "brief" (News) stay out of All unless turned on in Settings; their tab still lists them.
  const briefTopics = new Set(app.config.topics.filter((t) => t.brief).map((t) => t.id));
  const positive = new Set(app.config.sources.filter((x) => x.positive).map((x) => x.id));
  const inAll = (items) => (s.newsInFeed ? items : items.filter((i) => !briefTopics.has(i.topic)));

  // Today's brief: picked once a day (so it doesn't reshuffle), refilled if it came up short.
  async function brief() {
    if (!cache || !briefTopics.size) return [];
    const byId = new Map(cache.items.map((i) => [i.id, i]));
    const saved = await db.get('kv', 'brief');
    let picked = saved && saved.day === dayKey() ? saved.ids.map((id) => byId.get(id)).filter(Boolean) : [];
    if (picked.length < BRIEF_SIZE) {
      picked = pickBrief(cache.items, { topic: [...briefTopics][0], positive });
      await db.put('kv', 'brief', { day: dayKey(), ids: picked.map((i) => i.id) });
    }
    return picked;
  }
  let briefItems = await brief();

  function paintCounts() {
    const { byTopic } = cache && seen ? newCounts(cache.items, seen, muted) : { byTopic: {} };
    const { all } = cache && seen ? newCounts(inAll(cache.items), seen, muted) : { all: 0 };
    for (const tab of tabEls) {
      const n = tab.dataset.topic === 'all' ? all : tab.dataset.topic === '_list' ? 0 : byTopic[tab.dataset.topic] || 0;
      tab._count.textContent = n ? String(n) : '';
      tab.setAttribute('aria-label', n ? `${tab._name}, ${n} new` : tab._name);
    }
  }

  // Cards the user actually scrolled past: entries become "seen", your own cards move on.
  let pendingSeen = [], seenTimer = null;
  const watcher = new IntersectionObserver((records) => {
    for (const r of records) {
      if (!r.isIntersecting) continue;
      watcher.unobserve(r.target);
      const id = r.target.dataset.id;
      if (r.target.classList.contains('entry')) {
        if (seen && !seen[id]) { seen[id] = Date.now(); pendingSeen.push(id); }
      } else if (r.target.classList.contains('throwback')) {
        const entry = throwbacks.find((t) => t.id === id);
        if (entry) db.put('saved', entry.id, afterShown(entry));
      } else if (r.target.classList.contains('listed')) {
        const p = listed.find((x) => x.id === id);
        if (p) savePost({ ...p, list: afterListShown(p.list) });
      }
    }
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => { markSeen(pendingSeen.splice(0)); paintCounts(); }, 400);
  }, { threshold: 0.6 });

  const itemEl = (it) => (hidden[it.id]
    ? hiddenEl(it, async () => { hidden = await setHidden(it.id, false); refresh(it.id); })
    : entryEl(it, { openedAt: opened[it.id] }));

  // The Reading list tab: your queue as a feed of its own (oldest added first, like a queue).
  function drawList() {
    const queued = posts.filter((p) => p.list).sort((a, b) => a.list.addedAt - b.list.addedAt);
    list.replaceChildren(...(queued.length
      ? queued.map((p) => entryEl(p.item, { openedAt: opened[p.id], extra: [p.scroll > 0.02 ? Math.round(p.scroll * 100) + '% read' : 'Not started'] }))
      : [h('div', { class: 'empty' },
        h('h2', { text: 'Reading list is empty' }),
        h('p', { class: 'lead', text: 'Long-press a post (or right-click) and choose Add to reading list.' }))]));
  }

  function draw() {
    watcher.disconnect();
    if (app.topic === '_list') return drawList();
    const mixed = cache ? mixFeed(app.topic === 'all' ? inAll(cache.items) : cache.items, { topic: app.topic, muted }) : [];
    const { fresh, older } = splitNew(mixed, seen);
    const entries = [...fresh, ...older];
    const all = app.topic === 'all'; // the book card and your own cards belong to the main mix only
    const cards = composeFeed(entries, { book: all ? book : null, throwbacks: all ? throwbacks : [], listed: all ? listed : [] });
    if (fresh.length && older.length) {
      const at = cards.findIndex((c) => c.type === 'entry' && c.data === older[0]);
      cards.splice(at, 0, { type: 'divider' });
    }
    if ((all || briefTopics.has(app.topic)) && briefItems.length) cards.unshift({ type: 'brief' });
    list.replaceChildren(...cards.map((c) => (
      c.type === 'entry' ? itemEl(c.data)
        : c.type === 'book' ? bookEl(c.data, s)
          : c.type === 'listed' ? listedEl(c.data)
            : c.type === 'divider' ? h('div', { class: 'earlier', role: 'separator' }, h('span', { text: 'Earlier' }))
              : c.type === 'brief' ? briefEl(briefItems, opened, positive)
              : throwbackEl(c.data))));
    list.querySelectorAll('.entry, .throwback, .listed').forEach((el) => watcher.observe(el));
    list.appendChild(endEl(entries.length));
    paintCounts();
  }

  function endEl(count) {
    if (!s.feedUrl) {
      return h('div', { class: 'empty' },
        h('h2', { text: 'Feed server not set' }),
        h('p', { class: 'lead', text: 'Add your bonsai-feeds address in Settings to load articles.' }),
        h('a', { class: 'btn btn-secondary', href: '#/settings' }, 'Open Settings'));
    }
    if (loading && !cache) return h('p', { class: 'feed-end meta', role: 'status', text: 'Loading…' });
    if (error && !cache) {
      return h('div', { class: 'empty' },
        h('h2', { text: 'Couldn’t load the feed' }),
        h('p', { class: 'lead', text: error }),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => load(true) }, 'Try again'));
    }
    if (!count) {
      const name = app.topic === 'all' ? '' : ' in ' + app.topicName(app.topic);
      return h('p', { class: 'feed-end meta', text: 'No articles' + name + ' yet.' });
    }
    // While the feed server is still doing its first pass, say how far along it is.
    const health = serverHealth(cache.status, app.config.sources.filter((x) => x.feed).length);
    const filling = health.expected && health.loaded < health.expected
      ? h('p', { class: 'meta' + (health.stalled ? ' warn' : '') }, health.stalled
        ? `${health.loaded} of ${health.expected} sources loaded. The feed server’s schedule doesn’t seem to be running, so Bonsai is loading them while the app is open. To fix it, see Library → Sources.`
        : `${health.loaded} of ${health.expected} sources loaded. The rest are on their way.`)
      : null;
    return h('div', { class: 'feed-end' },
      h('p', { class: 'meta', role: 'status' },
        loading ? 'Updating…' : 'You’re up to date · updated ' + relTime(cache.fetchedAt || cache.updatedAt)),
      filling,
      h('button', { type: 'button', class: 'btn-text', disabled: loading, onclick: () => load(true) }, 'Refresh'));
  }

  async function load(force) {
    if (!s.feedUrl || loading) return;
    if (!force && cache && Date.now() - (cache.fetchedAt || 0) < STALE) return;
    loading = true; error = '';
    // Only the status line changes while loading; redrawing the list would lose your place.
    if (list.querySelector('.entry')) list.lastChild.replaceWith(endEl(list.querySelectorAll('.entry').length));
    else draw();
    try {
      const base = s.feedUrl.replace(/\/+$/, '');
      if (force) await fetch(base + '/refresh', { method: 'POST' }).catch(() => {});
      const r = await fetch(base + '/feed', { cache: 'no-store' });
      if (!r.ok) throw new Error('The feed server answered ' + r.status + '.');
      cache = { ...normalizeFeed(await r.json()), fetchedAt: Date.now() };
      await db.put('kv', 'feed', cache);
      await initSeen();
      briefItems = await brief();
    } catch (e) {
      error = e instanceof TypeError ? 'The feed server couldn’t be reached.' : e.message;
    }
    loading = false;
    const atTop = window.scrollY < 200;
    if (atTop || !list.querySelector('.entry')) draw();
    else {
      // Reading further down: don't move things; offer the new ones instead.
      list.lastChild.replaceWith(endEl(list.querySelectorAll('.entry').length));
      paintCounts();
      const shown = new Set([...list.querySelectorAll('.entry')].map((e) => e.dataset.id));
      const waiting = mixFeed(app.topic === 'all' ? inAll(cache?.items || []) : cache?.items || [], { topic: app.topic, muted }).filter((i) => !seen?.[i.id] && !shown.has(i.id)).length;
      if (waiting) {
        pill.replaceChildren(icon('back', 18), h('span', { text: waiting === 1 ? '1 new article' : waiting + ' new articles' }));
        pill.hidden = false;
      }
    }
  }

  // Long-press / right-click menu. After an action only that post is redrawn, so nothing jumps.
  const lookup = (id) => cache?.items.find((i) => i.id === id) || posts.find((p) => p.id === id)?.item || null;
  async function refresh(id) {
    [opened, hidden, posts] = await Promise.all([openedMap(), hiddenMap(), allPosts()]);
    if (app.topic === '_list') return drawList();
    const it = lookup(id);
    for (const el of list.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)) {
      if (it && (el.classList.contains('entry') || el.classList.contains('entry-hidden'))) {
        const next = itemEl(it);
        el.replaceWith(next);
        if (next.classList.contains('entry')) watcher.observe(next);
      }
    }
    list.querySelectorAll('.brief-list li').forEach((li) => {
      const a = li.querySelector('[data-post]');
      if (a) li.classList.toggle('is-read', Boolean(opened[a.dataset.post]));
    });
  }
  const detachMenu = enablePostMenu(list, lookup, (kind, it) => refresh(it.id));
  // Swipe left for Reading list / Hide (the Reading list tab only needs the first).
  const detachSwipe = enableSwipe(list, lookup, (kind, it) => refresh(it.id), { canHide: () => app.topic !== '_list' });

  await initSeen();
  draw();
  if (app.feedScroll) { const y = app.feedScroll; app.onShown = () => window.scrollTo(0, y); }
  load(false);

  // While sources are still missing, nudge the feed server about once a minute as long as the app
  // is open (it refreshes whatever is due each time), and pick up what arrived.
  const nudge = setInterval(async () => {
    if (!s.feedUrl || loading || document.visibilityState !== 'visible' || !cache) return;
    const health = serverHealth(cache.status, app.config.sources.filter((x) => x.feed).length);
    if (health.loaded >= health.expected) return;
    try {
      const r = await fetch(s.feedUrl.replace(/\/+$/, '') + '/refresh', { method: 'POST' });
      const done = r.ok ? await r.json() : null;
      if (done && Array.isArray(done.refreshed) && done.refreshed.length) load(true);
    } catch { /* offline: try again next minute */ }
  }, 65_000);

  return () => {
    clearInterval(nudge);
    app.feedScroll = window.scrollY;
    watcher.disconnect();
    detachMenu();
    detachSwipe();
    clearTimeout(seenTimer);
    if (pendingSeen.length) markSeen(pendingSeen.splice(0));
  };
}

// Book card: pick a timed session length (remembered) and start it, or just read freely.
function bookEl({ meta, f }, s) {
  let minutes = SESSION_CHOICES.includes(s.sessionMinutes) ? s.sessionMinutes : 15;
  const start = h('a', { class: 'btn btn-primary' });
  const paint = () => {
    start.textContent = 'Start ' + minutes + ' min';
    start.href = '#/read/' + meta.id + '/' + minutes;
    for (const b of lengths.children) b.setAttribute('aria-pressed', String(Number(b.dataset.min) === minutes));
  };
  const lengths = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Session length' },
    SESSION_CHOICES.map((m) => h('button', { type: 'button', 'data-min': m, onclick: () => {
      minutes = m;
      paint();
      db.saveSettings({ sessionMinutes: m }).then((next) => { s.sessionMinutes = next.sessionMinutes; });
    } }, m + ' min')));
  paint();
  return h('section', { class: 'book-card', 'aria-label': 'Continue reading' },
    enso(f, 48, { track: 'var(--beige)' }),
    h('div', {},
      h('p', { class: 'meta', text: 'Continue reading' }),
      h('h2', { class: 'book-title', text: meta.title }),
      h('p', { class: 'meta', text: percent(f) + ' read' + (meta.author ? ' · ' + meta.author : '') })),
    h('div', { class: 'book-actions' },
      lengths,
      h('div', { class: 'book-buttons' },
        start,
        h('a', { class: 'btn btn-secondary', href: '#/read/' + meta.id + '/free' }, 'Free read'))));
}

// Today's brief: five headlines, one of them good news.
function briefEl(items, opened, positive) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  return h('section', { class: 'brief', 'aria-labelledby': 'brief-title' },
    h('div', { class: 'brief-head' },
      h('h2', { class: 'brief-title', id: 'brief-title', text: 'Today’s brief' }),
      h('p', { class: 'meta', text: today })),
    h('ol', { class: 'brief-list' }, items.map((i) => h('li', { class: opened[i.id] ? 'is-read' : '' },
      h('a', { class: 'brief-link', href: '#/item/' + encodeURIComponent(i.id), 'data-post': i.id },
        h('span', { class: 'brief-item', text: i.title }),
        h('span', { class: 'meta', text: [positive.has(i.sourceId) ? 'Good news' : null, i.sourceName, opened[i.id] ? 'Opened' : null].filter(Boolean).join(' · ') }))))));
}

// A reading-list article coming back around.
function listedEl(post) {
  const it = post.item;
  const where = post.scroll > 0.02 ? Math.round(post.scroll * 100) + '% read' : 'Not started';
  return h('aside', { class: 'listed', 'data-id': post.id, 'aria-label': 'From your reading list' },
    h('p', { class: 'meta', text: 'From your reading list · added ' + relTime(post.list.addedAt) }),
    h('h2', { class: 'entry-title' }, h('a', { href: '#/item/' + encodeURIComponent(post.id) }, it.title)),
    h('p', { class: 'meta', text: [it.sourceName, where].filter(Boolean).join(' · ') }));
}

export function throwbackEl(entry) {
  return h('aside', { class: 'throwback', 'data-id': entry.id, 'aria-label': 'Throwback' },
    h('p', { class: 'meta', text: 'Throwback · saved ' + relTime(entry.savedAt) }),
    h('blockquote', { class: 'quote' + (entry.kind === 'note' ? ' note' : ''), text: entry.kind === 'note' ? entry.text : '“' + entry.text + '”' }),
    h('p', { class: 'meta', text: sourceLine(entry) }));
}

export function sourceLine(entry) {
  return [entry.sourceTitle, entry.sourceName].filter(Boolean).join(' — ');
}
