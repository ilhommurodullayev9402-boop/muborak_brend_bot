// Telegram Mini App initData imzosini tekshirish (HMAC-SHA256, Telegram hujjatiga ko'ra).
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(msg));
}

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function signInitData(fields, botToken) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const hash = hex(await hmac(secret, dcs));
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}

// Natija: { user } yoki { error }
export async function verifyInitData(initData, botToken, nowMs, maxAgeSec = 86400) {
  if (!initData || typeof initData !== 'string' || initData.length > 4096) return { error: 'no_init' };
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return { error: 'no_hash' };
  p.delete('hash');
  const dcs = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const calc = hex(await hmac(secret, dcs));
  if (!safeEq(calc, hash)) return { error: 'bad_sign' };
  const authDate = Number(p.get('auth_date'));
  if (!authDate || nowMs / 1000 - authDate > maxAgeSec || authDate - nowMs / 1000 > 300) return { error: 'expired' };
  let user;
  try { user = JSON.parse(p.get('user') || 'null'); } catch { return { error: 'bad_user' }; }
  if (!user || !Number.isInteger(user.id)) return { error: 'bad_user' };
  return { user: { id: user.id, first_name: user.first_name || '', username: user.username || '' } };
}

export async function sha256hex(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export function randomToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return hex(a.buffer); }
