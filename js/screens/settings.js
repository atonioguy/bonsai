import * as db from '../db.js';
import { h, toast, avatarEl, AVATARS } from '../ui.js';
import { VERSION } from '../app.js';
import { themeChoice, setTheme } from '../prefs.js';
import { autoplayOn } from '../shorts.js';

export async function render(main, app) {
  const s = app.settings;

  const field = (id, label, input, hint) => h('div', { class: 'field' },
    h('label', { for: id }, label), input, hint ? h('p', { class: 'hint', id: id + '-hint', text: hint }) : null);

  const feedUrl = h('input', { class: 'input', id: 'feed-url', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', value: s.feedUrl, placeholder: 'https://bonsai-feeds.you.workers.dev', 'aria-describedby': 'feed-url-hint' });
  const sqUrl = h('input', { class: 'input', id: 'sq-url', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', value: s.sqUrl, placeholder: 'https://aquamarine-data.you.workers.dev', 'aria-describedby': 'sq-url-hint' });
  const sqKey = h('input', { class: 'input', id: 'sq-key', type: 'password', autocomplete: 'off', value: s.sqKey });

  const newsInFeed = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id: 'news-in-feed', checked: Boolean(s.newsInFeed) });
  newsInFeed.addEventListener('change', async () => { app.settings = await db.saveSettings({ newsInFeed: newsInFeed.checked }); });
  const autoplay = h('input', { type: 'checkbox', role: 'switch', class: 'switch', id: 'autoplay-shorts', checked: autoplayOn(s) });
  autoplay.addEventListener('change', async () => { app.settings = await db.saveSettings({ autoplayShorts: autoplay.checked }); });
  const libraryId = h('input', { class: 'input', id: 'library-id', type: 'text', inputmode: 'numeric', autocomplete: 'off', value: s.libraryId || '', 'aria-describedby': 'library-id-hint' });

  const form = h('form', { class: 'form', onsubmit: async (e) => {
    e.preventDefault();
    app.settings = await db.saveSettings({
      feedUrl: feedUrl.value.trim().replace(/\/+$/, ''),
      sqUrl: sqUrl.value.trim().replace(/\/+$/, ''),
      sqKey: sqKey.value.trim(),
      libraryId: libraryId.value.trim().replace(/\D/g, ''),
    });
    toast('Settings saved');
  } },
  h('section', { class: 'fieldset', 'aria-labelledby': 'set-feed' },
    h('h2', { class: 'section-title', id: 'set-feed', text: 'Feed' }),
    field('feed-url', 'Feed server URL', feedUrl, 'The address of your bonsai-feeds worker.'),
    h('div', { class: 'row' },
      h('label', { class: 'row-main', for: 'news-in-feed' },
        h('span', { class: 'label', text: 'News in the main feed' }),
        h('span', { class: 'hint', text: 'Off: news shows only in Today’s brief and the News tab.' })),
      newsInFeed),
    h('div', { class: 'row' },
      h('label', { class: 'row-main', for: 'autoplay-shorts' },
        h('span', { class: 'label', text: 'Autoplay Shorts' }),
        h('span', { class: 'hint', text: 'Shorts play muted as you scroll. Off: tap a Short to play it.' })),
      autoplay)),
  h('section', { class: 'fieldset', 'aria-labelledby': 'set-library' },
    h('h2', { class: 'section-title', id: 'set-library', text: 'Library access' }),
    field('library-id', 'LibKey library ID', libraryId, 'The number in your library’s LibKey links (libkey.io/libraries/NUMBER/…). Used for papers that aren’t open access.')),
  h('section', { class: 'fieldset', 'aria-labelledby': 'set-sq' },
    h('h2', { class: 'section-title', id: 'set-sq', text: 'Side Quest' }),
    field('sq-url', 'Worker URL', sqUrl, 'Side Quest’s aquamarine-data worker. Finished sessions are logged there as TickTick focus sessions.'),
    field('sq-key', 'Key', sqKey, 'The same AQ_KEY Side Quest uses. It stays on this device.')),
  h('div', {}, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')));

  // ---------- profile: your name and avatar on notes (only on this device) ----------
  let profile = (await db.get('kv', 'profile')) || {};
  const saveProfile = async (patch) => { profile = { ...profile, ...patch }; await db.put('kv', 'profile', profile); paintAvatars(); };
  const name = h('input', { class: 'input', id: 'profile-name', type: 'text', maxlength: '40', autocomplete: 'nickname', value: profile.name || '' });
  name.addEventListener('change', () => saveProfile({ name: name.value.trim() }));
  const avatars = h('div', { class: 'avatar-grid', role: 'group', 'aria-label': 'Avatar' });
  const photoInput = h('input', { class: 'file-input', id: 'photo', type: 'file', accept: 'image/*' });
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    try { await saveProfile({ photo: await squarePhoto(file, 160) }); } catch { toast('Couldn’t use that photo'); }
    photoInput.value = '';
  });
  function paintAvatars() {
    avatars.replaceChildren(...Object.keys(AVATARS).map((key) => h('button', {
      type: 'button', class: 'avatar-choice', 'aria-label': 'Avatar: ' + key,
      'aria-pressed': String(!profile.photo && (profile.avatar || 'bonsai') === key),
      onclick: () => saveProfile({ avatar: key, photo: null }),
    }, avatarEl({ avatar: key }, 40))),
    ...(profile.photo ? [h('button', { type: 'button', class: 'avatar-choice', 'aria-label': 'Avatar: your photo', 'aria-pressed': 'true' }, avatarEl(profile, 40))] : []));
  }
  paintAvatars();
  const profileSec = h('section', { class: 'fieldset section', 'aria-labelledby': 'set-profile' },
    h('h2', { class: 'section-title', id: 'set-profile', text: 'Profile' }),
    field('profile-name', 'Name', name, 'Shown on your notes. Stays on this device.'),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Avatar' }), avatars,
      h('div', {}, photoInput, h('label', { for: 'photo', class: 'btn btn-secondary' }, 'Use a photo'))));

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
      for (const store of ['saved', 'progress', 'sessions', 'posts']) {
        await db.clear(store);
        for (const [k, v] of Object.entries(data[store] || {})) await db.put(store, k, v);
      }
      for (const k of ['folders', 'opened', 'profile']) if (data[k]) await db.put('kv', k, data[k]);
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
    h('p', { class: 'hint', style: 'margin-bottom: var(--s-4)', text: 'Everything is stored on this device. A backup has your bookmarks, reading list, notes, quotes, reading progress and settings. It leaves out books and the Side Quest key.' }),
    h('div', { style: 'display: flex; flex-wrap: wrap; gap: var(--s-3)' },
      h('button', { type: 'button', class: 'btn btn-secondary', onclick: exportBackup }, 'Export'),
      importInput,
      h('label', { for: 'import', class: 'btn btn-secondary' }, 'Import')));

  main.append(
    h('h1', { class: 'screen-title', text: 'Settings' }),
    profileSec,
    h('div', { class: 'section' }, appearance),
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
    posts: await dump('posts'),
    folders: await db.get('kv', 'folders'), opened: await db.get('kv', 'opened'), profile: await db.get('kv', 'profile'),
    bookIndex: await db.get('kv', 'bookIndex'),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'bonsai-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// A centered square crop, scaled down, as a small JPEG data URL.
async function squarePhoto(file, size) {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.85);
}
