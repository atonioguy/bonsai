import * as db from '../db.js';
import { weekSummary, foliageScale, relTime } from '../logic.js';
import { h, icon, svg, toast } from '../ui.js';
import { sourceLine } from './feed.js';
import { allPosts, savePost, folders, addFolder, renameFolder, deleteFolder } from '../posts.js';

const SECTIONS = [['list', 'Reading list'], ['bookmarks', 'Bookmarks'], ['quotes', 'Quotes']];

/** #/saved[/list|/bookmarks|/quotes] and #/saved/folder/:id (id 'all' = every bookmark) */
export async function render(main, app, tab = 'list', id = null) {
  if (tab === 'folder') return renderFolder(main, app, id);
  main.append(
    h('h1', { class: 'screen-title', text: 'Saved' }),
    h('nav', { class: 'tabs saved-tabs', 'aria-label': 'Saved sections' },
      SECTIONS.map(([key, label]) => h('a', { class: 'tab', href: '#/saved/' + key, 'aria-current': key === tab ? 'page' : null }, label))));
  if (tab === 'bookmarks') return renderBookmarks(main, app);
  if (tab === 'quotes') return renderQuotes(main, app);
  return renderList(main, app);
}

// ---------- reading list ----------
async function renderList(main, app) {
  const posts = (await allPosts()).filter((p) => p.list).sort((a, b) => b.list.addedAt - a.list.addedAt);
  if (!posts.length) {
    main.append(h('div', { class: 'empty' },
      h('h2', { text: 'Reading list is empty' }),
      h('p', { class: 'lead', text: 'Tap the list icon at the top of an article to add it. It comes back in your feed until you finish it.' })));
    return;
  }
  const ul = h('ul', { class: 'list post-list' });
  for (const p of posts) {
    const where = p.scroll > 0.02 ? Math.round(p.scroll * 100) + '% read' : 'Not started';
    const li = postRow(p, [p.item.sourceName, where, 'added ' + relTime(p.list.addedAt)], 'Remove from reading list', async () => {
      const was = p.list;
      p.list = null;
      await savePost(p);
      li.remove();
      toast('Removed from reading list', { label: 'Undo', run: async () => { p.list = was; await savePost(p); rerender(main, app, 'list'); } });
    });
    ul.appendChild(li);
  }
  main.append(ul);
}

// ---------- bookmarks: folders overview ----------
async function renderBookmarks(main, app) {
  const [posts, fs] = await Promise.all([allPosts(), folders()]);
  const marked = posts.filter((p) => p.bookmark);
  const count = (fid) => marked.filter((p) => p.bookmark.folders.includes(fid)).length;
  const row = (href, label, n) => h('li', {}, h('a', { class: 'folder-row', href },
    icon('folder', 22), h('span', { class: 'folder-name', text: label }), h('span', { class: 'meta', text: String(n) }), icon('chevron', 18)));

  const name = h('input', { class: 'input', id: 'new-folder', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'New folder name' });
  const form = h('form', { class: 'inline-field', onsubmit: async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return;
    await addFolder(name.value);
    rerender(main, app, 'bookmarks');
  } }, h('label', { class: 'visually-hidden', for: 'new-folder' }, 'New folder name'), name, h('button', { type: 'submit', class: 'btn btn-secondary' }, 'Add folder'));

  main.append(
    h('ul', { class: 'list' },
      row('#/saved/folder/all', 'All bookmarks', marked.length),
      fs.map((f) => row('#/saved/folder/' + f.id, f.name, count(f.id)))),
    h('div', { style: 'margin-top: var(--s-5)' }, form),
    marked.length ? null : h('p', { class: 'hint', style: 'margin-top: var(--s-4)', text: 'Tap the bookmark icon at the top of an article to keep it here.' }));
}

// ---------- one folder ----------
async function renderFolder(main, app, id) {
  const [posts, fs] = await Promise.all([allPosts(), folders()]);
  const folder = fs.find((f) => f.id === id);
  const inAll = id === 'all' || !folder;
  const items = posts.filter((p) => p.bookmark && (inAll || p.bookmark.folders.includes(id)))
    .sort((a, b) => b.bookmark.at - a.bookmark.at);

  const title = h('h1', { class: 'screen-title', text: inAll ? 'All bookmarks' : folder.name });
  const head = h('div', { class: 'backrow' },
    h('a', { class: 'btn btn-text btn-quiet', href: '#/saved/bookmarks' }, icon('back', 20), 'Bookmarks'));

  let edit = null;
  if (!inAll) {
    edit = h('button', { type: 'button', class: 'btn btn-text', onclick: () => {
      const input = h('input', { class: 'input', id: 'rename', type: 'text', maxlength: '60', value: folder.name });
      const form = h('form', { class: 'form folder-edit', onsubmit: async (e) => {
        e.preventDefault();
        if (input.value.trim()) await renameFolder(folder.id, input.value);
        rerender(main, app, 'folder', id);
      } },
      h('div', { class: 'field' }, h('label', { for: 'rename' }, 'Folder name'), input),
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-text btn-danger', onclick: async () => {
          if (!confirm('Delete “' + folder.name + '”? Its articles stay in All bookmarks.')) return;
          await deleteFolder(folder.id);
          location.hash = '#/saved/bookmarks';
        } }, 'Delete folder'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')));
      edit.replaceWith(form);
      input.focus();
    } }, 'Edit folder');
  }

  const ul = h('ul', { class: 'list post-list' });
  for (const p of items) {
    const li = postRow(p, [p.item.sourceName, 'saved ' + relTime(p.bookmark.at)], inAll ? 'Remove bookmark' : 'Remove from ' + folder.name, async () => {
      const was = p.bookmark;
      p.bookmark = inAll ? null : { ...was, folders: was.folders.filter((x) => x !== id) };
      await savePost(p);
      li.remove();
      toast(inAll ? 'Bookmark removed' : 'Removed from folder', { label: 'Undo', run: async () => { p.bookmark = was; await savePost(p); rerender(main, app, 'folder', id); } });
    });
    ul.appendChild(li);
  }
  main.append(head, title, edit,
    items.length ? ul : h('p', { class: 'lead', style: 'margin-top: var(--s-5)', text: inAll ? 'No bookmarks yet.' : 'Nothing in this folder yet.' }));
}

