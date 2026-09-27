// Reading controls on articles and books: the "Aa" text-size popover, and a one-tap light/dark
// button beside it (a sun in light, a moon in dark). Both apply at once.
import { h, icon } from './ui.js';
import { textStep, textLabel, setTextStep, canGrow, canShrink, isDark, setTheme } from './prefs.js';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function readControls() {
  const btn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Text size', 'aria-expanded': 'false' }, icon('text'));
  const panel = h('div', { class: 'popover', role: 'group', 'aria-label': 'Text size', hidden: true });
  const theme = h('button', { type: 'button', class: 'btn-icon theme-toggle', 'aria-label': 'Dark theme', onclick: () => { setTheme(isDark() ? 'light' : 'dark'); paintTheme(); } });
  const paintTheme = () => {
    theme.replaceChildren(icon(isDark() ? 'moon' : 'sun'));
    theme.setAttribute('aria-pressed', String(isDark()));
  };
  paintTheme();
  const onSystem = () => setTimeout(paintTheme); // "Match phone" in Settings follows the phone
  darkQuery.addEventListener('change', onSystem);

  const size = h('span', { class: 'popover-value', 'aria-live': 'polite' });
  const smaller = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Smaller text', onclick: () => { setTextStep(textStep() - 1); paint(); } }, icon('minus', 20));
  const bigger = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Larger text', onclick: () => { setTextStep(textStep() + 1); paint(); } }, icon('plus', 20));

  panel.append(
    h('div', { class: 'popover-row' }, h('span', { class: 'label', text: 'Text size' }), h('span', { class: 'stepper' }, smaller, size, bigger)));

  function paint() {
    size.textContent = textLabel();
    smaller.disabled = !canShrink();
    bigger.disabled = !canGrow();
  }
  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) paint();
  }
  btn.addEventListener('click', () => toggle());
  const outside = (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) toggle(false); };
  const esc = (e) => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', esc);

  return {
    button: btn,
    theme,
    panel,
    detach() {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
      darkQuery.removeEventListener('change', onSystem);
    },
  };
}
