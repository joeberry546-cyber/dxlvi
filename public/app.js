import { h, s, todayStr, addDays, utcDay, longDate, mediumDate, monthName, yearsMonthsSince, ageOn, fmt1, round1, bmi, feetInches, parseCSV, download, isDateStr, parseDate } from './js/util.js';
import { drawWeightChart, smoothSeries } from './js/chart.js';

/* ---------- storage in this browser (only tiny conveniences) ---------- */
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---------- state ---------- */
const state = {
  token: LS.get('dxlvi.token'),
  entries: {},
  settings: { heightIn: 74.5, birthday: null, start: null, units: 'in', waterTargetOz: null, goals: {} },
};
const app = document.getElementById('app');
const MINS = ['cardio', 'stretch', 'balance', 'meditationAm', 'meditationPm'];
const BAND = { from: '2013-01-01', to: '2014-01-04', label: 'The 100 pound year' };

/* ---------- talking to the server ---------- */
async function api(path, { method = 'GET', body, keepalive } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    keepalive,
    headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') { signOut(); throw new Error('Please sign in again.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

async function loadData() {
  const d = await api('data');
  state.entries = d.entries;
  state.settings = { ...state.settings, ...d.settings };
}

function signOut() {
  state.token = null;
  LS.del('dxlvi.token');
  renderLogin();
}

/* ---------- saving (automatic, a moment after you stop typing) ---------- */
const dirty = new Set();
let saveTimer = null, retryTimer = null, statusEl = null;
let status = { kind: 'saved', msg: '' };

function setStatus(kind, msg = '') {
  status = { kind, msg };
  paintStatus();
}
function paintStatus() {
  if (!statusEl) return;
  statusEl.className = `status${status.kind === 'error' ? ' error' : ''}`;
  statusEl.textContent = status.kind === 'saving' ? 'Saving…' : status.kind === 'error' ? `Not saved yet. ${status.msg}` : status.msg || 'All changes saved';
}

function markDirty(date) {
  tidy(date);
  dirty.add(date);
  setStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}

async function flush() {
  clearTimeout(saveTimer);
  clearTimeout(retryTimer);
  const dates = [...dirty];
  dirty.clear();
  if (!dates.length) return;
  try {
    await Promise.all(dates.map((d) => api(`entries/${d}`, { method: 'PUT', body: state.entries[d] || {}, keepalive: true })));
    setStatus(dirty.size ? 'saving' : 'saved');
  } catch (err) {
    dates.forEach((d) => dirty.add(d));
    setStatus('error', err.message);
    retryTimer = setTimeout(flush, 5000);
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', flush);

async function saveSettings(patch) {
  setStatus('saving');
  try {
    state.settings = { ...state.settings, ...(await api('settings', { method: 'PUT', body: patch })) };
    setStatus('saved');
  } catch (err) { setStatus('error', err.message); }
}

/* ---------- entries ---------- */
const entryFor = (date) => (state.entries[date] ||= {});
const hasText = (v) => typeof v === 'string' && v.trim() !== '';

// Remove empty pieces so a day with nothing in it disappears from the history.
function tidy(date) {
  const e = state.entries[date];
  if (!e) return;
  if (e.weight === null || e.weight === undefined || Number.isNaN(e.weight)) { delete e.weight; delete e.weightNote; delete e.weightSource; delete e.weightFlag; }
  if (e.strength && !e.strength.done && !hasText(e.strength.note)) delete e.strength;
  for (const k of MINS) {
    const x = e[k];
    if (!x) continue;
    if (!(x.min > 0)) delete x.min;
    if (!hasText(x.note)) delete x.note;
    if (!x.min && !x.note) delete e[k];
  }
  if (e.water && !e.water.length) delete e.water;
  if (e.steps === null || e.steps === undefined || Number.isNaN(e.steps)) delete e.steps;
  for (const k of ['food', 'notes']) if (!hasText(e[k])) delete e[k];
  if (e.alcohol && !e.alcohol.had && !hasText(e.alcohol.note)) delete e.alcohol;
  if (!Object.keys(e).some((k) => k !== 'updatedAt')) delete state.entries[date];
}
const hasData = (e) => e && Object.keys(e).some((k) => k !== 'updatedAt');
const waterTotal = (e) => (e.water || []).reduce((a, b) => a + b, 0);

function weightSeries() {
  return Object.entries(state.entries)
    .filter(([, e]) => typeof e.weight === 'number')
    .map(([d, e]) => ({ d, t: utcDay(d), v: e.weight, flag: e.weightFlag === 'review' }))
    .sort((a, b) => a.t - b.t);
}

/* ---------- page frame ---------- */
const icons = {
  log: 'M12 5v14M5 12h14',
  history: 'M4 6h16M4 12h16M4 18h10',
  trends: 'M3 17l6-6 4 4 8-9',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
};
function nav(active) {
  const link = (key, label, href) =>
    h('a', { href, 'aria-current': active === key ? 'page' : null }, s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: icons[key] })), label);
  return h('nav', { class: 'nav', 'aria-label': 'Main' }, link('log', 'Log', `#/log/${todayStr()}`), link('history', 'History', '#/history'), link('trends', 'Trends', '#/trends'), link('settings', 'Settings', '#/settings'));
}
function shell(active, ...content) {
  statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  app.replaceChildren(h('div', { class: 'shell' }, h('header', { class: 'topbar' }, h('span', { class: 'wordmark' }, 'DXLVI'), statusEl), ...content), nav(active));
  paintStatus();
  window.scrollTo(0, 0);
}
function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
const numOrNull = (v) => (v === '' || v === null ? null : Number(v));

