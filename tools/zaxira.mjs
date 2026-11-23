// Zaxira nusxani (Созламалар → «Захира нусха» JSON fayli) kompyuterda tekshirish:
//  1) JSON dan to'liq SQLite baza tiklanadi (tiklash yo'li ishlashini ko'rsatadi);
//  2) shu NUSXADA yangi migratsiya ishlatiladi (jonli bazaga tegilmaydi);
//  3) eski kod (yangilashdan oldingi) va yangi kod bilan hisob-kitoblar solishtiriladi:
//     xodimlar, qoldiqlar, tariflar, ish haqi, to'lovlar, varaqalar — hammasi bir xil bo'lishi kerak.
// Ishga tushirish: node tools/zaxira.mjs <zaxira.json> --old <eski-src-papka> [--out hisobot.md] [--db nusxa.sqlite]
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--old' && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--db');
if (!file) { console.error('Foydalanish: node tools/zaxira.mjs <zaxira.json> --old <eski src papka>'); process.exit(2); }
const OLD = opt('--old');
const OUT = opt('--out');
const DBF = resolve(opt('--db', '/tmp/muborak-nusxa.sqlite'));

const NEW_SRC = new URL('../src/', import.meta.url);
const load = async (base) => ({
  core: await import(new URL('core/index.js', base).href),
  schema: await import(new URL('schema.js', base).href),
});

function adapter(d) {
  return {
    all: (q, ...p) => d.prepare(q).all(...p),
    one: (q, ...p) => d.prepare(q).get(...p),
    run: (q, ...p) => { d.prepare(q).run(...p); },
    tx: (fn) => { d.exec('BEGIN'); try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
  };
}

// JSON zaxiradan baza: sxema zaxiradagi versiyagacha quriladi, keyin barcha qatorlar aynan yoziladi
function restore(json, MIGRATIONS, path) {
  for (const f of [path, path + '-wal', path + '-shm']) if (existsSync(f)) rmSync(f);
  const d = new DatabaseSync(path);
  const ver = Number((json.tables.meta || []).find((r) => r.k === 'schema_version')?.v || 0);
  if (!ver || ver > MIGRATIONS.length) throw new Error(`Zaxiradagi sxema versiyasi ${ver}, kod biladigani ${MIGRATIONS.length}`);
  d.exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)');
  for (let i = 0; i < ver; i++) d.exec(MIGRATIONS[i]);
  d.exec('CREATE TABLE IF NOT EXISTS idem(key TEXT PRIMARY KEY, user_id INTEGER, action TEXT, result TEXT, at TEXT)');
  const known = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));
  const missing = Object.keys(json.tables).filter((t) => !known.has(t));
  if (missing.length) throw new Error('Zaxirada noma’lum jadvallar: ' + missing.join(', '));
  d.exec('BEGIN');
  for (const t of known) if (t !== 'sqlite_sequence') d.exec(`DELETE FROM "${t}"`);
  let rows = 0;
  for (const [t, list] of Object.entries(json.tables)) {
    for (const r of list) {
      const cols = Object.keys(r);
      d.prepare(`INSERT INTO "${t}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map((c) => r[c]));
      rows++;
    }
  }
  d.exec('COMMIT');
  return { d, ver, rows };
}

// Ilova mantiqi orqali hisob-kitob surati (rahbar nomidan, faqat o'qish)
function snapshot(core, db, nowMs) {
  const boss = db.one("SELECT tg_id FROM users WHERE role='rahbar' AND status='active' ORDER BY id LIMIT 1");
  const cfg = { ownerIds: [boss.tg_id] };
  const tg = { id: boss.tg_id };
  const call = (a, b = {}) => core.handle(db, cfg, tg, a, b, nowMs).result;
  const first = db.one("SELECT MIN(d) d FROM (SELECT MIN(day) d FROM moves UNION SELECT MIN(day) FROM earnings UNION SELECT MIN(day) FROM payments)").d || '2026-01-01';
  const to = '2099-12-31';
  const staff = call('staff_list');
  const money = call('money_summary').map((u) => ({ id: u.id, name: u.name, earned: u.earned, adj: u.adj, paid: u.paid, ded: u.ded, balance: u.balance, pending: u.pending, payable: u.payable, debt: u.debt }));
  const slips = money.map((u) => { const p = call('payslip', { user_id: u.id, from: first, to }); return { id: u.id, earned: p.earned, opening: p.opening, closing: p.closing, paid: p.paidConfirmed, ded: p.ded, missingQty: p.missingQty,
    qtyByWork: p.groups.reduce((a, g) => ({ ...a, [g.work + (g.zakaz ? '_zakaz' : '')]: (a[g.work + (g.zakaz ? '_zakaz' : '')] || 0) + g.qty }), {}) }; });
  const prod = call('prod_report', { from: first, to });
  const where = call('where_report', {}).map((r) => [r.line_id, r.state, r.holder, r.qty]).sort((a, b) => a.join().localeCompare(b.join()));
  const batches = call('batches_all').map((b) => { const v = call('batch_detail', { batch_id: b.id }); return { id: b.id, code: b.code, totals: v.totals, lines: v.lines.map((l) => [l.size, l.states, l.ready_total]) }; });
  const rates = call('rates_list').rates.map((r) => [r.work, r.type_id, r.model, r.price, r.valid_from]);
  return { staff: staff.users.map((u) => [u.id, u.tg_id, u.role, u.status, u.first_name, u.last_name]), money, slips, prod: { start: prod.start, end: prod.end, eq: prod.eq }, where, batches, rates };
}

function diff(a, b, path = '') {
  const out = [];
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return [`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diff(a[k], b[k], path + '.' + k));
    return out;
  }
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
}

