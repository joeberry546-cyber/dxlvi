// Monthly body measurements: the form, the due-reminder, comparisons and trends.
import { h, todayStr, mediumDate, monthName, fmt1, utcDay, isDateStr } from './util.js';
import { state, shell, saveMeasurement, deleteMeasurement, toast, LS, numOrNull } from './core.js';
import { MEASURE_ROWS, MEASURE_KEYS, measureLabel, BELLY_KEY } from './fields.js';
import { drawLineChart } from './chart.js';

// The inch/cm switch lasts for this visit only. Everything is stored in inches.
export const mview = { cm: false };
const CM = 2.54;
export const unitLabel = () => (mview.cm ? 'cm' : 'in');
export const show = (inches) => (mview.cm ? Math.round(inches * CM * 10) / 10 : Math.round(inches * 100) / 100);
export const showText = (inches) => `${fmt1(show(inches))} ${unitLabel()}`;
const signed = (n) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${fmt1(Math.abs(n))}`;

export const sessionDates = () => Object.keys(state.measurements).sort();
export function valueSeries(key) {
  return sessionDates().filter((d) => typeof state.measurements[d][key] === 'number').map((d) => ({ d, t: utcDay(d), v: state.measurements[d][key] }));
}

/* ---------- the monthly reminder ---------- */
export function measureDue() {
  const month = todayStr().slice(0, 7);
  return !sessionDates().some((d) => d.startsWith(month));
}
export function dueBanner({ dismissible = true } = {}) {
  if (!measureDue() || LS.get('dxlvi.mdismiss') === todayStr()) return null;
  const box = h('div', { class: 'banner', role: 'status' },
    h('div', null, h('strong', null, `Time for ${monthName(todayStr().slice(0, 7))} measurements`), h('div', { class: 'sub' }, 'Once a month is plenty. It takes about five minutes.')),
    h('div', { class: 'row' },
      h('a', { class: 'btn small', href: '#/measure' }, 'Measure now'),
      dismissible ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { LS.set('dxlvi.mdismiss', todayStr()); box.remove(); } }, 'Later') : null));
  return box;
}

/* ---------- the page ---------- */
export function viewMeasure(editDate) {
  let date = isDateStr(editDate) ? editDate : todayStr();
  let vals = {}, note = '';
  const loadDate = () => {
    const ex = state.measurements[date] || {};
    vals = {};
    for (const k of MEASURE_KEYS) if (typeof ex[k] === 'number') vals[k] = ex[k];
    note = ex.note || '';
  };
  loadDate();

  const formBox = h('section', { class: 'card' });
  const compareBox = h('section', { class: 'card' });
  const listBox = h('section', { class: 'card' });
  const tilesBox = h('div', { class: 'tiles' });
  const bannerBox = h('div');
  const unitSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Units' });

  const paintUnits = () => unitSeg.replaceChildren(...[['in', 'Inches'], ['cm', 'Centimeters']].map(([u, label]) => h('button', { type: 'button', 'aria-pressed': String((u === 'cm') === mview.cm), onclick: () => { mview.cm = u === 'cm'; paintAll(); } }, label)));

  function field(key, label) {
    const id = `m-${key}`;
    return h('label', { class: 'field mfield', for: id }, label,
      h('input', { id, type: 'number', inputmode: 'decimal', step: '0.1', min: '0', max: '400', placeholder: unitLabel(), value: vals[key] !== undefined ? show(vals[key]) : '', oninput: (ev) => {
        const v = numOrNull(ev.target.value);
        if (v === null || Number.isNaN(v) || v <= 0) delete vals[key]; else vals[key] = Math.round((mview.cm ? v / CM : v) * 100) / 100;
      } }));
  }

  function paintForm() {
    const dateIn = h('input', { type: 'date', id: 'm-date', value: date, max: todayStr(), 'aria-label': 'Measurement date', onchange: (ev) => { if (isDateStr(ev.target.value)) { date = ev.target.value; loadDate(); paintForm(); } } });
    const existing = Boolean(state.measurements[date]);
    let lastGroup = '';
    const rows = MEASURE_ROWS.map((r) => {
      const head = r.group !== lastGroup ? h('h3', { class: 'mgroup' }, r.group) : null;
      lastGroup = r.group;
      const body = r.keys.length === 1
        ? h('div', { class: 'mrow single' }, field(r.keys[0], r.label), r.hint ? h('p', { class: 'sub hint' }, r.hint) : null)
        : h('div', { class: 'mrow' }, h('div', { class: 'mlabel' }, r.label), h('div', { class: 'pair' }, field(r.keys[0], 'Left'), field(r.keys[1], 'Right')));
      return [head, body];
    });
    const noteIn = h('textarea', { id: 'm-note', maxlength: '1000', placeholder: 'Anything about this session (time of day, how you measured)', oninput: (ev) => { note = ev.target.value; } }, note);
    const saveBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
      const body = { ...vals, note };
      if (!Object.keys(vals).length) { toast('Enter at least one measurement first.'); return; }
      saveBtn.disabled = true;
      if (await saveMeasurement(date, body)) { toast(existing ? 'Session updated.' : 'Session saved.'); paintAll(); }
      saveBtn.disabled = false;
    } }, existing ? 'Update this session' : 'Save measurements');
    formBox.replaceChildren(
      h('h2', null, existing ? `Editing ${mediumDate(date)}` : 'New session'),
      h('label', { class: 'field', for: 'm-date' }, 'Date', dateIn),
      h('p', { class: 'sub' }, `Enter what you have; blank is fine. ${mview.cm ? 'You are typing centimeters. They are saved as inches.' : 'Saved in inches.'}`),
      ...rows.flat().filter(Boolean),
      h('label', { class: 'field', for: 'm-note' }, 'Notes', noteIn),
      h('div', { class: 'row' }, saveBtn, existing ? h('button', { class: 'btn ghost', type: 'button', onclick: async () => { if (confirm(`Delete the ${mediumDate(date)} session?`) && await deleteMeasurement(date)) { toast('Session deleted.'); date = todayStr(); loadDate(); paintAll(); } } }, 'Delete session') : null));
  }

  function paintTiles() {
    const t = [];
    const belly = valueSeries(BELLY_KEY).at(-1);
    if (belly) t.push(h('div', { class: 'tile' }, h('div', { class: 'k' }, 'Belly ÷ height'), h('div', { class: 'v' }, (belly.v / state.settings.heightIn).toFixed(2)), h('div', { class: 'n' }, `${showText(belly.v)} at the navel, ${mediumDate(belly.d)}. A commonly cited guideline is under 0.5.`)));
    const w = valueSeries('waist').at(-1), hip = valueSeries('hips').at(-1);
    if (w && hip) t.push(h('div', { class: 'tile' }, h('div', { class: 'k' }, 'Waist ÷ hips'), h('div', { class: 'v' }, (w.v / hip.v).toFixed(2)), h('div', { class: 'n' }, 'Natural waist over hips')));
    for (const [k, goal] of Object.entries(state.settings.goals || {})) {
      if (!MEASURE_KEYS.includes(k)) continue;
      const cur = valueSeries(k).at(-1);
      if (cur) t.push(h('div', { class: 'tile hl' }, h('div', { class: 'k' }, `${measureLabel(k)} goal`), h('div', { class: 'v' }, show(goal), h('small', null, unitLabel())), h('div', { class: 'n' }, cur.v > goal ? `${fmt1(show(cur.v - goal))} ${unitLabel()} to go` : 'Reached')));
    }
    tilesBox.replaceChildren(...t);
  }

  function paintCompare() {
    const rows = [];
    for (const r of MEASURE_ROWS) for (const key of r.keys) {
      const ser = valueSeries(key);
      if (!ser.length) continue;
      const latest = ser.at(-1), prev = ser.length > 1 ? ser.at(-2) : null, first = ser.length > 1 ? ser[0] : null;
      const chg = (a) => (a ? h('td', { class: 'num' }, `${a.v === latest.v ? '±' : latest.v < a.v ? '▼ ' : '▲ '}${a.v === latest.v ? '0' : fmt1(Math.abs(show(latest.v) - show(a.v)))}`) : h('td', { class: 'num dim' }, '–'));
      rows.push(h('tr', null, h('th', { scope: 'row' }, measureLabel(key)), h('td', { class: 'num' }, fmt1(show(latest.v))), chg(prev), chg(first)));
    }
    compareBox.replaceChildren(h('h2', null, 'Where you are'),
      ...(rows.length ? [h('p', { class: 'sub' }, `Latest value for each measurement, in ${unitLabel()}. ▼ means smaller than before, ▲ larger.`),
        h('div', { class: 'tablewrap' }, h('table', { class: 'mtable' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'Latest'), h('th', { class: 'num' }, 'Vs. previous'), h('th', { class: 'num' }, 'Vs. first'))), h('tbody', null, rows)))]
        : [h('p', { class: 'empty' }, 'Your first session will show up here.')]));
  }

  function paintList() {
    const ds = sessionDates().reverse();
    listBox.replaceChildren(h('h2', null, 'Sessions'),
      ds.length ? h('div', { class: 'days' }, ds.map((d) => {
        const m = state.measurements[d];
        const n = MEASURE_KEYS.filter((k) => typeof m[k] === 'number').length;
        return h('button', { class: 'day sess', type: 'button', onclick: () => { date = d; loadDate(); paintForm(); formBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
          h('div', { class: 'dn' }, mediumDate(d)), h('div', { class: 'chips' }, h('span', { class: 'chip' }, `${n} of ${MEASURE_KEYS.length}`), m.note ? h('span', { class: 'chip' }, 'Note') : null), h('div', { class: 'w' }, m[BELLY_KEY] ? `${fmt1(show(m[BELLY_KEY]))}` : ''));
      })) : h('p', { class: 'empty' }, 'No sessions yet.'));
  }

  function paintAll() { bannerBox.replaceChildren(...[dueBanner({ dismissible: false })].filter(Boolean)); paintUnits(); paintForm(); paintTiles(); paintCompare(); paintList(); }

  shell('measure',
    h('section', { class: 'card' }, h('h1', { class: 'pagetitle' }, 'Measurements'), h('p', { class: 'sub' }, 'Once a month is plenty. Same time of day, same spot, relaxed.'), h('div', { class: 'row' }, unitSeg)),
    bannerBox, formBox, tilesBox, compareBox, listBox);
  paintAll();
}

/* ---------- trends: one measurement over time ---------- */
export function measureTrendCard() {
  const pick = LS.get('dxlvi.mkey');
  let key = MEASURE_KEYS.includes(pick) ? pick : BELLY_KEY;
  const host = h('div', { class: 'chartbox' });
  const groups = [...new Set(MEASURE_ROWS.map((r) => r.group))];
  const sel = h('select', { id: 'mkey', 'aria-label': 'Measurement', onchange: (ev) => { key = ev.target.value; LS.set('dxlvi.mkey', key); draw(); } },
    groups.map((g) => h('optgroup', { label: g }, MEASURE_ROWS.filter((r) => r.group === g).flatMap((r) => r.keys).map((k) => h('option', { value: k, selected: k === key ? true : null }, measureLabel(k))))));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Units' });
  const paintSeg = () => seg.replaceChildren(...[['in', 'in'], ['cm', 'cm']].map(([u, label]) => h('button', { type: 'button', 'aria-pressed': String((u === 'cm') === mview.cm), onclick: () => { mview.cm = u === 'cm'; paintSeg(); draw(); } }, label)));
  const note = h('p', { class: 'sub' });
  function draw() {
    const ser = valueSeries(key);
    const goal = state.settings.goals?.[key];
    drawLineChart(host, { points: ser.map((p) => ({ ...p, v: show(p.v) })), unit: unitLabel(), goal: goal ? show(goal) : null, label: `${measureLabel(key)} over time` });
    if (ser.length > 1) { const d = show(ser.at(-1).v) - show(ser[0].v); note.textContent = `${signed(Math.round(d * 10) / 10)} ${unitLabel()} since ${mediumDate(ser[0].d)}.`; }
    else note.textContent = ser.length ? 'One session so far. The line appears after your second.' : 'No sessions yet.';
  }
  paintSeg();
  const card = h('section', { class: 'card' }, h('h2', null, 'Measurements'), h('div', { class: 'row', style: 'justify-content:space-between' }, h('div', { class: 'grow' }, sel), seg), host, note);
  requestAnimationFrame(draw);
  let lastW = 0;
  new ResizeObserver(() => { const w = Math.round(host.clientWidth); if (w && w !== lastW) { lastW = w; draw(); } }).observe(host);
  return card;
}
