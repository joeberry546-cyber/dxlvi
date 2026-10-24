import { h, todayStr, addDays, longDate, mediumDate, monthName, yearsMonthsSince, ageOn, fmt1, round1, bmi, feetInches, isDateStr, parseDate, utcDay } from './js/util.js';
import { LS, state, app, api, loadData, setSignOutHandler, signOut, flush, markDirty, entryFor, hasData, hasText, waterTotal, numOrNull, weightSeries, shell, toast } from './js/core.js';
import { STREAKS, streak, calendarCard } from './js/insights.js';
import { dueBanner, viewMeasure } from './js/measure.js';
import { viewMeds } from './js/meds.js';
import { viewTrends, stopObserving } from './js/trends.js';
import { viewSettings } from './js/settings.js';

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
    h('div', { class: 'waterbtns' }, [8, 16, 24, 40].map((oz) => h('button', { class: 'btn', type: 'button', onclick: () => addWater(oz) }, `+${oz} oz`))),
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
    h('div', { class: 'act' }, h('h3', null, 'Flexibility and balance'), minuteRow('flex', 'flex', 'Stretching, mobility, single-leg work…')));

  const timer = meditationTimer(date, (min, key) => { const cur = E()[key] || {}; E()[key] = { ...cur, min: Math.round(((cur.min || 0) + min) * 10) / 10 }; touch(); viewLog(date); });
  const medCard = h('section', { class: 'card' }, h('h2', null, 'Meditation'), timer,
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

  const strip = h('div', { class: 'streakstrip', 'aria-label': 'Current streaks' }, STREAKS.map((st) => { const r = streak(st.test); return r.current ? h('span', { class: 'chip streak' }, `${st.label} ${r.current}`) : null; }));
  shell('log', head, dueBanner(), strip.childElementCount ? strip : null, tilesBox, weightCard, waterCard, movementCard, medCard, foodCard, extraCard);
  paintTiles(); paintInfo(); paintWater();
}

/* ---------- meditation timer ---------- */
// The start time is kept in this browser, so the timer keeps counting if you leave the page or lock the phone.
function meditationTimer(date, addMinutes) {
  const KEY = 'dxlvi.timer';
  const read = () => { try { const t = JSON.parse(LS.get(KEY)); return t && Number.isFinite(t.start) ? t : null; } catch { return null; } };
  const box = h('div', { class: 'timer' });
  let tick = null;
  const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function paint() {
    clearInterval(tick);
    const t = read();
    if (!t) {
      const target = h('select', { id: 'timer-target', 'aria-label': 'Length' }, [0, 5, 10, 15, 20, 30].map((m) => h('option', { value: m }, m ? `${m} minutes` : 'No set length')));
      box.replaceChildren(h('div', { class: 'row' }, target, h('button', { class: 'btn', type: 'button', onclick: () => { LS.set(KEY, JSON.stringify({ start: Date.now(), target: Number(target.value) })); paint(); } }, 'Start timer')));
      return;
    }
    const time = h('div', { class: 'clock', role: 'timer' }, '0:00');
    const note = h('div', { class: 'sub' });
    const which = h('select', { id: 'timer-which', 'aria-label': 'Add to' }, [['meditationAm', 'Morning'], ['meditationPm', 'Evening']].map(([k, l]) => h('option', { value: k, selected: (new Date(t.start).getHours() < 12 ? 'meditationAm' : 'meditationPm') === k ? true : null }, l)));
    let buzzed = false;
    const update = () => {
      const ms = Date.now() - t.start;
      time.textContent = clock(ms);
      if (t.target) {
        note.textContent = ms >= t.target * 60000 ? `Your ${t.target} minutes are up.` : `${t.target} minute session`;
        if (ms >= t.target * 60000 && !buzzed) { buzzed = true; try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ } }
      }
    };
    update();
    tick = setInterval(() => { if (!time.isConnected) { clearInterval(tick); return; } update(); }, 500);
    box.replaceChildren(time, note, h('div', { class: 'row' }, which,
      h('button', { class: 'btn', type: 'button', onclick: () => { const min = Math.max(1, Math.round((Date.now() - t.start) / 60000)); LS.del(KEY); clearInterval(tick); addMinutes(min, which.value); toast(`Added ${min} ${min === 1 ? 'minute' : 'minutes'} to ${date === todayStr() ? 'today' : mediumDate(date)}.`); } }, 'Stop and add'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { LS.del(KEY); paint(); } }, 'Discard')));
  }
  paint();
  return box;
}

/* ---------- History ---------- */
function chipsFor(e) {
  const c = [];
  if (e.strength) c.push(h('span', { class: 'chip' }, 'Strength'));
  if (e.cardio?.min) c.push(h('span', { class: 'chip' }, `Cardio ${fmt1(e.cardio.min)}m`)); else if (e.cardio) c.push(h('span', { class: 'chip' }, 'Cardio'));
  if (e.flex?.min) c.push(h('span', { class: 'chip' }, `Flex ${fmt1(e.flex.min)}m`)); else if (e.flex) c.push(h('span', { class: 'chip' }, 'Flex'));
  const med = (e.meditationAm?.min || 0) + (e.meditationPm?.min || 0);
  if (med) c.push(h('span', { class: 'chip' }, `Meditate ${fmt1(med)}m`)); else if (e.meditationAm || e.meditationPm) c.push(h('span', { class: 'chip' }, 'Meditate'));
  if (e.water) c.push(h('span', { class: 'chip' }, `${fmt1(waterTotal(e))} oz water`));
  if (e.steps) c.push(h('span', { class: 'chip' }, `${e.steps.toLocaleString()} steps`));
  if (e.alcohol?.had) c.push(h('span', { class: 'chip alc' }, 'Alcohol'));
  return c;
}
const searchText = (e) => [e.food, e.notes, e.weightNote, e.strength?.note, e.cardio?.note, e.flex?.note, e.meditationAm?.note, e.meditationPm?.note, e.alcohol?.note].filter(Boolean).join(' ').toLowerCase();

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
  const mode = LS.get('dxlvi.hmode') === 'list' ? 'list' : 'calendar';
  const cal = calendarCard((d) => { location.hash = `#/log/${d}`; });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, [['calendar', 'Calendar'], ['list', 'List']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(k === mode), onclick: () => { LS.set('dxlvi.hmode', k); viewHistory(); } }, label)));
  shell('history', h('div', { class: 'card' }, h('h2', null, 'History'), h('p', { class: 'sub' }, `${days.length} days logged. Tap a day to edit it.`), h('div', { class: 'row' }, seg), mode === 'list' ? search : null), mode === 'calendar' ? cal : list);
  if (mode === 'list') paint();
}

/* ---------- routing ---------- */
function render() {
  if (!state.token) return renderLogin();
  stopObserving();
  const [, view = 'log', arg] = location.hash.split('/');
  if (view === 'history') viewHistory();
  else if (view === 'trends') viewTrends();
  else if (view === 'measure') viewMeasure(arg);
  else if (view === 'meds') viewMeds();
  else if (view === 'settings') viewSettings();
  else viewLog(arg);
}
window.addEventListener('hashchange', () => { flush(); render(); });
setSignOutHandler(() => renderLogin());

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