/* ---------- login ---------- */
function renderLogin(message = '') {
  const err = h('p', { class: 'error-text', role: 'alert' }, message);
  const input = h('input', { type: 'password', id: 'pass', autocomplete: 'current-password', placeholder: 'Passcode', 'aria-label': 'Passcode' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Unlock');
  const form = h('form', { class: 'card', onsubmit: async (ev) => {
    ev.preventDefault();
    btn.disabled = true; err.textContent = '';
    try {
      const r = await api('login', { method: 'POST', body: { passcode: input.value } });
      state.token = r.token;
      LS.set('dxlvi.token', r.token);
      await boot();
    } catch (e) { err.textContent = e.message; btn.disabled = false; input.select(); }
  } }, h('span', { class: 'wordmark' }, 'DXLVI'), h('p', { class: 'sub' }, 'Enter your passcode to open your log.'), input, btn, err);
  app.replaceChildren(h('div', { class: 'login' }, form));
  input.focus();
}

/* ---------- Log ---------- */
function latestWeightOnOrBefore(date) {
  const t = utcDay(date);
  const list = weightSeries().filter((p) => p.t <= t);
  return list.length ? list[list.length - 1] : null;
}

function viewLog(date) {
  if (!isDateStr(date)) date = todayStr();
  const E = () => entryFor(date);
  const touch = () => markDirty(date);
  const tilesBox = h('div', { class: 'tiles' });
  const stg = state.settings;

  function paintTiles() {
    const lw = latestWeightOnOrBefore(date);
    const tiles = [];
    if (lw) {
      tiles.push(h('div', { class: 'tile' }, h('div', { class: 'k' }, 'Weight'), h('div', { class: 'v' }, fmt1(lw.v), h('small', null, 'lb')), h('div', { class: 'n' }, lw.d === date ? 'Logged this day' : `Last: ${mediumDate(lw.d)}`)));
      if (stg.start) {
        const diff = round1(lw.v - stg.start.weight);
        tiles.push(h('div', { class: 'tile hl' }, h('div', { class: 'k' }, `Vs. ${fmt1(stg.start.weight)} start`), h('div', { class: 'v' }, `${diff <= 0 ? '−' : '+'}${fmt1(Math.abs(diff))}`, h('small', null, 'lb')), h('div', { class: 'n' }, `${fmt1(stg.start.weight)} on ${mediumDate(stg.start.date)}`)));
      }
      tiles.push(h('div', { class: 'tile' }, h('div', { class: 'k' }, 'BMI'), h('div', { class: 'v' }, fmt1(bmi(lw.v, stg.heightIn))), h('div', { class: 'n' }, `Height ${feetInches(stg.heightIn)}`)));
    }
    if (stg.start) tiles.push(h('div', { class: 'tile' }, h('div', { class: 'k' }, 'On the journey'), h('div', { class: 'v', style: 'font-size:1.15rem' }, yearsMonthsSince(stg.start.date, todayStr())), h('div', { class: 'n' }, `Since ${mediumDate(stg.start.date)}`)));
    tilesBox.replaceChildren(...tiles);
  }

  /* date header */
  const go = (d) => { flush(); location.hash = `#/log/${d}`; };
  const rel = date === todayStr() ? 'Today' : date === addDays(todayStr(), -1) ? 'Yesterday' : '';
  const dateInput = h('input', { type: 'date', id: 'datepick', value: date, max: todayStr(), 'aria-label': 'Jump to a date', onchange: (ev) => isDateStr(ev.target.value) && go(ev.target.value) });
  const head = h('div', { class: 'card' },
    h('div', { class: 'datenav' },
      h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Previous day', onclick: () => go(addDays(date, -1)) }, '‹'),
      h('div', { class: 'datehead' }, h('h1', null, longDate(date)), rel ? h('small', null, rel) : null),
      h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Next day', onclick: () => go(addDays(date, 1)) }, '›')),
    h('div', { class: 'datepick' }, dateInput, date !== todayStr() ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => go(todayStr()) }, 'Jump to today') : null));

  /* weight */
  const original = E().weight;
  const info = h('div', { class: 'grid' });
  const paintInfo = () => {
    const e = E();
    info.replaceChildren(...[
      e.weightNote ? h('div', { class: 'weightnote' }, e.weightNote) : null,
      e.weightSource && e.weightSource !== 'manual' ? h('div', { class: 'weightnote' }, `Source: ${e.weightSource}`) : null,
      e.weightFlag === 'review' ? h('div', { class: 'row' }, h('span', { class: 'pill warn' }, 'Needs review'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => { delete E().weightFlag; touch(); paintInfo(); paintTiles(); } }, 'Looks right')) : null,
    ].filter(Boolean));
  };
  const wIn = h('input', { id: 'weight', type: 'number', inputmode: 'decimal', step: '0.1', min: '50', max: '1500', placeholder: 'Pounds', value: original ?? '', oninput: (ev) => {
    const v = numOrNull(ev.target.value);
    E().weight = v;
    if (v !== original) { delete E().weightFlag; delete E().weightSource; }
    touch(); paintTiles(); paintInfo();
  } });
  const weightCard = h('section', { class: 'card' }, h('h2', null, 'Weight'), h('label', { class: 'field', for: 'weight' }, 'Pounds', wIn), info);

  /* water */
  const totalEl = h('strong', null, '0');
  const meterFill = h('span', { style: 'width:0%' });
  const meter = h('div', { class: 'meter', hidden: !stg.waterTargetOz, role: 'progressbar', 'aria-label': 'Water goal' }, meterFill);
  const goalEl = h('span', { class: 'sub' });
  const paintWater = () => {
    const t = waterTotal(E());
    totalEl.textContent = fmt1(t);
    if (stg.waterTargetOz) {
      meter.hidden = false;
      meterFill.style.width = `${Math.min(100, (t / stg.waterTargetOz) * 100)}%`;
      meter.setAttribute('aria-valuenow', Math.round(t)); meter.setAttribute('aria-valuemax', stg.waterTargetOz);
      goalEl.textContent = `of ${fmt1(stg.waterTargetOz)} oz goal`;
    } else goalEl.textContent = 'oz today';
  };
  const addWater = (oz) => { if (!(oz > 0)) return; (E().water ||= []).push(oz); touch(); paintWater(); };
  const customWater = h('input', { type: 'number', inputmode: 'decimal', min: '1', max: '200', step: '1', placeholder: 'Custom oz', 'aria-label': 'Custom ounces', class: 'grow' });
  const waterCard = h('section', { class: 'card' }, h('h2', null, 'Water'),
    h('div', { class: 'watertotal' }, totalEl, goalEl), meter,
    h('div', { class: 'waterbtns' }, [8, 12, 16, 24].map((oz) => h('button', { class: 'btn', type: 'button', onclick: () => addWater(oz) }, `+${oz} oz`))),
    h('div', { class: 'row' }, customWater, h('button', { class: 'btn ghost', type: 'button', onclick: () => { addWater(Number(customWater.value)); customWater.value = ''; } }, 'Add'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { (E().water || []).pop(); touch(); paintWater(); } }, 'Undo last'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (waterTotal(E()) === 0 || confirm('Clear all water logged for this day?')) { delete E().water; touch(); paintWater(); } } }, 'Clear day')));

  /* movement */
  const strengthBox = h('input', { type: 'checkbox', id: 'strength-done', checked: Boolean(E().strength?.done) });
  const strengthNote = h('input', { type: 'text', id: 'strength-note', maxlength: '300', placeholder: 'Leg day, back and biceps, full body…', value: E().strength?.note ?? '' });
  const syncStrength = () => { E().strength = { done: strengthBox.checked, note: strengthNote.value }; touch(); };
  strengthBox.addEventListener('change', syncStrength);
  strengthNote.addEventListener('input', () => { if (strengthNote.value.trim()) strengthBox.checked = true; syncStrength(); });
  const minuteRow = (key, id, notePlaceholder) => {
    const min = h('input', { type: 'number', inputmode: 'decimal', id: `${id}-min`, class: 'narrow', min: '0', max: '1440', step: '1', placeholder: 'Minutes', 'aria-label': 'Minutes', value: E()[key]?.min ?? '' });
    const note = h('input', { type: 'text', id: `${id}-note`, class: 'grow', maxlength: '300', placeholder: notePlaceholder, 'aria-label': 'Note', value: E()[key]?.note ?? '' });
    const sync = () => { E()[key] = { min: numOrNull(min.value), note: note.value }; touch(); };
    min.addEventListener('input', sync); note.addEventListener('input', sync);
    return h('div', { class: 'row' }, min, note);
  };
  const movementCard = h('section', { class: 'card' }, h('h2', null, 'Movement'),
    h('div', { class: 'act' }, h('h3', null, 'Strength'), h('label', { class: 'check', for: 'strength-done' }, strengthBox, 'Did strength training'), strengthNote),
    h('div', { class: 'act' }, h('h3', null, 'Cardio'), minuteRow('cardio', 'cardio', 'Walk, elliptical, bike…')),
    h('div', { class: 'act' }, h('h3', null, 'Stretching'), minuteRow('stretch', 'stretch', 'Morning stretch, hips, legs…')),
    h('div', { class: 'act' }, h('h3', null, 'Balance'), minuteRow('balance', 'balance', 'Single-leg work, balance board…')));

  const medCard = h('section', { class: 'card' }, h('h2', null, 'Meditation'),
    h('div', { class: 'act' }, h('h3', null, 'Morning'), minuteRow('meditationAm', 'medam', 'Breathwork, silent sitting, guided…')),
    h('div', { class: 'act' }, h('h3', null, 'Evening'), minuteRow('meditationPm', 'medpm', 'Breathwork, silent sitting, guided…')));

  /* food, drink, steps, notes */
  const food = h('textarea', { id: 'food', maxlength: '4000', placeholder: 'What did you eat today? No numbers needed.', oninput: (ev) => { E().food = ev.target.value; touch(); } }, E().food ?? '');
  const alcBox = h('input', { type: 'checkbox', id: 'alc', checked: Boolean(E().alcohol?.had) });
  const alcNote = h('input', { type: 'text', id: 'alc-note', maxlength: '300', placeholder: 'What and how much (optional)', value: E().alcohol?.note ?? '' });
  const syncAlc = () => { E().alcohol = { had: alcBox.checked, note: alcNote.value }; touch(); };
  alcBox.addEventListener('change', syncAlc); alcNote.addEventListener('input', syncAlc);
  const foodCard = h('section', { class: 'card' }, h('h2', null, 'Food and drink'), h('label', { class: 'field', for: 'food' }, 'What I ate', food),
    h('label', { class: 'check', for: 'alc' }, alcBox, 'Had alcohol'), alcNote);
  const steps = h('input', { id: 'steps', type: 'number', inputmode: 'numeric', min: '0', max: '200000', step: '1', placeholder: 'Steps', value: E().steps ?? '', oninput: (ev) => { E().steps = numOrNull(ev.target.value); touch(); } });
  const notes = h('textarea', { id: 'notes', maxlength: '4000', placeholder: 'Anything worth remembering about today', oninput: (ev) => { E().notes = ev.target.value; touch(); } }, E().notes ?? '');
  const extraCard = h('section', { class: 'card' }, h('h2', null, 'Steps and notes'), h('label', { class: 'field', for: 'steps' }, 'Steps for the day', steps), h('label', { class: 'field', for: 'notes' }, 'Notes', notes));

  shell('log', head, tilesBox, weightCard, waterCard, movementCard, medCard, foodCard, extraCard);
  paintTiles(); paintInfo(); paintWater();
}

