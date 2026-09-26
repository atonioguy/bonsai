// Per-device display preferences (theme, text size). Kept in localStorage so index.html can
// apply them before first paint; everything still works if storage is unavailable.

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const TEXT_STEPS = [0.9, 1, 1.12, 1.25, 1.4];

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: this visit only */ } };

// ---------- theme ----------
export const themeChoice = () => read('bonsai-theme', 'system');
export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function setTheme(choice) {
  write('bonsai-theme', choice);
  applyTheme(choice);
}

export function applyTheme(choice = themeChoice()) {
  const dark = choice === 'dark' || (choice === 'system' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1D1A17' : '#F5F0E7');
}
darkQuery.addEventListener('change', () => applyTheme());

// ---------- reading text size ----------
export const textStep = () => {
  const i = Number(read('bonsai-text', 1));
  return Number.isInteger(i) && i >= 0 && i < TEXT_STEPS.length ? i : 1;
};
export const textLabel = (i = textStep()) => Math.round(TEXT_STEPS[i] * 100) + '%';
export const canGrow = (i = textStep()) => i < TEXT_STEPS.length - 1;
export const canShrink = (i = textStep()) => i > 0;

export function setTextStep(i) {
  const next = Math.max(0, Math.min(TEXT_STEPS.length - 1, i));
  write('bonsai-text', String(next));
  applyText(next);
  return next;
}

export function applyText(i = textStep()) {
  document.documentElement.style.setProperty('--read-scale', String(TEXT_STEPS[i]));
}
