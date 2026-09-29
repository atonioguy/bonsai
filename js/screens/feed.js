import * as db from '../db.js';
import {
  mixFeed, composeFeed, dueThrowbacks, afterShown, relTime, normalizeFeed, mergeDuplicates, retopic, SESSION_CHOICES,
  dueListed, afterListShown, newCounts, shapeFeed, capPerSource, tooOld, stampArrivals, pickBrief, dayKey, BRIEF_SIZE, serverHealth, minEveryOf, limitResetAt, topicsOf, isMuted, seenOf,
} from '../logic.js';
import { h, enso, icon, toast } from '../ui.js';
import { currentBook, percent } from '../books.js';
import { openedMap, seenMap, markSeen, allPosts, savePost, hiddenMap, setHidden } from '../posts.js';
import { entryEl, hiddenEl, showLength } from '../entries.js';
import { loadLengths, requestLengths } from '../lengths.js';
import { enablePostMenu } from '../postmenu.js';
import { enableSwipe } from '../swipe.js';
import { enableShorts, autoplayOn } from '../shorts.js';
import { enablePull } from '../pull.js';

const STALE = 10 * 60_000; // check the feed server in the background when the cached copy is older than this
const slim = ({ html, ...rest }) => rest; // a post as the feed shows it (the full text stays in the cache)

