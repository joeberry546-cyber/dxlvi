import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function makeToken(secret, days = 30, now = Date.now()) {
  const exp = Math.floor(now / 1000) + days * 86400;
  const sig = crypto.createHmac('sha256', secret).update(String(exp)).digest();
  return { token: `${exp}.${b64u(sig)}`, exp };
}

export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || !sig || exp < Math.floor(now / 1000)) return false;
  const good = b64u(crypto.createHmac('sha256', secret).update(String(exp)).digest());
  return safeEqual(sig, good);
}

export function deriveSecret(env) {
  return env.SESSION_SECRET || crypto.createHash('sha256').update('dxlvi:' + (env.APP_PASSCODE || '')).digest('hex');
}
