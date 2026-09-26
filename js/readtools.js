// The "Aa" control on articles and books: text size and light/dark, applied at once.
import { h, icon } from './ui.js';
import { textStep, textLabel, setTextStep, canGrow, canShrink, isDark, setTheme } from './prefs.js';

export function readControls() {
  const btn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Text and theme', 'aria-expanded': 'false' }, icon('text'));
  const panel = h('div', { class: 'popover', role: 'group', 'aria-label': 'Text and theme', hidden: true });

  const size = h('span', { class: 'popover-value', 'aria-live': 'polite' });
  const smaller = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Smaller text', onclick: () => { setTextStep(textStep() - 1); paint(); } }, icon('minus', 20));
  const bigger = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Larger text', onclick: () => { setTextStep(textStep() + 1); paint(); } }, icon('plus', 20));
  const light = h('button', { type: 'button', onclick: () => { setTheme('light'); paint(); } }, 'Light');
  const dark = h('button', { type: 'button', onclick: () => { setTheme('dark'); paint(); } }, 'Dark');

  panel.append(
    h('div', { class: 'popover-row' }, h('span', { class: 'label', text: 'Text size' }), h('span', { class: 'stepper' }, smaller, size, bigger)),
    h('div', { class: 'popover-row' }, h('span', { class: 'label', text: 'Theme' }), h('div', { class: 'segmented', role: 'group', 'aria-label': 'Theme' }, light, dark)));

  function paint() {
    size.textContent = textLabel();
    smaller.disabled = !canShrink();
    bigger.disabled = !canGrow();
    light.setAttribute('aria-pressed', String(!isDark()));
    dark.setAttribute('aria-pressed', String(isDark()));
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
    panel,
    detach() { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); },
  };
}