export async function render(main, app) {
  const s = app.settings;
  let cache = await db.get('kv', 'feed');          // { updatedAt, fetchedAt, items, status }
  if (cache && !cache.merged) { // saved before duplicates were merged
    cache = { ...cache, items: mergeDuplicates(cache.items), merged: true };
    await db.put('kv', 'feed', cache);
  }
  if (cache) cache = { ...cache, items: retopic(cache.items, app.config.sources) };
  const muted = new Set(s.muted);

  // The feed keeps its order until you refresh it (pull down, or Refresh at the end): per tab, the
  // posts in the order you saw them and the post at the top of the screen. Kept across app restarts.
  if (app.feedView === undefined) app.feedView = (await db.get('kv', 'feedView')) || null;
  // A Settings/Library change, or a source moved to another topic, rebuilds it.
  const sig = JSON.stringify([s.muted, Boolean(s.newsInFeed), app.config.sources.map((x) => x.id + ':' + x.topic).join()]);
  if (!app.feedView || app.feedView.sig !== sig) app.feedView = { sig, tabs: {} };
  const views = () => app.feedView.tabs;
  let saveTimer = null;
  const saveViews = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => db.put('kv', 'feedView', app.feedView), 500); };

  const tabs = h('div', { class: 'tabs topic-tabs', role: 'group', 'aria-label': 'Topics' });
  const list = h('div', { class: 'feed' });
  // "3 new posts": shows when a background check finds posts this tab isn't showing yet. Tapping it
  // does what pulling down does (a new order, newest first, back to the top).
  const pill = h('button', { type: 'button', class: 'new-pill', hidden: true, onclick: () => { pill.hidden = true; refreshTop(); } });
  main.append(h('h1', { class: 'visually-hidden', text: 'Feed' }), tabs, pill, list);

  const topics = [{ id: 'all', name: 'All' }, { id: '_list', name: 'Reading list' }, ...app.config.topics];
  if (!topics.some((t) => t.id === app.topic)) app.topic = 'all';
  const tabEls = topics.map((t) => {
    const count = h('span', { class: 'tab-count' });
    const tab = h('button', {
      type: 'button', class: 'tab', 'aria-pressed': String(app.topic === t.id), 'data-topic': t.id,
      onclick: () => {
        if (app.topic === t.id) return;
        captureAnchor();
        app.topic = t.id;
        tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
        const r = tab.getBoundingClientRect(), row = tabs.getBoundingClientRect(); // show all of it in the row
        if (r.left < row.left || r.right > row.right) tabs.scrollBy({ left: r.left < row.left ? r.left - row.left - 16 : r.right - row.right + 16 });
        draw();
        restoreAnchor();
      },
    }, h('span', { text: t.name }), count);
    tab._name = t.name;
    tab._count = count;
    tabs.appendChild(tab);
    return tab;
  });

  let book, saved, posts, opened, hidden, throwbacks, listed;
  async function loadExtras() {
    [book, saved, posts, opened, hidden] = await Promise.all([currentBook(), db.all('saved'), allPosts(), openedMap(), hiddenMap()]);
    throwbacks = dueThrowbacks(saved, Date.now(), 3);
    listed = dueListed(posts, Date.now(), 2);
  }
  await Promise.all([loadExtras(), loadLengths()]);
  let seen = await seenMap();
  let loading = false, error = '', note = '';

  // When each post first reached this device: the feed's order is newest arrival first.
  let arrived = (await db.get('kv', 'arrived')) || {};
  async function stamp() {
    if (!cache) return;
    const r = stampArrivals(arrived, cache.items);
    arrived = r.arrived;
    if (r.changed) await db.put('kv', 'arrived', arrived);
  }
  await stamp();

  // Every id a post goes by (a merged post keeps the other feed's id too), for lookups by id.
  let byId = new Map();
  const index = () => {
    byId = new Map();
    for (const i of cache?.items || []) for (const id of [i.id, ...(i.dupIds || [])]) if (!byId.has(id)) byId.set(id, i);
  };
  index();
  // Reading list and bookmark marks: one record per post, the same in every tab.
  const savedOf = (i) => { const p = posts.find((x) => x.id === i.id); return p ? { list: Boolean(p.list), bookmark: Boolean(p.bookmark) } : null; };
  const openedAt = (i) => opened[i.id] || (i.dupIds || []).map((d) => opened[d]).find(Boolean) || 0;

  // First run with "new" tracking: everything already here counts as seen, so it doesn't open on "240 new".
  async function initSeen() {
    if (seen || !cache) return;
    seen = {};
    const now = Date.now();
    for (const i of cache.items) seen[i.id] = now;
    await markSeen(cache.items.map((i) => i.id));
  }

  // Topics marked "brief" (News) stay out of All unless turned on in Settings; their tab still lists them.
  const briefTopics = new Set(app.config.topics.filter((t) => t.brief).map((t) => t.id));
  const positive = new Set(app.config.sources.filter((x) => x.positive).map((x) => x.id));
  const inAll = (items) => (s.newsInFeed ? items : items.filter((i) => !topicsOf(i).every((t) => briefTopics.has(t))));
  // Newest arrivals first; posts that arrived over a month ago have left the feed.
  const pool = (topic) => (cache ? mixFeed(topic === 'all' ? inAll(cache.items) : cache.items, { topic, muted, arrived, limit: 200 }).filter((i) => !tooOld(i, arrived)) : []);

  // Today's brief: picked once a day (so it doesn't reshuffle), refilled if it came up short.
  async function brief() {
    if (!cache || !briefTopics.size) return [];
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
        for (const d of [id, ...(byId.get(id)?.dupIds || [])]) {
          if (seen && !seen[d]) { seen[d] = Date.now(); pendingSeen.push(d); }
        }
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
    : entryEl(it, { openedAt: openedAt(it), saved: savedOf(it) }));

  // ---------- the feed as a list of card keys ----------
  const keyOf = (c) => (c.type === 'entry' ? 'e:' + c.data.id : c.type === 'book' ? 'book' : c.type === 'listed' ? 'l:' + c.data.id
    : c.type === 'throwback' ? 't:' + c.data.id : c.type === 'divider' ? 'earlier' : c.type === 'brief' ? 'brief' : 'new:' + c.at);

  // A fresh order for a tab: new posts first, then an "Earlier" line and the ones already seen.
  function buildView(topic) {
    const { fresh, older } = shapeFeed(pool(topic), seen);
    const entries = [...fresh, ...older];
    const all = topic === 'all'; // the book card and your own cards belong to the main mix only
    const cards = composeFeed(entries, { book: all ? book : null, throwbacks: all ? throwbacks : [], listed: all ? listed : [] });
    if (fresh.length && older.length) {
      const at = cards.findIndex((c) => c.type === 'entry' && c.data === older[0]);
      cards.splice(at, 0, { type: 'divider' });
    }
    if ((all || briefTopics.has(topic)) && briefItems.length) cards.unshift({ type: 'brief' });
    return { keys: cards.map(keyOf), items: Object.fromEntries(entries.map((e) => [e.id, slim(e)])), anchor: null, entries: entries.length, builtAt: Date.now() };
  }

  // The saved order back as cards, with today's state (opened, hidden, the current book…).
  function cardsOf(view, topic) {
    const out = [], shown = new Set();
    const savedById = new Map(saved.map((x) => [x.id, x]));
    const postById = new Map(posts.map((p) => [p.id, p]));
    for (const k of view.keys) {
      const id = k.slice(2);
      if (k.startsWith('e:')) {
        const it = byId.get(id) || view.items[id];
        if (it && !shown.has(it.id) && !isMuted(it, muted)) { shown.add(it.id); out.push({ type: 'entry', data: it }); }
      } else if (k === 'book') { if (book) out.push({ type: 'book', data: book }); }
      else if (k.startsWith('t:')) { if (savedById.has(id)) out.push({ type: 'throwback', data: savedById.get(id) }); }
      else if (k.startsWith('l:')) { if (postById.get(id)?.list) out.push({ type: 'listed', data: postById.get(id) }); }
      else if (k === 'earlier') out.push({ type: 'divider' });
      else if (k.startsWith('new:')) out.push({ type: 'new', at: Number(k.slice(4)) });
      else if (k === 'brief') { if (briefItems.length) out.push({ type: 'brief' }); }
    }
    // A book started since this order was made still gets its usual place.
    if (topic === 'all' && book && !view.keys.includes('book')) out.splice(Math.min(1, out.length), 0, { type: 'book', data: book });
    return out;
  }

  function cardEl(c) {
    const el = c.type === 'entry' ? itemEl(c.data)
      : c.type === 'book' ? bookEl(c.data, s)
        : c.type === 'listed' ? listedEl(c.data)
          : c.type === 'divider' ? h('div', { class: 'earlier', role: 'separator' }, h('span', { text: 'Earlier' }))
            : c.type === 'new' ? h('div', { class: 'earlier', role: 'separator' }, h('span', { text: 'New' }))
              : c.type === 'brief' ? briefEl(briefItems, opened, positive)
                : throwbackEl(c.data);
    el.dataset.key = keyOf(c);
    return el;
  }

  // The Reading list tab: your queue as a feed of its own (oldest added first, like a queue).
  function drawList() {
    const queued = posts.filter((p) => p.list).sort((a, b) => a.list.addedAt - b.list.addedAt);
    list.replaceChildren(...(queued.length
      ? queued.map((p) => entryEl(p.item, { openedAt: openedAt(p.item), saved: savedOf(p.item), extra: [p.scroll > 0.02 ? Math.round(p.scroll * 100) + '% read' : 'Not started'] }))
      : [h('div', { class: 'empty' },
        h('h2', { text: 'Reading list is empty' }),
        h('p', { class: 'lead', text: 'Long-press a post (or right-click) and choose Add to reading list.' }))]));
  }

  function draw() {
    watcher.disconnect();
    if (app.topic === '_list') { drawList(); paintPill(); shorts.scan(); askLengths(); return; }
    let view = views()[app.topic];
    if (!view || (!view.entries && cache?.items.length)) { // never built, or built before anything arrived
      view = views()[app.topic] = buildView(app.topic);
      saveViews();
    }
    list.replaceChildren(...cardsOf(view, app.topic).map(cardEl));
    list.querySelectorAll('.entry, .throwback, .listed').forEach((el) => watcher.observe(el));
    list.appendChild(endEl());
    paintCounts();
    paintPill();
    shorts.scan();
    askLengths();
  }

  // Videos on this tab without a known length: ask the feed server, fill them in as they come.
  const askLengths = () => requestLengths([...list.querySelectorAll('.entry[data-post]')].map((el) => lookup(el.dataset.post)).filter(Boolean),
    s.feedUrl, (videoId, seconds) => showLength(list, videoId, seconds));

  // ---------- keep your place ----------
  const topbar = document.querySelector('.topbar');
  function captureAnchor() {
    const view = views()[app.topic] || (views()[app.topic] = { keys: [], items: {}, anchor: null, list: true });
    if (window.scrollY < 4) { view.anchor = null; return; }
    const edge = topbar ? topbar.getBoundingClientRect().bottom : 0;
    for (const el of list.children) {
      if (!el.dataset.key && !el.dataset.id) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > edge + 1) { view.anchor = { key: el.dataset.key || 'e:' + el.dataset.id, off: r.top }; return; }
    }
  }
  function restoreAnchor() {
    const a = views()[app.topic]?.anchor;
    const el = a && list.querySelector(`[data-key="${CSS.escape(a.key)}"]`);
    window.scrollTo(0, el ? el.getBoundingClientRect().top + window.scrollY - a.off : 0);
    showTabs(); // a jump isn't a scroll down: keep the topics in view
  }
  let anchorTimer = null;
  const onScroll = () => {
    moveTabs();
    if (anchorTimer) return;
    anchorTimer = setTimeout(() => { anchorTimer = null; captureAnchor(); saveViews(); }, 200);
  };

  // ---------- the topics stay reachable ----------
  // Like Safari's bar: they stick under the top bar, slide away while you scroll down and come
  // back as soon as you scroll up.
  let lastY = window.scrollY, calmUntil = 0;
  function showTabs() {
    tabs.classList.remove('is-away');
    lastY = window.scrollY;
    calmUntil = Date.now() + 400; // the scroll events from a jump don't count
  }
  function moveTabs() {
    const y = window.scrollY;
    tabs.classList.toggle('is-stuck', y > 8);
    if (Date.now() < calmUntil || y < 80) { if (y < 80) tabs.classList.remove('is-away'); lastY = y; return; }
    if (y > lastY + 12) { tabs.classList.add('is-away'); lastY = y; }
    else if (y < lastY - 12) { tabs.classList.remove('is-away'); lastY = y; }
  }

  // ---------- the end of the list: status and Refresh ----------
  // Posts the server has that this tab isn't showing yet (they come in when you refresh).
  // (At most a few per source, like a fresh order: the rest come with the refresh after.)
  function notShown() {
    const view = views()[app.topic];
    if (!view || app.topic === '_list') return [];
    const inView = new Set(view.keys.filter((k) => k.startsWith('e:')).map((k) => k.slice(2)));
    return capPerSource(pool(app.topic).filter((i) => !seenOf(seen, i) && ![i.id, ...(i.dupIds || [])].some((d) => inView.has(d))))[0];
  }
  const waiting = () => notShown().length;

  function endEl() {
    const el = endContent(list.querySelectorAll('.entry, .entry-hidden').length);
    el.dataset.end = '';
    return el;
  }
  const paintEnd = () => { list.querySelector('[data-end]')?.replaceWith(endEl()); paintPill(); };
  function paintPill() {
    // Only posts that arrived since this order was made (not the ones a source's cap held back).
    if (loading) return; // keep what it shows while a check runs
    const since = views()[app.topic]?.builtAt || 0;
    const n = app.topic === '_list' ? 0 : notShown().filter((i) => (arrived[i.id] || 0) > since).length;
    pill.hidden = !n;
    if (!n) return;
    const text = n === 1 ? '1 new post' : n + ' new posts';
    pill.replaceChildren(icon('arrowUp', 18), h('span', { text }));
    pill.setAttribute('aria-label', 'Show ' + text);
  }

  function endContent(count) {
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
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => refreshTop() }, 'Try again'));
    }
    if (!count) {
      const name = app.topic === 'all' ? '' : ' in ' + app.topicName(app.topic);
      return h('div', { class: 'feed-end' },
        h('p', { class: 'meta', text: 'No articles' + name + ' yet.' }),
        h('button', { type: 'button', class: 'btn btn-secondary', disabled: loading, onclick: () => refreshTop() }, icon('refresh', 18), 'Refresh'));
    }
    // While the feed server is still doing its first pass, say how far along it is; if it has
    // stopped saving new posts, say so instead of looking up to date.
    const health = serverHealth(cache.status, app.config.sources.filter((x) => x.feed).length, cache.fetchedAt || Date.now(), minEveryOf(app.config));
    const resets = new Date(limitResetAt()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const filling = health.quiet
      ? h('p', { class: 'meta warn' }, `The feed server is behind: ${health.overdue} sources are overdue for a check (last save ${relTime(health.newest)}). Cloudflare’s free daily limit may be used up (it resets at ${resets}), or its schedule has stopped (see Library).`)
      : health.expected && health.loaded < health.expected
        ? h('p', { class: 'meta' + (health.stalled ? ' warn' : '') }, health.stalled
          ? `${health.loaded} of ${health.expected} sources loaded. The feed server’s schedule doesn’t seem to be running, so Bonsai is loading them while the app is open. To fix it, see Library → Sources.`
          : `${health.loaded} of ${health.expected} sources loaded. The rest are on their way.`)
        : null;
    const n = loading ? 0 : waiting();
    const status = loading ? 'Updating…'
      : note ? note
        : n ? `${n} new ${n === 1 ? 'post' : 'posts'} · Refresh to add ${n === 1 ? 'it' : 'them'}`
          : 'You’re up to date · updated ' + relTime(cache.fetchedAt || cache.updatedAt);
    return h('div', { class: 'feed-end' },
      h('p', { class: 'meta', role: 'status', text: status }),
      filling,
      h('button', { type: 'button', class: 'btn btn-secondary', disabled: loading, onclick: () => refreshBottom() }, icon('refresh', 18), 'Refresh'));
  }

  // ---------- loading ----------
  // Fetches the feed into the cache. What's on screen doesn't change (unless nothing was yet).
  // Resolves false if it failed; a refresh during a background load waits for that one.
  let inflight = null;
  function load(force) {
    if (!s.feedUrl) return Promise.resolve(false);
    if (inflight) return inflight;
    if (!force && cache && Date.now() - (cache.fetchedAt || 0) < STALE) return Promise.resolve(true);
    inflight = fetchFeed(force).finally(() => { inflight = null; });
    return inflight;
  }
  async function fetchFeed(force) {
    loading = true; error = ''; note = '';
    if (list.querySelector('[data-key]')) paintEnd(); else draw();
    try {
      const base = s.feedUrl.replace(/\/+$/, '');
      // The server refreshes on its own schedule; only nudge it when that schedule isn't running
      // (every nudge costs Cloudflare's daily limits).
      if (force && cache && serverHealth(cache.status, app.config.sources.filter((x) => x.feed).length).stalled) {
        await fetch(base + '/refresh', { method: 'POST' }).catch(() => {});
      }
      const r = await fetch(base + '/feed', { cache: 'no-store' });
      if (!r.ok) throw new Error('The feed server answered ' + r.status + '.');
      cache = { ...normalizeFeed(await r.json()), fetchedAt: Date.now() };
      await db.put('kv', 'feed', cache);
      cache = { ...cache, items: retopic(cache.items, app.config.sources) };
      await stamp();
      index();
      await initSeen();
      briefItems = await brief();
    } catch (e) {
      error = e instanceof TypeError ? 'The feed server couldn’t be reached.' : e.message;
    }
    loading = false;
    if (!list.querySelector('.entry, .entry-hidden')) draw();
    else { paintEnd(); paintCounts(); }
    return !error;
  }

  // Pull down at the top: a new order for this tab, with what's new first. Other tabs keep their
  // own order and place until you refresh them.
  async function refreshTop() {
    const ok = await load(true);
    if (!ok && cache) { toast('Couldn’t refresh. ' + error); return; }
    await loadExtras();
    if (pendingSeen.length) await markSeen(pendingSeen.splice(0));
    if (app.topic !== '_list') views()[app.topic] = buildView(app.topic);
    saveViews();
    draw();
    window.scrollTo(0, 0);
    showTabs();
  }

  // Refresh at the end: new posts join below, where you are.
  async function refreshBottom() {
    const ok = await load(true);
    if (!ok && cache) { toast('Couldn’t refresh. ' + error); return; }
    if (app.topic === '_list') { await loadExtras(); drawList(); return; }
    const view = views()[app.topic];
    if (!view) { draw(); return; }
    const inView = new Set(view.keys.filter((k) => k.startsWith('e:')).map((k) => k.slice(2)));
    const added = notShown();
    if (!added.length) { note = 'No new posts · updated just now'; paintEnd(); return; }
    const mark = { type: 'new', at: Date.now() };
    view.keys.push(keyOf(mark), ...added.map((i) => 'e:' + i.id));
    for (const i of added) view.items[i.id] = slim(i);
    view.entries = (view.entries || 0) + added.length;
    saveViews();
    const els = [cardEl(mark), ...added.map((i) => cardEl({ type: 'entry', data: i }))];
    list.querySelector('[data-end]').before(...els);
    els.forEach((el) => { if (el.classList.contains('entry')) watcher.observe(el); });
    paintEnd();
    shorts.scan();
    askLengths();
  }

  // Long-press / right-click menu. After an action only that post is redrawn, so nothing jumps.
  const lookup = (id) => byId.get(id) || posts.find((p) => p.id === id)?.item || views()[app.topic]?.items?.[id] || null;
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
    shorts.scan();
  }
  const detachMenu = enablePostMenu(list, lookup, (kind, it) => refresh(it.id));
  // Swipe left for Reading list / Hide (the Reading list tab only needs the first).
  const detachSwipe = enableSwipe(list, lookup, (kind, it) => refresh(it.id), { canHide: () => app.topic !== '_list' });
  const shorts = enableShorts(list, { autoplay: autoplayOn(s) });
  const detachPull = s.feedUrl ? enablePull(refreshTop) : () => {};

  await initSeen();
  draw();
  app.onShown = restoreAnchor;
  window.addEventListener('scroll', onScroll, { passive: true });
  load(false);

  // Check for new posts now and then while the feed is open, and on coming back to the app. This
  // only reads the feed server (no KV writes); what it finds shows as the "new posts" button.
  const check = () => { if (document.visibilityState === 'visible') load(false); };
  const checker = setInterval(check, STALE);
  document.addEventListener('visibilitychange', check);

  // Only while the server's schedule isn't running (sources missing, nothing saved lately): nudge it
  // every 5 minutes as long as the app is open. What arrives waits for your next refresh.
  const nudge = setInterval(async () => {
    if (!s.feedUrl || loading || document.visibilityState !== 'visible' || !cache) return;
    if (!serverHealth(cache.status, app.config.sources.filter((x) => x.feed).length).stalled) return;
    try {
      const r = await fetch(s.feedUrl.replace(/\/+$/, '') + '/refresh', { method: 'POST' });
      const done = r.ok ? await r.json() : null;
      if (done && Array.isArray(done.refreshed) && done.refreshed.length) load(true);
    } catch { /* offline: try again later */ }
  }, 5 * 60_000);

  return () => {
    clearInterval(nudge);
    clearInterval(checker);
    document.removeEventListener('visibilitychange', check);
    clearTimeout(anchorTimer);
    window.removeEventListener('scroll', onScroll);
    watcher.disconnect();
    detachMenu();
    detachSwipe();
    shorts.detach();
    detachPull();
    clearTimeout(seenTimer);
    if (pendingSeen.length) markSeen(pendingSeen.splice(0));
    clearTimeout(saveTimer);
    db.put('kv', 'feedView', app.feedView);
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
