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
