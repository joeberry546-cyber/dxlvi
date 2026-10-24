// Shared plumbing: state, talking to the server, autosave, and the page frame.
import { h, s, todayStr, utcDay } from './util.js';

export const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const state = {
  token: LS.get('dxlvi.token'),
  entries: {},
  measurements: {},
  meds: [],
  settings: { heightIn: 74.5, birthday: null, start: null, units: 'in', waterTargetOz: null, goals: {} },
};
export const app = document.getElementById('app');
export const MINS = ['cardio', 'flex', 'meditationAm', 'meditationPm'];
export const BAND = { from: '2013-01-01', to: '2014-01-04', label: 'The 100 pound year' };

let onSignOut = () => {};
export const setSignOutHandler = (fn) => { onSignOut = fn; };

export async function api(path, { method = 'GET', body, keepalive } = {}) {
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

export async function loadData() {
  const d = await api('data');
  state.entries = d.entries;
  state.measurements = d.measurements || {};
  state.meds = d.meds || [];
  state.settings = { ...state.settings, ...d.settings };
}

export function signOut() {
  state.token = null;
  LS.del('dxlvi.token');
  onSignOut();
}

/* ---------- saving days (automatic, a moment after you stop typing) ---------- */
const dirty = new Set();
let saveTimer = null, retryTimer = null, statusEl = null;
let status = { kind: 'saved', msg: '' };

export function setStatus(kind, msg = '') { status = { kind, msg }; paintStatus(); }
function paintStatus() {
  if (!statusEl) return;
  statusEl.className = `status${status.kind === 'error' ? ' error' : ''}`;
  statusEl.textContent = status.kind === 'saving' ? 'Saving…' : status.kind === 'error' ? `Not saved yet. ${status.msg}` : status.msg || 'All changes saved';
}

export function markDirty(date) {
  tidy(date);
  dirty.add(date);
  setStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}

export async function flush() {
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

export async function saveSettings(patch) {
  setStatus('saving');
  try {
    state.settings = { ...state.settings, ...(await api('settings', { method: 'PUT', body: patch })) };
    setStatus('saved');
  } catch (err) { setStatus('error', err.message); }
}

export async function saveMeasurement(date, session) {
  setStatus('saving');
  try {
    const r = await api(`measurements/${date}`, { method: 'PUT', body: session });
    if (r.session) state.measurements[date] = r.session; else delete state.measurements[date];
    setStatus('saved');
    return true;
  } catch (err) { setStatus('error', err.message); return false; }
}
export async function deleteMeasurement(date) {
  setStatus('saving');
  try { await api(`measurements/${date}`, { method: 'DELETE' }); delete state.measurements[date]; setStatus('saved'); return true; }
  catch (err) { setStatus('error', err.message); return false; }
}
export async function saveMeds(items) {
  setStatus('saving');
  try { state.meds = (await api('meds', { method: 'PUT', body: { items } })).items; setStatus('saved'); return true; }
  catch (err) { setStatus('error', err.message); return false; }
}

/* ---------- entries ---------- */
export const entryFor = (date) => (state.entries[date] ||= {});
export const hasText = (v) => typeof v === 'string' && v.trim() !== '';
export const hasData = (e) => e && Object.keys(e).some((k) => k !== 'updatedAt');
export const waterTotal = (e) => (e.water || []).reduce((a, b) => a + b, 0);
export const numOrNull = (v) => (v === '' || v === null ? null : Number(v));

// Remove empty pieces so a day with nothing in it disappears from the history.
export function tidy(date) {
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

export function weightSeries() {
  return Object.entries(state.entries)
    .filter(([, e]) => typeof e.weight === 'number')
    .map(([d, e]) => ({ d, t: utcDay(d), v: e.weight, flag: e.weightFlag === 'review' }))
    .sort((a, b) => a.t - b.t);
}

/* ---------- page frame ---------- */
const icons = {
  log: 'M12 5v14M5 12h14',
  history: 'M4 6h16M4 12h16M4 18h10',
  measure: 'M3 8h18v8H3zM7 8v4M11 8v3M15 8v4M19 8v3',
  meds: 'M8.5 3.5l12 12a4.2 4.2 0 0 1-6 6l-12-12a4.2 4.2 0 0 1 6-6zM8 9l7 7',
  trends: 'M3 17l6-6 4 4 8-9',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
};
export function nav(active) {
  const link = (key, label, href) =>
    h('a', { href, 'aria-current': active === key ? 'page' : null }, s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d: icons[key] })), label);
  return h('nav', { class: 'nav', 'aria-label': 'Main' },
    link('log', 'Log', `#/log/${todayStr()}`), link('history', 'History', '#/history'), link('measure', 'Measure', '#/measure'),
    link('meds', 'Meds', '#/meds'), link('trends', 'Trends', '#/trends'), link('settings', 'Settings', '#/settings'));
}
export function shell(active, ...content) {
  statusEl = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  app.replaceChildren(h('div', { class: 'shell' }, h('header', { class: 'topbar' }, h('span', { class: 'wordmark' }, 'DXLVI'), statusEl), ...content), nav(active));
  paintStatus();
  window.scrollTo(0, 0);
}
export function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
