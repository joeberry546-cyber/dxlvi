import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { fileKV } from '../server/kv.mjs';
import { createHandler } from '../server/router.mjs';

async function setup(extraEnv = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dxlvi-'));
  const env = { APP_PASSCODE: 'sesame', DXLVI_FAIL_DELAY_MS: '0', ...extraEnv };
  const handler = createHandler({ kv: fileKV(dir), env });
  const call = async (method, p, body, token) => {
    const res = await handler(new Request('http://x' + p, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  const { body } = await call('POST', '/api/login', { passcode: 'sesame' });
  return { call, token: body.token, handler };
}

test('requests without a valid token are rejected', async () => {
  const { call } = await setup();
  assert.equal((await call('GET', '/api/data')).status, 401);
  assert.equal((await call('GET', '/api/data', undefined, 'nope.nope')).status, 401);
});

test('wrong passcode is rejected and repeated misses lock out', async () => {
  const { call } = await setup();
  for (let i = 0; i < 8; i++) assert.equal((await call('POST', '/api/login', { passcode: 'bad' })).status, 401);
  assert.equal((await call('POST', '/api/login', { passcode: 'sesame' })).status, 429);
});

test('login fails safely when no passcode is configured', async () => {
  const { call } = await setup({ APP_PASSCODE: '' });
  assert.equal((await call('POST', '/api/login', { passcode: '' })).status, 500);
});

test('save, edit, backfill and delete an entry', async () => {
  const { call, token } = await setup();
  let r = await call('PUT', '/api/entries/2026-10-23', { weight: 424, water: [8, 8, 12], cardio: { min: 30, note: 'walk' }, alcohol: { had: false } }, token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.entry.water, [8, 8, 12]);
  assert.equal(r.body.entry.alcohol, undefined, 'unchecked alcohol with no note is dropped');
  await call('PUT', '/api/entries/2016-03-04', { weight: 409 }, token); // backfill an old date
  const all = await call('GET', '/api/data', undefined, token);
  assert.deepEqual(Object.keys(all.body.entries).sort(), ['2016-03-04', '2026-10-23']);
  assert.equal(all.body.settings.heightIn, 74.5);
  r = await call('PUT', '/api/entries/2026-10-23', { weight: 423.4 }, token); // full replace
  assert.equal(r.body.entry.cardio, undefined);
  r = await call('PUT', '/api/entries/2026-10-23', { weight: '', food: '  ' }, token); // emptied out
  assert.equal(r.body.entry, null);
  assert.equal(Object.keys((await call('GET', '/api/data', undefined, token)).body.entries).length, 1);
});

test('bad input is cleaned or refused', async () => {
  const { call, token } = await setup();
  assert.equal((await call('PUT', '/api/entries/2026-02-31', { weight: 400 }, token)).status, 400);
  const r = await call('PUT', '/api/entries/2026-03-01', { weight: 99999, steps: -5, cardio: { min: 'abc' }, junk: 1 }, token);
  assert.equal(r.body.entry, null);
});

test('import fills gaps, never overwrites, and is safe to run twice', async () => {
  const { call, token } = await setup();
  await call('PUT', '/api/entries/2013-01-01', { weight: 490, notes: 'mine' }, token);
  const payload = {
    start: { date: '2012-08-13', weight: 546 },
    entries: [
      { date: '2012-08-13', weight: 546, weightNote: 'Starting weight', weightSource: 'sheet' },
      { date: '2013-01-01', weight: 491, notes: 'from memory' },
      { date: '2016-08-08', weight: 405.6, weightFlag: 'review', weightNote: 'Review: carried forward' },
      { date: '2015-02-02', steps: 4047, meditationAm: { min: 5 } },
      { date: '2015-02-03', weight: null },
    ],
  };
  const first = await call('POST', '/api/import', payload, token);
  assert.deepEqual(first.body, { created: 3, merged: 1, unchanged: 0 });
  const second = await call('POST', '/api/import', payload, token);
  assert.deepEqual(second.body, { created: 0, merged: 0, unchanged: 4 });
  const { body } = await call('GET', '/api/data', undefined, token);
  assert.equal(body.entries['2013-01-01'].weight, 490, 'existing weight kept');
  assert.match(body.entries['2013-01-01'].notes, /mine[\s\S]*from memory/);
  assert.equal(body.entries['2016-08-08'].weightFlag, 'review');
  assert.equal(body.entries['2015-02-02'].meditationAm.min, 5);
  assert.deepEqual(body.settings.start, { date: '2012-08-13', weight: 546 });
});

test('settings validate and persist', async () => {
  const { call, token } = await setup();
  let r = await call('PUT', '/api/settings', { heightIn: 74.5, birthday: '1982-10-09', units: 'cm', waterTargetOz: 96 }, token);
  assert.equal(r.body.units, 'cm');
  r = await call('PUT', '/api/settings', { heightIn: 5, birthday: 'not a date', units: 'furlongs' }, token);
  assert.equal(r.body.heightIn, 74.5);
  assert.equal(r.body.birthday, '1982-10-09');
  assert.equal(r.body.units, 'cm');
});

test('simultaneous saves to the same month do not lose entries', async () => {
  const { call, token } = await setup();
  await Promise.all(Array.from({ length: 12 }, (_, i) => call('PUT', `/api/entries/2026-10-${String(i + 1).padStart(2, '0')}`, { weight: 430 - i }, token)));
  assert.equal(Object.keys((await call('GET', '/api/data', undefined, token)).body.entries).length, 12);
});

test('export returns everything', async () => {
  const { call, token } = await setup();
  await call('PUT', '/api/entries/2026-10-23', { weight: 424 }, token);
  const r = await call('GET', '/api/export', undefined, token);
  assert.equal(r.body.app, 'DXLVI');
  assert.equal(r.body.entries['2026-10-23'].weight, 424);
});

test('stretching and balance fold into one flex section', async () => {
  const { call, token } = await setup();
  const r = await call('PUT', '/api/entries/2026-10-20', { stretch: { min: 10, note: 'hamstrings' }, balance: { min: 5, note: 'one leg' } }, token);
  assert.deepEqual(r.body.entry.flex, { min: 15, note: 'hamstrings · one leg' });
  assert.equal(r.body.entry.stretch, undefined);
  assert.equal(r.body.entry.balance, undefined);
});

test('measurements save, clean, merge on import, and delete', async () => {
  const { call, token } = await setup();
  let r = await call('PUT', '/api/measurements/2026-09-04', { belly: 65.5, neck: 'x', armLooseL: 17, bogus: 9, note: ' first ' }, token);
  assert.deepEqual({ belly: r.body.session.belly, armLooseL: r.body.session.armLooseL, note: r.body.session.note, neck: r.body.session.neck, bogus: r.body.session.bogus }, { belly: 65.5, armLooseL: 17, note: 'first', neck: undefined, bogus: undefined });
  r = await call('POST', '/api/import', { measurements: [{ date: '2026-09-04', belly: 70, waist: 60 }, { date: '2026-10-01', belly: 64 }, { date: 'nope', belly: 1 }] }, token);
  assert.deepEqual(r.body.sessions, { created: 1, merged: 1, unchanged: 0 });
  const data = (await call('GET', '/api/data', undefined, token)).body;
  assert.equal(data.measurements['2026-09-04'].belly, 65.5, 'existing value kept');
  assert.equal(data.measurements['2026-09-04'].waist, 60, 'gap filled');
  assert.equal(data.measurements['2026-10-01'].belly, 64);
  await call('DELETE', '/api/measurements/2026-10-01', undefined, token);
  assert.equal((await call('GET', '/api/data', undefined, token)).body.measurements['2026-10-01'], undefined);
  assert.equal((await call('PUT', '/api/measurements/2026-02-31', { belly: 1 }, token)).status, 400);
});

test('medications can be added, changed, ended and removed', async () => {
  const { call, token } = await setup();
  let r = await call('PUT', '/api/meds', { items: [{ name: 'Vitamin D', dose: '2000 IU', start: '2026-01-01' }, { name: '' }, { name: 'Fish oil', end: '2026-05-05' }] }, token);
  assert.equal(r.body.items.length, 2);
  assert.ok(r.body.items[0].id);
  const items = r.body.items.map((m) => (m.name === 'Vitamin D' ? { ...m, end: '2026-10-01' } : m));
  await call('PUT', '/api/meds', { items }, token);
  let data = (await call('GET', '/api/data', undefined, token)).body;
  assert.equal(data.meds.find((m) => m.name === 'Vitamin D').end, '2026-10-01');
  await call('PUT', '/api/meds', { items: [] }, token);
  data = (await call('GET', '/api/data', undefined, token)).body;
  assert.deepEqual(data.meds, []);
});

test('supplies start seeded, save, and are cleaned', async () => {
  const { call, token } = await setup();
  let data = (await call('GET', '/api/data', undefined, token)).body;
  assert.deepEqual(data.supplies.cpap.cushion, ['2026-11-01']);
  assert.equal(data.supplies.vendor.phone, '(801) 507-9100');
  const r = await call('PUT', '/api/supplies', {
    vendor: { name: ' Shop ', phone: '1' },
    cpap: { cushion: ['2026-11-01', '2026-10-01', 'bad', '2026-11-01'], bogus: ['2026-01-01'] },
    glasses: { odSph: '-1.25', osAxis: '90', pd: '63', examDate: '2026-11-05', expires: 'nope', junk: 'x' },
    stockings: [{ brand: 'Jobst', strength: '20-30' }, {}, { id: 'bad id', size: 'L' }],
  }, token);
  assert.deepEqual(r.body.cpap.cushion, ['2026-11-01', '2026-10-01']);
  assert.deepEqual(r.body.cpap.filter, []);
  assert.equal(r.body.cpap.bogus, undefined);
  assert.equal(r.body.glasses.odSph, '-1.25');
  assert.equal(r.body.glasses.expires, undefined);
  assert.equal(r.body.glasses.junk, undefined);
  assert.equal(r.body.stockings.length, 2);
  assert.ok(r.body.stockings[0].id);
  data = (await call('GET', '/api/data', undefined, token)).body;
  assert.equal(data.supplies.vendor.name, 'Shop');
});

test('CPAP due dates follow the calendar or the interval', async () => {
  const { nextDue } = await import('../public/js/fields.js');
  assert.equal(nextDue({ days: [1] }, '2026-11-01'), '2026-12-01');
  assert.equal(nextDue({ days: [1] }, '2026-11-28'), '2026-12-01');
  assert.equal(nextDue({ days: [1, 15] }, '2026-11-01'), '2026-11-15');
  assert.equal(nextDue({ days: [1, 15] }, '2026-11-15'), '2026-12-01');
  assert.equal(nextDue({ days: [1, 15] }, '2026-12-20'), '2027-01-01');
  assert.equal(nextDue({ months: 3 }, '2026-11-01'), '2027-02-01');
  assert.equal(nextDue({ months: 3 }, '2026-11-30'), '2027-02-28');
});

test('reflections save with the day, are optional, and are cleaned', async () => {
  const { call, token } = await setup();
  let r = await call('PUT', '/api/entries/2026-11-11', { reflection: { expected: '  A quiet day ', actual: '', gap: 'Plans\nshift', junk: 'x' } }, token);
  assert.deepEqual(r.body.entry.reflection, { expected: 'A quiet day', gap: 'Plans shift' }, 'a reflection alone is enough to save a day');
  r = await call('PUT', '/api/entries/2026-11-12', { weight: 420, reflection: { expected: ' ', actual: '' } }, token);
  assert.equal(r.body.entry.reflection, undefined, 'an empty reflection never blocks or clutters the day');
  assert.equal(r.body.entry.weight, 420);
  const ex = await call('GET', '/api/export', undefined, token);
  assert.equal(ex.body.entries['2026-11-11'].reflection.expected, 'A quiet day');
});

test('a past reflection is resurfaced only when there are enough, preferring a month ago', async () => {
  const { pickResurfaced } = await import('../public/js/fields.js');
  const few = ['2026-10-01', '2026-10-02', '2026-10-03'];
  assert.equal(pickResurfaced(few, '2026-11-11'), null);
  const many = ['2026-09-01', '2026-09-02', '2026-10-09', '2026-10-12', '2026-10-20', '2026-11-01', '2026-11-10', '2026-11-11'];
  assert.deepEqual(pickResurfaced(many, '2026-11-11'), { date: '2026-10-12', kind: 'month' });
  const none = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
  const a = pickResurfaced(none, '2026-11-11');
  assert.equal(a.kind, 'random');
  assert.ok(none.includes(a.date));
  assert.deepEqual(pickResurfaced(none, '2026-11-11'), a, 'same pick all day');
  assert.equal(pickResurfaced(none, '2026-11-04'), null, 'never shows a later day');
});