function postRow(p, metaParts, removeLabel, onRemove) {
  return h('li', { class: 'row post-row' },
    h('a', { class: 'row-main', href: '#/item/' + encodeURIComponent(p.id) },
      h('span', { class: 'row-title', text: p.item.title }),
      h('span', { class: 'meta', text: metaParts.filter(Boolean).join(' · ') })),
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': removeLabel + ': ' + p.item.title, onclick: onRemove }, icon('close', 20)));
}

function rerender(main, app, tab, id) { main.replaceChildren(); return render(main, app, tab, id); }

// ---------- quotes (the tree, this week, saved quotes) ----------

// Where each topic's foliage sits on the tree (viewBox 360×300), trunk-side first.
const SPOTS = [
  { x: 180, y: 70, rx: 62, ry: 30 },   // crown
  { x: 84, y: 118, rx: 52, ry: 25 },
  { x: 278, y: 110, rx: 52, ry: 25 },
  { x: 100, y: 186, rx: 44, ry: 21 },
  { x: 262, y: 178, rx: 46, ry: 21 },
];

async function renderQuotes(main, app) {
  const [saved, sessions] = await Promise.all([db.all('saved'), db.all('sessions')]);
  saved.sort((a, b) => b.savedAt - a.savedAt);
  const week = weekSummary({ sessions, saved });

  const counts = new Map();
  for (const x of saved) counts.set(x.topic, (counts.get(x.topic) || 0) + 1);
  const topics = app.config.topics.slice(0, SPOTS.length);

  const foliage = topics.map((t, i) => {
    const sp = SPOTS[i], k = foliageScale(counts.get(t.id) || 0);
    return `<ellipse cx="${sp.x}" cy="${sp.y}" rx="${(sp.rx * k).toFixed(1)}" ry="${(sp.ry * k).toFixed(1)}" fill="var(--sage)" opacity="${(0.7 + 0.3 * k).toFixed(2)}"/>`;
  }).join('');
  const tree = svg(
    `<path d="M180 262C176 236 160 222 166 196C171 176 190 168 184 140C180 118 186 104 182 92" stroke="var(--bark)" stroke-width="13" fill="none" stroke-linecap="round"/>
     <path d="M170 200C150 196 130 192 112 186M180 172C205 172 230 174 252 178M184 134C160 128 126 124 96 120M184 118C212 114 240 112 266 112" stroke="var(--bark)" stroke-width="6" fill="none" stroke-linecap="round"/>
     <rect x="112" y="258" width="136" height="12" rx="5" fill="var(--clay-dark)"/>
     <path d="M124 270H236L224 294H136Z" fill="var(--clay)"/>` + foliage,
    { viewBox: '0 34 360 266', class: 'tree', role: 'img', 'aria-hidden': 'false',
      'aria-label': 'Saved quotes by topic: ' + topics.map((t) => `${t.name} ${counts.get(t.id) || 0}`).join(', ') });

  const byTopic = h('p', { class: 'meta', style: 'text-align: center; margin-top: var(--s-3)', 'aria-hidden': 'true',
    text: topics.map((t) => `${t.name} ${counts.get(t.id) || 0}`).join(' · ') });
  const weekLine = h('p', { class: 'week lead', text: `This week: ${week.minutes} min read · ${week.sessions} ${week.sessions === 1 ? 'session' : 'sessions'} · ${week.saved} saved` });

  const list = saved.length
    ? h('ul', { class: 'saved-list' }, saved.map((x) => itemEl(x)))
    : h('div', { class: 'empty' },
      h('h2', { text: 'Nothing saved yet' }),
      h('p', { class: 'lead', text: 'Select text in an article or book, then tap Save quote.' }),
      h('a', { class: 'btn btn-secondary', href: '#/' }, 'Go to feed'));

  function itemEl(x) {
    const li = h('li', { class: 'saved-item' },
      h('blockquote', { class: 'quote' + (x.kind === 'note' ? ' note' : ''), text: x.kind === 'note' ? x.text : '“' + x.text + '”' }),
      h('div', { class: 'saved-foot' },
        h('p', { class: 'meta', text: [sourceLine(x), relTime(x.savedAt)].filter(Boolean).join(' · ') }),
        h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Delete quote', onclick: async () => {
          await db.del('saved', x.id);
          li.remove();
          toast('Deleted', { label: 'Undo', run: async () => { await db.put('saved', x.id, x); rerender(main, app, 'quotes'); } });
        } }, icon('trash', 20))));
    return li;
  }

  main.append(tree, byTopic, weekLine, list);
}

