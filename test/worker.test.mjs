import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/worker.js';
import { isLocked } from '../worker/parse.js';
import { bundle } from '../worker/build.mjs';
import { normalizeFeed } from '../js/logic.js';

const fx = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

// In-memory stand-in for a Workers KV namespace.
function memKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k).value : null; },
    async getWithMetadata(k) { return m.has(k) ? { ...m.get(k) } : { value: null, metadata: null }; },
    async put(k, value, opts = {}) { m.set(k, { value, metadata: opts.metadata ?? null }); },
    async list({ prefix }) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })) }; },
  };
}

const SOURCES = {
  topics: [],
  sources: [
    { id: 'a', name: 'A', topic: 'mind', kind: 'essay', feed: 'https://a.test/feed' },
    { id: 'b', name: 'B', topic: 'tao', kind: 'audio', feed: 'https://b.test/feed' },
    { id: 'c', name: 'C', topic: 'tao', kind: 'essay', feed: 'https://c.test/feed', hideLocked: true },
    { id: 'none', name: 'No feed', topic: 'tao', feed: null },
  ],
};
const LOCKED_FEED = `<rss><channel>
<item><title>Free issue</title><link>https://c.test/1</link><content:encoded><![CDATA[<p>${'Free words. '.repeat(50)}</p><p>Subscribe to our premium tier for extra issues.</p>]]></content:encoded></item>
<item><title>Paid issue</title><link>https://c.test/2</link><content:encoded><![CDATA[<p>Teaser.</p><p>This post is for paid subscribers.</p>]]></content:encoded></item>
<item><title>Another paid issue</title><link>https://c.test/3</link><content:encoded><![CDATA[<p>Teaser.</p><p>Subscribe to Premium to read the rest.</p>]]></content:encoded></item>
</channel></rss>`;

let broken = false;
globalThis.fetch = async (url) => {
  const u = String(url);
  const body = u.endsWith('sources.json') ? JSON.stringify(SOURCES)
    : u.startsWith('https://a.test') ? fx('wordpress.xml')
    : u.startsWith('https://b.test') ? (broken ? null : fx('podcast.xml'))
    : u.startsWith('https://c.test') ? LOCKED_FEED : null;
  return body === null ? new Response('nope', { status: 503 }) : new Response(body);
};

const ctx = { waitUntil: (p) => p };
const run = async (env) => { await worker.scheduled({}, env, { waitUntil: (p) => (run.p = p) }); await run.p; };

// Make every stored source look older than the 2 h refresh age.
async function age(env, ms = 3 * 3600e3) {
  for (const [k, v] of env.FEEDS.m) if (k.startsWith('src:')) v.metadata = { ...v.metadata, fetchedAt: v.metadata.fetchedAt - ms };
}

test('first visit fills every due source at once; /feed stitches them', async () => {
  const env = { FEEDS: memKV() };
  const first = await (await worker.fetch(new Request('https://w.test/feed'), env, ctx)).json();
  assert.equal(first.sources.length, 3, 'all three fetched on the first visit');
  assert.deepEqual([...env.FEEDS.m.keys()].filter((k) => k.startsWith('src:')).sort(), ['src:a', 'src:b', 'src:c']);

  const res = await worker.fetch(new Request('https://w.test/feed'), env, ctx);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://atonioguy.github.io');
  const feed = normalizeFeed(await res.json());
  assert.equal(feed.items.length, 2 + 1 + 1);
  assert.deepEqual(feed.items.filter((i) => i.sourceId === 'c').map((i) => i.title), ['Free issue']);
  assert.equal(feed.status.find((s) => s.id === 'c').hidden, 2);
});

test('scheduled runs only refresh what is due (no wasted KV writes)', async () => {
  const env = { FEEDS: memKV() };
  await run(env);
  const before = env.FEEDS.m.get('src:a').metadata.fetchedAt;
  await run(env); // nothing is 2 h old yet
  assert.equal(env.FEEDS.m.get('src:a').metadata.fetchedAt, before);
  await age(env);
  await run(env);
  assert.ok(env.FEEDS.m.get('src:a').metadata.fetchedAt > before, 'refreshed once due');
});

test('a failing source keeps its last good items and reports the error', async () => {
  const env = { FEEDS: memKV() };
  await run(env);
  broken = true;
  await age(env);
  await run(env);
  broken = false;
  const feed = normalizeFeed(await (await worker.fetch(new Request('https://w.test/feed'), env, ctx)).json());
  const b = feed.status.find((s) => s.id === 'b');
  assert.equal(b.ok, false);
  assert.match(b.error, /503/);
  assert.equal(feed.items.filter((i) => i.sourceId === 'b').length, 1);
});

