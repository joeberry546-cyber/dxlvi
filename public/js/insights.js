// Streaks, highlights and the activity calendar. No red or green meanings anywhere.
import { h, todayStr, addDays, utcDay, fmtDate, mediumDate, monthName, fmt1 } from './util.js';
import { state, hasData, waterTotal, weightSeries } from './core.js';
import { BELLY_KEY } from './fields.js';

const moved = (e) => Boolean(e && (e.strength?.done || e.cardio?.min || e.flex?.min || e.cardio || e.flex));
const meditated = (e) => Boolean(e && (e.meditationAm?.min || e.meditationPm?.min));
const watered = (e) => {
  if (!e?.water) return false;
  const goal = state.settings.waterTargetOz;
  return goal ? waterTotal(e) >= goal : true;
};

export const STREAKS = [
  { key: 'log', label: 'Logging', unit: 'days', test: (e) => hasData(e) },
  { key: 'move', label: 'Moving', unit: 'days', test: moved },
  { key: 'med', label: 'Meditating', unit: 'days', test: meditated },
  { key: 'water', label: 'Water', unit: 'days', test: watered },
];

// current = run of days ending today (or yesterday, so today can still be filled in); best = longest run ever.
export function streak(test) {
  const days = Object.keys(state.entries).filter((d) => test(state.entries[d])).sort();
  if (!days.length) return { current: 0, best: 0, bestEnd: null };
  const set = new Set(days);
  let best = 0, bestEnd = null, run = 0, prev = null;
  for (const d of days) {
    run = prev && utcDay(d) - utcDay(prev) === 1 ? run + 1 : 1;
    if (run >= best) { best = run; bestEnd = d; }
    prev = d;
  }
  const today = todayStr();
  let cur = 0, d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) { cur++; d = addDays(d, -1); }
  return { current: cur, best, bestEnd };
}

export function streakTiles() {
  return STREAKS.map((st) => {
    const r = streak(st.test);
    return h('div', { class: 'tile streak' },
      h('div', { class: 'k' }, st.label),
      h('div', { class: 'v' }, String(r.current), h('small', null, r.current === 1 ? 'day' : 'days')),
      h('div', { class: 'n' }, r.best > r.current ? `Best: ${r.best} ${r.best === 1 ? 'day' : 'days'}` : r.current ? 'Your best so far' : 'Start one today'));
  });
}

function monthlyAverages(series) {
  const by = new Map();
  for (const p of series.filter((x) => !x.flag)) {
    const ym = p.d.slice(0, 7);
    (by.get(ym) || by.set(ym, []).get(ym)).push(p.v);
  }
  return [...by].map(([ym, v]) => ({ ym, v: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })).sort((a, b) => a.ym.localeCompare(b.ym));
}

export function highlights() {
  const out = [];
  const stg = state.settings;
  const series = weightSeries().filter((p) => !p.flag);
  const last = series[series.length - 1];

  if (last && stg.start) {
    const lost = stg.start.weight - last.v;
    if (lost > 0) {
      const floorTen = Math.floor(lost / 10) * 10;
      out.push({ icon: '↓', title: `${fmt1(lost)} lb below your starting weight`, text: floorTen >= 10 ? `You passed ${floorTen} lb down. The next mark is ${floorTen + 10}, which is ${fmt1(floorTen + 10 - lost)} lb away.` : `The first mark is 10 lb, ${fmt1(10 - lost)} lb away.` });
    }
  }
  if (last) {
    const lower = [...series].reverse().find((p) => p.v < last.v - 0.05);
    if (!lower) out.push({ icon: '★', title: 'Your lowest weight on record', text: `${fmt1(last.v)} lb on ${mediumDate(last.d)}.` });
    else if (utcDay(last.d) - lower.t > 120) out.push({ icon: '★', title: `Lowest weight since ${mediumDate(lower.d)}`, text: `${fmt1(last.v)} lb on ${mediumDate(last.d)}.` });
    const hi = series.reduce((a, p) => (!a || p.v > a.v ? p : a), null);
    if (hi && hi.v - last.v > 1) out.push({ icon: '↓', title: `${fmt1(hi.v - last.v)} lb down from your highest`, text: `The high was ${fmt1(hi.v)} lb on ${mediumDate(hi.d)}.` });
  }
  const months = monthlyAverages(series).filter((m) => m.n >= 3);
  let best = null;
  for (let i = 1; i < months.length; i++) {
    const [ya, ma] = months[i - 1].ym.split('-').map(Number), [yb, mb] = months[i].ym.split('-').map(Number);
    if ((yb - ya) * 12 + (mb - ma) !== 1) continue;
    const drop = months[i - 1].v - months[i].v;
    if (drop > 0 && (!best || drop > best.drop)) best = { ym: months[i].ym, drop };
  }
  if (best) out.push({ icon: '◆', title: `Best month: ${monthName(best.ym)}`, text: `The monthly average fell ${fmt1(best.drop)} lb from the month before.` });

  const dates = Object.keys(state.entries);
  const bestSteps = dates.reduce((a, d) => ((state.entries[d].steps || 0) > (a?.v || 0) ? { d, v: state.entries[d].steps } : a), null);
  if (bestSteps) out.push({ icon: '◇', title: `Most steps: ${bestSteps.v.toLocaleString()}`, text: mediumDate(bestSteps.d) });
  const mm = dates.filter((d) => d.startsWith(todayStr().slice(0, 7))).reduce((a, d) => a + (state.entries[d].meditationAm?.min || 0) + (state.entries[d].meditationPm?.min || 0), 0);
  if (mm > 0) out.push({ icon: '○', title: `${fmt1(mm)} meditation ${mm === 1 ? 'minute' : 'minutes'} this month`, text: 'Morning and evening together.' });

  const ms = Object.keys(state.measurements).sort();
  if (ms.length >= 2) {
    const a = state.measurements[ms[0]], b = state.measurements[ms[ms.length - 1]];
    if (a[BELLY_KEY] && b[BELLY_KEY] && a[BELLY_KEY] !== b[BELLY_KEY]) {
      const d = a[BELLY_KEY] - b[BELLY_KEY];
      out.push({ icon: d > 0 ? '↓' : '↑', title: `Belly (navel) ${d > 0 ? 'down' : 'up'} ${fmt1(Math.abs(d))} in`, text: `From ${fmt1(a[BELLY_KEY])} in on ${mediumDate(ms[0])} to ${fmt1(b[BELLY_KEY])} in on ${mediumDate(ms[ms.length - 1])}.` });
    }
  }
  return out;
}

