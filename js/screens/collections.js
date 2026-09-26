import * as db from '../db.js';
import { relTime } from '../logic.js';
import { h, icon, toast } from '../ui.js';
import { sourceLine } from './feed.js';
import { allPosts, savePost, folders, addFolder, renameFolder, deleteFolder, openedMap } from '../posts.js';
import { entryEl } from '../entries.js';
import { enablePostMenu } from '../postmenu.js';

const SECTIONS = [['list', 'Reading list'], ['bookmarks', 'Bookmarks'], ['quotes', 'Quotes']];

/** #/collections[/list|/bookmarks|/quotes] and #/collections/folder/:id (id 'all' = every bookmark) */
export async function render(main, app, tab = 'list', id = null) {
  if (tab === 'folder') return renderFolder(main, app, id);
  main.append(
    h('h1', { class: 'screen-title', text: 'Collections' }),
    h('nav', { class: 'tabs saved-tabs', 'aria-label': 'Collection sections' },
      SECTIONS.map(([key, label]) => h('a', { class: 'tab', href: '#/collections/' + key, 'aria-current': key === tab ? 'page' : null }, label))));
  if (tab === 'bookmarks') return renderBookmarks(main, app);
  if (tab === 'quotes') return renderQuotes(main, app);
  return renderList(main, app);
}

// ---------- reading list ----------
async function renderList(main, app) {
  // Oldest first, like a queue: the same order as the Reading list tab in the feed.
  const posts = (await allPosts()).filter((p) => p.list).sort((a, b) => a.list.addedAt - b.list.addedAt);
  const opened = await openedMap();
  if (!posts.length) {
    main.append(h('div', { class: 'empty' },
      h('h2', { text: 'Reading list is empty' }),
      h('p', { class: 'lead', text: 'Tap the list icon at the top of an article to add it. It comes back in your feed until you finish it.' })));
    return;
  }
  const ul = h('div', { class: 'feed' });
  for (const p of posts) {
    const where = p.scroll > 0.02 ? Math.round(p.scroll * 100) + '% read' : 'Not started';
    const li = postRow(p, [where], opened, 'Remove from reading list', async () => {
      const was = p.list;
      p.list = null;
      await savePost(p);
      li.remove();
      toast('Removed from reading list', { label: 'Undo', run: async () => { p.list = was; await savePost(p); rerender(main, app, 'list'); } });
    });
    ul.appendChild(li);
  }
  main.append(ul);
  return postMenu(ul, posts, () => rerender(main, app, 'list'));
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
      row('#/collections/folder/all', 'All bookmarks', marked.length),
      fs.map((f) => row('#/collections/folder/' + f.id, f.name, count(f.id)))),
    h('div', { style: 'margin-top: var(--s-5)' }, form),
    ...(marked.length ? [] : [h('p', { class: 'hint', style: 'margin-top: var(--s-4)', text: 'Tap the bookmark icon at the top of an article, or long-press a post, to keep it here.' })]));
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
    h('a', { class: 'btn btn-text btn-quiet', href: '#/collections/bookmarks' }, icon('back', 20), 'Bookmarks'));

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
          location.hash = '#/collections/bookmarks';
        } }, 'Delete folder'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')));
      edit.replaceWith(form);
      input.focus();
    } }, 'Edit folder');
  }

  const opened = await openedMap();
  const ul = h('div', { class: 'feed' });
  for (const p of items) {
    const li = postRow(p, [], opened, inAll ? 'Remove bookmark' : 'Remove from ' + folder.name, async () => {
      const was = p.bookmark;
      p.bookmark = inAll ? null : { ...was, folders: was.folders.filter((x) => x !== id) };
      await savePost(p);
      li.remove();
      toast(inAll ? 'Bookmark removed' : 'Removed from folder', { label: 'Undo', run: async () => { p.bookmark = was; await savePost(p); rerender(main, app, 'folder', id); } });
    });
    ul.appendChild(li);
  }
  main.append(head, title, ...(edit ? [edit] : []),
    items.length ? ul : h('p', { class: 'lead', style: 'margin-top: var(--s-5)', text: inAll ? 'No bookmarks yet.' : 'Nothing in this folder yet.' }));
  return postMenu(ul, items, () => rerender(main, app, 'folder', id));
}

// Collections list posts the same way the feed does, with one quiet remove button.
function postRow(p, extra, opened, removeLabel, onRemove) {
  return entryEl(p.item, {
    openedAt: opened[p.id], extra,
    action: h('button', { type: 'button', class: 'btn-icon', 'aria-label': removeLabel + ': ' + p.item.title, onclick: onRemove }, icon('close', 20)),
  });
}

// Long-press / right-click on these posts too; any change redraws the list.
function postMenu(root, posts, redraw) {
  return enablePostMenu(root, (id) => posts.find((p) => p.id === id)?.item || null, () => redraw());
}

function rerender(main, app, tab, id) { main.replaceChildren(); return render(main, app, tab, id); }

// ---------- quotes ----------
async function renderQuotes(main, app) {
  const saved = (await db.all('saved')).sort((a, b) => b.savedAt - a.savedAt);
  if (!saved.length) {
    main.append(h('div', { class: 'empty' },
      h('h2', { text: 'No quotes yet' }),
      h('p', { class: 'lead', text: 'Select text in an article or book, then tap Save quote.' })));
    return;
  }
  const list = h('ul', { class: 'saved-list' }, saved.map((x) => itemEl(x)));
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
  main.append(list);
}
