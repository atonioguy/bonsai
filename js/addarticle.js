// Add a research article by its link, to the Reading list and/or Bookmarks. PubMed, PMC and DOI
// links (doi.org, or a journal link with the DOI in it) get their title, journal, date and abstract
// from Europe PMC, or from Crossref for other DOIs. Any other link can be added with a title you type.
// The article is kept on this device like any post, and opens like one (Load full article included).
import { h, toast, openSheet } from './ui.js';
import { articleIds, newListEntry } from './logic.js';
import { epmc } from './fulltext.js';
import { sanitize } from './sanitize.js';
import { ensurePost, savePost } from './posts.js';

const text = (html) => { const d = document.createElement('div'); d.innerHTML = sanitize(html || ''); return d.textContent.replace(/\s+/g, ' ').trim(); };
const excerptOf = (t, max = 280) => (t.length <= max ? t : t.slice(0, t.lastIndexOf(' ', max) > max * 0.6 ? t.lastIndexOf(' ', max) : max) + '…');
const idFor = (key) => { // short and stable, so adding the same article twice updates it
  let x = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { x ^= key.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  return 'added-' + (x >>> 0).toString(36);
};

/** @returns {Promise<{title, journal, published, authors, abstract, url, key} | null>} */
export async function lookupArticle(link, settings) {
  const ids = articleIds({ url: link });
  if (!ids) return null;
  const key = ids.pmid ? 'pmid:' + ids.pmid : ids.pmcid ? 'pmc:' + ids.pmcid : 'doi:' + ids.doi.toLowerCase();
  const q = ids.pmid ? `EXT_ID:${ids.pmid} AND SRC:MED` : ids.pmcid ? `PMCID:${ids.pmcid}` : `DOI:"${ids.doi}"`;
  try {
    const r = await epmc(`search?query=${encodeURIComponent(q)}&resultType=core&format=json&pageSize=1`, settings);
    const hit = r.ok ? (await r.json())?.resultList?.result?.[0] : null;
    if (hit?.title) {
      return {
        key,
        title: text(hit.title),
        journal: hit.journalInfo?.journal?.title || hit.bookOrReportDetails?.publisher || '',
        published: hit.firstPublicationDate || (hit.pubYear ? hit.pubYear + '-01-01' : ''),
        authors: hit.authorString || '',
        abstract: hit.abstractText || '',
        url: hit.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${hit.pmid}/` : hit.doi ? 'https://doi.org/' + hit.doi : link,
      };
    }
  } catch { /* try Crossref */ }
  if (!ids.doi) return null;
  try {
    const r = await fetch('https://api.crossref.org/works/' + encodeURIComponent(ids.doi));
    const m = r.ok ? (await r.json())?.message : null;
    if (!m?.title?.[0]) return null;
    const parts = (m.published || m.issued || {})['date-parts']?.[0] || [];
    return {
      key,
      title: text(m.title[0]),
      journal: m['container-title']?.[0] || m.publisher || '',
      published: parts[0] ? `${parts[0]}-${String(parts[1] || 1).padStart(2, '0')}-${String(parts[2] || 1).padStart(2, '0')}` : '',
      authors: (m.author || []).slice(0, 6).map((a) => [a.given, a.family].filter(Boolean).join(' ')).join(', ') + ((m.author || []).length > 6 ? ' et al.' : ''),
      abstract: (m.abstract || '').replace(/<\/?jats:/g, '<').replace(/<\/?(title|sec)[^>]*>/g, ''),
      url: 'https://doi.org/' + ids.doi,
    };
  } catch { return null; }
}

// The article as a post (the same shape as a feed item).
export function articleItem(meta, { topic = '' } = {}) {
  const abstract = sanitize(meta.abstract || '', { images: false });
  const date = meta.published && Number.isFinite(Date.parse(meta.published)) ? new Date(meta.published).toISOString() : null;
  let host = '';
  try { host = new URL(meta.url).hostname.replace(/^www\./, ''); } catch { /* no link */ }
  return {
    id: idFor(meta.key || meta.url),
    sourceId: 'added', sourceName: meta.journal || host || 'Added by you', topic, kind: 'research',
    title: meta.title, url: meta.url, published: date,
    excerpt: excerptOf(text(abstract) || meta.authors || ''),
    html: (meta.authors ? `<p><em>${text(meta.authors).replace(/[<>&]/g, '')}</em></p>` : '') + abstract,
    audioUrl: '', image: '',
  };
}

/**
 * The "Add article" sheet.
 * @param {object} app
 * @param {{ list?: boolean, bookmark?: boolean, onAdded?: (post) => void }} opts  which boxes start ticked
 */
export function addArticleSheet(app, { list = true, bookmark = false, onAdded = () => {} } = {}) {
  openSheet('Add an article', (close) => {
    const link = h('input', { class: 'input', id: 'add-link', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://pubmed.ncbi.nlm.nih.gov/…', 'aria-describedby': 'add-link-hint' });
    const found = h('p', { class: 'hint', id: 'add-link-hint', role: 'status', text: 'A PubMed, PMC or DOI link, or any journal link with the DOI in it.' });
    const title = h('input', { class: 'input', id: 'add-title', type: 'text', maxlength: '300', autocomplete: 'off' });
    const titleField = h('div', { class: 'field', hidden: true }, h('label', { for: 'add-title' }, 'Title'), title);
    const inList = h('input', { type: 'checkbox', id: 'add-list', checked: list });
    const inMarks = h('input', { type: 'checkbox', id: 'add-mark', checked: bookmark });
    const topic = h('select', { class: 'input', id: 'add-topic' },
      h('option', { value: '' }, 'No topic'),
      app.config.topics.filter((t) => !t.brief).map((t) => h('option', { value: t.id }, t.name)));
    const add = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Add');

    let meta = null, lookedUp = '', timer = null;
    const look = async () => {
      const url = link.value.trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url) || url === lookedUp) return;
      lookedUp = url;
      meta = null;
      found.textContent = 'Looking it up…';
      const m = await lookupArticle(url, app.settings);
      if (link.value.trim() !== url) return; // changed meanwhile
      meta = m;
      titleField.hidden = Boolean(m);
      found.textContent = m ? [m.title, [m.journal, (m.published || '').slice(0, 4)].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
        : 'Couldn’t find this article’s details. Type a title to add it anyway.';
    };
    link.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(look, 500); });

    const form = h('form', { class: 'form sheet-form', onsubmit: async (e) => {
      e.preventDefault();
      const url = link.value.trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) { found.textContent = 'Paste a link that starts with https://'; link.focus(); return; }
      if (!inList.checked && !inMarks.checked) { found.textContent = 'Choose Reading list, Bookmarks or both.'; return; }
      add.disabled = true;
      clearTimeout(timer);
      if (url !== lookedUp) await look();
      add.disabled = false;
      if (!meta && !title.value.trim()) { titleField.hidden = false; title.focus(); return; }
      const item = articleItem(meta || { key: url, url, title: title.value.trim() }, { topic: topic.value });
      const post = await ensurePost(item);
      if (inList.checked) post.list = post.list || newListEntry();
      if (inMarks.checked) post.bookmark = post.bookmark || { at: Date.now(), folders: [] };
      await savePost(post);
      close();
      toast(inList.checked && inMarks.checked ? 'Added to reading list and bookmarks' : inList.checked ? 'Added to reading list' : 'Bookmarked',
        { label: 'Open', run: () => { location.hash = '#/item/' + encodeURIComponent(item.id); } });
      onAdded(post);
    } },
    h('div', { class: 'field' }, h('label', { for: 'add-link' }, 'Link'), link, found),
    titleField,
    h('fieldset', { class: 'plain-fieldset' },
      h('legend', { class: 'label', text: 'Save to' }),
      h('label', { class: 'check-row', for: 'add-list' }, inList, h('span', { text: 'Reading list' })),
      h('label', { class: 'check-row', for: 'add-mark' }, inMarks, h('span', { text: 'Bookmarks' }))),
    h('div', { class: 'field' }, h('label', { for: 'add-topic' }, 'Topic'), topic),
    h('div', { class: 'sheet-actions' }, h('button', { type: 'button', class: 'btn btn-text btn-quiet', onclick: close }, 'Cancel'), add));
    setTimeout(() => link.focus(), 50);
    return form;
  });
}
