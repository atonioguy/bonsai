// Small DOM helpers, icons and shared pieces (toast, ensō ring, tree).

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only ever sanitized or static markup
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(markup, attrs = {}) {
  const wrap = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', ...attrs })) wrap.setAttribute(k, v);
  wrap.innerHTML = markup;
  return wrap;
}

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  back: `<path ${STROKE} d="M15 5l-7 7 7 7"/>`,
  feed: `<path ${STROKE} d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path ${STROKE} d="M5 19l8-8"/>`,
  library: `<path ${STROKE} d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path ${STROKE} d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>`,
  saved: `<path ${STROKE} d="M12 20v-7"/><path ${STROKE} d="M8 20h8"/><circle ${STROKE} cx="12" cy="8.5" r="4"/><circle ${STROKE} cx="6.5" cy="12" r="2.5"/><circle ${STROKE} cx="17.5" cy="11" r="2.5"/>`,
  settings: `<path ${STROKE} d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle ${STROKE} cx="16" cy="7" r="2"/><circle ${STROKE} cx="10" cy="17" r="2"/>`,
  trash: `<path ${STROKE} d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>`,
  external: `<path ${STROKE} d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/>`,
  clock: `<circle ${STROKE} cx="12" cy="12" r="8"/><path ${STROKE} d="M12 8v4l3 2"/>`,
  share: `<path ${STROKE} d="M12 15V4M8 8l4-4 4 4"/><path ${STROKE} d="M6 12v7h12v-7"/>`,
  bookmark: `<path ${STROKE} d="M7 4h10v16l-5-4-5 4z"/>`,
  bookmarked: `<path fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M7 4h10v16l-5-4-5 4z"/>`,
  listAdd: `<path ${STROKE} d="M4 7h10M4 12h10M4 17h6M18 14v6M15 17h6"/>`,
  listed: `<path ${STROKE} d="M4 7h10M4 12h10M4 17h6M15 17l2 2 4-4"/>`,
  text: `<path ${STROKE} d="M4 18l4-11 4 11M5.5 14h5M14 18l3-7 3 7M15 16h4"/>`,
  close: `<path ${STROKE} d="M6 6l12 12M18 6L6 18"/>`,
  plus: `<path ${STROKE} d="M12 5v14M5 12h14"/>`,
  minus: `<path ${STROKE} d="M5 12h14"/>`,
  folder: `<path ${STROKE} d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>`,
  chevron: `<path ${STROKE} d="M9 5l7 7-7 7"/>`,
  play: `<path fill="currentColor" d="M8 5l11 7-11 7z"/>`,
  check: `<path ${STROKE} d="M5 12l5 5 9-10"/>`,
  unread: `<circle ${STROKE} cx="12" cy="12" r="8"/><circle fill="currentColor" cx="12" cy="12" r="3.5"/>`,
  hide: `<path ${STROKE} d="M4 12s3-6 8-6c1.6 0 3 .5 4.2 1.3M20 12s-3 6-8 6c-1.6 0-3-.5-4.2-1.3"/><path ${STROKE} d="M5 19L19 5"/>`,
  arrowDown: `<path ${STROKE} d="M12 5v14M6 13l6 6 6-6"/>`,
  arrowUp: `<path ${STROKE} d="M12 19V5M6 11l6-6 6 6"/>`,
};

// Reactions: private, one per article, drawn in the bonsai world (no emoji).
export const REACTIONS = [
  ['learned', 'Learned something', `<path ${STROKE} d="M12 20v-8"/><path ${STROKE} d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6z"/><path ${STROKE} d="M12 10c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z"/>`],
  ['think', 'Made me think', `<path ${STROKE} d="M9 3h6M12 3v2"/><rect ${STROKE} x="7" y="5" width="10" height="13" rx="4"/><path ${STROKE} d="M12 9v5M10 21h4"/>`],
  ['loved', 'Loved it', `<path ${STROKE} d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path ${STROKE} d="M12 9.5v7"/>`],
  ['calm', 'Grounding', `<ellipse ${STROKE} cx="12" cy="18" rx="7" ry="2.5"/><ellipse ${STROKE} cx="12" cy="12.5" rx="5" ry="2.2"/><ellipse ${STROKE} cx="12" cy="7.5" rx="3" ry="1.8"/>`],
  ['more', 'More like this', `<path ${STROKE} d="M5 20c7 0 11-4 11-11V4"/><path ${STROKE} d="M16 9c2.5 0 4-1.5 4-4"/><path ${STROKE} d="M9 17c-2.5 0-4-1.5-4-4"/>`],
];
export const reactionIcon = (id, size = 22) => {
  const r = REACTIONS.find((x) => x[0] === id);
  return r ? svg(r[2], { width: size, height: size, class: 'icon' }) : null;
};

