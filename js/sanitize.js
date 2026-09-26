// Feed and book HTML → a safe, plain reading subset. Everything not on the list is
// unwrapped (text kept) or, for active content, dropped entirely.

const KEEP = new Set(['P', 'BR', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'EM', 'I', 'STRONG', 'B',
  'A', 'FIGURE', 'FIGCAPTION', 'IMG', 'PRE', 'CODE', 'HR', 'SUP', 'SUB', 'SMALL']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SELECT',
  'TEXTAREA', 'NOSCRIPT', 'SVG', 'MATH', 'VIDEO', 'AUDIO', 'CANVAS', 'TEMPLATE', 'LINK', 'META', 'HEAD', 'TITLE']);
const RENAME = { H1: 'H2', H5: 'H4', H6: 'H4', DIV: 'P', SECTION: null, ARTICLE: null, SPAN: null };

const httpUrl = (u) => {
  try {
    const url = new URL(u, 'https://invalid.example/');
    return /^https?:$/.test(url.protocol) && url.hostname !== 'invalid.example' ? url.href : '';
  } catch { return ''; }
};

/**
 * @param {string} html
 * @param {{images?: boolean}} opts  images: keep http(s) <img> (feeds yes, books no)
 * @returns {string}
 */
export function sanitize(html, { images = true } = {}) {
  const doc = new DOMParser().parseFromString('<!doctype html><body>' + (html || ''), 'text/html');
  const out = document.createElement('div');
  copy(doc.body, out, images);
  // drop empty paragraphs left behind by layout divs
  out.querySelectorAll('p').forEach((p) => { if (!p.textContent.trim() && !p.querySelector('img')) p.remove(); });
  return out.innerHTML;
}

function copy(from, to, images) {
  for (const node of Array.from(from.childNodes)) {
    if (node.nodeType === 3) { to.appendChild(document.createTextNode(node.nodeValue)); continue; }
    if (node.nodeType !== 1) continue;
    let tag = node.tagName.toUpperCase();
    if (DROP.has(tag)) continue;
    if (tag in RENAME) tag = RENAME[tag];
    if (!tag || !KEEP.has(tag)) { copy(node, to, images); continue; }
    if (tag === 'IMG') {
      const src = images ? httpUrl(node.getAttribute('src')) : '';
      if (!src) continue;
      const img = document.createElement('img');
      img.src = src;
      img.alt = node.getAttribute('alt') || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      to.appendChild(img);
      continue;
    }
    const el = document.createElement(tag);
    if (tag === 'A') {
      const href = httpUrl(node.getAttribute('href'));
      if (!href) { copy(node, to, images); continue; }
      el.href = href;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
    copy(node, el, images);
    to.appendChild(el);
  }
}
