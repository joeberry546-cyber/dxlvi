// Settings: you, goals, theme, importing history, and downloading your data.
import { h, todayStr, round1, ageOn, parseCSV, download, isDateStr } from './util.js';
import { state, shell, saveSettings, signOut, flush, toast, LS, api, loadData, hasData, waterTotal } from './core.js';
import { MEASURE_KEYS, measureLabel } from './fields.js';

const GOAL_KEYS = ['neck', 'chest', 'waist', 'belly', 'hips'];

function entriesToCSV() {
  const cols = ['date', 'weight_lb', 'strength', 'strength_note', 'cardio_min', 'cardio_note', 'flex_min', 'flex_note', 'meditation_am_min', 'meditation_am_note', 'meditation_pm_min', 'meditation_pm_note', 'water_oz', 'steps', 'food', 'alcohol', 'alcohol_note', 'notes'];
  const q = (v) => { const t = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = Object.keys(state.entries).filter((d) => hasData(state.entries[d])).sort().map((d) => {
    const e = state.entries[d];
    return [d, e.weight, e.strength ? 'yes' : '', e.strength?.note, e.cardio?.min, e.cardio?.note, e.flex?.min, e.flex?.note, e.meditationAm?.min, e.meditationAm?.note, e.meditationPm?.min, e.meditationPm?.note, e.water ? waterTotal(e) : '', e.steps, e.food, e.alcohol?.had ? 'yes' : '', e.alcohol?.note, e.notes].map(q).join(',');
  });
  return [cols.join(','), ...rows].join('\n');
}
function measurementsToCSV() {
  const cols = ['date', ...MEASURE_KEYS.map((k) => `${k}_in`), 'note'];
  const q = (v) => { const t = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = Object.keys(state.measurements).sort().map((d) => { const m = state.measurements[d]; return [d, ...MEASURE_KEYS.map((k) => m[k]), m.note].map(q).join(','); });
  return [cols.join(','), ...rows].join('\n');
}

// Reads the CSV files from the Seed data folder (and any exported by this app) and sends them to the server in batches.
async function importFiles(files, out) {
  const entries = [], measurements = [];
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
    } else if (MEASURE_KEYS.some((k) => keys.includes(`${k}_in`) || keys.includes(`${k}_cm`))) {
      for (const r of rows) {
        if (!isDateStr(r.date)) continue;
        const m = { date: r.date, note: r.note || undefined };
        for (const k of MEASURE_KEYS) {
          if (r[`${k}_in`]) m[k] = Number(r[`${k}_in`]);
          else if (r[`${k}_cm`]) m[k] = Number(r[`${k}_cm`]) / 2.54;
        }
        measurements.push(m);
      }
    } else if (keys.includes('meditation_morning_min') || keys.includes('steps')) {
      for (const r of rows) {
        if (!isDateStr(r.date)) continue;
        const extra = [r.note, r.workout_note, r.miles ? `${r.miles} mi` : '', r.floors ? `${r.floors} floors` : ''].filter(Boolean).join(' · ');
        entries.push({ date: r.date, steps: r.steps ? Number(r.steps) : undefined, meditationAm: r.meditation_morning_min ? { min: Number(r.meditation_morning_min) } : undefined, meditationPm: r.meditation_evening_min ? { min: Number(r.meditation_evening_min) } : undefined, notes: extra || undefined });
      }
    } else out.append(h('p', { class: 'sub' }, `Skipped ${f.name}: not a file I recognize.`));
  }
  const total = { created: 0, merged: 0, unchanged: 0, sessions: 0 };
  for (let i = 0; i < entries.length; i += 300) {
    const r = await api('import', { method: 'POST', body: { entries: entries.slice(i, i + 300), start: i === 0 ? start : undefined } });
    for (const k of ['created', 'merged', 'unchanged']) total[k] += r[k];
  }
  if (measurements.length) {
    const r = await api('import', { method: 'POST', body: { entries: [], measurements } });
    total.sessions = (r.sessions?.created || 0) + (r.sessions?.merged || 0);
  }
  await loadData();
  return total;
}

