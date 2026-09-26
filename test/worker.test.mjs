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

test('each run refreshes the longest-waiting source; /feed stitches them', async () => {
  const env = { FEEDS: memKV() };
  const first = await (await worker.fetch(new Request('https://w.test/feed'), env, ctx)).json();
  assert.equal(first.sources.length, 1, 'first visit fills one source');
  await run(env); await run(env);
  assert.deepEqual([...env.FEEDS.m.keys()].sort(), ['src:a', 'src:b', 'src:c']);

  const res = await worker.fetch(new Request('https://w.test/feed'), env, ctx);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://atonioguy.github.io');
  const feed = normalizeFeed(await res.json());
  assert.equal(feed.items.length, 2 + 1 + 1);
  assert.deepEqual(feed.items.filter((i) => i.sourceId === 'c').map((i) => i.title), ['Free issue']);
  assert.equal(feed.status.find((s) => s.id === 'c').hidden, 2);
});

test('a failing source keeps its last good items and reports the error', async () => {
  const env = { FEEDS: memKV() };
  for (let i = 0; i < 3; i++) await run(env);
  broken = true;
  for (let i = 0; i < 3; i++) await run(env);
  broken = false;
  const feed = normalizeFeed(await (await worker.fetch(new Request('https://w.test/feed'), env, ctx)).json());
  const b = feed.status.find((s) => s.id === 'b');
  assert.equal(b.ok, false);
  assert.match(b.error, /503/);
  assert.equal(feed.items.filter((i) => i.sourceId === 'b').length, 1);
});

test('/refresh is rate-limited', async () => {
  const env = { FEEDS: memKV() };
  const a = await (await worker.fetch(new Request('https://w.test/refresh', { method: 'POST' }), env, ctx)).json();
  const b = await (await worker.fetch(new Request('https://w.test/refresh', { method: 'POST' }), env, ctx)).json();
  assert.equal(a.refreshed, 'a');
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
