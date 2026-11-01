// Cloudflare Worker: Mini App sahifasini beradi, /api/* so'rovlarida Telegram imzosini tekshiradi va
// barcha hisobni bitta doimiy SQLite bazali Durable Object ("korxona") ichida tranzaksiya bilan bajaradi.
import { DurableObject } from 'cloudflare:workers';
import { handle, cronTick, migrate, AppError } from './core/index.js';
import { verifyInitData, sha256hex, randomToken } from './auth.js';

function cfgFrom(env) {
  const ownerIds = String(env.OWNER_TG_ID || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return { ownerIds };
}

export class Korxona extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    this.db = {
      all: (q, ...p) => sql.exec(q, ...p).toArray(),
      one: (q, ...p) => sql.exec(q, ...p).toArray()[0],
      run: (q, ...p) => { sql.exec(q, ...p).toArray(); },
      tx: (fn) => ctx.storage.transactionSync(fn),
    };
    ctx.blockConcurrencyWhile(async () => {
      const cur = sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").toArray().length
        ? (sql.exec("SELECT v FROM meta WHERE k='schema_version'").toArray()[0] || {}).v : null;
      const { MIGRATIONS } = await import('./schema.js');
      if (Number(cur || 0) < MIGRATIONS.length) {
        // Migratsiyadan oldin tiklash nuqtasi (Cloudflare 30 kunlik nuqtadan tiklash imkoniyati uchun)
        let bookmark = null;
        try { bookmark = await ctx.storage.getCurrentBookmark(); } catch { /* lokal muhitda bo'lmasligi mumkin */ }
        ctx.storage.transactionSync(() => {
          const ran = migrate((q, ...p) => sql.exec(q, ...p).toArray(), (q, ...p) => sql.exec(q, ...p).toArray()[0]);
          if (bookmark) sql.exec("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", 'bookmark_before_v' + ran.join('_'), bookmark);
        });
      }
    });
  }
  async call(tg, action, body, nowMs) {
    try {
      return { ok: true, ...handle(this.db, cfgFrom(this.env), tg, action, body, nowMs) };
    } catch (e) {
      if (e instanceof AppError || (e && e.code && e.params)) return { ok: false, error: e.code, params: e.params, status: e.status || 400 };
      console.error('internal', action, e && e.message);
      return { ok: false, error: 'internal', params: {}, status: 500 };
    }
  }
  async cron(nowMs) { return cronTick(this.db, cfgFrom(this.env), nowMs); }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

async function sendTelegram(env, list) {
  if (!env.BOT_TOKEN || !list || !list.length) return;
  const base = env.TG_API || 'https://api.telegram.org';
  for (const m of list.slice(0, 50)) {
    try {
      await fetch(`${base}/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: m.tg_id, text: m.text, disable_web_page_preview: true }),
      });
    } catch { /* bildirishnoma yuborilmasa ham hisob saqlangan */ }
  }
}

async function sendDocument(env, chatId, name, text) {
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', 'MUBORAK BREND — база захира нусхаси');
    fd.append('document', new Blob([text], { type: 'application/json' }), name);
    const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    return r.ok;
  } catch { return false; }
}

const stub = (env) => env.KORXONA.get(env.KORXONA.idFromName('muborak-brend'));

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (env.TEST_MODE === '1' && url.pathname === '/__test/cron') {
      // Faqat lokal sinov rejimida: eslatmalarni berilgan vaqt bilan ishga tushirish
      const r = await stub(env).cron(Number(req.headers.get('x-test-now')) || Date.now());
      await sendTelegram(env, r.notify);
      return json({ ok: true, result: r.sent });
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
    if (!env.BOT_TOKEN) return json({ ok: false, error: 'not_configured' }, 503);
    let nowMs = Date.now();
    if (env.TEST_MODE === '1' && req.headers.get('x-test-now')) nowMs = Number(req.headers.get('x-test-now'));
    const v = await verifyInitData(req.headers.get('x-init-data'), env.BOT_TOKEN, nowMs);
    if (v.error) return json({ ok: false, error: 'auth', params: { why: v.error } }, 401);
    const action = url.pathname.slice(5);
    if (!/^[a-z_]{2,40}$/.test(action)) return json({ ok: false, error: 'unknown_action' }, 404);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
    // Biometrik kalit: serverda faqat xeshi saqlanadi
    let token = null;
    if (action === 'bio_enroll') { token = randomToken(); body.token_hash = await sha256hex(token); }
    if (typeof body.bio_token === 'string' && body.bio_token) { body.bio_token_hash = await sha256hex(body.bio_token); }
    delete body.bio_token;
    const r = await stub(env).call(v.user, action, body, nowMs);
    if (!r.ok) return json({ ok: false, error: r.error, params: r.params }, r.status);
    if (r.notify && r.notify.length) ctx.waitUntil(sendTelegram(env, r.notify));
    if (action === 'export_all') {
      // Zaxira nusxa rahbarning Telegram chatiga fayl sifatida yuboriladi (Mini App ichida yuklab olish har doim ishlamaydi)
      const sent = await sendDocument(env, v.user.id, `muborak-zaxira-${new Date(nowMs).toISOString().slice(0, 10)}.json`, JSON.stringify(r.result));
      return json({ ok: true, result: { sent, bytes: JSON.stringify(r.result).length } });
    }
    const result = token && !r.replay ? { ...r.result, token } : r.result;
    return json({ ok: true, result });
  },
  async scheduled(evt, env, ctx) {
    const r = await stub(env).cron(Date.now());
    if (r.notify && r.notify.length) ctx.waitUntil(sendTelegram(env, r.notify));
  },
};
