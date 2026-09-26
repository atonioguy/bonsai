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
    html: '<p>' + 'Placeholder paragraph for layout testing. '.repeat(12) + '</p><p>' + 'A second placeholder paragraph. '.repeat(10) + '</p>',
    audioUrl: '', image: '',
  });
}
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
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // network failures to outside hosts (fonts, fixture images on example.org) are expected offline;
  // only the app's own files count
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('requestfailed', (r) => { if (r.url().startsWith(BASE)) errors.push('failed: ' + r.url()); });
  await page.route('https://feeds.test/**', (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: FEED, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://sq.test/**', (route) => { focusPosts++; route.fulfill({ json: { id: 'x' }, headers: { 'access-control-allow-origin': '*' } }); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

  const shot = async (name) => {
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${name}@${w}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: join(SHOTS, `${name}-${w}.png`), fullPage: false });
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
  await shot('02-settings');
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

  // 4. feed with data
  await page.goto(BASE + '#/');
  await page.reload();
  await page.waitForSelector('.entry');
  check(await page.$('.book-card'), 'book card shown');
  check(await page.$('.throwback'), 'throwback shown');
  await shot('04-feed');
  await page.evaluate(() => window.scrollTo(0, 900));
  await shot('05-feed-scrolled');
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

  // 6. reader: shorten the session to 3 s for the test
  await dbCall('saveSettings', { sessionMinutes: 0.05 });
  await page.goto(BASE + '#/');
  await page.reload();
  await page.waitForSelector('.book-card a');
  await page.click('.book-card a');
  await page.waitForSelector('.reader-bar');
  check(!(await page.evaluate(() => window.bad)), 'book script did not run');
  check((await page.textContent('.book-text .meta')).startsWith('Chapter One'), 'chapter label from nav');
  await shot('08-reader');
  for (let i = 0; i < 5 && !(await page.$('.complete')); i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(1000); }
  await page.waitForSelector('.complete');
  await page.waitForSelector('.status-ok, .status-warn');
  await shot('09-complete');
  await page.fill('#takeaway', 'My one-line takeaway.');
  await page.click('.complete button[type=submit]');

  // 7. saved
  await page.goto(BASE + '#/saved');
  await page.waitForSelector('.saved-item');
  check((await page.$$('.saved-item')).length === 3, 'three saved entries');
  await shot('10-saved');

  check(errors.length === 0, `console errors @${w}: ${errors.join(' | ')}`);
  await ctx.close();
}

check(focusPosts === 2, `Side Quest focus POSTs: ${focusPosts} (expected 2)`);
await browser.close();
server.close();

if (failures.length) { console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('ok — screenshots in test/shots/');
