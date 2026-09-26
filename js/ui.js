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
};
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
