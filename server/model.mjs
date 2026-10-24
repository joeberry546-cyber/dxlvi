// Data rules for DXLVI: what an entry looks like, how it is cleaned, and how imports merge.
import { MEASURE_KEYS } from '../public/js/fields.js';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const DEFAULT_SETTINGS = {
  heightIn: 74.5, // 6 ft 2.5 in
  birthday: null, // YYYY-MM-DD, optional
  start: null, // { date, weight }, set from the first imported weigh-in or by hand
  units: 'in', // 'in' or 'cm' for measurements (weight is always lb)
  waterTargetOz: null, // optional goal; leave null to hide
  goals: {}, // optional goals, e.g. { weight: 400, belly: 60 }
};

const str = (v, max) => {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\r\n/g, '\n').trim();
  return t.length > max ? t.slice(0, max) : t;
};
const num = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
};

const MIN_SECTIONS = ['cardio', 'flex', 'meditationAm', 'meditationPm'];

// Stretching and balance used to be two sections. They are now one ("flex").
// Old entries are folded together whenever they are read or written.
export function migrateEntry(raw) {
  if (!raw || typeof raw !== 'object' || (raw.stretch === undefined && raw.balance === undefined)) return raw;
  const e = { ...raw };
  const a = e.stretch, b = e.balance;
  delete e.stretch;
  delete e.balance;
  if (!e.flex) {
    const min = (Number(a?.min) || 0) + (Number(b?.min) || 0);
    const note = [a?.note, b?.note].filter((x) => typeof x === 'string' && x.trim()).join(' · ');
    if (min > 0 || note) e.flex = { ...(min > 0 ? { min } : {}), ...(note ? { note } : {}) };
  }
  return e;
}

// Returns only meaningful, valid fields. Anything empty is dropped, so an
// entry with nothing in it comes back as {}.
export function sanitizeEntry(input) {
  const e = {};
  if (!input || typeof input !== 'object') return e;
  const raw = migrateEntry(input);

  const weight = num(raw.weight, 50, 1500);
  if (weight !== null) {
    e.weight = weight;
    const wn = str(raw.weightNote, 300);
    const ws = str(raw.weightSource, 120);
    if (wn) e.weightNote = wn;
    if (ws) e.weightSource = ws;
    if (raw.weightFlag === 'review') e.weightFlag = 'review';
  }

  if (raw.strength && typeof raw.strength === 'object') {
    const note = str(raw.strength.note, 300);
    const done = raw.strength.done === true || note !== '';
    if (done) e.strength = { done: true, ...(note ? { note } : {}) };
  }

  for (const k of MIN_SECTIONS) {
    const s = raw[k];
    if (!s || typeof s !== 'object') continue;
    const min = num(s.min, 0, 1440);
    const note = str(s.note, 300);
    if (min !== null && min > 0) e[k] = { min, ...(note ? { note } : {}) };
    else if (note) e[k] = { note };
  }

  if (Array.isArray(raw.water)) {
    const w = raw.water.map((x) => num(x, 0.1, 200)).filter((x) => x !== null).slice(0, 120);
    if (w.length) e.water = w;
  }

  const steps = num(raw.steps, 0, 200000);
  if (steps !== null) e.steps = Math.round(steps);

  const food = str(raw.food, 4000);
  if (food) e.food = food;

  if (raw.alcohol && typeof raw.alcohol === 'object') {
    const note = str(raw.alcohol.note, 300);
    if (raw.alcohol.had === true || note) e.alcohol = { had: raw.alcohol.had === true, ...(note ? { note } : {}) };
  }

  const notes = str(raw.notes, 4000);
  if (notes) e.notes = notes;

  return e;
}

export const isEmptyEntry = (e) => Object.keys(e).filter((k) => k !== 'updatedAt').length === 0;

// Import merge: fill in what is missing, never overwrite what is already there.
export function mergeFill(existing, incoming) {
  const out = { ...existing };
  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'updatedAt') continue;
    // The note, source and flag belong to the weight and travel with it below.
    if (k === 'weightNote' || k === 'weightSource' || k === 'weightFlag') continue;
    if (k === 'weight') {
      if (out.weight === undefined) {
        out.weight = v;
        for (const extra of ['weightNote', 'weightSource', 'weightFlag']) if (incoming[extra]) out[extra] = incoming[extra];
        changed = true;
      }
      continue;
    }
    if (k === 'notes') {
      if (!out.notes) { out.notes = v; changed = true; }
      else if (!out.notes.includes(v)) { out.notes = `${out.notes}\n${v}`.slice(0, 4000); changed = true; }
      continue;
    }
    if (out[k] === undefined) { out[k] = v; changed = true; }
  }
  return { entry: out, changed };
}


/* ---------- body measurements (one session per date, inches) ---------- */
export function sanitizeMeasurement(raw) {
  const m = {};
  if (!raw || typeof raw !== 'object') return m;
  for (const k of MEASURE_KEYS) {
    const v = num(raw[k], 1, 150);
    if (v !== null) m[k] = v;
  }
  const note = str(raw.note, 1000);
  if (note) m.note = note;
  return m;
}
export const isEmptyMeasurement = (m) => Object.keys(m).filter((k) => k !== 'updatedAt').length === 0;

export function mergeMeasurementFill(existing, incoming) {
  const out = { ...existing };
  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'updatedAt') continue;
    if (k === 'note') {
      if (!out.note) { out.note = v; changed = true; }
      else if (!out.note.includes(v)) { out.note = `${out.note}\n${v}`.slice(0, 1000); changed = true; }
    } else if (out[k] === undefined) { out[k] = v; changed = true; }
  }
  return { entry: out, changed };
}

/* ---------- medications and supplements ---------- */
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export function sanitizeMeds(list, makeId) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list.slice(0, 300) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const name = str(raw.name, 120);
    if (!name) continue;
    let id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : makeId();
    while (seen.has(id)) id = makeId();
    seen.add(id);
    const item = { id, name };
    for (const [k, max] of [['dose', 120], ['schedule', 200], ['note', 1000]]) {
      const v = str(raw[k], max);
      if (v) item[k] = v;
    }
    if (isValidDate(raw.start)) item.start = raw.start;
    if (isValidDate(raw.end)) item.end = raw.end;
    out.push(item);
  }
  return out;
}
