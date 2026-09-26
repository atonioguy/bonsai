// Full text for research articles, from Europe PMC (a free mirror of PubMed Central's
// open-access papers). Looks the paper up by PMID/DOI, fetches its JATS XML and turns
// it into the app's reading HTML. Works only for open-access papers; anything else
// falls back to opening the article (or your library's LibKey link) in the browser.
import { sanitize } from './sanitize.js';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/';

export class FullTextError extends Error {}

// Direct first; if the browser blocks it, go through the feed server's /epmc relay.
async function epmc(path, settings) {
  try {
    const r = await fetch(EPMC + path);
    if (r.ok || r.status === 404) return r;
  } catch { /* blocked or offline: try the relay */ }
  if (!settings.feedUrl) throw new FullTextError('Couldn’t reach Europe PMC.');
  return fetch(settings.feedUrl.replace(/\/+$/, '') + '/epmc?path=' + encodeURIComponent(path));
}

/** @returns {Promise<{ html: string, pmcid: string }>} */
export async function loadFullText(ids, settings) {
  let pmcid = ids.pmcid;
  if (!pmcid) {
    const q = ids.pmid ? `EXT_ID:${ids.pmid} AND SRC:MED` : `DOI:"${ids.doi}"`;
    const r = await epmc(`search?query=${encodeURIComponent(q)}&resultType=lite&format=json&pageSize=1`, settings);
    if (!r.ok) throw new FullTextError('Europe PMC didn’t answer.');
    const hit = (await r.json())?.resultList?.result?.[0];
    pmcid = hit?.pmcid;
    if (!pmcid) throw new FullTextError('This paper isn’t in PubMed Central.');
  }
  const r = await epmc(`${pmcid}/fullTextXML`, settings);
  if (!r.ok) throw new FullTextError('The full text isn’t open access.');
  const html = jatsToHtml(await r.text());
  if (html.replace(/<[^>]+>/g, '').trim().length < 400) throw new FullTextError('The full text came back empty.');
  return { html, pmcid };
}

// ---------- JATS (journal XML) → reading HTML ----------
export function jatsToHtml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const body = doc.getElementsByTagName('body')[0];
  if (!body || doc.getElementsByTagName('parsererror').length) return '';
  const out = [];
  walk(body, out, 2);
  return sanitize(out.join(''), { images: false });
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(node) {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { s += esc(c.nodeValue); continue; }
    if (c.nodeType !== 1) continue;
    const t = c.localName;
    if (t === 'italic') s += '<em>' + inline(c) + '</em>';
    else if (t === 'bold') s += '<strong>' + inline(c) + '</strong>';
    else if (t === 'sup' || t === 'sub') s += `<${t}>` + inline(c) + `</${t}>`;
    else if (t === 'ext-link' || t === 'uri') {
      const href = c.getAttribute('xlink:href') || c.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || c.textContent;
      s += `<a href="${esc(href)}">` + inline(c) + '</a>';
    } else if (t === 'xref' && c.getAttribute('ref-type') === 'bibr') s += '<sup>' + inline(c) + '</sup>';
    else if (t === 'fn' || t === 'table-wrap' || t === 'fig' || t === 'graphic' || t === 'inline-graphic') continue;
    else s += inline(c); // xref, named-content, sc, etc.: keep the text
  }
  return s;
}

function walk(node, out, level) {
  for (const c of node.children) {
    const t = c.localName;
    if (t === 'sec') {
      const title = [...c.children].find((x) => x.localName === 'title');
      if (title) out.push(`<h${Math.min(level, 4)}>` + inline(title) + `</h${Math.min(level, 4)}>`);
      walk(c, out, level + 1);
    } else if (t === 'p') out.push('<p>' + inline(c) + '</p>');
    else if (t === 'list') {
      const tag = c.getAttribute('list-type') === 'order' ? 'ol' : 'ul';
      out.push(`<${tag}>`);
      for (const li of c.children) if (li.localName === 'list-item') out.push('<li>' + [...li.children].map(inline).join(' ') + '</li>');
      out.push(`</${tag}>`);
    } else if (t === 'disp-quote' || t === 'boxed-text') {
      out.push('<blockquote>'); walk(c, out, level + 1); out.push('</blockquote>');
    } else if (t === 'fig' || t === 'table-wrap') {
      const label = [...c.children].find((x) => x.localName === 'label');
      const caption = [...c.children].find((x) => x.localName === 'caption');
      if (label || caption) out.push('<figure><figcaption>' + (label ? '<strong>' + inline(label) + '</strong> ' : '') + (caption ? [...caption.children].map(inline).join(' ') : '') + '</figcaption></figure>');
    }
  }
}