export function viewSettings() {
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

  // Goals are optional. Leave a box empty and nothing about that goal shows up anywhere.
  const goalIn = (key, label, unit, id) => h('label', { class: 'field grow', for: id }, `${label} (${unit})`,
    h('input', { id, type: 'number', inputmode: 'decimal', step: '0.1', min: '0', placeholder: 'No goal', value: stg.goals?.[key] ?? '', onchange: (ev) => {
      const goals = { ...(state.settings.goals || {}) };
      if (ev.target.value === '' || Number(ev.target.value) <= 0) delete goals[key]; else goals[key] = Number(ev.target.value);
      saveSettings({ goals });
    } }));
  const goalsCard = h('section', { class: 'card' }, h('h2', null, 'Goals (optional)'),
    h('p', { class: 'sub' }, 'Skip these if you only want trends. A goal adds a dotted line on its chart and a "to go" tile. Measurement goals are in inches.'),
    h('div', { class: 'row' }, goalIn('weight', 'Weight', 'lb', 'goal-weight')),
    h('div', { class: 'row' }, GOAL_KEYS.map((k) => goalIn(k, measureLabel(k), 'in', `goal-${k}`))));

  const theme = h('select', { id: 'theme', onchange: (ev) => { const v = ev.target.value; if (v === 'system') { LS.del('dxlvi.theme'); delete document.documentElement.dataset.theme; } else { LS.set('dxlvi.theme', v); document.documentElement.dataset.theme = v; } } },
    ['system', 'light', 'dark', 'blush', 'forest', 'sage', 'slate', 'terracotta', 'plum'].map((v) => h('option', { value: v, selected: (LS.get('dxlvi.theme') || 'system') === v ? true : null }, ({ system: 'Match my device', light: 'Light (earthy)', dark: 'Dark (night log)', blush: 'Blush (elegant)', forest: 'Forest (moody)', sage: 'Sage and linen', slate: 'Slate and ocean', terracotta: 'Terracotta sunset', plum: 'Midnight plum' })[v])));
  const result = h('div', { class: 'grid', style: 'display:grid;gap:6px' });
  const fileIn = h('input', { id: 'import-files', type: 'file', accept: '.csv,text/csv', multiple: true, 'aria-label': 'Choose history files' });
  const importBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (!fileIn.files.length) { result.replaceChildren(h('p', { class: 'sub' }, 'Choose one or more history files first.')); return; }
    importBtn.disabled = true; result.replaceChildren(h('p', { class: 'sub' }, 'Importing…'));
    try {
      const t = await importFiles([...fileIn.files], result);
      result.append(h('p', { class: 'sub', role: 'status' }, `Done. ${t.created} new days, ${t.merged} days filled in, ${t.unchanged} already there${t.sessions ? `, ${t.sessions} measurement ${t.sessions === 1 ? 'session' : 'sessions'}` : ''}.`));
      fileIn.value = '';
    } catch (err) { result.append(h('p', { class: 'error-text' }, err.message)); }
    importBtn.disabled = false;
  } }, 'Import history');

  shell('settings',
    h('section', { class: 'card' }, h('h2', null, 'You'),
      h('div', { class: 'field' }, 'Height', h('div', { class: 'row' }, ftIn, h('span', null, 'ft'), inIn, h('span', null, 'in'))),
      h('label', { class: 'field', for: 'bday' }, 'Birthday (optional)', bday), ageEl,
      h('label', { class: 'field', for: 'water-goal' }, 'Daily water goal in oz (leave empty to hide)', water)),
    goalsCard,
    h('section', { class: 'card' }, h('h2', null, 'Where it began'), h('p', { class: 'sub' }, 'Your first weigh-in. It draws the dotted line on your chart.'),
      h('div', { class: 'row' }, h('label', { class: 'field grow', for: 'start-date' }, 'Date', sDate), h('label', { class: 'field grow', for: 'start-wt' }, 'Weight (lb)', sWt))),
    h('section', { class: 'card' }, h('h2', null, 'Look'), h('label', { class: 'field', for: 'theme' }, 'Theme', theme)),
    h('section', { class: 'card' }, h('h2', null, 'Bring in old history'), h('p', { class: 'sub' }, 'Choose the CSV files from your Seed data folder: weights, extras, steps and measurements. Importing only fills gaps, so it is safe to run again.'), fileIn, importBtn, result),
    h('section', { class: 'card' }, h('h2', null, 'Your data'), h('p', { class: 'sub' }, 'Keep a copy of everything. The JSON file is a full backup, including measurements and medications. The CSV files open in a spreadsheet.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: async () => { try { const r = await fetch('/api/export', { headers: { authorization: `Bearer ${state.token}` } }); download(`dxlvi-export-${todayStr()}.json`, await r.text(), 'application/json'); } catch (e) { toast(e.message); } } }, 'Download backup (JSON)'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`dxlvi-days-${todayStr()}.csv`, entriesToCSV(), 'text/csv') }, 'Download days (CSV)'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => download(`dxlvi-measurements-${todayStr()}.csv`, measurementsToCSV(), 'text/csv') }, 'Download measurements (CSV)'))),
    h('section', { class: 'card' }, h('h2', null, 'Account'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { flush(); signOut(); } }, 'Sign out')));
}
