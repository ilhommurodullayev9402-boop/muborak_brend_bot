// Cloudflare Worker: Mini App sahifasini beradi, /api/* so'rovlarida Telegram imzosini tekshiradi va
// barcha hisobni bitta doimiy SQLite bazali Durable Object ("korxona") ichida tranzaksiya bilan bajaradi.
import { DurableObject } from 'cloudflare:workers';
import { handle, cronTick, migrate, AppError } from './core/index.js';
import { verifyInitData, sha256hex, randomToken } from './auth.js';
import { getJob, setJob, scheduleWeekly } from './core/arxiv.js';
import { runArchive } from './arxiv-run.js';

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
      const r = { ok: true, ...handle(this.db, cfgFrom(this.env), tg, action, body, nowMs) };
      if (action === 'archive_now' && !r.replay) await this.ctx.storage.setAlarm(Date.now() + 500);
      return r;
    } catch (e) {
      if (e instanceof AppError || (e && e.code && e.params)) return { ok: false, error: e.code, params: e.params, status: e.status || 400 };
      console.error('internal', action, e && e.message);
      return { ok: false, error: 'internal', params: {}, status: 500 };
    }
  }
  async cron(nowMs) { return cronTick(this.db, cfgFrom(this.env), nowMs); }
  // Har kuni 00:05 (Toshkent) chaqiriladi; faqat dushanba kuni o'tgan haftaning arxivi navbatga qo'yiladi
  async weekly(nowMs) {
    const job = this.db.tx(() => scheduleWeekly(this.db, nowMs));
    if (job) await this.ctx.storage.setAlarm(Date.now() + 1000);
    return job;
  }
  async alarm() { await this.archiveRun(Date.now()); }
  async archiveRun(nowMs) {
    const job = getJob(this.db);
    if (!job) return null;
    try {
      const res = await runArchive(this.db, this.env, cfgFrom(this.env).ownerIds, job, nowMs);
      this.db.tx(() => {
        setJob(this.db, null);
        if (!job.manual) this.db.run("INSERT INTO meta(k,v) VALUES('archive_last',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", job.from);
      });
      return res;
    } catch (e) {
      console.error('archive', e && e.message);
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts < 3) {
        this.db.tx(() => setJob(this.db, job));
        await this.ctx.storage.setAlarm(Date.now() + 10 * 60000);
      } else {
        this.db.tx(() => setJob(this.db, null));
        const to = job.manual && job.by ? [{ tg_id: job.by }] : this.db.all("SELECT tg_id FROM users WHERE role='rahbar' AND status='active'");
        await sendTelegram(this.env, to.map((u) => ({ tg_id: u.tg_id, text: '⚠️ Ҳафталик архивни юбориб бўлмади. Кейинроқ Созламалар’да «Архивни ҳозир юбориш» тугмасини босинг.' })));
      }
      return { error: true };
    }
  }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

async function sendVoiceNote(base, env, m) {
  await fetch(`${base}/bot${env.BOT_TOKEN}/sendDocument`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: m.tg_id, document: m.voice, caption: '🎙 Ovozli izoh' }),
  });
}

async function sendTelegram(env, list) {
  if (!env.BOT_TOKEN || !list || !list.length) return;
  const base = env.TG_API || 'https://api.telegram.org';
  for (const m of list.slice(0, 50)) {
    try {
      if (m.photo) {
        const r = await fetch(`${base}/bot${env.BOT_TOKEN}/sendPhoto`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: m.tg_id, photo: m.photo, caption: m.text.slice(0, 1000) }),
        });
        if (r.ok) { if (m.voice) await sendVoiceNote(base, env, m); continue; }
      }
      await fetch(`${base}/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: m.tg_id, text: m.text, disable_web_page_preview: true }),
      });
      if (m.voice) await sendVoiceNote(base, env, m);
    } catch { /* bildirishnoma yuborilmasa ham hisob saqlangan */ }
  }
}

async function sendDocument(env, chatId, name, text, caption = 'MUBORAK BREND — база захира нусхаси') {
  try {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    fd.append('caption', caption);
    fd.append('document', new Blob([text], { type: 'application/json' }), name);
    const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
    return r.ok;
  } catch { return false; }
}


// ---------- Rasmlar ----------
// Fayl Telegram'da saqlanadi: PHOTO_CHAT_ID (yopiq kanal) berilgan bo'lsa — o'sha yerda arxiv bo'lib qoladi;
// berilmagan bo'lsa — yuboruvchining bot bilan chatiga ovozsiz yuborilib, darhol o'chiriladi (file_id saqlanib qoladi).
const INTERNAL = new Set(['photo_save', 'photo_meta', 'photo_can']);

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function tgCall(env, method, body) {
  const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${env.BOT_TOKEN}/${method}`, body instanceof FormData
    ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return j && j.ok ? j.result : null;
}