export function highlightList() {
  const list = highlights();
  if (!list.length) return h('p', { class: 'empty' }, 'Highlights appear here as you log.');
  return h('ul', { class: 'hl-list' }, list.map((x) => h('li', null, h('span', { class: 'hl-ic', 'aria-hidden': 'true' }, x.icon), h('div', null, h('strong', null, x.title), h('div', { class: 'sub' }, x.text)))));
}

/* ---------- calendar ---------- */
const cal = { ym: todayStr().slice(0, 7) };
export function calendarCard(onPick) {
  const box = h('section', { class: 'card' });
  const paint = () => {
    const [y, m] = cal.ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const lead = first.getDay();
    const today = todayStr();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'cal-empty' }));
    for (let n = 1; n <= days; n++) {
      const d = fmtDate(new Date(y, m - 1, n));
      const e = state.entries[d];
      const marks = e ? [typeof e.weight === 'number', moved(e), Boolean(e.water), meditated(e)] : [false, false, false, false];
      const level = marks.filter(Boolean).length;
      const tags = [marks[0] && 'weighed in', marks[1] && 'moved', marks[2] && 'logged water', marks[3] && 'meditated'].filter(Boolean);
      cells.push(h('button', { type: 'button', class: `cal-day lv${level}${d === today ? ' today' : ''}`, 'aria-label': `${mediumDate(d)}${tags.length ? ': ' + tags.join(', ') : ': nothing logged'}`, onclick: () => onPick(d) },
        h('span', null, String(n)),
        h('span', { class: 'marks', 'aria-hidden': 'true' }, marks[0] ? h('i', { class: 'm-w' }) : null, marks[1] ? h('i', { class: 'm-m' }) : null, marks[2] ? h('i', { class: 'm-h' }) : null, marks[3] ? h('i', { class: 'm-d' }) : null)));
    }
    const shift = (k) => { const dt = new Date(y, m - 1 + k, 1); cal.ym = fmtDate(dt).slice(0, 7); paint(); };
    box.replaceChildren(
      h('div', { class: 'datenav' },
        h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
        h('div', { class: 'datehead' }, h('h2', null, monthName(cal.ym))),
        h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Next month', disabled: cal.ym >= today.slice(0, 7) ? true : null, onclick: () => shift(1) }, '›')),
      h('div', { class: 'cal-grid cal-head', 'aria-hidden': 'true' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => h('span', null, x))),
      h('div', { class: 'cal-grid' }, cells),
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'm-w lg' }), 'Weighed in'), h('span', null, h('i', { class: 'm-m lg' }), 'Moved'), h('span', null, h('i', { class: 'm-h lg' }), 'Water'), h('span', null, h('i', { class: 'm-d lg' }), 'Meditated')),
      h('p', { class: 'sub' }, 'Darker days have more logged. Tap a day to open it.'));
  };
  paint();
  return box;
}

