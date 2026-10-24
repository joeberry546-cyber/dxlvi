// A tiny key/value layer. Production uses Netlify Blobs; local development and
// tests use plain JSON files so nothing needs a Netlify account.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function blobsKV(store) {
  return {
    async getJSON(key) {
      const r = await store.getWithMetadata(key, { type: 'json' });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    // etag === null means "create only if the key does not exist yet".
    async putJSON(key, data, etag) {
      const r = await store.setJSON(key, data, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      return r.modified;
    },
    async putJSONForce(key, data) {
      await store.setJSON(key, data);
    },
    async list(prefix) {
      const keys = [];
      for await (const page of store.list({ prefix, paginate: true })) {
        for (const b of page.blobs) keys.push(b.key);
      }
      return keys;
    },
    async del(key) {
      await store.delete(key);
    },
  };
}

export function fileKV(dir) {
  const fileFor = (key) => path.join(dir, ...key.split('/')) + '.json';
  const etagOf = (text) => crypto.createHash('sha1').update(text).digest('hex');
  let chain = Promise.resolve(); // serialize writes so compare-and-set is atomic in-process
  const locked = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  return {
    async getJSON(key) {
      try {
        const text = await fs.readFile(fileFor(key), 'utf8');
        return { data: JSON.parse(text), etag: etagOf(text) };
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    putJSON: (key, data, etag) =>
      locked(async () => {
        const file = fileFor(key);
        let current = null;
        try { current = await fs.readFile(file, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        if (etag === null ? current !== null : current === null || etagOf(current) !== etag) return false;
        await fs.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(data));
        await fs.rename(tmp, file);
        return true;
      }),
    putJSONForce: (key, data) =>
      locked(async () => {
        const file = fileFor(key);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(data));
      }),
    async list(prefix) {
      const out = [];
      const walk = async (d, rel) => {
        let items = [];
        try { items = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
        for (const it of items) {
          if (it.isDirectory()) await walk(path.join(d, it.name), rel + it.name + '/');
          else if (it.name.endsWith('.json')) out.push(rel + it.name.slice(0, -5));
        }
      };
      await walk(dir, '');
      return out.filter((k) => k.startsWith(prefix));
    },
    async del(key) {
      try { await fs.unlink(fileFor(key)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    },
  };
}
