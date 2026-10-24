import { getStore } from '@netlify/blobs';
import { blobsKV } from '../../server/kv.mjs';
import { createHandler } from '../../server/router.mjs';

// One site-wide store. "strong" makes a change visible on the very next read.
const kv = blobsKV(getStore({ name: 'dxlvi', consistency: 'strong' }));
const handler = createHandler({ kv, env: process.env });

export default async (req) => handler(req);

export const config = { path: '/api/*' };