test('/health reports how many sources are loaded and overdue', async () => {
  const env = { FEEDS: memKV() };
  let h = await (await worker.fetch(new Request('https://w.test/health'), env, ctx)).json();
  assert.deepEqual([h.sources, h.loaded, h.overdue], [3, 0, 3]);
  await run(env);
  h = await (await worker.fetch(new Request('https://w.test/health'), env, ctx)).json();
  assert.deepEqual([h.loaded, h.overdue], [3, 0]);
  assert.ok(h.newest);
});

test('/refresh is rate-limited', async () => {
  const env = { FEEDS: memKV() };
  const a = await (await worker.fetch(new Request('https://w.test/refresh', { method: 'POST' }), env, ctx)).json();
  const b = await (await worker.fetch(new Request('https://w.test/refresh', { method: 'POST' }), env, ctx)).json();
  assert.deepEqual(a.refreshed, ['a', 'b', 'c']);
  assert.equal(b.skipped, true);
});

test('isLocked: paywall notices yes, premium plugs in free posts no', () => {
  const t = (html) => isLocked({ title: 'x', excerpt: '', html });
  assert.equal(t('<p>Teaser</p><p>This post is for paid subscribers</p>'), true);
  assert.equal(t('<p>Teaser</p><p>Subscribe to Premium to read the rest.</p>'), true);
  assert.equal(t('<p>Want to keep reading? Upgrade.</p>'), true);
  assert.equal(t('<p>Premium subscribers only</p>'), true);
  assert.equal(t('<p>Long free post.</p><p>Subscribe to our premium tier for bonus issues.</p>'), false);
  assert.equal(t('<p>Upgrade to paid to support the newsletter.</p>'), false);
});

test('bonsai-feeds.js (the paste-in file) is up to date', () => {
  assert.equal(readFileSync(new URL('../worker/bonsai-feeds.js', import.meta.url), 'utf8'), bundle(),
    'run: node worker/build.mjs');
});

test('/epmc relays only Europe PMC search and full-text paths', async () => {
  const env = { FEEDS: memKV() };
  const bad = await worker.fetch(new Request('https://w.test/epmc?path=' + encodeURIComponent('../../evil')), env, ctx);
  assert.equal(bad.status, 400);
  const saved = globalThis.fetch;
  globalThis.fetch = async (u) => new Response('<article/>', { status: String(u).includes('europepmc') ? 200 : 500 });
  const ok = await worker.fetch(new Request('https://w.test/epmc?path=PMC123456%2FfullTextXML'), env, ctx);
  globalThis.fetch = saved;
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '<article/>');
});

test('youtube:@handle is resolved once to the channel feed', async () => {
  const env = { FEEDS: memKV() };
  const saved = globalThis.fetch;
  const calls = [];
  const yt = readFileSync(new URL('./fixtures/youtube.xml', import.meta.url), 'utf8');
  globalThis.fetch = async (u) => {
    u = String(u); calls.push(u);
    if (u.endsWith('sources.json')) return new Response(JSON.stringify({ sources: [{ id: 'k', name: 'K', topic: 'science', kind: 'video', feed: 'youtube:@kurz' }] }));
    if (u === 'https://www.youtube.com/@kurz') return new Response('<html><link rel="canonical" href="https://www.youtube.com/channel/UCsXVk37bltHxD1rDPwtNM8Q"></html>');
    if (u.includes('videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q')) return new Response(yt);
    return new Response('no', { status: 404 });
  };
  await run(env);
  await env.FEEDS.put('src:k', '[]', { metadata: { fetchedAt: 0 } });
  await run(env);
  globalThis.fetch = saved;
  assert.equal(calls.filter((u) => u === 'https://www.youtube.com/@kurz').length, 1, 'channel page fetched once');
  assert.equal(await env.FEEDS.get('yt:@kurz'), 'UCsXVk37bltHxD1rDPwtNM8Q');
  const items = JSON.parse((await env.FEEDS.get('src:k')));
  assert.equal(items[0].videoId, 'abcDEF12345');
});

test('a run stops at its byte budget; the rest wait for the next run', async () => {
  const env = { FEEDS: memKV() };
  const saved = globalThis.fetch;
  const big = '<rss><channel>' + '<item><title>t</title><link>https://x/1</link><description>' + 'x'.repeat(120000) + '</description></item>' + '</channel></rss>';
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u.endsWith('sources.json')) return new Response(JSON.stringify({ sources: ['p', 'q', 'r', 's'].map((id) => ({ id, name: id, topic: 't', feed: 'https://' + id + '.test/' })) }));
    return new Response(big);
  };
  await run(env);
  const after1 = [...env.FEEDS.m.keys()].filter((k) => k.startsWith('src:')).length;
  await run(env);
  const after2 = [...env.FEEDS.m.keys()].filter((k) => k.startsWith('src:')).length;
  globalThis.fetch = saved;
  assert.equal(after1, 3, '3 x ~120 KB crosses the 300 KB budget');
  assert.equal(after2, 4);
});