/* ---------- History ---------- */
function chipsFor(e) {
  const c = [];
  if (e.strength) c.push(h('span', { class: 'chip' }, 'Strength'));
  if (e.cardio?.min) c.push(h('span', { class: 'chip' }, `Cardio ${fmt1(e.cardio.min)}m`)); else if (e.cardio) c.push(h('span', { class: 'chip' }, 'Cardio'));
  if (e.stretch?.min) c.push(h('span', { class: 'chip' }, `Stretch ${fmt1(e.stretch.min)}m`)); else if (e.stretch) c.push(h('span', { class: 'chip' }, 'Stretch'));
  if (e.balance?.min) c.push(h('span', { class: 'chip' }, `Balance ${fmt1(e.balance.min)}m`)); else if (e.balance) c.push(h('span', { class: 'chip' }, 'Balance'));
  const med = (e.meditationAm?.min || 0) + (e.meditationPm?.min || 0);
  if (med) c.push(h('span', { class: 'chip' }, `Meditate ${fmt1(med)}m`)); else if (e.meditationAm || e.meditationPm) c.push(h('span', { class: 'chip' }, 'Meditate'));
  if (e.water) c.push(h('span', { class: 'chip' }, `${fmt1(waterTotal(e))} oz water`));
  if (e.steps) c.push(h('span', { class: 'chip' }, `${e.steps.toLocaleString()} steps`));
  if (e.alcohol?.had) c.push(h('span', { class: 'chip alc' }, 'Alcohol'));
  return c;
}
const searchText = (e) => [e.food, e.notes, e.weightNote, e.strength?.note, e.cardio?.note, e.stretch?.note, e.balance?.note, e.meditationAm?.note, e.meditationPm?.note, e.alcohol?.note].filter(Boolean).join(' ').toLowerCase();

