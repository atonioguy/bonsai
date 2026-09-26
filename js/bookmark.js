// The bookmark sheet (choose folders, add a folder, remove the bookmark). Shared by the article
// screen and the long-press menu. Works on a post record and saves it after each change.
import { h, icon, toast, openSheet } from './ui.js';
import { folders, addFolder, savePost } from './posts.js';

export async function bookmarkSheet(post, { onChange = () => {} } = {}) {
  const list = await folders();
  const save = async () => { await savePost(post); onChange(post); };
  const ensure = () => { if (!post.bookmark) post.bookmark = { at: Date.now(), folders: [] }; };

  openSheet('Bookmark', (close) => {
    const hint = h('p', { class: 'hint' });
    const boxes = h('ul', { class: 'list' });
    const paint = () => {
      hint.textContent = list.length ? 'Folders' : 'No folders yet. It’s in All bookmarks; add a folder to sort it.';
      boxes.replaceChildren(...list.map((f) => {
        const cb = h('input', { type: 'checkbox', id: 'fold-' + f.id, checked: Boolean(post.bookmark?.folders.includes(f.id)) });
        cb.addEventListener('change', async () => {
          ensure();
          const set = new Set(post.bookmark.folders);
          if (cb.checked) set.add(f.id); else set.delete(f.id);
          post.bookmark.folders = [...set];
          await save();
        });
        return h('li', {}, h('label', { class: 'check-row', for: 'fold-' + f.id }, cb, icon('folder', 20), h('span', { text: f.name })));
      }));
    };
    paint();
    const name = h('input', { class: 'input', id: 'new-folder', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'New folder name' });
    const form = h('form', { class: 'inline-field', onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      const f = await addFolder(name.value);
      list.push(f);
      ensure();
      post.bookmark.folders.push(f.id);
      await save();
      name.value = '';
      paint();
    } }, h('label', { class: 'visually-hidden', for: 'new-folder' }, 'New folder name'), name, h('button', { type: 'submit', class: 'btn btn-secondary' }, 'Add'));
    return h('div', { class: 'sheet-body' },
      hint,
      boxes,
      form,
      h('div', { class: 'sheet-actions' },
        h('button', { type: 'button', class: 'btn btn-text btn-danger', onclick: async () => {
          post.bookmark = null;
          await save();
          close();
          toast('Bookmark removed');
        } }, 'Remove bookmark'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: close }, 'Done')));
  });
}
