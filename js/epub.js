// EPUB → { title, author, chapters: [{ title, html }] }.
// An EPUB is a zip; this reads it with the browser's own DecompressionStream (no library).

import { sanitize } from './sanitize.js';

// ---------- zip ----------
async function unzip(buf) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, { method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    has: (name) => entries.has(name),
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lnameLen = dv.getUint16(e.local + 26, true);
      const lextraLen = dv.getUint16(e.local + 28, true);
      const start = e.local + 30 + lnameLen + lextraLen;
      const raw = new Uint8Array(buf, start, e.csize);
      let bytes;
      if (e.method === 0) bytes = raw;
      else if (e.method === 8) {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error('Unsupported compression in ' + name);
      return new TextDecoder('utf-8').decode(bytes);
    },
  };
}

// ---------- epub ----------
const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const byLocal = (doc, name) => Array.from(doc.getElementsByTagNameNS('*', name));
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

function resolve(base, href) {
  const parts = (base + href.split('#')[0]).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.map((p) => { try { return decodeURIComponent(p); } catch { return p; } }).join('/');
}

export async function parseEpub(arrayBuffer) {
  const zip = await unzip(arrayBuffer);
  const container = await zip.text('META-INF/container.xml');
  if (!container) throw new Error('Not an EPUB (no container.xml)');
  const opfPath = byLocal(xml(container), 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('Not an EPUB (no package file)');
  const opf = xml(await zip.text(opfPath));
  const base = dirOf(opfPath);

  const title = byLocal(opf, 'title')[0]?.textContent.trim() || 'Untitled';
  const author = byLocal(opf, 'creator')[0]?.textContent.trim() || '';

  const manifest = new Map();
  for (const it of byLocal(opf, 'item')) {
    manifest.set(it.getAttribute('id'), {
      href: resolve(base, it.getAttribute('href') || ''),
      type: it.getAttribute('media-type') || '',
      props: it.getAttribute('properties') || '',
    });
  }

  const labels = await tocLabels(zip, opf, manifest);

  const chapters = [];
  for (const ref of byLocal(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref'));
    if (!item || !/html/.test(item.type)) continue;
    const src = await zip.text(item.href);
    if (!src) continue;
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const text = doc.body ? doc.body.textContent.replace(/\s+/g, ' ').trim() : '';
    if (text.length < 20) continue; // cover pages, blank separators
    const heading = doc.querySelector('h1, h2, h3')?.textContent.replace(/\s+/g, ' ').trim();
    chapters.push({
      title: labels.get(item.href) || heading || 'Section ' + (chapters.length + 1),
      html: sanitize(doc.body.innerHTML, { images: false }),
      words: text.split(' ').length,
    });
  }
  if (!chapters.length) throw new Error('No readable chapters found');
  return { title, author, chapters };
}

// Chapter names from the EPUB 3 nav document or the EPUB 2 toc.ncx.
async function tocLabels(zip, opf, manifest) {
  const labels = new Map();
  const nav = [...manifest.values()].find((m) => /\bnav\b/.test(m.props));
  if (nav) {
    const doc = new DOMParser().parseFromString((await zip.text(nav.href)) || '', 'text/html');
    const navBase = dirOf(nav.href);
    doc.querySelectorAll('nav a[href]').forEach((a) => {
      const key = resolve(navBase, a.getAttribute('href'));
      if (!labels.has(key)) labels.set(key, a.textContent.replace(/\s+/g, ' ').trim());
    });
    if (labels.size) return labels;
  }
  const tocId = byLocal(opf, 'spine')[0]?.getAttribute('toc');
  const ncx = tocId && manifest.get(tocId);
  if (ncx) {
    const doc = xml((await zip.text(ncx.href)) || '<x/>');
    const ncxBase = dirOf(ncx.href);
    for (const np of byLocal(doc, 'navPoint')) {
      const label = byLocal(np, 'text')[0]?.textContent.trim();
      const src = byLocal(np, 'content')[0]?.getAttribute('src');
      if (label && src) {
        const key = resolve(ncxBase, src);
        if (!labels.has(key)) labels.set(key, label);
      }
    }
  }
  return labels;
}