function viewHistory() {
  const days = Object.keys(state.entries).filter((d) => hasData(state.entries[d])).sort().reverse();
  const list = h('div', { class: 'grid', style: 'display:grid;gap:14px' });
  const search = h('input', { type: 'text', id: 'q', placeholder: 'Search food, notes, and workouts', 'aria-label': 'Search', oninput: () => paint() });
  const dayRow = (d) => {
    const e = state.entries[d];
    const dt = parseDate(d);
    return h('a', { class: 'day', href: `#/log/${d}` },
      h('div', { class: 'dn' }, String(dt.getDate()), h('small', null, dt.toLocaleDateString(undefined, { weekday: 'short' }))),
      h('div', { class: 'chips' }, chipsFor(e)),
      h('div', { class: 'w' }, typeof e.weight === 'number' ? `${fmt1(e.weight)}` : ''));
  };
  function paint() {
    const q = search.value.trim().toLowerCase();
    if (q) {
      const hits = days.filter((d) => searchText(state.entries[d]).includes(q));
      list.replaceChildren(hits.length ? h('div', { class: 'card', style: 'padding:0;overflow:hidden;gap:0' }, h('div', { class: 'days' }, hits.slice(0, 200).map((d) => h('div', null, h('div', { class: 'sub', style: 'padding:8px 16px 0' }, mediumDate(d)), dayRow(d))))) : h('p', { class: 'empty' }, 'Nothing matches that search.'));
      return;
    }
    if (!days.length) { list.replaceChildren(h('p', { class: 'empty' }, 'No days logged yet. Add your first one on the Log tab.')); return; }
    const byMonth = new Map();
    for (const d of days) { const ym = d.slice(0, 7); if (!byMonth.has(ym)) byMonth.set(ym, []); byMonth.get(ym).push(d); }
    let first = true;
    const groups = [];
    for (const [ym, ds] of byMonth) {
      const ws = ds.map((d) => state.entries[d].weight).filter((x) => typeof x === 'number');
      const avg = ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null;
      groups.push(h('details', { class: 'month', open: first ? true : null },
        h('summary', null, h('h2', null, monthName(ym)), h('span', null, `${ds.length} ${ds.length === 1 ? 'day' : 'days'}${avg ? ` · avg ${fmt1(avg)} lb` : ''}`)),
        h('div', { class: 'days' }, ds.map(dayRow))));
      first = false;
    }
    list.replaceChildren(...groups);
  }
  shell('history', h('div', { class: 'card' }, h('h2', null, 'History'), h('p', { class: 'sub' }, `${days.length} days logged. Tap a day to edit it.`), search), list);
  paint();
}

