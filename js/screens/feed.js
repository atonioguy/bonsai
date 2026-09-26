import * as db from '../db.js';
import { mixFeed, composeFeed, dueThrowbacks, afterShown, relTime } from '../logic.js';
import { h, enso } from '../ui.js';
import { currentBook, percent } from '../books.js';

const STALE = 30 * 60_000; // refetch the feed when the cached copy is older than this

export async function render(main, app) {
  const s = app.settings;
  let cache = await db.get('kv', 'feed');          // { updatedAt, fetchedAt, items, status }
  const muted = new Set(s.muted);

  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Topics' });
  const list = h('div', { class: 'feed' });
  main.append(h('h1', { class: 'visually-hidden', text: 'Feed' }), tabs, list);

  const topics = [{ id: 'all', name: 'All' }, ...app.config.topics];
  if (!topics.some((t) => t.id === app.topic)) app.topic = 'all';
  for (const t of topics) {
    const tab = h('button', {
      type: 'button', class: 'tab', 'aria-pressed': String(app.topic === t.id),
      onclick: () => {
        app.topic = t.id;
        tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
        draw();
      },
    }, t.name);
    tabs.appendChild(tab);
  }

  const [book, saved] = await Promise.all([currentBook(), db.all('saved')]);
  const throwbacks = dueThrowbacks(saved, Date.now(), 3);
  let loading = false, error = '';

  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const entry = throwbacks.find((t) => t.id === e.target.dataset.id);
      if (entry) db.put('saved', entry.id, afterShown(entry));
    }
  }, { threshold: 0.6 });

  function draw() {
    seen.disconnect();
    const entries = cache ? mixFeed(cache.items, { topic: app.topic, muted }) : [];
    const all = app.topic === 'all'; // the book card and throwbacks belong to the main mix only
    const cards = composeFeed(entries, { book: all ? book : null, throwbacks: all ? throwbacks : [] });
    list.replaceChildren(...cards.map((c) => (c.type === 'entry' ? entryEl(c.data) : c.type === 'book' ? bookEl(c.data, s) : throwbackEl(c.data))));
    list.querySelectorAll('.throwback').forEach((el) => seen.observe(el));
    list.appendChild(endEl(entries.length));
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
    return h('div', { class: 'feed-end' },
      h('p', { class: 'meta', role: 'status' },
        loading ? 'Updating…' : 'You’re up to date · updated ' + relTime(cache.fetchedAt || cache.updatedAt)),
      h('button', { type: 'button', class: 'btn-text', disabled: loading, onclick: () => load(true) }, 'Refresh'));
  }

  async function load(force) {
    if (!s.feedUrl || loading) return;
    if (!force && cache && Date.now() - (cache.fetchedAt || 0) < STALE) return;
    loading = true; error = ''; draw();
    try {
      const base = s.feedUrl.replace(/\/+$/, '');
      if (force) await fetch(base + '/refresh', { method: 'POST' }).catch(() => {});
      const r = await fetch(base + '/feed', { cache: 'no-store' });
      if (!r.ok) throw new Error('The feed server answered ' + r.status + '.');
      const data = await r.json();
      cache = { ...data, fetchedAt: Date.now() };
      await db.put('kv', 'feed', cache);
    } catch (e) {
      error = e instanceof TypeError ? 'The feed server couldn’t be reached.' : e.message;
    }
    loading = false;
    const atTop = window.scrollY < 200;
    if (atTop || !list.querySelector('.entry')) draw();
    else list.lastChild.replaceWith(endEl(list.querySelectorAll('.entry').length));
  }

  draw();
  if (app.feedScroll) requestAnimationFrame(() => window.scrollTo(0, app.feedScroll));
  load(false);

  return () => {
    app.feedScroll = window.scrollY;
    seen.disconnect();
  };
}

function entryEl(item) {
  const meta = [item.kind === 'audio' ? 'Audio' : null, item.sourceName, relTime(item.published)].filter(Boolean).join(' · ');
  return h('article', { class: 'entry' },
    h('p', { class: 'meta', text: meta }),
    h('h2', { class: 'entry-title' }, h('a', { href: '#/item/' + encodeURIComponent(item.id) }, item.title)),
    item.excerpt && item.excerpt !== item.title ? h('p', { class: 'entry-excerpt', text: item.excerpt }) : null);
}

function bookEl({ meta, f }, s) {
  return h('section', { class: 'book-card', 'aria-label': 'Continue reading' },
    enso(f, 48, { track: 'var(--beige)' }),
    h('div', {},
      h('p', { class: 'meta', text: 'Continue reading' }),
      h('h2', { class: 'book-title', text: meta.title }),
      h('p', { class: 'meta', text: percent(f) + ' read' + (meta.author ? ' · ' + meta.author : '') })),
    h('a', { class: 'btn btn-primary', href: '#/read/' + meta.id }, 'Start ' + s.sessionMinutes + ' min session'));
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