// Avatars: a few drawn ones, or your own photo (a small data URL kept on this device).
export const AVATARS = {
  bonsai: `<g transform="translate(8 7) scale(.4)">${'__TREE__'}</g>`,
  sprout: `<path d="M32 46V32" stroke="var(--bark)" stroke-width="3" stroke-linecap="round"/><path d="M32 33c0-7-5-11-12-11 0 7 5 11 12 11z" fill="var(--sage)"/><path d="M32 30c0-6 4-9 10-9 0 6-4 9-10 9z" fill="var(--sage)" opacity=".8"/>`,
  pine: `<path d="M32 14l12 18h-7l9 12H18l9-12h-7z" fill="var(--sage)"/><rect x="30" y="44" width="4" height="6" fill="var(--bark)"/>`,
  stones: `<ellipse cx="32" cy="45" rx="14" ry="5" fill="var(--clay)"/><ellipse cx="32" cy="35" rx="10" ry="4.5" fill="var(--clay-dark)"/><ellipse cx="32" cy="26" rx="6" ry="3.5" fill="var(--bark)"/>`,
  moon: `<path d="M38 16a17 17 0 1 0 10 28A14 14 0 0 1 38 16z" fill="var(--clay)"/>`,
  leaf: `<path d="M18 46c0-18 12-28 30-28 0 18-12 28-30 28z" fill="var(--sage)"/><path d="M18 46l18-18" stroke="var(--bark)" stroke-width="2.5" stroke-linecap="round"/>`,
};

export function avatarEl(profile, size = 40) {
  const wrap = h('span', { class: 'avatar', style: `width: ${size}px; height: ${size}px`, 'aria-hidden': 'true' });
  if (profile?.photo) wrap.appendChild(h('img', { src: profile.photo, alt: '' }));
  else {
    const key = AVATARS[profile?.avatar] ? profile.avatar : 'bonsai';
    wrap.appendChild(svg(AVATARS[key].replace('__TREE__', TREE_MARK), { viewBox: '0 0 64 64', width: size, height: size }));
  }
  return wrap;
}

// ---------- sheet (bottom sheet on phones, centered panel on desktop) ----------
export function openSheet(title, build) {
  const dlg = h('dialog', { class: 'sheet', 'aria-label': title });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', text: title }),
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Close', onclick: close }, icon('close'))),
    build(close));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  return dlg;
}

// ---------- share ----------
export async function sharePost(item) {
  const url = item.url || item.audioUrl;
  if (!url) { toast('This one has no link to share'); return; }
  const data = { title: item.title, url };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Couldn’t copy the link'); }
}
export const icon = (name, size = 24) => svg(ICONS[name], { width: size, height: size, class: 'icon' });

// The ensō progress ring. `p` 0…1.
export function enso(p, size = 36, { track = 'var(--surface-warm)' } = {}) {
  const el = svg(
    `<circle cx="20" cy="20" r="15" fill="none" stroke="${track}" stroke-width="4"/>` +
    `<circle class="enso-arc" cx="20" cy="20" r="15" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" transform="rotate(-90 20 20)"/>`,
    { viewBox: '0 0 40 40', width: size, height: size, class: 'enso' },
  );
  setEnso(el, p);
  return el;
}

export function setEnso(el, p) {
  const arc = el.querySelector('.enso-arc');
  const c = 2 * Math.PI * 15;
  const f = Math.max(0, Math.min(1, p));
  arc.setAttribute('stroke-dasharray', `${(f * c).toFixed(2)} ${c.toFixed(2)}`);
  arc.style.opacity = f < 0.01 ? '0' : '1'; // a round cap on a zero-length arc draws a stray dot
}

// The small bonsai mark (header, session complete).
export const TREE_MARK = `
  <ellipse cx="62" cy="34" rx="24" ry="13" fill="var(--sage)"/>
  <ellipse cx="32" cy="55" rx="17" ry="9" fill="var(--sage)" opacity=".85"/>
  <ellipse cx="88" cy="42" rx="18" ry="10" fill="var(--sage)" opacity=".85"/>
  <path d="M60 94C58 80 50 74 54 63C57 55 66 52 63 42" stroke="var(--bark)" stroke-width="7" fill="none" stroke-linecap="round"/>
  <path d="M55 66C46 62 40 60 34 56" stroke="var(--bark)" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M62 50C70 47 78 46 86 43" stroke="var(--bark)" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="28" y="93" width="64" height="7" rx="3" fill="var(--clay-dark)"/>
  <path d="M34 100H86L80 112H40Z" fill="var(--clay)"/>`;
export const treeMark = (size = 28) => svg(TREE_MARK, { viewBox: '0 0 120 120', width: size, height: size, class: 'tree-mark' });

// ---------- toast ----------
let toastTimer = null;
export function toast(message, action) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(el);
  }
  el.replaceChildren(h('span', { text: message }));
  if (action) {
    el.appendChild(h('button', { type: 'button', class: 'btn-text', onclick: () => { action.run(); hide(); } }, action.label));
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 5000 : 2500);
  function hide() { el.classList.remove('show'); }
}

// ---------- misc ----------
export const TOPIC_NAMES = {
  mind: 'Mind', trans: 'Trans health', 'queer-history': 'Queer history', 'tech-society': 'Tech & society', tao: 'Tao',
};

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