/* ---------- Trends ---------- */
const trend = { days: Number(LS.get('dxlvi.range')) || 0, avg: LS.get('dxlvi.avg') !== '0', ref: LS.get('dxlvi.ref') !== '0', band: LS.get('dxlvi.band') !== '0' };
let resizeObs = null;

function viewTrends() {
  const series = weightSeries();
  const avg = smoothSeries(series);
  const stg = state.settings;
  const host = h('div', { class: 'chartbox' });
  const draw = () => drawWeightChart(host, { series, avg, days: trend.days || null, today: todayStr(), showAvg: trend.avg, showRef: trend.ref && Boolean(stg.start), refWeight: stg.start?.weight, refLabel: stg.start ? `${fmt1(stg.start.weight)} · ${mediumDate(stg.start.date)}` : '', showBand: trend.band, band: BAND });

  const ranges = [[0, 'All'], [365 * 5, '5 yr'], [365, '1 yr'], [90, '90 days']];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Range' });
  const paintSeg = () => seg.replaceChildren(...ranges.map(([d, label]) => h('button', { type: 'button', 'aria-pressed': String(trend.days === d), onclick: () => { trend.days = d; LS.set('dxlvi.range', d); paintSeg(); draw(); } }, label)));
  paintSeg();
  const toggle = (key, id, label) => h('label', { class: 'check', for: id, style: 'min-height:38px' }, h('input', { type: 'checkbox', id, checked: trend[key], onchange: (ev) => { trend[key] = ev.target.checked; LS.set(`dxlvi.${key}`, ev.target.checked ? '1' : '0'); draw(); } }), label);

  const hi = series.reduce((a, p) => (!a || p.v > a.v ? p : a), null);
  const lo = series.reduce((a, p) => (!a || p.v < a.v ? p : a), null);
  const last = series[series.length - 1];
  const changeOver = (days) => {
    if (!last) return null;
    let best = null;
    for (const p of series) if (Math.abs(p.t - (last.t - days)) <= 7 && (!best || Math.abs(p.t - (last.t - days)) < Math.abs(best.t - (last.t - days)))) best = p;
    return best && best !== last ? round1(last.v - best.v) : null;
  };
  const signed = (n) => `${n <= 0 ? '−' : '+'}${fmt1(Math.abs(n))}`;
  const tile = (k, v, n, hl) => h('div', { class: `tile${hl ? ' hl' : ''}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, h('small', null, 'lb')), n ? h('div', { class: 'n' }, n) : null);
  const tiles = [];
  if (last) tiles.push(tile('Latest', fmt1(last.v), mediumDate(last.d)));
  if (stg.start && last) tiles.push(tile(`Vs. ${fmt1(stg.start.weight)} start`, signed(last.v - stg.start.weight), 'Since the first weigh-in', true));
  if (hi) tiles.push(tile('Highest', fmt1(hi.v), mediumDate(hi.d)));
  if (lo) tiles.push(tile('Lowest', fmt1(lo.v), mediumDate(lo.d)));
  if (last && hi) tiles.push(tile('From the highest', signed(last.v - hi.v), `Highest was ${mediumDate(hi.d)}`));
  const c30 = changeOver(30), c90 = changeOver(90);
  if (c30 !== null) tiles.push(tile('Past 30 days', signed(c30), 'Compared with about a month ago'));
  if (c90 !== null) tiles.push(tile('Past 90 days', signed(c90), 'Compared with about 3 months ago'));
  const flagged = series.filter((p) => p.flag).length;

  shell('trends',
    h('section', { class: 'card' }, h('h2', null, 'Weight'),
      h('div', { class: 'row', style: 'justify-content:space-between' }, seg),
      h('div', { class: 'row', style: 'gap:4px 18px' }, toggle('avg', 't-avg', '31-day average'), stg.start ? toggle('ref', 't-ref', `${fmt1(stg.start.weight)} line`) : null, toggle('band', 't-band', 'The 100 pound year')),
      host,
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'l-raw' }), 'Daily reading'), h('span', null, h('i', { class: 'l-avg' }), '31-day average'), stg.start ? h('span', null, h('i', { class: 'l-ref' }), `${fmt1(stg.start.weight)} starting weight`) : null),
      flagged ? h('p', { class: 'sub' }, `${flagged} ${flagged === 1 ? 'reading is' : 'readings are'} marked for review. They show as hollow dots and stay out of the average.`) : null),
    series.length ? h('div', { class: 'tiles' }, tiles) : h('p', { class: 'empty' }, 'Log a weight to start your chart.'));
  requestAnimationFrame(draw);
  resizeObs?.disconnect();
  let lastW = 0;
  resizeObs = new ResizeObserver(() => { const w = Math.round(host.clientWidth); if (w && w !== lastW) { lastW = w; draw(); } });
  resizeObs.observe(host);
}

/* ---------- Settings ---------- */
function entriesToCSV() {
  const cols = ['date', 'weight_lb', 'strength', 'strength_note', 'cardio_min', 'cardio_note', 'stretch_min', 'stretch_note', 'balance_min', 'balance_note', 'meditation_am_min', 'meditation_am_note', 'meditation_pm_min', 'meditation_pm_note', 'water_oz', 'steps', 'food', 'alcohol', 'alcohol_note', 'notes'];
  const q = (v) => { const t = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = Object.keys(state.entries).filter((d) => hasData(state.entries[d])).sort().map((d) => {
    const e = state.entries[d];
    return [d, e.weight, e.strength ? 'yes' : '', e.strength?.note, e.cardio?.min, e.cardio?.note, e.stretch?.min, e.stretch?.note, e.balance?.min, e.balance?.note, e.meditationAm?.min, e.meditationAm?.note, e.meditationPm?.min, e.meditationPm?.note, e.water ? waterTotal(e) : '', e.steps, e.food, e.alcohol?.had ? 'yes' : '', e.alcohol?.note, e.notes].map(q).join(',');
  });
  return [cols.join(','), ...rows].join('\n');
}

async function importFiles(files, out) {
  const entries = [];
  let start = null;
  for (const f of files) {
    const rows = parseCSV(await f.text());
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    if (keys.includes('weight_lb')) {
      for (const r of rows) {
        if (!isDateStr(r.date) || !r.weight_lb) continue;
        const note = r.note || '';
        entries.push({ date: r.date, weight: Number(r.weight_lb), weightSource: r.source, weightNote: note, weightFlag: /^review/i.test(note) ? 'review' : undefined });
        if (/^starting weight/i.test(note) && !start) start = { date: r.date, weight: Number(r.weight_lb) };
      }
    } else if (keys.includes('meditation_morning_min') || keys.includes('steps')) {
      for (const r of rows) {
        if (!isDateStr(r.date)) continue;
        const extra = [r.note, r.workout_note, r.miles ? `${r.miles} mi` : '', r.floors ? `${r.floors} floors` : ''].filter(Boolean).join(' · ');
        entries.push({ date: r.date, steps: r.steps ? Number(r.steps) : undefined, meditationAm: r.meditation_morning_min ? { min: Number(r.meditation_morning_min) } : undefined, meditationPm: r.meditation_evening_min ? { min: Number(r.meditation_evening_min) } : undefined, notes: extra || undefined });
      }
    } else out.append(h('p', { class: 'sub' }, `Skipped ${f.name}: not a file I recognize.`));
  }
  const total = { created: 0, merged: 0, unchanged: 0 };
  for (let i = 0; i < entries.length; i += 300) {
    const r = await api('import', { method: 'POST', body: { entries: entries.slice(i, i + 300), start: i === 0 ? start : undefined } });
    for (const k of Object.keys(total)) total[k] += r[k];
  }
  await loadData();
  return total;
}

function viewSettings() {
  const stg = state.settings;
  const ft = Math.floor(stg.heightIn / 12), inch = round1(stg.heightIn - ft * 12);
  const ftIn = h('input', { id: 'h-ft', type: 'number', inputmode: 'numeric', min: '3', max: '8', step: '1', value: ft, class: 'narrow' });
  const inIn = h('input', { id: 'h-in', type: 'number', inputmode: 'decimal', min: '0', max: '11.9', step: '0.5', value: inch, class: 'narrow' });
  const saveHeight = () => { const total = Number(ftIn.value) * 12 + Number(inIn.value || 0); if (total >= 36 && total <= 96) saveSettings({ heightIn: total }); };
  ftIn.addEventListener('change', saveHeight); inIn.addEventListener('change', saveHeight);
  const ageEl = h('span', { class: 'sub' }, stg.birthday ? `Age ${ageOn(stg.birthday, todayStr())}` : '');
  const bday = h('input', { id: 'bday', type: 'date', value: stg.birthday ?? '', max: todayStr(), onchange: (ev) => { saveSettings({ birthday: ev.target.value || null }); ageEl.textContent = ev.target.value ? `Age ${ageOn(ev.target.value, todayStr())}` : ''; } });
  const water = h('input', { id: 'water-goal', type: 'number', inputmode: 'decimal', min: '8', max: '500', step: '1', placeholder: 'Optional', value: stg.waterTargetOz ?? '', onchange: (ev) => saveSettings({ waterTargetOz: ev.target.value === '' ? '' : Number(ev.target.value) }) });
  const sDate = h('input', { id: 'start-date', type: 'date', value: stg.start?.date ?? '', max: todayStr() });
  const sWt = h('input', { id: 'start-wt', type: 'number', inputmode: 'decimal', step: '0.1', value: stg.start?.weight ?? '', placeholder: 'Pounds' });
  const saveStart = () => { if (isDateStr(sDate.value) && Number(sWt.value) > 50) saveSettings({ start: { date: sDate.value, weight: Number(sWt.value) } }); };
  sDate.addEventListener('change', saveStart); sWt.addEventListener('change', saveStart);
  const theme = h('select', { id: 'theme', onchange: (ev) => { const v = ev.target.value; if (v === 'system') { LS.del('dxlvi.theme'); delete document.documentElement.dataset.theme; } else { LS.set('dxlvi.theme', v); document.documentElement.dataset.theme = v; } } },
    ['system', 'light', 'dark'].map((v) => h('option', { value: v, selected: (LS.get('dxlvi.theme') || 'system') === v ? true : null }, v === 'system' ? 'Match my device' : v === 'light' ? 'Light (earthy)' : 'Dark (night log)')));
  const result = h('div', { class: 'grid', style: 'display:grid;gap:6px' });
  const fileIn = h('input', { id: 'import-files', type: 'file', accept: '.csv,text/csv', multiple: true, 'aria-label': 'Choose history files' });
  const importBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!fileIn.files.length) { result.replaceChildren(h('p', { class: 'sub' }, 'Choose one or both history files first.')); return; }
    importBtn.disabled = true; result.replaceChildren(h('p', { class: 'sub' }, 'Importing…'));
    try {
      const t = await importFiles([...fileIn.files], result);
      result.append(h('p', { class: 'sub', role: 'status' }, `Done. ${t.created} new days, ${t.merged} days filled in, ${t.unchanged} already there.`));
      fileIn.value = '';
    } catch (err) { result.append(h('p', { class: 'error-text' }, err.message)); }
    importBtn.disabled = false;
  } }, 'Import history');

  shell('settings',
    h('section', { class: 'card' }, h('h2', null, 'You'),
      h('div', { class: 'field' }, 'Height', h('div', { class: 'row' }, ftIn, h('span', null, 'ft'), inIn, h('span', null, 'in'))),
      h('label', { class: 'field', for: 'bday' }, 'Birthday (optional)', bday), ageEl,
      h('label', { class: 'field', for: 'water-goal' }, 'Daily water goal in oz (leave empty to hide)', water)),
    h('section', { class: 'card' }, h('h2', null, 'Where it began'), h('p', { class: 'sub' }, 'Your first weigh-in. It draws the dotted line on your chart.'),
      h('div', { class: 'row' }, h('label', { class: 'field grow', for: 'start-date' }, 'Date', sDate), h('label', { class: 'field grow', for: 'start-wt' }, 'Weight (lb)', sWt))),
    h('section', { class: 'card' }, h('h2', null, 'Look'), h('label', { class: 'field', for: 'theme' }, 'Theme', theme)),
    h('section', { class: 'card' }, h('h2', null, 'Bring in old history'), h('p', { class: 'sub' }, 'Choose dxlvi-historical-weights.csv and dxlvi-historical-extras.csv from your Seed data folder. Importing only fills gaps, so it is safe to run twice.'), fileIn, importBtn, result),
    h('section', { class: 'card' }, h('h2', null, 'Your data'), h('p', { class: 'sub' }, 'Keep a copy of everything. The JSON file is a full backup. The CSV opens in a spreadsheet.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: async () => { try { const r = await fetch('/api/export', { headers: { authorization: `Bearer ${state.token}` } }); download(`dxlvi-export-${todayStr()}.json`, await r.text(), 'application/json'); } catch (e) { toast(e.message); } } }, 'Download backup (JSON)'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`dxlvi-days-${todayStr()}.csv`, entriesToCSV(), 'text/csv') }, 'Download days (CSV)'))),
    h('section', { class: 'card' }, h('h2', null, 'Account'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { flush(); signOut(); } }, 'Sign out')));
}

/* ---------- routing ---------- */
function render() {
  if (!state.token) return renderLogin();
  resizeObs?.disconnect();
  const [, view = 'log', arg] = location.hash.split('/');
  if (view === 'history') viewHistory();
  else if (view === 'trends') viewTrends();
  else if (view === 'settings') viewSettings();
  else viewLog(arg);
}
window.addEventListener('hashchange', () => { flush(); render(); });

async function boot() {
  if (!state.token) return renderLogin();
  app.replaceChildren(h('p', { class: 'empty' }, 'Loading your log…'));
  try {
    await loadData();
  } catch (err) {
    if (!state.token) return;
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('span', { class: 'wordmark' }, 'DXLVI'), h('p', { class: 'error-text' }, err.message), h('button', { class: 'btn', type: 'button', onclick: boot }, 'Try again'))));
    return;
  }
  if (!location.hash.startsWith('#/')) history.replaceState(null, '', `#/log/${todayStr()}`);
  render();
}
boot();
