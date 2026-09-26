import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed, decodeEntities, makeExcerpt, stripTags, hashId } from '../worker/parse.js';

const fx = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const src = (kind = 'essay') => ({ id: 'sample', name: 'Sample', topic: 'mind', kind });

test('RSS (WordPress style): full content, entities, order', () => {
  const items = parseFeed(fx('wordpress.xml'), src());
  assert.equal(items.length, 2);
  const [a, b] = items;
  assert.equal(a.title, 'Sample essay — on archives & memory');
  assert.equal(a.url, 'https://example.org/archives-memory/');
  assert.equal(a.published, '2026-09-22T14:00:00.000Z');
  assert.match(a.html, /First paragraph of the full essay/);
  assert.equal(a.excerpt, 'A short summary of the essay with emphasis.');
  assert.equal(a.image, 'https://example.org/pic.jpg');
  assert.equal(a.topic, 'mind');
  assert.equal(b.excerpt, 'Escaped HTML summary that is fairly plain.');
  assert.equal(b.html, 'Escaped <b>HTML</b> summary that is fairly plain.');
});

test('Atom: alternate link, escaped html title and summary', () => {
  const [e] = parseFeed(fx('atom.xml'), src('research'));
  assert.equal(e.title, 'A sample study title with italics');
  assert.equal(e.url, 'https://journal.example.org/articles/1');
  assert.equal(e.published, '2026-09-24T10:00:00.000Z');
  assert.match(e.excerpt, /^Background: sample abstract text\./);
  assert.equal(e.kind, 'research');
});

test('Podcast: enclosure becomes audio, itunes image', () => {
  const [p] = parseFeed(fx('podcast.xml'), src('audio'));
  assert.equal(p.kind, 'audio');
  assert.equal(p.audioUrl, 'https://cdn.example.org/ep42.mp3');
  assert.equal(p.image, 'https://cdn.example.org/ep42.jpg');
  assert.equal(p.url, '');
  assert.equal(p.published, '2026-09-23T11:00:00.000Z');
});

test('ids are stable and differ per item', () => {
  const a = parseFeed(fx('wordpress.xml'), src());
  const b = parseFeed(fx('wordpress.xml'), src());
  assert.equal(a[0].id, b[0].id);
  assert.notEqual(a[0].id, a[1].id);
  assert.equal(hashId('x'), hashId('x'));
});

test('not a feed → no items', () => {
  assert.deepEqual(parseFeed('<html><body>hi</body></html>', src()), []);
});

test('helpers', () => {
  assert.equal(decodeEntities('&lt;a&gt; &amp;amp; &#x2019; &#8217; &unknown;'), '<a> &amp; ’ ’ &unknown;');
  assert.equal(stripTags('<p>a</p><style>x{}</style><p>b<em>c</em>d&nbsp;e</p>'), 'a bcd e');
  const long = 'word '.repeat(100);
  const ex = makeExcerpt(long, 50);
  assert.ok(ex.length <= 51 && ex.endsWith('…'));
});

test('YouTube channel feed: video id, Shorts, thumbnail, description', () => {
  const [v, s] = parseFeed(fx('youtube.xml'), { id: 'yt', name: 'Sample Channel', topic: 'science', kind: 'video' });
  assert.equal(v.kind, 'video');
  assert.equal(v.videoId, 'abcDEF12345');
  assert.equal(v.short, false);
  assert.equal(v.url, 'https://www.youtube.com/watch?v=abcDEF12345');
  assert.match(v.excerpt, /^Line one of the description\./);
  assert.equal(v.image, 'https://i2.ytimg.com/vi/abcDEF12345/hqdefault.jpg');
  assert.equal(s.videoId, 'shortID_123');
  assert.equal(s.short, true);
});