async function uploadMedia(env, user, bytes, caption, voiceMime) {
  const channel = env.PHOTO_CHAT_ID ? String(env.PHOTO_CHAT_ID).trim() : '';
  const targets = channel ? [channel] : [String(user.id), ...cfgFrom(env).ownerIds.map(String)];
  for (const chat of targets) {
    const fd = new FormData();
    fd.append('chat_id', chat);
    fd.append('disable_notification', 'true');
    if (channel) fd.append('caption', caption.slice(0, 900));
    if (voiceMime) {
      const ext = /mp4|m4a|aac/.test(voiceMime) ? 'm4a' : /ogg/.test(voiceMime) ? 'ogg' : 'webm';
      fd.append('document', new Blob([bytes], { type: voiceMime }), 'ovozli-izoh.' + ext);
      const m = await tgCall(env, 'sendDocument', fd);
      const doc = m && (m.document || m.audio || m.voice);
      if (!doc) continue;
      if (!channel) await tgCall(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id });
      return { file_id: doc.file_id, uniq: doc.file_unique_id, kind: 'voice', mime: voiceMime };
    }
    fd.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'rasm.jpg');
    const m = await tgCall(env, 'sendPhoto', fd);
    if (!m || !m.photo || !m.photo.length) continue;
    const big = m.photo[m.photo.length - 1];
    if (!channel) await tgCall(env, 'deleteMessage', { chat_id: chat, message_id: m.message_id });
    return { file_id: big.file_id, uniq: big.file_unique_id, w: big.width, h: big.height, kind: 'photo' };
  }
  return null;
}

async function servePhoto(env, ctx, meta) {
  const cache = caches.default;
  const key = new Request('https://photo.cache/' + encodeURIComponent(meta.uniq));
  const hit = await cache.match(key);
  const headers = { 'content-type': meta.mime || 'image/jpeg', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' };
  if (hit) return new Response(hit.body, { headers });
  const f = await tgCall(env, 'getFile', { file_id: meta.file_id });
  if (!f || !f.file_path) return json({ ok: false, error: 'photo_missing' }, 404);
  const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/file/bot${env.BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) return json({ ok: false, error: 'photo_missing' }, 404);
  const buf = await r.arrayBuffer();
  ctx.waitUntil(cache.put(key, new Response(buf, { headers: { 'content-type': meta.mime || 'image/jpeg', 'cache-control': 'max-age=2592000' } })).catch(() => {}));
  return new Response(buf, { headers });
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
    if (env.TEST_MODE === '1' && url.pathname === '/__test/archive') {
      // Faqat lokal sinov: haftalik arxivni darhol (alarm kutmasdan) ishga tushirish
      const now = Number(req.headers.get('x-test-now')) || Date.now();
      const job = await stub(env).weekly(now);
      const res = await stub(env).archiveRun(now);
      return json({ ok: true, result: { job, res } });
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
    if (INTERNAL.has(action)) return json({ ok: false, error: 'unknown_action' }, 404);
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
    if (action === 'photo_upload' || action === 'voice_upload') {
      const can = await stub(env).call(v.user, 'photo_can', {}, nowMs);
      if (!can.ok) return json({ ok: false, error: can.error, params: can.params }, can.status);
      const voice = action === 'voice_upload';
      const data = typeof body.data === 'string' ? body.data.replace(/^data:[\w/+.-]+(;[\w=.-]+)*;base64,/, '') : '';
      let bytes;
      try { bytes = b64ToBytes(data); } catch { bytes = null; }
      const mime = voice ? String(body.mime || 'audio/webm').split(';')[0] : 'image/jpeg';
      const okType = voice ? /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)$/.test(mime) : bytes && bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!bytes || bytes.length < 200 || bytes.length > 3_000_000 || !okType) return json({ ok: false, error: voice ? 'bad_voice' : 'bad_photo' }, 400);
      const who = [v.user.first_name, v.user.last_name].filter(Boolean).join(' ');
      // Kanalda qidirish uchun: #bo'lim, kim, sana, nimaga tegishli
      const sec = ['bichim', 'izoh', 'olganlar', 'buyurtma', 'murojaat'].includes(body.sec) ? '#' + body.sec + ' ' : '';
      const d = new Date(nowMs + 5 * 3600000).toISOString().slice(0, 10).split('-').reverse().join('.');
      const what = String(body.what || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
      const up = await uploadMedia(env, v.user, bytes, `${sec}${voice ? '🎙' : '📷'} ${who} · ${d}${what ? ' · ' + what : ''}`, voice ? mime : null);
      if (!up) return json({ ok: false, error: 'photo_failed' }, 502);
      const r = await stub(env).call(v.user, 'photo_save', up, nowMs);
      if (!r.ok) return json({ ok: false, error: r.error, params: r.params }, r.status);
      return json({ ok: true, result: r.result });
    }
    if (action === 'photo_get' || action === 'voice_get') {
      const r = await stub(env).call(v.user, 'photo_meta', { id: body.id }, nowMs);
      if (!r.ok) return json({ ok: false, error: r.error, params: r.params }, r.status);
      return servePhoto(env, ctx, r.result);
    }
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
    // "5 19 * * *" — har kuni 00:05 Toshkent: dushanba bo'lsa o'tgan haftaning arxivi
    if (evt && evt.cron === '5 19 * * *') { await stub(env).weekly(Date.now()); return; }
    const r = await stub(env).cron(Date.now());
    if (r.notify && r.notify.length) ctx.waitUntil(sendTelegram(env, r.notify));
  },
};
