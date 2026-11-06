// The body measurements DXLVI tracks. The server and the app both read this list.
// Values are always stored in inches.

export const MEASURE_ROWS = [
  { group: 'Torso', label: 'Neck', keys: ['neck'] },
  { group: 'Torso', label: 'Chest', keys: ['chest'] },
  { group: 'Torso', label: 'Waist (natural)', keys: ['waist'], hint: 'The narrowest part of your torso, above the navel' },
  { group: 'Torso', label: 'Belly (navel)', keys: ['belly'], hint: 'Level with your navel, relaxed, after breathing out' },
  { group: 'Torso', label: 'Hips', keys: ['hips'], hint: 'The widest part around your hips' },
  { group: 'Arms', label: 'Upper arm, loose', keys: ['armLooseL', 'armLooseR'] },
  { group: 'Arms', label: 'Upper arm, tight', keys: ['armTightL', 'armTightR'] },
  { group: 'Arms', label: 'Forearm', keys: ['forearmL', 'forearmR'] },
  { group: 'Legs', label: 'Thigh', keys: ['thighL', 'thighR'] },
  { group: 'Legs', label: 'Calf', keys: ['calfL', 'calfR'] },
  { group: 'Legs', label: 'Ankle', keys: ['ankleL', 'ankleR'] },
];

export const MEASURE_KEYS = MEASURE_ROWS.flatMap((r) => r.keys);

const SIDE = { L: 'left', R: 'right' };
export function measureLabel(key) {
  for (const r of MEASURE_ROWS) {
    const i = r.keys.indexOf(key);
    if (i === -1) continue;
    return r.keys.length === 1 ? r.label : `${r.label} (${SIDE[key.slice(-1)]})`;
  }
  return key;
}

export const BELLY_KEY = 'belly'; // used for the belly-to-height ratio

// Medication categories and how often something is taken. Used by the Meds page and the server.
export const MED_CATEGORIES = ['Prescription', 'Over the counter', 'Supplement', 'Herbal', 'Topical', 'Other'];
export const MED_FREQUENCIES = ['Daily', 'Twice daily', 'Every other day', 'Weekly', 'Monthly', 'As needed', 'Other'];

// ---------- Supplies page: CPAP schedule, glasses prescription ----------
// rule.days = fixed days of the month (sorted); rule.months = every N months from the day it was changed.
export const CPAP_PARTS = [
  { key: 'cushion', label: 'Mask cushion', every: '1st of each month', rule: { days: [1] } },
  { key: 'filter', label: 'Filter', every: '1st and 15th of each month', rule: { days: [1, 15] } },
  { key: 'headgear', label: 'Headgear', every: 'Every 3 months', rule: { months: 3 } },
  { key: 'tubing', label: 'Tubing', every: 'Every 3 months', rule: { months: 3 } },
  { key: 'chamber', label: 'Humidifier chamber', every: 'Every 3 months', rule: { months: 3 } },
];
export const EYE_COLS = [['sph', 'Sphere'], ['cyl', 'Cylinder'], ['axis', 'Axis'], ['add', 'Add'], ['prism', 'Prism'], ['base', 'Base']];
export const EYES = [['od', 'Right (OD)'], ['os', 'Left (OS)']];
export const eyeKey = (eye, col) => eye + col[0].toUpperCase() + col.slice(1);
export const GLASSES_EXTRA = ['pd', 'pdNear', 'prescriber'];

const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayNum = (str) => { const [y, m, d] = str.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

// The next date a part is due, counting from the day it was last changed.
// Fixed-day parts are due on the next scheduled day after that date, so changing early never shifts the calendar.
export function nextDue(rule, last) {
  const [y, m, d] = last.split('-').map(Number);
  if (rule.months) {
    const t = m - 1 + rule.months;
    const yy = y + Math.floor(t / 12), mm = (t % 12) + 1;
    return ymd(yy, mm, Math.min(d, dim(yy, mm)));
  }
  for (const day of rule.days) if (day > d) return ymd(y, m, day);
  return m === 12 ? ymd(y + 1, 1, rule.days[0]) : ymd(y, m + 1, rule.days[0]);
}

// history is newest first. Returns { last, next, diff } where diff is days from today to the due date (<= 0 means due).
export function dueInfo(part, history, today) {
  const last = history && history[0];
  if (!last) return { last: null, next: null, diff: null };
  const next = nextDue(part.rule, last);
  return { last, next, diff: dayNum(next) - dayNum(today) };
}
export function dueCount(cpap, today) {
  return CPAP_PARTS.filter((p) => { const i = dueInfo(p, cpap && cpap[p.key], today); return i.diff !== null && i.diff <= 0; }).length;
}
