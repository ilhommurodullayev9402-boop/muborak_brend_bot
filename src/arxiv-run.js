// Haftalik arxivni yig'ib, Telegram'ga yuborish (Durable Object alarm ichida ishlaydi).
// Rasmlar va ovozlar Telegram'dan yuklab olinadi va ZIP ichiga bo'lim bo'yicha joylanadi.
// Telegram bot orqali bitta fayl 50 MB gacha bo'lishi mumkin — shuning uchun katta arxiv qismlarga bo'linadi.
import { ZipWriter } from './zip.js';
import { buildArchive, fullDump } from './core/arxiv.js';

const PART_LIMIT = 45 * 1024 * 1024;
const dm = (d) => d.slice(8, 10) + '.' + d.slice(5, 7);

async function tg(env, method, body) {
  const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/bot${env.BOT_TOKEN}/${method}`, body instanceof FormData
    ? { method: 'POST', body } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return j && j.ok ? j.result : null;
}

async function download(env, fileId) {
  for (let i = 0; i < 2; i++) {
    try {
      const f = await tg(env, 'getFile', { file_id: fileId });
      if (!f || !f.file_path) continue;
      const r = await fetch(`${env.TG_API || 'https://api.telegram.org'}/file/bot${env.BOT_TOKEN}/${f.file_path}`);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch { /* qayta urinish */ }
  }
  return null;
}

// job: { from, to, manual, by (tg_id) }. Muvaffaqiyatsiz bo'lsa xato tashlaydi — alarm qayta urinadi.
export async function runArchive(db, env, ownerIds, job, nowMs) {
  if (!env.BOT_TOKEN) throw new Error('no_token');
  const { files, media, summary, dump } = db.tx(() => ({ ...buildArchive(db, job.from, job.to, nowMs), dump: JSON.stringify(fullDump(db, new Date(nowMs).toISOString())) }));
  const rahbars = db.all("SELECT tg_id FROM users WHERE role='rahbar' AND status='active'").map((u) => String(u.tg_id));
  const channel = env.PHOTO_CHAT_ID ? String(env.PHOTO_CHAT_ID).trim() : '';
  // Qo'lda so'ralgan arxiv — kanalga va so'ragan rahbarga; haftalik — kanalga va barcha rahbarlarga
  let people = job.manual && job.by ? [String(job.by)] : rahbars;
  if (!people.length) people = ownerIds.map(String);
  const main = channel || people[0];
  if (!main) throw new Error('no_target');
  const extra = people.filter((p) => p !== main);
  const period = `${dm(job.from)}–${dm(job.to)}.${job.to.slice(0, 4)}`;
  const base = `muborak-arxiv_${job.from}_${job.to}`;

  let part = 1, sent = 0, zip = new ZipWriter(nowMs);
  const send = async (last) => {
    const blob = zip.finish();
    const name = part === 1 && last ? `${base}.zip` : `${base}_${part}-qism.zip`;
    const cap = `#arxiv 📦 MUBORAK BREND · haftalik arxiv · ${period}${part > 1 || !last ? ` · ${part}-qism${last ? ' (oxirgi)' : ''}` : ''}`
      + (part === 1 ? '\n\n' + summary.split('\r\n').slice(4).filter(Boolean).slice(0, 9).join('\n') : '');
    const fd = new FormData();
    fd.append('chat_id', main);
    fd.append('caption', cap.slice(0, 1000));
    fd.append('disable_notification', channel ? 'true' : 'false');
    fd.append('document', blob, name);
    const m = await tg(env, 'sendDocument', fd);
    const doc = m && m.document;
    if (!m) throw new Error('send_failed');
    for (const p of extra) {
      // Bir marta yuklangan fayl qayta yuklanmaydi — Telegram'dagi nusxasi (file_id) yuboriladi
      if (doc && doc.file_id) await tg(env, 'sendDocument', { chat_id: p, document: doc.file_id, caption: cap.slice(0, 1000) });
    }
    sent++; part++; zip = new ZipWriter(nowMs);
  };

  for (const f of files) await zip.add(f.name, f.text);
  await zip.add('baza/toliq_zaxira.json', dump);
  const failed = [];
  for (const m of media) {
    const bytes = await download(env, m.file_id);
    if (!bytes) { failed.push(m.path); continue; }
    if (zip.count > 0 && zip.size + bytes.length + 200 > PART_LIMIT) await send(false);
    await zip.add(m.path, bytes, true);
  }
  if (failed.length) await zip.add('yuklanmagan_fayllar.txt', 'Telegram’dan yuklab bo‘lmagan fayllar (kanalda qidirib topish mumkin):\r\n' + failed.join('\r\n') + '\r\n');
  await send(true);
  return { parts: sent, media: media.length - failed.length, failed: failed.length };
}
