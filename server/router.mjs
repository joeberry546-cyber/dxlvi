// All of the API logic. Netlify and the local dev server both call this.
import { DEFAULT_SETTINGS, isEmptyEntry, isValidDate, mergeFill, sanitizeEntry } from './model.mjs';
import { deriveSecret, makeToken, safeEqual, verifyToken } from './auth.mjs';

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
const fail = (status, error) => json({ error }, status);

const monthOf = (date) => date.slice(0, 7);

async function updateMonth(kv, ym, mutate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const cur = await kv.getJSON(`entries/${ym}`);
    const data = cur ? structuredClone(cur.data) : {};
    const result = mutate(data);
    if (await kv.putJSON(`entries/${ym}`, data, cur ? cur.etag : null)) return result;
    // Someone else saved this month first. Wait a moment, then read it again.
    await new Promise((r) => setTimeout(r, 5 + Math.random() * 40));
  }
  throw new Error('Could not save after several attempts. Please try again.');
}

async function loadAll(kv) {
  const keys = (await kv.list('entries/')).sort();
  const entries = {};
  for (let i = 0; i < keys.length; i += 16) {
    const chunk = await Promise.all(keys.slice(i, i + 16).map((k) => kv.getJSON(k)));
    for (const c of chunk) if (c) Object.assign(entries, c.data);
  }
  const s = await kv.getJSON('settings');
  return { entries, settings: { ...DEFAULT_SETTINGS, ...(s ? s.data : {}) } };
}

function sanitizeSettings(raw, current) {
  const s = { ...current };
  if (raw.heightIn !== undefined) {
    const h = Number(raw.heightIn);
    if (Number.isFinite(h) && h >= 36 && h <= 96) s.heightIn = Math.round(h * 100) / 100;
  }
  if (raw.birthday !== undefined) s.birthday = raw.birthday === null || raw.birthday === '' ? null : isValidDate(raw.birthday) ? raw.birthday : s.birthday;
  if (raw.units === 'in' || raw.units === 'cm') s.units = raw.units;
  if (raw.waterTargetOz !== undefined) {
    const w = Number(raw.waterTargetOz);
    s.waterTargetOz = raw.waterTargetOz === null || raw.waterTargetOz === '' ? null : Number.isFinite(w) && w > 0 && w <= 500 ? w : s.waterTargetOz;
  }
  if (raw.start !== undefined) {
    if (raw.start === null) s.start = null;
    else if (isValidDate(raw.start?.date) && Number.isFinite(Number(raw.start?.weight)) && Number(raw.start.weight) > 50) {
      s.start = { date: raw.start.date, weight: Number(raw.start.weight) };
    }
  }
  if (raw.goals && typeof raw.goals === 'object') {
    const g = {};
    for (const [k, v] of Object.entries(raw.goals)) {
      const n = Number(v);
      if (/^[a-zA-Z]{1,24}$/.test(k) && Number.isFinite(n) && n > 0 && n < 5000) g[k] = n;
    }
    s.goals = g;
  }
  return s;
}

