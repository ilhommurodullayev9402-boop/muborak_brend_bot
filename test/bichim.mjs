// Bichim yozuvlari, «Изменить», yordamchi ulushi, fason tariflari va tanlangan yozuvni hisobdan chiqarish sinovi.
// Asosiy qabul sinovidan keyin o'sha serverda ishlaydi (bash test/run.sh). Yangi xodimlar bilan, alohida sanalarda.
import http from 'node:http';
import { signInitData } from '../src/auth.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const TOKEN = '123456:TEST_TOKEN_FOR_LOCAL_ONLY';
let NOW = Date.parse('2026-12-01T03:30:00Z'); // Toshkent 08:30
const DAY = 86400000;
const tgSent = [];
const mock = http.createServer((req, res) => {
  const ch = [];
  req.on('data', (c) => ch.push(c));
  req.on('end', () => { try { tgSent.push(JSON.parse(Buffer.concat(ch).toString('utf8'))); } catch {} res.end('{"ok":true,"result":{"message_id":1}}'); });
}).listen(8799);

const results = [];
let cur = null;
function test(n, title) { cur = { n, title, checks: [], ok: true }; results.push(cur); }
function check(cond, what, extra) {
  cur.checks.push((cond ? '  ✓ ' : '  ✗ ') + what + (cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra).slice(0, 500)));
  if (!cond) cur.ok = false;
}
async function raw(tgId, action, body = {}) {
  const init = await signInitData({ auth_date: String(Math.floor(NOW / 1000)), query_id: 'AAE' + tgId, user: JSON.stringify({ id: tgId, first_name: 'T' + tgId }) }, TOKEN);
  const r = await fetch(`${BASE}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': init, 'x-test-now': String(NOW) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}
async function api(tgId, action, body = {}) {
  const r = await raw(tgId, action, body);
  if (!r.ok) throw Object.assign(new Error(`${action}: ${r.error} ${JSON.stringify(r.params || {})}`), { r });
  return r.result;
}
let n = 0;
const rid = () => 'b-' + (++n) + '-' + Math.random().toString(36).slice(2);
const day = () => new Date(NOW + 5 * 3600000).toISOString().slice(0, 10);

const OWNER = 1000, CUT = 5001, CUT2 = 5002, H1 = 5101, H2 = 5102, SEW = 5103;

async function main() {
  // Tayyorgarlik: yangi bichuvchi(lar) va tikuvchilar
  for (const [tg, role, fn] of [[CUT, 'bichuvchi', 'Bekzod'], [CUT2, 'bichuvchi', 'Olim'], [H1, 'tikuvchi', 'Nodira'], [H2, 'tikuvchi', 'Zarina'], [SEW, 'tikuvchi', 'Kamola']]) {
    await api(tg, 'register', { role, first_name: fn, last_name: 'Sinov', bd: 1, bm: 2, by: 1990, rid: rid() });
  }
  let st = await api(OWNER, 'staff_list');
  const id = (tg) => st.users.find((u) => u.tg_id === tg).id;
  for (const tg of [CUT, CUT2, H1, H2, SEW]) await api(OWNER, 'staff_decide', { user_id: id(tg), approve: true, rid: rid() });
  st = await api(OWNER, 'staff_list');
  const cutId = id(CUT), h1 = id(H1), h2 = id(H2), sew = id(SEW);
  const types = (await api(OWNER, 'prod_meta')).types;
  const KOYLAK = types.find((t) => t.name === 'Ko‘ylak').id;

  // ---------- Fason va tariflar ----------
  test('B1', 'Rahbar fason yaratadi; bichish tarifi barcha fasonlar uchun bitta; tikish tarifi va qo‘shimcha haq alohida');
  let tf = await api(OWNER, 'tariffs');
  check(tf.flat.bichish.history.length >= 1 && tf.flat.bichish.history.some((h) => h.price === 8000), 'Bichish tarifi 8 000 so‘m/dona boshlang‘ich sifatida bor', tf.flat);
  await api(OWNER, 'flat_rate_set', { work: 'bichish', price: 8000, valid_from: day(), rid: rid() });
  await api(OWNER, 'flat_rate_set', { work: 'bichish_yordam', price: 6000, valid_from: day(), rid: rid() });
  const fA = await api(OWNER, 'fason_save', { type_id: KOYLAK, name: 'Sinov-Lola', sew_price: 15000, extra_price: 0, rid: rid() });
  const fB = await api(OWNER, 'fason_save', { type_id: KOYLAK, name: 'Sinov-Tosh', rid: rid() });
  await api(OWNER, 'fason_rate_set', { fason_id: fB.id, sew_price: 20000, extra_price: 5000, extra_note: 'tosh terish', valid_from: '2026-11-01', rid: rid() });
  check((await raw(OWNER, 'fason_save', { type_id: KOYLAK, name: 'sinov-lola' })).error === 'fason_exists', 'Bir xil fason ikki marta yaratilmaydi');
  check((await raw(CUT, 'fason_rate_set', { fason_id: fA.id, sew_price: 1 })).status === 403, 'Bichuvchi tarif o‘zgartira olmaydi');
  tf = await api(OWNER, 'tariffs');
  const tB = tf.fasons.find((f) => f.id === fB.id);
  check(tB.sew.price === 20000 && tB.sew.extra === 5000 && tB.sew.total === 25000, 'Tikish 20 000 + qo‘shimcha 5 000 = 25 000 (bir marta qo‘shildi)', tB.sew);
  const cm = await api(CUT, 'cut_meta');
  check(cm.fasons.some((f) => f.id === fA.id) && cm.helpers.some((h) => h.id === h1) && !cm.helpers.some((h) => h.id === cutId), 'Bichuvchi fasonni ro‘yxatdan tanlaydi; yordamchilar — tasdiqlangan tikuvchilar', cm);

  // ---------- Har bir «Bichdim» alohida ----------
  test('B2', 'Har bir «Bichdim» alohida yozuv (fason bir xil bo‘lsa ham); yordamchi ulushi 100 → 80 + 20');
  const c1 = await api(CUT, 'cut_create', { fason_id: fA.id, material: 'Paxta', color: 'Qizil', lines: [{ size: '46', ready: 60 }, { size: '48', ready: 40 }], helper_id: h1, helper_qty: 20, rid: rid() });
  const c2 = await api(CUT, 'cut_create', { fason_id: fA.id, material: 'Paxta', color: 'Qizil', lines: [{ size: '46', ready: 10 }], rid: rid() });
  check(c1.id !== c2.id && c1.batch_id !== c2.batch_id, 'Ikki «Bichdim» — ikki alohida yozuv', { c1, c2 });
  check((await raw(CUT, 'cut_create', { fason_id: fA.id, material: 'P', color: 'Q', lines: [{ size: '46', ready: 5 }], helper_id: h1, helper_qty: 6 })).error === 'helper_too_much', 'Ulush jami bichimdan oshmaydi');
  check((await raw(CUT, 'cut_create', { fason_id: fA.id, material: 'P', color: 'Q', lines: [{ size: '46', ready: 5 }], helper_id: id(CUT2), helper_qty: 1 })).error === 'bad_helper', 'Yordamchi faqat tasdiqlangan tikuvchi');
  let ps = await api(OWNER, 'payslip', { user_id: cutId, from: '2026-12-01', to: '2026-12-31' });
  const cg = ps.groups.filter((g) => g.work === 'bichish');
  check(cg.reduce((a, g) => a + g.qty, 0) === 90 && ps.earned === 90 * 8000, 'Bichuvchiga 80 + 10 = 90 dona × 8 000', ps.groups);
  let ph = await api(OWNER, 'payslip', { user_id: h1, from: '2026-12-01', to: '2026-12-31' });
  const hg = ph.groups.find((g) => g.work === 'bichish_yordam');
  check(hg && hg.qty === 20 && hg.price === 6000 && hg.amount === 120000 && /Bekzod/.test(hg.giver), 'Yordamchiga «Bichishga yordam»: 20 × 6 000, kim ajratgani ko‘rinadi', ph.groups);
  check(tgSent.some((m) => m.chat_id === H1 && /yordamchi/.test(m.text)), 'Yordamchiga Telegram xabari ketdi');
  let d1 = await api(OWNER, 'cut_detail', { cut_id: c1.id });
  check(d1.ready === 100 && d1.cutter_qty === 80 && d1.helper_qty === 20 && d1.pay.find((p) => p.work === 'bichish').amount === 640000, 'Rahbar ko‘radi: jami 100, bichuvchi 80 (640 000), yordamchi 20', d1.pay);

  // ---------- «Изменить» ----------
  test('B3', '«Изменить»: sabab majburiy, 0 ga tushirish, tarix (eski/yangi, kim, qachon), qoldiq va haq yangilanadi');
  NOW += 2 * 3600000;
  check((await raw(CUT, 'cut_edit', { cut_id: c2.id, lines: [{ size: '46', ready: 0 }] })).error === 'need_reason', 'Sababsiz tuzatib bo‘lmaydi');
  check((await raw(CUT2, 'cut_edit', { cut_id: c2.id, lines: [{ size: '46', ready: 0 }], reason: 'begona' })).status === 403, 'Boshqa bichuvchi tuzata olmaydi');
  await api(CUT, 'cut_edit', { cut_id: c2.id, lines: [{ size: '46', ready: 0 }], reason: 'Xato kiritilgan, bunday bichim yo‘q', rid: rid() });
  const d2 = await api(OWNER, 'cut_detail', { cut_id: c2.id });
  const e2 = d2.edits[0];
  check(d2.ready === 0 && d2.lines[0].free === 0, 'Yozuv 0 ga tushdi, erkin qoldiq 0', d2.lines);
  check(e2 && e2.before.ready === 10 && e2.after.ready === 0 && /Bekzod/.test(e2.actor) && e2.reason.startsWith('Xato') && e2.time, 'Rahbar tarixda eski 10 → yangi 0, sabab, kim va qachon ko‘radi', e2);
  ps = await api(OWNER, 'payslip', { user_id: cutId, from: '2026-12-01', to: '2026-12-31' });
  check(ps.earned === 80 * 8000 && ps.groups.some((g) => g.mark === 'fix' && g.qty === -10), 'Haq kamaydi: tuzatish alohida qator (−10)', ps.groups);
  check(tgSent.some((m) => m.chat_id === OWNER && /тузатди/.test(m.text)), 'Rahbarga tuzatish haqida xabar ketdi');
  // Ulushni o'zgartirish: yordamchi H1 → H2, 20 → 30
  await api(CUT, 'cut_edit', { cut_id: c1.id, lines: [{ size: '46', ready: 60 }, { size: '48', ready: 40 }], helper_id: h2, helper_qty: 30, reason: 'Yordamchi boshqa edi', rid: rid() });
  ph = await api(OWNER, 'payslip', { user_id: h1, from: '2026-12-01', to: '2026-12-31' });
  const ph2 = await api(OWNER, 'payslip', { user_id: h2, from: '2026-12-01', to: '2026-12-31' });
  ps = await api(OWNER, 'payslip', { user_id: cutId, from: '2026-12-01', to: '2026-12-31' });
  check(ph.earned === 0 && ph2.earned === 30 * 6000 && ps.earned === 70 * 8000, 'Eski yordamchidan qaytdi, yangisiga 30, bichuvchiga 70', { h1: ph.earned, h2: ph2.earned, c: ps.earned });
  check((await raw(CUT, 'cut_edit', { cut_id: c1.id, lines: [{ size: '46', ready: 60 }, { size: '48', ready: 40 }], helper_id: h2, helper_qty: 30, reason: 'hech narsa' })).error === 'no_change', 'O‘zgarishsiz saqlash rad etiladi');

  // ---------- Bog'liqlik ----------
  test('B4', 'Tikuvchiga berilgan donadan pastga tuzatish rad etiladi va bog‘liq topshirish ko‘rsatiladi');
  const tr = await api(CUT, 'transfer_create', { to_id: sew, items: [{ line_id: d1.lines.find((l) => l.size === '46').line_id, qty: 50 }], rid: rid() });
  const bad = await raw(CUT, 'cut_edit', { cut_id: c1.id, lines: [{ size: '46', ready: 40 }], reason: 'kamaytirish' });
  check(bad.error === 'cut_conflict' && bad.params.items[0].min === 50 && bad.params.transfers.some((t) => t.code === tr.code), 'Rad: eng kami 50, bog‘liq topshirish ko‘rsatildi', bad);
  const okE = await api(CUT, 'cut_edit', { cut_id: c1.id, lines: [{ size: '46', ready: 50 }], reason: '10 tasi xato', rid: rid() });
  check(okE.lines.find((l) => l.size === '46').ready === 50 && okE.lines.find((l) => l.size === '46').free === 0, 'Berilgan miqdorgacha (50) tuzatish mumkin');
  check(okE.ready === 90 && okE.cutter_qty === 60, 'Jami 90, yordamchi 30, bichuvchi 60', okE);

  // ---------- Tikish: fason tarifi va qo'shimcha haq ----------
  test('B5', 'Tikish haqi fason bo‘yicha (qo‘shimcha haq bilan), avvalgi hisob o‘sha tarifda qoladi');
  const c3 = await api(CUT, 'cut_create', { fason_id: fB.id, material: 'Atlas', color: 'Oq', lines: [{ size: '50', ready: 10 }], rid: rid() });
  const d3 = await api(OWNER, 'cut_detail', { cut_id: c3.id });
  const t3 = await api(CUT, 'transfer_create', { to_id: sew, items: [{ line_id: d3.lines[0].line_id, qty: 10 }], rid: rid() });
  const sh = await api(SEW, 'sew_home');
  for (const t of sh.incoming) await api(SEW, 'transfer_accept', { id: t.id, rid: rid() });
  await api(SEW, 'submit', { line_id: d3.lines[0].line_id, qty: 4, rid: rid() });
  let il = (await api(OWNER, 'insp_list')).filter((s) => s.line_id === d3.lines[0].line_id);
  await api(OWNER, 'inspect', { submission_id: il[0].id, accepted: 4, rid: rid() });
  NOW += DAY;
  await api(OWNER, 'fason_rate_set', { fason_id: fB.id, sew_price: 22000, extra_price: 5000, extra_note: 'tosh terish', valid_from: day(), rid: rid() });
  await api(SEW, 'submit', { line_id: d3.lines[0].line_id, qty: 2, rid: rid() });
  il = (await api(OWNER, 'insp_list')).filter((s) => s.line_id === d3.lines[0].line_id);
  await api(OWNER, 'inspect', { submission_id: il[0].id, accepted: 2, rid: rid() });
  const pss = await api(OWNER, 'payslip', { user_id: sew, from: '2026-12-01', to: '2026-12-31' });
  const tk = pss.groups.filter((g) => g.work === 'tikish');
  check(tk.some((g) => g.qty === 4 && g.price === 25000 && g.extra === 5000 && g.amount === 100000), '4 dona × (20 000 + 5 000) — eski tarifda qoldi', tk);
  check(tk.some((g) => g.qty === 2 && g.price === 27000 && g.amount === 54000), '2 dona × (22 000 + 5 000) — yangi tarifda', tk);
  const pcut = await api(OWNER, 'payslip', { user_id: cutId, from: '2026-12-01', to: '2026-12-31' });
  check(pcut.groups.filter((g) => g.work === 'bichish').reduce((a, g) => a + g.qty, 0) === 70, 'Bichish haqi tikuvchi qabulida qayta yozilmadi (60 + 10 = 70)', pcut.groups);

  // ---------- Hisobdan chiqarish ----------
  test('B6', 'Rahbar faqat tanlangan sinov yozuvini ta’sirini ko‘rib, tasdiqlab hisobdan chiqaradi');
  const rep0 = await api(OWNER, 'prod_report', { from: '2026-11-01', to: '2026-12-31' });
  check((await raw(CUT, 'cut_void_preview', { cut_id: c3.id })).status === 403, 'Bichuvchi hisobdan chiqara olmaydi');
  const pv = await api(OWNER, 'cut_void_preview', { cut_id: c3.id });
  check(pv.mode === 'chain' && pv.stock.some((s) => s.state === 'accepted' && s.qty === 6) && pv.stock.some((s) => s.state === 'sewing' && s.qty === 4), 'Ta’sir: qoldiq kimda va qaysi holatda', pv.stock);
  check(pv.earn.some((e) => e.work === 'tikish' && e.qty === 4) && pv.earn.some((e) => e.work === 'bichish' && e.qty === 10) && pv.transfers.some((t) => t.code === t3.code), 'Ta’sir: qaytariladigan haq (tikish, bichish) va bog‘liq topshirish', pv);
  check((await raw(OWNER, 'cut_void', { cut_id: c3.id, reason: 'sinov', confirm: true, sig: 'x' })).error === 'impact_changed', 'Ta’sir ko‘rilmasa (imzo mos emas) chiqarilmaydi');
  check((await raw(OWNER, 'cut_void', { cut_id: c3.id, reason: 'sinov', sig: pv.sig })).error === 'need_confirm', 'Tasdiqsiz chiqarilmaydi');
  const before = { c1: await api(OWNER, 'cut_detail', { cut_id: c1.id }), h2: (await api(OWNER, 'payslip', { user_id: h2, from: '2026-12-01', to: '2026-12-31' })).earned };
  await api(OWNER, 'cut_void', { cut_id: c3.id, reason: 'Dastlabki sinov yozuvi', confirm: true, sig: pv.sig, rid: rid() });
  const d3v = await api(OWNER, 'cut_detail', { cut_id: c3.id });
  check(d3v.status === 'void' && d3v.edits[0].kind === 'void', 'Tanlangan yozuv «hisobdan chiqarilgan», tarixda qoldi');
  const after = { c1: await api(OWNER, 'cut_detail', { cut_id: c1.id }), h2: (await api(OWNER, 'payslip', { user_id: h2, from: '2026-12-01', to: '2026-12-31' })).earned };
  check(after.c1.status === 'active' && after.c1.ready === before.c1.ready && after.h2 === before.h2, 'Boshqa yozuvlar va hisoblar o‘zgarmadi');
  const pss2 = await api(OWNER, 'payslip', { user_id: sew, from: '2026-12-01', to: '2026-12-31' });
  check(pss2.earned === 0 && pss2.groups.some((g) => g.mark === 'void'), 'Tikuvchi haqi qaytarildi (alohida «hisobdan chiqarildi» qatori)', pss2.groups);
  const pc2 = await api(OWNER, 'payslip', { user_id: cutId, from: '2026-12-01', to: '2026-12-31' });
  check(pc2.earned === 60 * 8000, 'Bichuvchidan faqat shu yozuvning 10 donasi qaytdi', pc2.earned);
  const sh2 = await api(SEW, 'sew_home');
  check(!sh2.lines.some((l) => l.line_id === d3.lines[0].line_id), 'Tikuvchi qo‘lidan bu partiya qoldig‘i olindi');
  const rep1 = await api(OWNER, 'prod_report', { from: '2026-11-01', to: '2026-12-31' });
  check(rep1.eq && rep1.eq.ok && rep0.eq.ok, 'Hisob tenglamasi (boshlang‘ich + yangi = oxirgi) to‘g‘ri', rep1.eq);
  check((await raw(OWNER, 'cut_void', { cut_id: c3.id, reason: 'yana', confirm: true, sig: pv.sig })).error === 'bad_state', 'Ikki marta chiqarilmaydi');
  check((await raw(OWNER, 'reset_test', { confirm: 'ТОЗАЛАШ' })).error === 'unknown_action', 'Butun bazani tozalash amali yo‘q');

  test('B7', 'Eski tartibdagi (bir partiyada bir necha) bichim: berilgan qismi bo‘lsa chiqarish to‘xtatiladi');
  const lb = await api(CUT, 'batch_create', { type_id: KOYLAK, model: 'Eski', material: 'Chit', color: 'Sariq', lines: [{ size: '44', ready: 10 }], rid: rid() });
  await api(CUT, 'cut_add', { batch_id: lb.id, lines: [{ size: '44', ready: 5 }], rid: rid() });
  const legacy = (await api(OWNER, 'cut_list', { limit: 10 })).filter((c) => c.batch_id === lb.id);
  check(legacy.length === 2, 'Bitta partiyaga ikki bichish — ikki alohida yozuv', legacy.length);
  const lline = legacy[0].lines[0].line_id;
  await api(CUT, 'transfer_create', { to_id: sew, items: [{ line_id: lline, qty: 12 }], rid: rid() });
  const lp = await api(OWNER, 'cut_void_preview', { cut_id: legacy[0].id });
  check(lp.mode === 'stock' && lp.blockers.some((b) => b.code === 'given'), 'Berilgan donalar sabab chiqarib bo‘lmaydi (nomuvofiq o‘chirish yo‘q)', lp);
  check((await raw(OWNER, 'cut_void', { cut_id: legacy[0].id, reason: 'x x x', confirm: true, sig: lp.sig })).error === 'void_blocked', 'Server ham rad etadi');
}

try { await main(); } catch (e) { if (cur) check(false, 'Kutilmagan xato: ' + e.message); else console.error(e); }
mock.close();
let fail = 0;
for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.n}. ${r.title}`); for (const c of r.checks) console.log(c); if (!r.ok) fail++; }
console.log(`\n${results.length - fail}/${results.length} bo‘lim o‘tdi (bichim)`);
process.exit(fail ? 1 : 0);