const json = JSON.parse(readFileSync(file, 'utf8'));
for (const t of Object.keys(json.tables)) if (/^(__miniflare|_cf_)/.test(t)) delete json.tables[t]; // lokal muhit xizmat jadvallari
const NEW = await load(NEW_SRC);
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
say(`# Zaxira tekshiruvi\n\nFayl: ${file}\nZaxira vaqti: ${json.exported_at}\n`);

// 1) Tiklash
const r = restore(json, NEW.schema.MIGRATIONS, DBF);
const counts = Object.fromEntries(Object.entries(json.tables).map(([t, l]) => [t, l.length]));
const back = Object.fromEntries(Object.keys(json.tables).map((t) => [t, r.d.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n]));
const restoreOk = !diff(counts, back).length;
say(`## 1. Tiklash\n\nSxema versiyasi: ${r.ver}. Jadvallar: ${Object.keys(counts).length}. Qatorlar: ${r.rows}. Natija: ${restoreOk ? '✅ hammasi tiklandi' : '❌ farq bor'}`);
say(Object.entries(counts).filter(([, n]) => n).map(([t, n]) => `- ${t}: ${n}`).join('\n'));
const db = adapter(r.d);
const NOW = Date.now();

// 2) Eski kod bilan surat
let before = null;
if (OLD && r.ver < NEW.schema.MIGRATIONS.length) {
  const OLDC = await load(pathToFileURL(resolve(OLD) + '/'));
  before = snapshot(OLDC.core, db, NOW);
  say(`\n## 2. Eski kod bilan hisob (yangilashdan oldin)\n\nXodimlar: ${before.staff.length}, partiyalar: ${before.batches.length}, hisob tenglamasi: ${before.prod.eq && before.prod.eq.ok ? 'to‘g‘ri' : JSON.stringify(before.prod.eq)}`);
}
r.d.close();
copyFileSync(DBF, DBF.replace(/\.sqlite$/, '-oldin.sqlite'));

// 3) Nusxada migratsiya
const d2 = new DatabaseSync(DBF);
const db2 = adapter(d2);
const t0 = Date.now();
let ran = [];
db2.tx(() => { ran = NEW.schema.migrate((q, ...p) => (p.length ? d2.prepare(q).all(...p) : d2.exec(q)), (q, ...p) => d2.prepare(q).get(...p)); });
say(`\n## 3. Migratsiya (nusxada)\n\nIshladi: ${ran.length ? ran.join(', ') : 'kerak emas'} · ${Date.now() - t0} ms`);
const after = snapshot(NEW.core, db2, NOW);

// Eski jadvallar qatorlari o'zgarmaganini tekshirish (yangi ustunlardan tashqari)
const tableDiff = [];
for (const [t, list] of Object.entries(json.tables)) {
  if (t === 'meta') continue;
  const now = d2.prepare(`SELECT * FROM "${t}"`).all();
  if (now.length !== list.length) { tableDiff.push(`${t}: ${list.length} → ${now.length} qator`); continue; }
  const key = (x) => JSON.stringify(Object.keys(list[0] || {}).map((c) => x[c]));
  const A = new Set(list.map(key));
  const changed = now.filter((x) => !A.has(key(x))).length;
  if (changed) tableDiff.push(`${t}: ${changed} qator o‘zgargan`);
}
say(`Eski jadvallardagi yozuvlar: ${tableDiff.length ? '❌ ' + tableDiff.join('; ') : '✅ bitta ham o‘zgarmagan yoki o‘chmagan'}`);

// 4) Solishtirish
if (before) {
  const parts = ['staff', 'money', 'slips', 'prod', 'where', 'batches', 'rates'];
  say(`\n## 4. Oldin va keyin solishtirish (ilova mantiqi bilan)\n`);
  let bad = 0;
  for (const p of parts) {
    const d = diff(before[p], after[p], p);
    if (d.length) bad++;
    say(`- ${p}: ${d.length ? '❌ ' + d.slice(0, 8).join('; ') : '✅ bir xil'}`);
  }
  say(`\nXulosa: ${bad || !restoreOk || tableDiff.length ? '❌ FARQ BOR — joylamang' : '✅ xodimlar, qoldiqlar, tariflar, ish haqi va hisob-kitoblar saqlandi'}`);
}
const nc = (q) => d2.prepare(q).get().n;
say(`\n## 5. Yangi tuzilma\n\n- Bichim yozuvlari (eski bichimlardan): ${nc('SELECT COUNT(*) n FROM cuts')}\n- Bichim qatorlari: ${nc('SELECT COUNT(*) n FROM cut_lines')}` +
  `\n- Bichim yozuvlari jami (tayyor+chala): ${nc('SELECT COALESCE(SUM(ready+partial),0) n FROM cut_lines')} = harakatlardagi bichim: ${nc("SELECT COALESCE(SUM(m.qty),0) n FROM moves m JOIN lines l ON l.id=m.line_id JOIN batches b ON b.id=l.batch_id WHERE m.kind IN('cut_ready','cut_partial') AND b.opening=0")}` +
  `\n- Fasonlar: ${nc('SELECT COUNT(*) n FROM fasons')}; tikish tarifi ko‘chirilgan: ${nc('SELECT COUNT(*) n FROM fason_rates')}; fasonsiz partiya: ${nc('SELECT COUNT(*) n FROM batches WHERE fason_id IS NULL')}` +
  `\n- Bichish tarifi: ${d2.prepare("SELECT price FROM flat_rates WHERE work='bichish' ORDER BY id DESC LIMIT 1").get()?.price ?? '—'} so‘m/dona`);
d2.close();
if (OUT) writeFileSync(OUT, lines.join('\n') + '\n');