export function createHandler({ kv, env = process.env, now = () => Date.now() }) {
  const secret = deriveSecret(env);
  const failDelay = Number(env.DXLVI_FAIL_DELAY_MS ?? 600);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function login(req) {
    if (!env.APP_PASSCODE) return fail(500, 'The passcode is not set up yet. Add APP_PASSCODE in your Netlify site settings.');
    const windowMs = 15 * 60 * 1000;
    const t = now();
    const rec = await kv.getJSON('auth/attempts');
    const recent = (rec ? rec.data.fails : []).filter((x) => t - x < windowMs);
    if (recent.length >= 8) return fail(429, 'Too many wrong tries. Wait 15 minutes and try again.');
    let body;
    try { body = await req.json(); } catch { return fail(400, 'Send the passcode as JSON.'); }
    if (typeof body?.passcode === 'string' && safeEqual(body.passcode, env.APP_PASSCODE)) {
      if (recent.length) await kv.putJSONForce('auth/attempts', { fails: [] });
      const { token, exp } = makeToken(secret, 30, t);
      return json({ token, expiresAt: exp * 1000 });
    }
    await kv.putJSONForce('auth/attempts', { fails: [...recent, t] });
    if (failDelay > 0) await sleep(failDelay);
    return fail(401, 'That passcode is not right.');
  }

  return async function handler(req) {
    try {
      const url = new URL(req.url);
      const route = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, '').replace(/^\/|\/$/g, '');
      const method = req.method.toUpperCase();

      if (route === 'login' && method === 'POST') return await login(req);
      if (route === 'ping' && method === 'GET') return json({ ok: true });

      const auth = req.headers.get('authorization') || '';
      if (!verifyToken(secret, auth.replace(/^Bearer\s+/i, ''), now())) return fail(401, 'Please sign in again.');

      if (route === 'data' && method === 'GET') return json(await loadAll(kv));

      const m = route.match(/^entries\/(\d{4}-\d{2}-\d{2})$/);
      if (m) {
        const date = m[1];
        if (!isValidDate(date)) return fail(400, 'That date is not valid.');
        if (method === 'PUT') {
          let body;
          try { body = await req.json(); } catch { return fail(400, 'Send the entry as JSON.'); }
          const clean = sanitizeEntry(body);
          const empty = isEmptyEntry(clean);
          if (!empty) clean.updatedAt = new Date(now()).toISOString();
          await updateMonth(kv, monthOf(date), (data) => {
            if (empty) delete data[date];
            else data[date] = clean;
          });
          return json({ date, entry: empty ? null : clean });
        }
        if (method === 'DELETE') {
          await updateMonth(kv, monthOf(date), (data) => { delete data[date]; });
          return json({ date, entry: null });
        }
      }

      if (route === 'settings' && method === 'PUT') {
        let body;
        try { body = await req.json(); } catch { return fail(400, 'Send settings as JSON.'); }
        const cur = await kv.getJSON('settings');
        const next = sanitizeSettings(body || {}, { ...DEFAULT_SETTINGS, ...(cur ? cur.data : {}) });
        await kv.putJSONForce('settings', next);
        return json(next);
      }

      if (route === 'import' && method === 'POST') {
        let body;
        try { body = await req.json(); } catch { return fail(400, 'Send the import as JSON.'); }
        const list = Array.isArray(body?.entries) ? body.entries.slice(0, 1000) : [];
        const byMonth = new Map();
        for (const raw of list) {
          if (!isValidDate(raw?.date)) continue;
          const clean = sanitizeEntry(raw);
          if (isEmptyEntry(clean)) continue;
          const ym = monthOf(raw.date);
          if (!byMonth.has(ym)) byMonth.set(ym, []);
          byMonth.get(ym).push([raw.date, clean]);
        }
        const tally = { created: 0, merged: 0, unchanged: 0 };
        for (const [ym, items] of byMonth) {
          await updateMonth(kv, ym, (data) => {
            for (const [date, clean] of items) {
              if (!data[date]) { data[date] = { ...clean, updatedAt: new Date(now()).toISOString() }; tally.created++; continue; }
              const { entry, changed } = mergeFill(data[date], clean);
              if (changed) { data[date] = { ...entry, updatedAt: new Date(now()).toISOString() }; tally.merged++; } else tally.unchanged++;
            }
          });
        }
        if (body?.start) {
          const cur = await kv.getJSON('settings');
          const merged = { ...DEFAULT_SETTINGS, ...(cur ? cur.data : {}) };
          if (!merged.start) await kv.putJSONForce('settings', sanitizeSettings({ start: body.start }, merged));
        }
        return json(tally);
      }

      if (route === 'export' && method === 'GET') {
        const all = await loadAll(kv);
        return json({ app: 'DXLVI', exportedAt: new Date(now()).toISOString(), ...all }, 200, {
          'content-disposition': `attachment; filename="dxlvi-export-${new Date(now()).toISOString().slice(0, 10)}.json"`,
        });
      }

      return fail(404, 'Not found.');
    } catch (err) {
      console.error(err);
      return fail(500, err.message || 'Something went wrong.');
    }
  };
}
