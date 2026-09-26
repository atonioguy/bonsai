import * as db from '../db.js';
import { h, icon, toast } from '../ui.js';
import { serverHealth, relTime } from '../logic.js';
import { bookIndex, addBook, removeBook, progress, fraction, percent } from '../books.js';

export async function render(main, app) {
  const s = app.settings;
  const index = await bookIndex();
  const feed = await db.get('kv', 'feed');
  const status = new Map((feed?.status || []).map((x) => [x.id, x]));

  // ---------- books ----------
  const fileInput = h('input', { class: 'file-input', id: 'add-book', type: 'file', accept: '.epub,application/epub+zip' });
  const addLabel = h('label', { for: 'add-book', class: index.length ? 'btn btn-secondary' : 'btn btn-primary' }, 'Add book');
  const adding = h('p', { class: 'meta', role: 'status' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    adding.textContent = 'Adding ' + file.name + '…';
    try {
      const meta = await addBook(file);
      adding.textContent = '';
      toast('Added ' + meta.title);
      render.again(main, app);
    } catch (e) {
      adding.textContent = 'Couldn’t read that file. ' + (e.message || '') + ' Use an EPUB file.';
      adding.className = 'meta warn';
    }
    fileInput.value = '';
  });

  const bookRows = await Promise.all(index.map(async (m) => {
    const f = fraction(m, await progress(m.id));
    const topicSel = h('select', { class: 'input input-compact', id: 'topic-' + m.id },
      h('option', { value: '' }, 'No topic'),
      app.config.topics.map((t) => h('option', { value: t.id, selected: m.topic === t.id }, t.name)));
    const removeBtn = removeButton(m);
    topicSel.addEventListener('change', async () => {
      const list = await bookIndex();
      await db.put('kv', 'bookIndex', list.map((b) => (b.id === m.id ? { ...b, topic: topicSel.value } : b)));
    });
    return h('li', { class: 'book-row' },
      h('div', { class: 'row' },
        h('a', { class: 'row-main', href: '#/read/' + m.id + '/free' },
          h('span', { class: 'row-title', text: m.title }),
          h('span', { class: 'meta', text: [m.author, percent(f) + ' read'].filter(Boolean).join(' · ') })),
        removeBtn),
      h('div', { class: 'row-sub' },
        h('label', { class: 'meta', for: 'topic-' + m.id }, 'Topic'),
        topicSel));
  }));

  function removeButton(m) {
    return h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Remove ' + m.title, onclick: async () => {
        if (!confirm('Remove “' + m.title + '” and its reading progress?')) return;
        await removeBook(m.id);
        render.again(main, app);
      } }, icon('trash', 20));
  }

  const free = (app.config.books || []).filter((b) => !index.some((m) => m.title.toLowerCase().includes(b.title.toLowerCase().split(' ')[0])));

  const books = h('section', { class: 'section', 'aria-labelledby': 'books-title' },
    h('h2', { class: 'section-title', id: 'books-title', text: 'Books' }),
    index.length ? h('ul', { class: 'list' }, bookRows) : h('p', { class: 'lead', text: 'No books yet. Add an EPUB file to read it in 15-minute sessions.' }),
    h('div', { style: 'margin-top: var(--s-4); display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-2)' }, fileInput, addLabel, adding),
    free.length ? h('div', { style: 'margin-top: var(--s-5)' },
      h('p', { class: 'meta', text: 'Free EPUBs to start with:' }),
      h('ul', { class: 'list' }, free.map((b) => h('li', { class: 'row' },
        h('a', { class: 'row-main', href: b.source, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { text: b.title }),
          h('span', { class: 'meta', text: [b.translator ? 'tr. ' + b.translator : b.author, 'Project Gutenberg'].filter(Boolean).join(' · ') })),
        icon('external', 18))))) : null);

  // ---------- sources ----------
  const muted = new Set(s.muted);
  // One folding group per topic; the summary says how many sources and whether any need attention.
  const groups = app.config.topics.map((t) => {
    let problems = 0;
    const srcs = app.config.sources.filter((x) => x.topic === t.id);
    const rows = srcs.map((src) => {
      const st = status.get(src.id);
      const note = !src.feed ? 'No feed link yet' : !feed ? '' : !st ? 'Not loaded yet' : !st.ok ? 'Not loading' + (st.error ? ' (' + st.error + ')' : '') : '';
      if (note.startsWith('Not loading')) problems++;
      const label = h('label', { class: 'row-main', for: 'src-' + src.id },
        h('span', { text: src.name }),
        note ? h('span', { class: 'meta' + (note.startsWith('Not loading') ? ' warn' : ''), text: note }) : null);
      if (!src.feed) return h('li', { class: 'row' }, h('div', { class: 'row-main' }, ...label.childNodes)); // nothing to switch yet
      const sw = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id: 'src-' + src.id, checked: !muted.has(src.id) });
      sw.addEventListener('change', async () => {
        if (sw.checked) muted.delete(src.id); else muted.add(src.id);
        app.settings = await db.saveSettings({ muted: [...muted] });
      });
      return h('li', { class: 'row' }, label, sw);
    });
    const summary = [srcs.length + (srcs.length === 1 ? ' source' : ' sources'), problems ? problems + ' not loading' : null].filter(Boolean).join(' · ');
    return h('details', { class: 'topic-group', open: problems > 0 },
      h('summary', {}, h('span', { class: 'label', text: t.name }), h('span', { class: 'meta' + (problems ? ' warn' : ''), text: summary })),
      h('ul', { class: 'list' }, rows));
  });

  const sources = h('section', { class: 'section', 'aria-labelledby': 'sources-title' },
    h('h2', { class: 'section-title', id: 'sources-title', text: 'Sources' }),
    h('p', { class: 'hint', style: 'margin-bottom: var(--s-4)', text: 'Switch a source off to hide it from the feed.' }),
    serverLine(feed, app),
    groups);

  main.append(h('h1', { class: 'screen-title', text: 'Library' }), books, sources);
}

render.again = (main, app) => { main.replaceChildren(); return render(main, app); };

// One line about the feed server; if its schedule has stopped, say how to fix it.
function serverLine(feed, app) {
  if (!feed) return null;
  const health = serverHealth(feed.status, app.config.sources.filter((x) => x.feed).length);
  const last = health.newest ? 'last updated a source ' + relTime(health.newest) : 'hasn’t updated yet';
  if (!health.stalled) {
    return h('p', { class: 'meta', style: 'margin-bottom: var(--s-4)', text: `Feed server: ${health.loaded} of ${health.expected} sources loaded, ${last}.` });
  }
  return h('div', { class: 'fail-block', style: 'margin-bottom: var(--s-5)', role: 'status' },
    h('p', { class: 'label warn', text: `Feed server: ${health.loaded} of ${health.expected} sources loaded, ${last}.` }),
    h('p', { class: 'hint', text: 'Its schedule doesn’t seem to be running. In Cloudflare, open bonsai-feeds → Settings → Trigger events and check there’s a Cron Trigger set to */5 * * * *. Until then, Bonsai loads sources while the app is open.' }));
}
