// Headless run of the whole app with fixture data. Saves screenshots at 375 and 1280 wide
// to test/shots/ and fails on console errors, horizontal overflow or broken flows.
//   node test/ui.mjs
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { parseFeed } from '../worker/parse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'test', 'shots');
const require = createRequire(import.meta.url);
const pwPath = [join(ROOT, 'node_modules', 'playwright'), join(execSync('npm root -g').toString().trim(), 'playwright')].find(existsSync);
const { chromium } = require(pwPath);

// ---------- fixtures ----------
const fx = (f) => readFileSync(join(ROOT, 'test', 'fixtures', f), 'utf8');
const now = Date.now();
const iso = (hAgo) => new Date(now - hAgo * 3600e3).toISOString();
const items = [
  ...parseFeed(fx('wordpress.xml'), { id: 'sample-essays', name: 'Sample Essays', topic: 'queer-history', kind: 'essay' }),
  ...parseFeed(fx('atom.xml'), { id: 'sample-journal', name: 'Sample Journal', topic: 'mind', kind: 'research' }),
  ...parseFeed(fx('podcast.xml'), { id: 'sample-audio', name: 'Sample Oral Histories', topic: 'queer-history', kind: 'audio' }),
].map((it, i) => ({ ...it, published: iso(2 + i * 5) }));
for (let i = 0; i < 9; i++) {
  items.push({
    id: 'gen' + i, sourceId: 'gen-' + (i % 3), sourceName: ['Sample Magazine', 'Sample Newsletter', 'Sample Research Alert'][i % 3],
    topic: ['tech-society', 'tao', 'mind'][i % 3], kind: 'essay',
    title: `Sample article ${i + 1}: a longer headline to check how titles wrap across lines`,
    url: 'https://example.org/sample/' + i, published: iso(30 + i * 9),
    excerpt: 'This is placeholder summary text for layout testing. It runs long enough to be clamped at three lines on a phone so the feed rhythm can be judged properly.',
    html: ('<p>' + 'Placeholder paragraph for layout testing. '.repeat(12) + '</p>').repeat(12),
    audioUrl: '', image: '',
  });
}
// two PubMed alerts: one open access (full text loads), one not (falls back to the browser)
for (const [id, pmid] of [['pm-open', '39797602'], ['pm-closed', '41000322']]) {
  items.push({ id, sourceId: 'pubmed-alert-adult-adhd', sourceName: 'PubMed alert: adult ADHD', topic: 'mind', kind: 'research',
    title: 'Sample study ' + pmid, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/?utm_source=Other`, published: iso(90),
    excerpt: 'Sample abstract.', html: '<p>' + 'Background: a long sample abstract, as PubMed sends. '.repeat(20) + '</p>', audioUrl: '', image: '' });
}
const JATS = `<?xml version="1.0"?><article xmlns:xlink="http://www.w3.org/1999/xlink"><front/><body>
  <sec><title>Introduction</title><p>${'Sample full-text sentence with <italic>emphasis</italic> and a citation<xref ref-type="bibr" rid="r1">1</xref>. '.repeat(8)}</p></sec>
  <sec><title>Methods</title><p>${'Methods sample sentence. '.repeat(12)}</p><list list-type="order"><list-item><p>First step</p></list-item><list-item><p>Second step</p></list-item></list>
  <fig id="f1"><label>Figure 1</label><caption><p>A sample figure caption.</p></caption><graphic xlink:href="f1.jpg"/></fig></sec></body></article>`;
// news for today's brief (ids match real sources so the good-news flag applies), and a video
for (const [id, sourceId, sourceName] of [['n1', 'bbc-world', 'BBC World'], ['n2', 'npr-news', 'NPR News'], ['n3', 'the-19th', 'The 19th'], ['n4', 'propublica', 'ProPublica'], ['g1', 'reasons-to-be-cheerful', 'Reasons to be Cheerful']]) {
  items.push({ id, sourceId, sourceName, topic: 'news', kind: 'news', title: 'Sample headline from ' + sourceName, url: 'https://example.org/' + id, published: iso(3), excerpt: 'Sample news summary.', html: '<p>Sample news summary.</p>', audioUrl: '', image: '' });
}
items.push({ id: 'v1', sourceId: 'kurzgesagt', sourceName: 'Kurzgesagt', topic: 'science', kind: 'video', videoId: 'abcDEF12345', short: false, title: 'A sample explainer video', url: 'https://www.youtube.com/watch?v=abcDEF12345', published: iso(1.5), excerpt: 'Line one.', html: 'Line one.\nLine two.', audioUrl: '', image: '' });
// two Shorts, and the ADHD paper again from the BPD search (it shows once, with both tags)
for (const [id, vid, h, sourceId, sourceName] of [['s1', 'shortAAAA01', 20, 'veritasium', 'Veritasium'], ['s2', 'shortBBBB02', 26, 'scishow', 'SciShow']]) {
  items.push({ id, sourceId, sourceName, topic: 'science', kind: 'video', videoId: vid, short: true, title: 'A sample Short ' + id, url: 'https://www.youtube.com/shorts/' + vid, published: iso(h), excerpt: '', html: '', audioUrl: '', image: '' });
}
items.push({ ...items.find((i) => i.id === 'pm-open'), id: 'pm-zdup', sourceId: 'pubmed-alert-borderline-personality', sourceName: 'PubMed alert: borderline personality', url: 'https://pubmed.ncbi.nlm.nih.gov/39797602/?utm_source=Other&fc=2' });
// A stand-in for YouTube's player API (the real one can't be reached from tests).
const YT_MOCK = `window.YT = { Player: class {
  constructor(el, o) { this.o = o; this.id = o.videoId; this.muted = true; const f = document.createElement('iframe'); f.title = 'YouTube'; el.replaceWith(f); window.__yt = this;
    setTimeout(() => { o.events.onReady({ target: this }); this.set(1); }, 50); }
  set(s) { this.state = s; this.o.events.onStateChange({ data: s, target: this }); }
  loadVideoById(id) { this.id = id; this.set(1); } playVideo() { this.set(1); } pauseVideo() { this.set(2); } seekTo() {}
  mute() { this.muted = true; } unMute() { this.muted = false; } isMuted() { return this.muted; }
} }; window.onYouTubeIframeAPIReady();`;
const FEED = { updatedAt: iso(1), items, status: [{ id: 'sample-journal', ok: false, error: 'HTTP 404' }] };

// A tiny EPUB built in memory (deflate, like real EPUBs).
function crc32(buf) { return zlib.crc32 ? zlib.crc32(buf) : 0; }
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text, store] of files) {
    const data = Buffer.from(text, 'utf8');
    const comp = store ? data : zlib.deflateRawSync(data);
    const nameB = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(store ? 0 : 8, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(store ? 0 : 8, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameB, comp);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const para = (n) => Array.from({ length: n }, (_, i) => `<p>Sample book paragraph ${i + 1}. This text exists only to test the reader layout, line length and scrolling.</p>`).join('');
const EPUB = zip([
  ['mimetype', 'application/epub+zip', true],
  ['META-INF/container.xml', '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
  ['OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Sample Book</dc:title><dc:creator>Sample Author</dc:creator></metadata>
    <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest>
    <spine><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`],
  ['OEBPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li><a href="text/ch%201.xhtml">Chapter One</a></li><li><a href="text/ch2.xhtml#top">Chapter Two</a></li></ol></nav></body></html>'],
  ['OEBPS/cover.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="c.jpg"/></body></html>'],
  ['OEBPS/text/ch 1.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>I</h1>${para(30)}<script>window.bad=1</script></body></html>`],
  ['OEBPS/text/ch2.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>II</h1>${para(20)}</body></html>`],
]);

// ---------- server ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const BASE = 'http://localhost:' + server.address().port + '/';

// ---------- run ----------
await mkdir(SHOTS, { recursive: true });
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
let focusPosts = 0;

for (const [w, hgt] of [[375, 812], [1280, 860]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // network failures to outside hosts (fonts, fixture images on example.org) are expected offline;
  // only the app's own files count
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(BASE)) errors.push('failed: ' + r.url()); });
  await page.route('https://feeds.test/**', (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { ok: true } });
    const v = new URL(route.request().url()).searchParams.get('v');
    if (v) return route.fulfill({ json: { v, seconds: v === 'abcDEF12345' ? 754 : 0 }, headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ json: FEED, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://www.youtube.com/iframe_api', (route) => route.fulfill({ contentType: 'text/javascript', body: YT_MOCK }));
  await page.route('https://sq.test/**', (route) => { focusPosts++; route.fulfill({ json: { id: 'x' }, headers: { 'access-control-allow-origin': '*' } }); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.route('https://www.ebi.ac.uk/**', (route) => {
    const u = decodeURIComponent(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (u.includes('/search?')) return route.fulfill({ headers, json: { resultList: { result: u.includes('39797602') ? [{ pmid: '39797602', pmcid: 'PMC1111111' }] : [{ pmid: '41000322' }] } } });
    if (u.includes('PMC1111111/fullTextXML')) return route.fulfill({ headers, contentType: 'application/xml', body: JATS });
    return route.fulfill({ headers, status: 404, body: 'not found' });
  });

  const shot = async (name) => {
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${name}@${w}: horizontal overflow ${overflow}px`);
    const stray = await page.evaluate(() => (document.body.innerText.match(/\b(null|undefined|NaN)\b/) || [])[0]);
    check(!stray, `${name}@${w}: stray "${stray}" on screen`);
    await page.screenshot({ path: join(SHOTS, `${name}-${w}.png`), fullPage: Boolean(process.env.REVIEW) });
  };
  const dbCall = (fn, ...args) => page.evaluate(async ([fn, args]) => { const db = await import('/js/db.js'); return db[fn](...args); }, [fn, args]);

  // 1. empty feed
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  check((await page.textContent('.empty h2')) === 'Feed server not set', 'empty state text');
  await shot('01-feed-empty');

  // 2. settings
  await page.goto(BASE + '#/settings');
  await page.fill('#feed-url', 'https://feeds.test/');
  await page.fill('#sq-url', 'https://sq.test');
  await page.fill('#sq-key', 'k');
  check(await page.isChecked('#autoplay-shorts'), 'Shorts autoplay by default');
  await shot('02-settings');
  check(!(await page.textContent('main')).includes('null'), 'no stray "null" in Settings');
  await page.click('button[type=submit]');
  await page.waitForTimeout(200);
  const saved = await dbCall('settings');
  check(saved.feedUrl === 'https://feeds.test', 'settings saved (trailing slash trimmed)');

  // 3. library: add a book
  await page.goto(BASE + '#/library');
  await page.setInputFiles('#add-book', { name: 'sample.epub', mimeType: 'application/epub+zip', buffer: EPUB });
  await page.waitForSelector('.row-title');
  check((await page.textContent('.row-title')) === 'Sample Book', 'epub title parsed');
  await shot('03-library');

  // a quote saved long ago so a throwback is due
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const { newSaved } = await import('/js/logic.js');
    const e = newSaved({ kind: 'quote', text: 'A saved line from an earlier read, shown again as a throwback.', topic: 'mind', sourceName: 'Sample Journal', sourceTitle: 'A sample study' }, Date.now() - 21 * 864e5);
    await db.put('saved', e.id, e);
  });

  // 4. feed with data (one navigation: a visible throwback is marked seen, so a second load wouldn't show it)
  await page.goto(BASE + '#/');
  await page.waitForSelector('.entry');
  check(await page.$('.book-card'), 'book card shown');
  check(await page.$('.throwback'), 'throwback shown');
  await shot('04-feed');
  check(await page.$('.brief .brief-link'), "today's brief shown");
  check((await page.$$('.brief-link')).length === 5, 'brief has five stories');
  check((await page.textContent('.brief')).includes('Good news'), 'brief includes good news');
  check(!(await page.$('.entry[data-id="n1"]')), 'news stays out of the main feed');
  check(await page.$('.entry[data-id="v1"] .thumb img'), 'video shows a thumbnail');
  check(await page.waitForSelector('.entry[data-id="v1"] .thumb-time', { timeout: 5000 }).then((e) => e.textContent()).catch(() => '') === '12:34', 'video shows its length (asked from the feed server)');
  check(!(await page.$('.entry[data-id="pm-zdup"]')), 'the same paper from two searches shows once');
  const tagsOf = (id) => page.$$eval(`.entry[data-id="${id}"] .tags li`, (lis) => lis.map((l) => l.textContent));
  check((await tagsOf('pm-open')).join() === 'ADHD,BPD,Article', 'merged post has both searches\' tags + Article (' + (await tagsOf('pm-open')) + ')');
  check((await tagsOf('v1')).join() === 'Science,Video', 'video tags');

  // Shorts play in the feed, muted; turning the sound on keeps it on for the next Short
  const yt = (expr) => page.evaluate((e) => { const p = window.__yt; return p ? Function('p', 'return ' + e)(p) : null; }, expr);
  const center = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await center('.entry[data-id="s1"] .short-slot');
  await page.waitForSelector('.short-layer:not([hidden])');
  await page.waitForFunction(() => window.__yt && window.__yt.id === 'shortAAAA01');
  check(await yt('p.muted'), 'a Short starts muted');
  await shot('04e-short-playing');
  await page.click('.short-sound');
  check((await yt('p.muted')) === false, 'sound on');
  await center('.entry[data-id="s2"] .short-slot');
  await page.waitForFunction(() => window.__yt.id === 'shortBBBB02');
  check((await yt('p.muted')) === false, 'the next Short keeps the sound on');
  check((await page.getAttribute('.short-sound', 'aria-pressed')) === 'true', 'sound button shows on');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForSelector('.short-layer[hidden]', { state: 'attached' });
  await page.click('.tab[data-topic="news"]');
  check(await page.$('.entry[data-id="n1"]'), 'News tab lists news');
  await page.click('.tab[data-topic="all"]');
  await page.goto(BASE + '#/item/v1');
  await page.waitForSelector('.player iframe');
  check((await page.textContent('.article-head .meta')).includes('12:34'), 'video length in the article');
  check((await page.getAttribute('.player iframe', 'src')).startsWith('https://www.youtube-nocookie.com/embed/abcDEF12345'), 'video plays in the app');
  await shot('06h-video');
  await page.goto(BASE + '#/');
  await page.waitForSelector('.brief');

  // long-press / right-click menu: preview + actions
  await page.click('.entry[data-id="gen1"]', { button: 'right' });
  await page.waitForSelector('dialog.peek[open]');
  check((await page.textContent('dialog.peek .peek-title')).startsWith('Sample article 2'), 'preview shows the post');
  await shot('04b-peek');
  await page.click('dialog.peek button:has-text("Add to reading list")');
  await page.waitForFunction(async () => { const db = await import('/js/db.js'); return Boolean((await db.get('posts', 'gen1'))?.list); });
  await page.click('.entry[data-id="gen1"]', { button: 'right' });
  await page.click('dialog.peek button:has-text("Hide post")');
  await page.waitForSelector('.entry-hidden[data-id="gen1"]');
  await shot('04c-hidden');
  await page.click('.entry-hidden[data-id="gen1"] button:has-text("Show")');
  await page.waitForSelector('.entry[data-id="gen1"]');
  // touch: hold still for half a second
  await page.evaluate(() => {
    const el = document.querySelector('.entry[data-id="gen2"] .entry-title');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.x + 10, clientY: r.y + 10 }));
  });
  await page.waitForSelector('dialog.peek[open]', { timeout: 2000 });
  await page.click('dialog.peek button:has-text("Mark as read")');
  await page.waitForSelector('.entry.is-read[data-id="gen2"]');
  await page.click('.entry[data-id="gen2"]', { button: 'right' });
  await page.click('dialog.peek button:has-text("Mark as unread")');
  await page.waitForSelector('.entry[data-id="gen2"]:not(.is-read)');

  // swipe left (touch): Reading list and Hide buttons slide in on the right
  const swipe = (id, dist) => page.evaluate(([id, dist]) => {
    const el = document.querySelector(`.entry[data-id="${id}"] .entry-title`);
    const r = el.getBoundingClientRect();
    const x = r.x + r.width - 20, y = r.y + 10;
    const ev = (type, cx) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: cx, clientY: y }));
    ev('pointerdown', x);
    for (let i = 1; i <= 8; i++) ev('pointermove', x - (dist * i) / 8);
    ev('pointerup', x - dist);
  }, [id, dist]);
  await swipe('gen2', 20); // too short: springs back
  await page.waitForFunction(() => !document.querySelector('.entry[data-id="gen2"] .swipe-actions'));
  await swipe('gen2', 120);
  await page.waitForTimeout(300);
  const bar = await page.$eval('.entry[data-id="gen2"] .swipe-actions', (b) => b.getBoundingClientRect().width);
  check(bar > 132 && bar < 140, 'swipe opens both buttons (' + bar + 'px)');
  check(!(await page.evaluate(() => String(getSelection()))), 'no text selected by a swipe');
  await shot('04d-swipe');
  await page.evaluate(() => document.querySelector('.tabs').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 8 })));
  await page.waitForFunction(() => !document.querySelector('.entry[data-id="gen2"] .swipe-actions'));
  await swipe('gen2', 120);
  await page.click('.entry[data-id="gen2"] .swipe-later');
  await page.waitForFunction(async () => { const db = await import('/js/db.js'); return Boolean((await db.get('posts', 'gen2'))?.list); });
  await swipe('gen2', 120);
  check((await page.getAttribute('.entry[data-id="gen2"] .swipe-later', 'aria-label')) === 'Remove from reading list', 'swipe knows the post is listed');
  await page.click('.entry[data-id="gen2"] .swipe-hide');
  await page.waitForSelector('.entry-hidden[data-id="gen2"]');
  await page.click('.entry-hidden[data-id="gen2"] button:has-text("Show")');
  await page.waitForSelector('.entry[data-id="gen2"]:not(.swiping)');

  // the Reading list as a feed of its own
  await page.click('.tab[data-topic="_list"]');
  await page.waitForSelector('.entry[data-id="gen1"]');
  check((await page.textContent('.entry[data-id="gen1"] .meta')).includes('Not started'), 'reading list tab shows progress');
  await page.click('.tab[data-topic="all"]');

  // jump button: to the bottom, then back to top; drag it to the other side
  await page.waitForSelector('.jump:not([hidden])');
  await page.click('.jump');
  await page.waitForFunction(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 5);
  await page.waitForSelector('.jump[aria-label="Back to top"]');
  await page.click('.jump');
  await page.waitForFunction(() => scrollY < 5);
  const jb = await page.$eval('.jump', (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(jb.x, jb.y);
  await page.mouse.down();
  await page.mouse.move(40, jb.y - 120, { steps: 6 });
  await page.mouse.up();
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('bonsai-jump')).side)) === 'left', 'jump button moves and remembers');
  await page.waitForTimeout(300);
  await shot('04d-jump-moved');
  check((await page.evaluate(() => scrollY)) < 5, 'dragging the jump button does not jump');
  await page.evaluate(() => window.scrollTo(0, 900));
  await shot('05-feed-scrolled');

  // your place in the feed is kept: after another screen, and after the app restarts
  const topPost = () => page.evaluate(() => {
    const edge = document.querySelector('.topbar').getBoundingClientRect().bottom;
    const el = [...document.querySelectorAll('.feed > [data-key]')].find((e) => e.getBoundingClientRect().bottom > edge + 1);
    return { key: el.dataset.key, y: Math.round(el.getBoundingClientRect().top) };
  });
  await page.waitForTimeout(400);
  const placeBefore = await topPost();
  await page.goto(BASE + '#/library');
  await page.waitForSelector('.row-title');
  await page.goto(BASE + '#/');
  await page.waitForSelector('.entry');
  const placeBack = await topPost();
  check(placeBack.key === placeBefore.key && Math.abs(placeBack.y - placeBefore.y) < 3, `feed place kept after another screen (${JSON.stringify(placeBefore)} → ${JSON.stringify(placeBack)})`);
  await page.reload();
  await page.waitForSelector('.entry');
  await page.waitForTimeout(300);
  const placeReload = await topPost();
  check(placeReload.key === placeBefore.key && Math.abs(placeReload.y - placeBefore.y) < 3, `feed place kept after a restart (${JSON.stringify(placeBefore)} → ${JSON.stringify(placeReload)})`);
  check(await page.getAttribute('.short-sound', 'aria-pressed').catch(() => null) !== 'true', 'sound is off again after a restart');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('.tab:has-text("Mind")');
  check(!(await page.$('.book-card')), 'topic filter hides book card');
  await page.click('.tab:has-text("All")');

  // 5. article
  await page.click('.entry-title a');
  await page.waitForSelector('.article-title');
  check(!(await page.$('.prose script')), 'script stripped from article');
  await shot('06-article');
  // select a sentence → Save quote
  await page.evaluate(() => {
    const p = document.querySelector('.prose p');
    const r = document.createRange(); r.selectNodeContents(p);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.waitForSelector('.selbar.show');
  await shot('07-article-selection');
  await page.click('.selbar button');
  await page.waitForSelector('.toast.show');

  // 5b. article tools: text size, share, reading list, bookmark + folder, reaction, note
  await page.goto(BASE + '#/item/gen0');
  await page.waitForSelector('.article-bar');
  await page.click('[aria-label="Text and theme"]');
  await page.click('[aria-label="Larger text"]');
  await page.click('[aria-label="Larger text"]');
  check((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--read-scale').trim())) === '1.25', 'text size grows');
  await shot('06b-article-tools');
  await page.keyboard.press('Escape');
  await page.click('[aria-label="Smaller text"]').catch(() => {});
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
  await page.click('[aria-label="Share"]');
  await page.waitForSelector('.toast.show:has-text("Link copied")');
  check((await page.evaluate(() => navigator.clipboard.readText())) === 'https://example.org/sample/0', 'share copies the link');
  await page.click('[aria-label="Add to reading list"]');
  check(await page.waitForSelector('[aria-label="Remove from reading list"][aria-pressed="true"]', { timeout: 3000 }).catch(() => null), 'added to reading list');
  await page.click('[aria-label="Bookmark"]');
  await page.click('.toast button:has-text("Add to folder")');
  await page.waitForSelector('dialog.sheet[open]');
  await page.fill('#new-folder', 'Psych reads');
  await page.click('dialog.sheet button:has-text("Add")');
  await page.waitForSelector('dialog.sheet input[type=checkbox]:checked');
  await shot('06c-bookmark-sheet');
  await page.click('dialog.sheet button:has-text("Done")');
  await page.click('.reaction:has-text("Made me think")');
  check(await page.waitForSelector('.reaction[aria-pressed="true"]:has-text("Made me think")', { timeout: 3000 }).catch(() => null), 'reaction set');
  await page.fill('#note', 'Compare with the ADHD review.');
  await page.click('.note-form button[type=submit]');
  check(await page.waitForSelector('.note', { timeout: 3000 }).catch(() => null), 'note posted');
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(900);
  await shot('06d-article-end');

  // full text: loads for an open-access paper; otherwise offers the browser
  await page.goto(BASE + '#/item/pm-open');
  await page.waitForSelector('.article-title:has-text("Sample study 39797602")');
  check((await page.$$eval('.article-head .tags li', (lis) => lis.map((l) => l.textContent))).join() === 'ADHD,BPD,Article', 'tags at the top of an opened post');
  await page.click('button:has-text("Load full article")');
  await page.waitForSelector('.fulltext h2:has-text("Full text")');
  check((await page.textContent('.fulltext')).includes('Methods sample sentence'), 'full text loaded');
  check(await page.$('.fulltext ol li'), 'full text keeps lists');
  check(await page.$('.fulltext sup'), 'citations as superscripts');
  await shot('06f-fulltext');
  await page.goto(BASE + '#/item/pm-closed');
  await page.click('button:has-text("Load full article")');
  await page.waitForSelector('.fail-block');
  check(await page.$('.fail-block a:has-text("Open in browser")'), 'fallback offers the browser');
  await shot('06g-fulltext-fail');
  await page.goto(BASE + '#/item/pm-open');
  await page.waitForSelector('.fulltext h2');
  check(!(await page.$('button:has-text("Load full article")')), 'full text kept for next time');

  // your place is kept: leave and come back
  const before = await page.evaluate(() => location.hash);
  await page.click('[aria-label="Back"]');
  await page.waitForFunction((h) => location.hash !== h, before);
  check((await page.evaluate(() => location.hash)).startsWith('#/item/'), 'Back returns to the previous screen');
  await page.goto(BASE + '#/');
  await page.waitForSelector('.entry');
  await page.goto(BASE + '#/item/gen0');
  await page.waitForSelector('.article-title');
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.scrollY)) > 600, 'scroll position restored');

  // Recent drawer
  await page.click('[aria-label="Recently opened"]');
  await page.waitForSelector('dialog.drawer[open]');
  check((await page.$$('.drawer-row')).length >= 2, 'recent lists opened posts');
  await shot('06e-recent');
  await page.keyboard.press('Escape');

  // feed: opened posts marked; new posts only come in when you refresh
  await page.goto(BASE + '#/');
  await page.waitForSelector('.entry');
  check(await page.$('.entry.is-read'), 'opened post marked read');
  for (let i = 0; i < 3; i++) {
    FEED.items.push({ ...FEED.items.find((x) => x.id === 'gen8'), id: `new${w}-${i}`, sourceId: 'gen-0', topic: 'mind', title: 'New sample ' + i, url: `https://example.org/new/${w}/${i}`, published: new Date().toISOString() });
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const firstBefore = await page.textContent('.entry-title');
  await page.click('.feed-end button:has-text("Refresh")');
  await page.waitForSelector('.earlier:has-text("New")');
  const afterNew = await page.$$eval('.feed > *', (els) => { const i = els.findIndex((e) => e.textContent === 'New'); return els.slice(i + 1).filter((e) => e.classList.contains('entry')).map((e) => e.querySelector('.entry-title').textContent); });
  check(afterNew.length === 3 && afterNew.every((t) => t.startsWith('New sample')), 'Refresh at the end adds the new posts below (' + afterNew + ')');
  check((await page.textContent('.entry-title')) === firstBefore, 'the top of the feed stays as it was');
  check((await page.evaluate(() => scrollY)) > 400, 'Refresh at the end doesn’t jump to the top');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('05b-refresh-end');
  await page.click('.feed-end button:has-text("Refresh")');
  await page.waitForSelector('.feed-end .meta:has-text("No new posts")');
  // pull down at the top: a new order, with the newest first
  FEED.items.push({ ...FEED.items.find((x) => x.id === 'gen8'), id: `pulled${w}`, sourceId: 'gen-1', topic: 'tao', title: 'Pulled sample ' + w, url: `https://example.org/pulled/${w}`, published: new Date().toISOString() });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => {
    const t = (y) => new Touch({ identifier: 1, target: document.body, clientX: 150, clientY: y });
    const fire = (type, y) => document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t(y)], changedTouches: [t(y)] }));
    fire('touchstart', 150);
    for (let i = 1; i <= 10; i++) fire('touchmove', 150 + i * 20);
    fire('touchend', 350);
  });
  await page.waitForFunction((w) => document.querySelector('.entry-title')?.textContent === 'Pulled sample ' + w, w);
  check(await page.$('.earlier:has-text("Earlier")'), 'posts already seen go below "Earlier"');
  await page.waitForTimeout(500);
  await shot('05c-pulled');

  // reading list item comes back into the feed when due, and leaves only when you say so
  await page.evaluate(async () => {
    const db = await import('/js/db.js');
    const p = await db.get('posts', 'gen0');
    p.list.dueAt = Date.now() - 1000;
    await db.put('posts', 'gen0', p);
  });
  await page.goto(BASE + '#/collections');
  await dbCall('del', 'kv', 'feedView'); // it comes back with the next refresh (here: a restart without a saved order)
  await page.reload();
  await page.goto(BASE + '#/');
  await page.waitForSelector('.listed');
  await page.goto(BASE + '#/collections/list');
  await page.waitForSelector('.feed .entry');
  await shot('10b-reading-list');
  await page.goto(BASE + '#/collections/bookmarks');
  await page.waitForSelector('.folder-row:has-text("Psych reads")');
  check((await page.textContent('.folder-row:has-text("Psych reads") .meta')) === '1', 'folder count');
  await shot('10c-bookmarks');
  await page.click('.folder-row:has-text("Psych reads")');
  await page.waitForSelector('.feed .entry');
  await shot('10d-folder');
  await page.goto(BASE + '#/item/gen0');
  await page.click('button:has-text("Done, remove it")');
  await page.waitForTimeout(200);
  check(!(await dbCall('get', 'posts', 'gen0')).list, 'removed from reading list at the end');

  // 6. book card: pick a length, then a timed session (3 s via the route, for the test)
  await page.goto(BASE + '#/');
  await page.waitForSelector('.book-card .segmented');
  await page.click('.segmented button:has-text("25 min")');
  check((await page.textContent('.book-card .btn-primary')) === 'Start 25 min', 'length choice updates Start');
  const startHref = await page.getAttribute('.book-card .btn-primary', 'href');
  check(startHref.endsWith('/25'), 'Start links to a 25 min session');
  check((await dbCall('settings')).sessionMinutes === 25, 'length choice remembered');
  await shot('07b-book-card');
  const bookHash = startHref.replace(/\/25$/, '');

  // free read: Done right away → recorded locally only, nothing sent to Side Quest
  await page.goto(BASE + bookHash + '/free');
  await page.waitForSelector('.reader-bar');
  check(await page.$('.reader-bar button:has-text("Done")'), 'free read has Done');
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(1500);
  await page.click('.reader-bar button:has-text("Done")');
  await page.waitForSelector('.complete');
  check((await page.textContent('#done-title')) === 'Under 1 min read', 'free read summary');

  await page.goto(BASE + bookHash + '/0.05');
  await page.waitForSelector('.reader-bar');
  check(!(await page.evaluate(() => window.bad)), 'book script did not run');
  check((await page.textContent('.book-text .meta')).startsWith('Chapter One'), 'chapter label from nav');
  await shot('08-reader');
  for (let i = 0; i < 5 && !(await page.$('.complete')); i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(1000); }
  await page.waitForSelector('.complete');
  await page.waitForSelector('.status-ok, .status-warn');
  check((await page.textContent('#done-title')) === 'Session complete', 'timed session completes');
  await shot('09-complete');
  await page.fill('#takeaway', 'My one-line takeaway.');
  await page.click('.complete button[type=submit]');

  // 7. saved quotes
  await page.goto(BASE + '#/collections/quotes');
  await page.waitForSelector('.saved-item');
  check((await page.$$('.saved-item')).length === 3, 'three saved entries');
  await shot('10-saved');

  // bonsai tab: grows with activity
  await page.goto(BASE + '#/bonsai');
  await page.waitForSelector('svg.bonsai');
  check((await page.textContent('.stage-name')) !== 'Seed', 'bonsai has grown past a seed');
  await shot('17-bonsai');

  // Shorts with autoplay off: nothing plays until you tap one
  await page.goto(BASE + '#/settings');
  await page.click('label[for="autoplay-shorts"]');
  await page.waitForFunction(async () => { const db = await import('/js/db.js'); return (await db.settings()).autoplayShorts === false; });
  await page.goto(BASE + '#/');
  await page.waitForSelector('.entry[data-id="s1"]');
  await center('.entry[data-id="s1"] .short-slot');
  await page.waitForTimeout(600);
  check(await page.$('.short-layer[hidden]') || !(await page.$('.short-layer')), 'no autoplay when it’s off');
  await page.click('.entry[data-id="s1"] .short-play');
  await page.waitForSelector('.short-layer:not([hidden])');
  await page.waitForFunction(() => window.__yt && window.__yt.id === 'shortAAAA01');
  check(await yt('p.muted'), 'a tapped Short starts muted after a restart');
  await shot('04f-short-tapped');
  await page.evaluate(() => window.scrollTo(0, 0));

  // 8. dark theme (Settings → Appearance)
  await page.goto(BASE + '#/settings');
  await page.selectOption('#theme', 'dark');
  check((await page.getAttribute('html', 'data-theme')) === 'dark', 'theme switches to dark');
  await shot('11-dark-settings');
  await page.goto(BASE + '#/');
  await page.reload();
  await page.waitForSelector('.entry');
  check((await page.getAttribute('html', 'data-theme')) === 'dark', 'dark theme survives reload');
  await shot('12-dark-feed');
  await page.click('.entry-title a');
  await page.waitForSelector('.article-title');
  await shot('13-dark-article');
  await page.goto(BASE + '#/collections/quotes');
  await page.waitForSelector('.saved-item');
  await shot('14-dark-saved');
  await page.goto(BASE + '#/item/gen0');
  await page.waitForSelector('.article-bar');
  await shot('16-dark-article-tools');
  await page.goto(BASE + '#/bonsai');
  await page.waitForSelector('svg.bonsai');
  await shot('18-dark-bonsai');
  await page.goto(BASE + '#/library');
  await page.waitForSelector('.row-title');
  await shot('15-dark-library');
  check((await page.textContent('main')).includes('Trigger events'), 'Library explains a stalled feed server');
  await page.evaluate(() => localStorage.setItem('bonsai-theme', 'system'));

  check(errors.length === 0, `console errors @${w}: ${errors.join(' | ')}`);
  await ctx.close();
}

check(focusPosts === 2, `Side Quest focus POSTs: ${focusPosts} (expected 2)`);
await browser.close();
server.close();

if (failures.length) { console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('ok — screenshots in test/shots/');
