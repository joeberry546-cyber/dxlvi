// Reflection: a short, optional evening review on the daily log.
// Three lines saved with the day. Deliberately kept out of streaks, highlights and the calendar.
import { h, mediumDate } from './util.js';
import { state, entryFor, markDirty, hasReflection } from './core.js';
import { REFLECT_PROMPTS, pickResurfaced } from './fields.js';

// Remembers whether the section is open for the day on screen, so it stays put if the page redraws.
const view = { date: null, open: false };

function resurfacedCard(pick) {
  const r = state.entries[pick.date]?.reflection;
  if (!r) return null;
  return h('aside', { class: 'resurfaced', 'aria-label': 'A past reflection' },
    h('div', { class: 'when' }, pick.kind === 'month' ? `About a month ago · ${mediumDate(pick.date)}` : `Looking back · ${mediumDate(pick.date)}`),
    h('dl', null, REFLECT_PROMPTS.filter(([k]) => r[k]).map(([k, label]) => [h('dt', null, label.replace(' today', '')), h('dd', null, r[k])])),
    h('a', { href: `#/log/${pick.date}` }, 'Open that day'));
}

export function reflectionCard(date) {
  const E = () => entryFor(date);
  const dates = () => Object.keys(state.entries).filter((d) => hasReflection(state.entries[d])).sort();
  const meta = h('span', { class: 'meta' });
  const paintMeta = () => { const n = dates().length; meta.textContent = n ? `${n} so far` : 'Optional'; };

  const inputs = {};
  const sync = () => {
    E().reflection = Object.fromEntries(REFLECT_PROMPTS.map(([k]) => [k, inputs[k].value]));
    markDirty(date);
    paintMeta();
  };
  const fields = REFLECT_PROMPTS.map(([k, label, placeholder]) => {
    inputs[k] = h('input', { type: 'text', id: `reflect-${k}`, maxlength: '300', placeholder, autocomplete: 'off', enterkeyhint: k === 'gap' ? 'done' : 'next', value: E().reflection?.[k] ?? '', oninput: sync });
    return h('label', { class: 'field', for: `reflect-${k}` }, label, inputs[k]);
  });
  // Enter moves to the next line, and closes the keyboard on the last one.
  REFLECT_PROMPTS.forEach(([k], i) => inputs[k].addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const next = REFLECT_PROMPTS[i + 1];
    if (next) inputs[next[0]].focus(); else inputs[k].blur();
  }));

  const pick = pickResurfaced(dates(), date);
  if (view.date !== date) { view.date = date; view.open = false; }
  const box = h('details', { class: 'card reflect', open: view.open ? true : null },
    h('summary', null, h('h2', null, 'Reflection'), meta),
    h('div', { class: 'reflect-body' }, pick ? resurfacedCard(pick) : null, fields));
  box.addEventListener('toggle', () => { view.open = box.open; });
  paintMeta();
  return box;
}
