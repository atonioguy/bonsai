// RSS 2.0 / RSS 1.0 (RDF) / Atom → Bonsai items. Pure string work: Cloudflare
// Workers have no DOMParser, and this file is also imported by the Node tests.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  middot: '·', copy: '©', reg: '®', trade: '™', eacute: 'é', egrave: 'è', aacute: 'á',
  iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç',
};

export function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s || '';
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

// Inner text of a tag's content: CDATA is taken raw, anything else is entity-decoded once.
function unwrap(inner) {
  const t = inner.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(t);
  if (cdata) return cdata[1];
  // mixed CDATA sections inside a value
  if (t.indexOf('<![CDATA[') >= 0) return t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(t);
}

const esc = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TAG_RE = new Map();
function tagRe(name) {
  let re = TAG_RE.get(name);
  if (!re) {
    re = new RegExp('<' + esc(name) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + esc(name) + '\\s*>', 'i');
    TAG_RE.set(name, re);
  }
  return re;
}

// First matching element's inner content, trying names in order (e.g. 'content:encoded').
function tag(block, names) {
  for (const name of names) {
    const m = tagRe(name).exec(block);
    if (m && m[1].trim()) return unwrap(m[1]);
  }
  return '';
}

// Attribute of the first self-closing or open tag with that name.
function attr(block, name, attrName, where) {
  const re = new RegExp('<' + esc(name) + '\\b([^>]*)>', 'gi');
  let m;
  while ((m = re.exec(block))) {
    const attrs = m[1];
    if (where && !where(attrs)) continue;
    const a = new RegExp('\\b' + esc(attrName) + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(attrs);
    if (a) return decodeEntities(a[2] ?? a[3]);
  }
  return '';
}

export function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<(script|style|iframe|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|blockquote|section|article|figure|figcaption|table|tr|td|th|hr)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  ).replace(/\s+/g, ' ').trim();
}

export function makeExcerpt(text, max = 280) {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
}

// Short stable id (FNV-1a, base36) — the same item keeps the same id across refreshes.
export function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function toIso(s) {
  if (!s) return null;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function isHttp(u) {
  return /^https?:\/\//i.test(u || '');
}

const MAX_HTML = 80_000; // bigger bodies are dropped (the item view links out instead)

/**
 * @param {string} xml  the feed document
 * @param {{id:string,name:string,topic:string,kind:string}} source
 * @returns {Array<object>} items, newest first
 */
export function parseFeed(xml, source, limit = 50) {
  const doc = String(xml || '');
  const isAtom = /<feed\b[^>]*>/i.test(doc) && !/<rss\b/i.test(doc);
  const blockRe = isAtom ? /<entry\b[\s\S]*?<\/entry\s*>/gi : /<item\b[\s\S]*?<\/item\s*>/gi;

  const items = [];
  let bm;
  while ((bm = blockRe.exec(doc)) && items.length < limit) {
    // Pull the (large) body out first so the other lookups scan a small block.
    let b = bm[0];
    let full = '';
    for (const name of ['content:encoded', 'content']) {
      const m = tagRe(name).exec(b);
      if (m && m[1].trim()) { full = unwrap(m[1]); b = b.slice(0, m.index) + b.slice(m.index + m[0].length); break; }
    }
    const title = stripTags(tag(b, ['title']));

    let link = '';
    if (isAtom) {
      link = attr(b, 'link', 'href', (a) => !/\brel\s*=/.test(a) || /\brel\s*=\s*["']alternate["']/i.test(a));
    } else {
      link = stripTags(tag(b, ['link']));
      if (!isHttp(link)) {
        const guid = stripTags(tag(b, ['guid']));
        if (isHttp(guid)) link = guid;
      }
      if (!isHttp(link)) link = attr(b, 'item', 'rdf:about');
    }
    if (!isHttp(link)) link = '';

    const summary = tag(b, ['description', 'summary', 'itunes:summary', 'media:description']);
    let html = full || summary;
    const excerpt = makeExcerpt(stripTags(summary || full));
    if (html.length > MAX_HTML) html = '';

    const audioUrl = attr(b, 'enclosure', 'url', (a) => /type\s*=\s*["']audio\//i.test(a))
      || attr(b, 'media:content', 'url', (a) => /type\s*=\s*["']audio\//i.test(a));

    const image = attr(b, 'media:thumbnail', 'url')
      || attr(b, 'media:content', 'url', (a) => /medium\s*=\s*["']image["']|type\s*=\s*["']image\//i.test(a))
      || attr(b, 'enclosure', 'url', (a) => /type\s*=\s*["']image\//i.test(a))
      || attr(b, 'itunes:image', 'href')
      || attr(html.slice(0, 20_000), 'img', 'src');

    const published = toIso(tag(b, ['pubDate', 'published', 'dc:date', 'updated', 'prism:publicationDate']));
    const videoId = stripTags(tag(b, ['yt:videoId'])); // YouTube channel feeds
    const guid = stripTags(tag(b, isAtom ? ['id'] : ['guid'])) || link || title;
    if (!title && !excerpt) continue;

    items.push({
      id: hashId(source.id + '|' + guid),
      sourceId: source.id,
      sourceName: source.name,
      topic: source.topic,
      kind: videoId ? 'video' : audioUrl ? 'audio' : source.kind || 'article',
      title: title || excerpt.slice(0, 80),
      url: link,
      published,
      excerpt,
      html: html.trim(),
      audioUrl: isHttp(audioUrl) ? audioUrl : '',
      image: isHttp(image) ? image : '',
      ...(videoId && /^[\w-]{11}$/.test(videoId) ? { videoId, short: /\/shorts\//.test(link) } : {}),
    });
  }

  items.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  return items;
}

// Paywalled posts ("for paid subscribers", "upgrade to read the rest"…). Used only for
// sources marked `hideLocked`, so a newsletter's own "go premium" plug in a free post
// doesn't hide it: the phrases have to be about *this* post being locked.
const LOCKED = [
  /\b(this|the rest of this|the full) (post|issue|edition|article|story|piece|newsletter)( is| are)? (only )?(for|available (only )?to|reserved for|exclusive to) (paid|paying|premium)/i,
  /\b(subscribe|upgrade|join|become a (paid|paying|premium) (member|subscriber))\b[^.!?]{0,60}\b(to (read|continue reading|keep reading|unlock|access) (the rest|this|the full|more of this)|to read on)\b/i,
  /\b(paid|paying|premium) (subscribers|members) only\b/i,
  /\b(want|ready) to keep reading\?/i,
  /\bunlock (this|the full) (post|issue|article)\b/i,
];

export function isLocked(item) {
  // Paywall notices sit at the start or the end of a post; look only there.
  const html = item.html || '';
  const ends = html.length > 8000 ? html.slice(0, 3000) + ' ' + html.slice(-5000) : html;
  const text = stripTags(ends) + ' ' + (item.excerpt || '') + ' ' + (item.title || '');
  return LOCKED.some((re) => re.test(text));
}
