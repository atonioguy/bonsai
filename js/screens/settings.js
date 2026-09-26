import * as db from '../db.js';
import { h, toast } from '../ui.js';
import { VERSION, themeChoice, setTheme } from '../app.js';

export async function render(main, app) {
  const s = app.settings;

  const field = (id, label, input, hint) => h('div', { class: 'field' },
    h('label', { for: id }, label), input, hint ? h('p', { class: 'hint', id: id + '-hint', text: hint }) : null);

  const feedUrl = h('input', { class: 'input', id: 'feed-url', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', value: s.feedUrl, placeholder: 'https://bonsai-feeds.you.workers.dev', 'aria-describedby': 'feed-url-hint' });
  const sqUrl = h('input', { class: 'input', id: 'sq-url', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', value: s.sqUrl, placeholder: 'https://aquamarine-data.you.workers.dev', 'aria-describedby': 'sq-url-hint' });
  const sqKey = h('input', { class: 'input', id: 'sq-key', type: 'password', autocomplete: 'off', value: s.sqKey });

  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    app.settings = await db.saveSettings({
      feedUrl: feedUrl.value.trim().replace(/\/+$/, ''),
      sqUrl: sqUrl.value.trim().replace(/\/+$/, ''),
      sqKey: sqKey.value.trim(),
    });
    toast('Settings saved');
  } },
  h('section', { class: 'fieldset', 'aria-labelledby': 'set-feed' },
    h('h2', { class: 'section-title', id: 'set-feed', text: 'Feed' }),
    field('feed-url', 'Feed server URL', feedUrl, 'The address of your bonsai-feeds worker.')),
  h('section', { class: 'fieldset', 'aria-labelledby': 'set-sq' },
    h('h2', { class: 'section-title', id: 'set-sq', text: 'Side Quest' }),
    field('sq-url', 'Worker URL', sqUrl, 'Side Quest’s aquamarine-data worker. Finished sessions are logged there as TickTick focus sessions.'),
    field('sq-key', 'Key', sqKey, 'The same AQ_KEY Side Quest uses. It stays on this device.')),
  h('div', {}, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')));

  // ---------- appearance (applies at once, stored on this device) ----------
  const theme = h('select', { class: 'input', id: 'theme' },
    [['system', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) => h('option', { value: v, selected: themeChoice() === v }, label)));
  theme.addEventListener('change', () => setTheme(theme.value));
  const appearance = h('section', { class: 'fieldset section', 'aria-labelledby': 'set-look' },
    h('h2', { class: 'section-title', id: 'set-look', text: 'Appearance' }),
    field('theme', 'Theme', theme));

  // ---------- backup ----------
  const importInput = h('input', { class: 'file-input', id: 'import', type: 'file', accept: 'application/json,.json' });
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'bonsai') throw new Error('Not a Bonsai backup');
      if (!confirm('Replace saved quotes, reading progress and settings with this backup?')) return;
      for (const store of ['saved', 'progress', 'sessions']) {
        await db.clear(store);
        for (const [k, v] of Object.entries(data[store] || {})) await db.put(store, k, v);
      }
      if (data.settings) app.settings = await db.saveSettings({ ...data.settings, sqKey: data.settings.sqKey || app.settings.sqKey });
      toast('Backup restored');
      main.replaceChildren();
      render(main, app);
    } catch (e) {
      toast('Couldn’t restore: ' + e.message);
    }
    importInput.value = '';
  });

  const backup = h('section', { class: 'section', 'aria-labelledby': 'set-backup' },
    h('h2', { class: 'section-title', id: 'set-backup', text: 'Backup' }),
    h('p', { class: 'hint', style: 'margin-bottom: var(--s-4)', text: 'Everything is stored on this device. A backup has your saved quotes, reading progress and settings. It leaves out books and the Side Quest key.' }),
    h('div', { style: 'display: flex; flex-wrap: wrap; gap: var(--s-3)' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: exportBackup }, 'Export'),
      importInput,
      h('label', { for: 'import', class: 'btn btn-secondary' }, 'Import')));

  main.append(
    h('h1', { class: 'screen-title', text: 'Settings' }),
    appearance,
    h('div', { class: 'section' }, form),
    backup,
    h('p', { class: 'meta section', text: 'Bonsai ' + VERSION }));
}

async function exportBackup() {
  const dump = async (store) => {
    const db2 = await new Promise((res, rej) => { const r = indexedDB.open('bonsai'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return new Promise((res, rej) => {
      const out = {};
      const req = db2.transaction(store).objectStore(store).openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      req.onerror = () => rej(req.error);
    });
  };
  const data = {
    app: 'bonsai', version: 1, exportedAt: new Date().toISOString(),
    settings: { ...(await db.settings()), sqKey: '' }, // the Side Quest key is never written to a file
    saved: await dump('saved'), progress: await dump('progress'), sessions: await dump('sessions'),
    bookIndex: await db.get('kv', 'bookIndex'),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'bonsai-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
