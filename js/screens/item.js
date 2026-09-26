import * as db from '../db.js';
import { relTime, newListEntry } from '../logic.js';
import { h, icon, toast, fmtDate, sharePost, openSheet, REACTIONS, reactionIcon, avatarEl } from '../ui.js';
import { sanitize } from '../sanitize.js';
import { attachSaveQuote } from '../selection.js';
import { readControls } from '../readtools.js';
import { getPost, ensurePost, savePost, markOpened, folders, addFolder } from '../posts.js';

export async function render(main, app, id) {
  const cache = await db.get('kv', 'feed');
  const stored = await getPost(id);
  const item = cache?.items.find((i) => i.id === id) || stored?.item;

  const backBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Back', onclick: () => app.back() }, icon('back'));

  if (!item) {
    main.append(h('div', { class: 'article-bar' }, backBtn), h('div', { class: 'empty' },
      h('h1', { class: 'screen-title', text: 'Article not found' }),
      h('p', { class: 'lead', text: 'It’s no longer in the feed.' })));
    return;
  }

  await markOpened(item);
  // One in-memory copy is the source of truth on this screen; every change saves it whole.
  const post = await ensurePost(item);
  const save = () => savePost(post);
  const profile = (await db.get('kv', 'profile')) || {};

  const body = sanitize(item.html || '');
  const plainBody = body.replace(/<[^>]+>/g, '').trim();
  const hasFull = plainBody.length > (item.excerpt || '').length + 200; // more than the summary

  // ---------- toolbar ----------
  const tools = readControls();
  const listBtn = h('button', { type: 'button', class: 'btn-icon' });
  const markBtn = h('button', { type: 'button', class: 'btn-icon' });
  const paintTools = () => {
    listBtn.replaceChildren(icon(post.list ? 'listed' : 'listAdd'));
    listBtn.setAttribute('aria-label', post.list ? 'Remove from reading list' : 'Add to reading list');
    listBtn.setAttribute('aria-pressed', String(Boolean(post.list)));
    markBtn.replaceChildren(icon(post.bookmark ? 'bookmarked' : 'bookmark'));
    markBtn.setAttribute('aria-label', post.bookmark ? 'Bookmarked, choose folders' : 'Bookmark');
    markBtn.setAttribute('aria-pressed', String(Boolean(post.bookmark)));
    listEnd.hidden = !post.list;
  };

  listBtn.addEventListener('click', async () => {
    const was = post.list;
    post.list = was ? null : newListEntry();
    await save();
    paintTools();
    toast(was ? 'Removed from reading list' : 'Added to reading list', { label: 'Undo', run: async () => { post.list = was; await save(); paintTools(); } });
  });

  markBtn.addEventListener('click', async () => {
    if (post.bookmark) return folderSheet();
    post.bookmark = { at: Date.now(), folders: [] };
    await save();
    paintTools();
    toast('Bookmarked', { label: 'Add to folder', run: folderSheet });
  });

  async function folderSheet() {
    const list = await folders();
    openSheet('Bookmark', (close) => {
      const boxes = h('ul', { class: 'list' });
      const paintBoxes = (fs) => boxes.replaceChildren(...fs.map((f) => {
        const cb = h('input', { type: 'checkbox', id: 'fold-' + f.id, checked: post.bookmark?.folders.includes(f.id) });
        cb.addEventListener('change', async () => {
          if (!post.bookmark) post.bookmark = { at: Date.now(), folders: [] };
          const set = new Set(post.bookmark.folders);
          if (cb.checked) set.add(f.id); else set.delete(f.id);
          post.bookmark.folders = [...set];
          await save();
          paintTools();
        });
        return h('li', {}, h('label', { class: 'check-row', for: 'fold-' + f.id }, cb, icon('folder', 20), h('span', { text: f.name })));
      }));
      paintBoxes(list);
      const name = h('input', { class: 'input', id: 'new-folder', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'New folder name' });
      const form = h('form', { class: 'inline-field', onsubmit: async (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        const f = await addFolder(name.value);
        list.push(f);
        if (!post.bookmark) post.bookmark = { at: Date.now(), folders: [] };
        post.bookmark.folders.push(f.id);
        await save();
        name.value = '';
        paintBoxes(list);
        paintTools();
      } }, h('label', { class: 'visually-hidden', for: 'new-folder' }, 'New folder name'), name, h('button', { type: 'submit', class: 'btn btn-secondary' }, 'Add'));
      return h('div', { class: 'sheet-body' },
        list.length ? h('p', { class: 'hint', text: 'Folders' }) : h('p', { class: 'hint', text: 'No folders yet. It’s in All bookmarks; add a folder to sort it.' }),
        boxes,
        form,
        h('div', { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'btn btn-text btn-danger', onclick: async () => {
            post.bookmark = null;
            await save();
            paintTools();
            close();
            toast('Bookmark removed');
          } }, 'Remove bookmark'),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: close }, 'Done')));
    });
  }

  const bar = h('div', { class: 'article-bar' },
    backBtn,
    h('div', { class: 'article-tools' },
      tools.button,
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Share', onclick: () => sharePost(item) }, icon('share')),
      listBtn,
      markBtn),
    tools.panel);

  // ---------- text ----------
  const text = h('div', { class: 'prose' });
  if (body) text.innerHTML = body; // sanitized
  else text.appendChild(h('p', { text: item.excerpt }));

  const open = item.url
    ? h('a', { class: hasFull ? 'btn btn-secondary' : 'btn btn-primary', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
      'Open original', icon('external', 18))
    : null;

  // ---------- end of article ----------
  const listEnd = h('div', { class: 'end-block', hidden: true },
    h('p', { class: 'label', text: 'This is on your reading list.' }),
    h('p', { class: 'hint', text: 'It keeps coming back in your feed until you remove it.' }),
    h('button', { type: 'button', class: 'btn btn-secondary', onclick: async () => {
      post.list = null;
      await save();
      paintTools();
      toast('Removed from reading list');
    } }, 'Done, remove it'));

  const reactions = h('div', { class: 'reactions', role: 'group', 'aria-label': 'Your reaction' });
  const paintReactions = () => reactions.replaceChildren(...REACTIONS.map(([rid, label]) => h('button', {
    type: 'button', class: 'reaction', 'aria-pressed': String(post.reaction === rid),
    onclick: async () => { post.reaction = post.reaction === rid ? null : rid; await save(); paintReactions(); },
  }, reactionIcon(rid, 20), h('span', { text: label }))));
  paintReactions();

  const notesList = h('ul', { class: 'notes' });
  const paintNotes = () => notesList.replaceChildren(...post.notes.map((n) => h('li', { class: 'note' },
    avatarEl(profile, 32),
    h('div', { class: 'note-body' },
      h('p', { class: 'meta', text: [profile.name || 'You', relTime(n.at)].join(' · ') }),
      h('p', { class: 'note-text', text: n.text })),
    h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Delete note', onclick: async () => {
      post.notes = post.notes.filter((x) => x.id !== n.id);
      await save();
      paintNotes();
    } }, icon('trash', 18)))));
  paintNotes();
  const noteInput = h('textarea', { class: 'input textarea', id: 'note', rows: '2', maxlength: '2000' });
  const noteForm = h('form', { class: 'note-form', onsubmit: async (e) => {
    e.preventDefault();
    const t = noteInput.value.trim();
    if (!t) return;
    post.notes = [...post.notes, { id: 'n' + Date.now().toString(36), text: t, at: Date.now() }];
    await save();
    noteInput.value = '';
    paintNotes();
  } },
  h('label', { class: 'visually-hidden', for: 'note' }, 'Add a note'),
  avatarEl(profile, 32),
  noteInput,
  h('button', { type: 'submit', class: 'btn btn-secondary' }, 'Post'));

  main.append(
    bar,
    h('article', {},
      h('header', { class: 'article-head' },
        h('p', { class: 'meta', text: [item.sourceName, fmtDate(item.published) || relTime(item.published)].filter(Boolean).join(' · ') }),
        h('h1', { class: 'article-title', text: item.title }),
        item.audioUrl ? h('audio', { controls: true, preload: 'none', src: item.audioUrl }) : null),
      text,
      !hasFull && item.url ? h('p', { class: 'meta', style: 'margin-top: var(--s-5)', text: 'The full text isn’t in the feed.' }) : null,
      open ? h('div', { class: 'article-actions' }, open) : null,
      listEnd,
      h('section', { class: 'end-block', 'aria-labelledby': 'react-title' },
        h('h2', { class: 'section-title', id: 'react-title', text: 'Your reaction' }), reactions),
      h('section', { class: 'end-block', 'aria-labelledby': 'notes-title' },
        h('h2', { class: 'section-title', id: 'notes-title', text: 'Notes' }), notesList, noteForm)),
  );
  paintTools();

  // ---------- keep your place ----------
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (post.scroll > 0 && max > 0) window.scrollTo(0, post.scroll * max);
  });
  let scrollTimer = null;
  // Track your place as you scroll (not when leaving: the browser may already have moved).
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max > 0) post.scroll = Math.min(1, window.scrollY / max);
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(save, 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  const detachQuote = attachSaveQuote(text, () => ({ topic: item.topic, sourceName: item.sourceName, sourceTitle: item.title, url: item.url, postId: item.id }));
  return async () => {
    clearTimeout(scrollTimer);
    window.removeEventListener('scroll', onScroll);
    tools.detach();
    detachQuote();
    await save(); // finish before the next screen reads it
  };
}
