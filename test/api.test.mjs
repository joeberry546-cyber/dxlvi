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
