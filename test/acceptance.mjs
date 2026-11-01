// 14 ta qabul sinovi. Haqiqiy server muhitida (wrangler dev / workerd + SQLite Durable Object) HTTP orqali ishlaydi.
// Har so'rov haqiqiy Telegram initData imzosi bilan yuboriladi. Ishga tushirish: bash test/run.sh
import http from 'node:http';
import { signInitData } from '../src/auth.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const TOKEN = '123456:TEST_TOKEN_FOR_LOCAL_ONLY';
const PHASE = process.argv[2] || 'main';
const T0 = Date.parse('2026-11-02T03:30:00Z'); // Toshkent 08:30
let NOW = T0;
const DAY = 86400000;

// Telegram API o'rniga lokal qabul qiluvchi: bildirishnomalarni tekshirish uchun
const tgSent = [];
const mock = http.createServer((req, res) => {
  let d = '';
  req.on('data', (c) => (d += c));
  req.on('end', () => { try { tgSent.push(JSON.parse(d)); } catch {} res.end('{"ok":true}'); });
}).listen(8799);

const results = [];
let cur = null;
function test(n, title) { cur = { n, title, checks: [], ok: true }; results.push(cur); }
function check(cond, what, extra) {
  cur.checks.push((cond ? '  ✓ ' : '  ✗ ') + what + (cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra).slice(0, 400)));
  if (!cond) cur.ok = false;
}

async function raw(tgId, action, body = {}, initOverride) {
  const init = initOverride ?? await signInitData({ auth_date: String(Math.floor(NOW / 1000)), query_id: 'AAE' + tgId,
    user: JSON.stringify({ id: tgId, first_name: 'T' + tgId }) }, TOKEN);
  const r = await fetch(`${BASE}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': init, 'x-test-now': String(NOW) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}
async function api(tgId, action, body = {}) {
  const r = await raw(tgId, action, body);
  if (!r.ok) throw Object.assign(new Error(`${action}: ${r.error} ${JSON.stringify(r.params || {})}`), { r });
  return r.result;
}
let ridN = 0;
const rid = () => 'rid-' + (++ridN) + '-' + Math.random().toString(36).slice(2);
const day = () => new Date(NOW + 5 * 3600000).toISOString().slice(0, 10);

const OWNER = 1000, RUX = 2001, DIL = 2002, SAR = 3001, STR = 9999, MAL = 2003;
const LOC_OK = { lat: 41.31105, lng: 69.27970, acc: 20 };

async function main() {
  // ---------- Tayyorgarlik: dadam (egasi) ----------
  let e = await api(OWNER, 'enter', { role: 'rahbar' });
  const ownerFirst = e.state;
  await api(OWNER, 'register', { role: 'rahbar', first_name: 'Muborak', last_name: 'Aka', bd: 3, bm: 11, by: 1965, rid: rid() });
  e = await api(OWNER, 'enter', { role: 'rahbar' });
  await api(OWNER, 'settings_set', { values: { lat: 41.3111, lng: 69.2797, radius: 150, max_acc: 100, require_bio: 1, work_start: '08:00', grace_min: 10, full_min: 480, break_start: '13:00', break_min: 60 }, rid: rid() });
  const meta = await api(OWNER, 'prod_meta');
  const KOYLAK = meta.types.find((t) => t.name === 'Ko‘ylak').id;
  const XALAT = meta.types.find((t) => t.name === 'Xalat').id;
  await api(OWNER, 'rate_add', { work: 'tikish', type_id: KOYLAK, price: 10000, valid_from: '2026-11-01', rid: rid() });
  await api(OWNER, 'rate_add', { work: 'bichish', type_id: KOYLAK, price: 2000, valid_from: '2026-11-01', rid: rid() });

  // ---------- 1 ----------
  test(1, 'Yangi xodim: anketa → bitta so‘rov → rahbar tasdig‘i → keyingi kirishda qayta so‘rov yo‘q');
  check(ownerFirst === 'register' && e.state === 'ok', 'Dadam (oldindan sozlangan ID) o‘z ma’lumotini kiritib, tasdiq kutmasdan rahbar bo‘ldi', { ownerFirst, e });
  let r = await api(RUX, 'enter', { role: 'tikuvchi' });
  check(r.state === 'register', 'Yangi tikuvchiga anketa ko‘rsatiladi', r);
  const regBody = { role: 'tikuvchi', first_name: 'Ruxshona', last_name: 'Karimova', bd: 4, bm: 11, by: 1998 };
  r = await api(RUX, 'register', { ...regBody, rid: rid() });
  check(r.state === 'pending', 'So‘rov yuborildi → «rahbar tasdig‘ini kutmoqda»', r);
  await api(RUX, 'register', { ...regBody, rid: rid() });
  await api(RUX, 'register', { ...regBody, rid: rid() });
  let st = await api(OWNER, 'staff_list');
  check(st.users.filter((u) => u.tg_id === RUX).length === 1, 'Qayta bosish dublikat so‘rov yaratmadi (bitta yozuv)');
  check(tgSent.some((m) => m.chat_id === OWNER && /Янги сўров/.test(m.text)), 'Rahbarga kirillcha bildirishnoma ketdi');
  const ruxId = st.users.find((u) => u.tg_id === RUX).id;
  await api(OWNER, 'staff_decide', { user_id: ruxId, approve: true, rid: rid() });
  r = await api(RUX, 'enter', { role: 'tikuvchi' });
  check(r.state === 'ok', 'Tasdiqdan keyin o‘z rolini bossa darrov profilga kiradi', r);
  r = await api(RUX, 'register', { ...regBody, rid: rid() });
  st = await api(OWNER, 'staff_list');
  check(st.users.filter((u) => u.tg_id === RUX).length === 1 && st.users.find((u) => u.tg_id === RUX).status === 'active', 'Keyingi kirishda yangi anketa/so‘rov yaratilmaydi');
  for (const [tg, role, fn, ln] of [[DIL, 'tikuvchi', 'Dilnoza', 'Aliyeva'], [SAR, 'bichuvchi', 'Sardor', 'Toshev'], [MAL, 'tikuvchi', 'Malika', 'Yusupova']]) {
    await api(tg, 'register', { role, first_name: fn, last_name: ln, bd: 15, bm: 6, by: 1995, rid: rid() });
  }
  st = await api(OWNER, 'staff_list');
  const id = (tg) => st.users.find((u) => u.tg_id === tg).id;
  for (const tg of [DIL, SAR, MAL]) await api(OWNER, 'staff_decide', { user_id: id(tg), approve: true, rid: rid() });
  const dilId = id(DIL), sarId = id(SAR), malId = id(MAL);

  // ---------- 2 ----------
  test(2, 'Boshqa rol va boshqa xodim ma’lumotiga kirish taqiqlangan; faolsiz xodim kira olmaydi');
  r = await api(RUX, 'enter', { role: 'rahbar' });
  check(r.state === 'wrong_role' && r.myRole === 'tikuvchi', 'Tikuvchi «Rahbar»ni bossa: «Sizning bo‘limingiz — Tikuvchi»', r);
  r = await api(STR, 'enter', { role: 'rahbar' });
  check(r.state === 'not_rahbar', 'Begona odam «Rahbar»ni bosganda avtomatik rahbar bo‘lmaydi', r);
  r = await raw(STR, 'register', { role: 'rahbar', first_name: 'A', last_name: 'B', bd: 1, bm: 1, by: 1990 });
  check(!r.ok && r.status === 403, 'Begona odam rahbar sifatida ro‘yxatdan o‘ta olmaydi', r);
  r = await raw(RUX, 'staff_list');
  check(!r.ok && r.status === 403, 'Tikuvchi rahbar hisobotini ocha olmaydi', r);
  r = await raw(RUX, 'cut_home');
  check(!r.ok && r.status === 403, 'Tikuvchi bichuvchi bo‘limini ocha olmaydi', r);
  r = await raw(RUX, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(!r.ok && r.status === 403, 'Tikuvchi boshqa xodimning puli/hisobini ko‘ra olmaydi', r);
  r = await raw(RUX, 'att_history', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(!r.ok && r.status === 403, 'Boshqa xodimning davomati yopiq', r);
  r = await raw(RUX, 'staff_decide', { user_id: malId, approve: true });
  check(!r.ok && r.status === 403, 'Frontend rol yuborsa ham server ruxsat bermaydi');
  const fakeInit = (await signInitData({ auth_date: String(Math.floor(NOW / 1000)), user: JSON.stringify({ id: OWNER }) }, '999:WRONG'));
  r = await raw(OWNER, 'staff_list', {}, fakeInit);
  check(!r.ok && r.status === 401, 'Soxta imzo (boshqa token) rad etiladi', r);
  const oldInit = await signInitData({ auth_date: String(Math.floor(NOW / 1000) - 2 * 86400), user: JSON.stringify({ id: OWNER }) }, TOKEN);
  r = await raw(OWNER, 'staff_list', {}, oldInit);
  check(!r.ok && r.status === 401 && r.params.why === 'expired', 'Eskirgan initData rad etiladi', r);
  await api(OWNER, 'staff_status', { user_id: malId, active: false, reason: 'Ishdan ketdi', rid: rid() });
  r = await raw(MAL, 'sew_home');
  check(!r.ok && r.status === 403, 'Faolsizlantirilgan xodim kira olmaydi', r);
  r = await api(MAL, 'enter', { role: 'tikuvchi' });
  check(r.state === 'inactive', 'Faolsiz xodimga «kirish yopilgan» holati', r);
  await api(OWNER, 'staff_status', { user_id: malId, active: true, reason: 'Qayta ishga qaytdi', rid: rid() });
  const aud = await api(OWNER, 'audit_list', { limit: 50 });
  check(aud.some((a) => a.action === 'user_reactivated' && a.reason === 'Qayta ishga qaytdi'), 'Qayta faollashtirish auditda sababi bilan');

  // ---------- 4 ----------
  test(4, 'Lokatsiya/biometrika ishlamasa avtomatik kelish yo‘q; dublikat yo‘q; ketish unutilsa to‘liq kun yo‘q');
  const en = await api(RUX, 'bio_enroll', { rid: rid() });
  check(typeof en.token === 'string' && en.token.length === 64, 'Biometrik kalit berildi (serverda faqat xeshi saqlanadi)');
  const tries = [
    [{ kind: 'in', loc: null, bio: 'ok', bio_token: en.token }, 'loc_off', 'Lokatsiya o‘chiq'],
    [{ kind: 'in', loc: { ...LOC_OK, acc: 500 }, bio: 'ok', bio_token: en.token }, 'low_accuracy', 'Aniqlik yetarli emas'],
    [{ kind: 'in', loc: { lat: 41.33, lng: 69.30, acc: 15 }, bio: 'ok', bio_token: en.token }, 'outside', 'Hududdan tashqarida'],
    [{ kind: 'in', loc: LOC_OK, bio: 'none' }, 'bio_none', 'Telefonda biometrika yo‘q'],
    [{ kind: 'in', loc: LOC_OK, bio: 'failed' }, 'bio_failed', 'Biometrika tasdiqlanmadi'],
    [{ kind: 'in', loc: LOC_OK, bio: 'ok', bio_token: 'x'.repeat(64) }, 'bio_token', 'Boshqa qurilma kaliti'],
  ];
  for (const [b, reason, what] of tries) {
    r = await api(RUX, 'att_mark', { ...b, rid: rid() });
    check(r.ok === false && r.reason === reason, `${what} → kelish yozilmadi (${reason})`, r);
  }
  let t = await api(RUX, 'att_today');
  check(t.row === null, 'Muvaffaqiyatsiz urinishlardan keyin davomat yozuvi yo‘q');
  r = await api(RUX, 'att_mark', { kind: 'in', loc: LOC_OK, bio: 'ok', bio_token: en.token, rid: rid() });
  check(r.ok && r.at === '08:30', 'To‘g‘ri joy + biometrika → kelish 08:30 (server vaqti)', r);
  NOW += 60000;
  r = await api(RUX, 'att_mark', { kind: 'in', loc: LOC_OK, bio: 'ok', bio_token: en.token, rid: rid() });
  check(r.ok && r.already && r.at === '08:30', 'Qayta bosish yangi kelish yaratmadi, vaqt o‘zgarmadi', r);
  r = await api(RUX, 'att_exception', { kind: 'in', reason: 'loc_off', rid: rid() }).catch((x) => x.r);
  check(r.ok === false && r.error === 'already_marked', 'Kelgan bo‘lsa, istisno so‘rovi ham qayta yaratilmaydi', r);
  // Dilnoza: biometrikasiz telefon → istisno → rahbar tasdiqlaydi
  NOW = T0 + 20 * 60000; // 08:50
  r = await api(DIL, 'att_mark', { kind: 'in', loc: LOC_OK, bio: 'none', rid: rid() });
  const ex = await api(DIL, 'att_exception', { kind: 'in', reason: r.reason, note: 'Telefonimda barmoq izi yo‘q', rid: rid() });
  await api(DIL, 'att_exception', { kind: 'in', reason: r.reason, rid: rid() });
  let excs = await api(OWNER, 'att_exc_list');
  check(excs.filter((x) => x.user_id === dilId && x.status === 'pending').length === 1, 'Istisno so‘rovi bitta, rahbarga ko‘rinadi');
  await api(OWNER, 'att_exc_decide', { id: ex.id, approve: true, note: 'Ko‘rdim, keldi', rid: rid() });
  excs = await api(OWNER, 'att_exc_list');
  const exr = excs.find((x) => x.id === ex.id);
  check(exr.status === 'approved' && exr.d_first === 'Muborak' && exr.decide_note === 'Ko‘rdim, keldi', 'Tasdiqlagan rahbar va sabab saqlandi', exr);
  // Ruxshona ketishni belgilamaydi → ertasi kuni
  NOW = T0 + DAY;
  const rep = await api(OWNER, 'att_report', { from: '2026-11-02', to: '2026-11-02' });
  const rx = rep.users.find((u) => u.id === ruxId).days[0];
  check(rx.status === 'no_out' && rx.full === false && rx.net === null, '«Ketish qayd etilmagan», to‘liq kun avtomatik yozilmadi', rx);
  const dx = rep.users.find((u) => u.id === dilId).days[0];
  check(dx.late === 40 && dx.in_how.startsWith('exc:'), 'Kechikish hisoblandi (08:50, chegara 08:10), istisno belgisi bor', dx);
  // To'liq kun: kelish 08:00, ketish 17:30 (tanaffus 60 daqiqa) → sof 510 daqiqa
  NOW = Date.parse('2026-11-03T03:00:00Z');
  await api(RUX, 'att_mark', { kind: 'in', loc: LOC_OK, bio: 'ok', bio_token: en.token, rid: rid() });
  NOW = Date.parse('2026-11-03T12:30:00Z');
  r = await api(RUX, 'att_mark', { kind: 'out', loc: LOC_OK, bio: 'ok', bio_token: en.token, rid: rid() });
  const h = await api(RUX, 'att_history', { from: '2026-11-03', to: '2026-11-03' });
  check(h[0].gross === 570 && h[0].net === 510 && h[0].full === true, 'Kelish-ketish oralig‘i 9:30, sof ish 8:30 → to‘liq kun', h[0]);
  NOW = T0 + DAY; // 2026-11-03 08:30

  // ---------- 5 ----------
  test(5, '20 donadan 8 berilganda erkin qoldiq 12; parallel berishda ortiqcha taqsimlash yo‘q');
  const b1 = await api(SAR, 'batch_create', { type_id: KOYLAK, model: 'Lola', material: 'Paxta', color: 'Qizil',
    lines: [{ size: '48', ready: 8, partial: 0 }, { size: '50', ready: 12, partial: 3 }], rid: rid() });
  let bd = await api(SAR, 'batch_detail', { batch_id: b1.id });
  const L48 = bd.lines.find((l) => l.size === '48'), L50 = bd.lines.find((l) => l.size === '50');
  check(bd.totals.free === 20 && bd.totals.partial === 3 && bd.lines.length === 2, `${b1.code}: 48 — 8, 50 — 12 alohida qator, jami 20 tayyor; chala 3 alohida`, bd.totals);
  await api(SAR, 'transfer_create', { to_id: ruxId, items: [{ line_id: L48.line_id, qty: 8 }], rid: rid() });
  bd = await api(SAR, 'batch_detail', { batch_id: b1.id });
  check(bd.totals.free === 12 && bd.totals.reserved === 8, '8 dona berildi → erkin qoldiq 12, 8 dona band (qabul kutilmoqda)', bd.totals);
  r = await raw(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L50.line_id, qty: 13 }] });
  check(!r.ok && r.error === 'not_enough_free' && r.params.have === 12, 'Erkin qoldiqdan ko‘p (13) berib bo‘lmaydi', r);
  r = await raw(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L50.line_id, qty: 14 }] });
  const par = await Promise.all([1, 2, 3, 4, 5].map(() => raw(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L50.line_id, qty: 5 }], rid: rid() })));
  bd = await api(SAR, 'batch_detail', { batch_id: b1.id });
  check(par.filter((x) => x.ok).length === 2 && bd.totals.free === 2 && bd.totals.reserved === 18, '5 ta parallel so‘rov (5 tadan): faqat 2 tasi o‘tdi, erkin qoldiq 2, manfiy yo‘q', { ok: par.filter((x) => x.ok).length, totals: bd.totals });
  const sameRid = rid();
  const d1 = await api(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L50.line_id, qty: 1 }], rid: sameRid });
  const d2 = await api(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L50.line_id, qty: 1 }], rid: sameRid });
  bd = await api(SAR, 'batch_detail', { batch_id: b1.id });
  check(d1.id === d2.id && bd.totals.free === 1, 'Bir xil so‘rovni qayta yuborish (tarmoq uzilishi) ikkinchi topshiriq yaratmadi', { d1, d2 });
  // bekor qilish band qoldiqni bo'shatadi
  await api(SAR, 'transfer_cancel', { id: d1.id, reason: 'Xato kiritildi', rid: rid() });
  bd = await api(SAR, 'batch_detail', { batch_id: b1.id });
  check(bd.totals.free === 2, 'Bekor qilish band qoldiqni to‘g‘ri bo‘shatdi', bd.totals);

  // ---------- 6 ----------
  test(6, '10 qabul → 8 tayyor → 2 qolgan; ertasi shu 2 o‘sha partiyada saqlanadi');
  const b2 = await api(SAR, 'batch_create', { type_id: KOYLAK, model: 'Gulnoza', material: 'Shtapel', color: 'Ko‘k', lines: [{ size: '46', ready: 100 }], rid: rid() });
  bd = await api(SAR, 'batch_detail', { batch_id: b2.id });
  const L46 = bd.lines[0].line_id;
  const tr = await api(SAR, 'transfer_create', { to_id: ruxId, items: [{ line_id: L46, qty: 10 }], rid: rid() });
  let sh = await api(RUX, 'sew_home');
  check(sh.incoming.some((x) => x.id === tr.id && x.total === 10), 'Tikuvchida kelgan ish: 10 dona, tafsiloti bilan');
  check(tgSent.some((m) => m.chat_id === RUX && /Sizga 10 dona/.test(m.text)), 'Tikuvchiga lotincha bildirishnoma ketdi');
  await api(RUX, 'transfer_accept', { id: tr.id, rid: rid() });
  await api(RUX, 'submit', { line_id: L46, qty: 8, rid: rid() });
  sh = await api(RUX, 'sew_home');
  let ln = sh.lines.find((l) => l.line_id === L46);
  check(ln.sewing === 2 && ln.review === 8, 'Tikuvchida 2 qoldi, 8 tasi tekshiruvda', ln);
  NOW += DAY;
  sh = await api(RUX, 'sew_home');
  ln = sh.lines.find((l) => l.line_id === L46);
  const mv = await api(RUX, 'my_moves', { from: day(), to: day() });
  check(ln.sewing === 2 && ln.code === b2.code && mv.length === 0, 'Ertasi kuni 2 dona o‘sha partiyada turibdi, yangi kirim yaratilmadi', { ln, mv: mv.length });

  // ---------- 7 ----------
  test(7, 'Faqat 2 mavjud bo‘lsa 8 tayyor rad; kechadan 6 + bugun 2 bo‘lsa 8 mumkin');
  r = await raw(RUX, 'submit', { line_id: L46, qty: 8 });
  check(!r.ok && r.error === 'have_only' && r.params.have === 2, '«Sizda 2 dona bor. Miqdorni tekshiring» — saqlanmadi', r);
  // Dilnoza: kecha 6 qoldi, bugun 2 keldi
  NOW -= DAY;
  const tr6 = await api(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L46, qty: 6 }], rid: rid() });
  await api(DIL, 'transfer_accept', { id: tr6.id, rid: rid() });
  NOW += DAY;
  const tr2 = await api(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L46, qty: 2 }], rid: rid() });
  r = await raw(DIL, 'submit', { line_id: L46, qty: 8 });
  check(!r.ok && r.params.have === 6, 'Bugungi 2 dona hali qabul qilinmagan → faqat 6 hisobga olinadi', r);
  await api(DIL, 'transfer_accept', { id: tr2.id, rid: rid() });
  r = await raw(DIL, 'submit', { line_id: L46, qty: 8, rid: rid() });
  check(r.ok && r.result.left === 0, 'Kechagi 6 + bugungi 2 → 8 tayyor saqlandi, qoldiq 0 («hammasi tugadi»)', r);

  // ---------- 8 ----------
  test(8, 'Model/rang/razmerlar aralashmaydi; tayyor mahsulot qayta topshirilmaydi');
  await api(RUX, 'transfer_accept', { id: (await api(RUX, 'sew_home')).incoming.find((x) => x.items[0].line_id === L48.line_id).id, rid: rid() });
  r = await raw(RUX, 'submit', { line_id: L50.line_id, qty: 1 });
  check(!r.ok && r.params.have === 0, 'Ruxshonada 48-razmer bor, 50-razmerdan topshira olmaydi', r);
  sh = await api(RUX, 'sew_home');
  check(sh.lines.find((l) => l.line_id === L48.line_id).sewing === 8 && sh.lines.find((l) => l.line_id === L46).sewing === 2,
    'Qizil «Lola» 48 (8) va ko‘k «Gulnoza» 46 (2) alohida qatorlarda');
  r = await raw(RUX, 'submit', { line_id: L46, qty: 3 });
  check(!r.ok && r.params.have === 2, 'Tekshiruvga ketgan 8 dona yana topshirilmaydi (qo‘lda faqat 2)', r);
  const ins = await api(OWNER, 'insp_list');
  const subR = ins.find((s) => s.sewer_id === ruxId && s.line_id === L46);
  await api(OWNER, 'inspect', { submission_id: subR.id, accepted: 8, rid: rid() });
  r = await raw(OWNER, 'inspect', { submission_id: subR.id, accepted: 8 });
  check(!r.ok && r.error === 'have_only' && r.params.have === 0, 'Bir topshiriq ikki marta qabul qilinmaydi', r);

  // ---------- 9 ----------
  test(9, 'Qabul qilinmagan mahsulot haqga kirmaydi; bir mahsulotga qayta haq hisoblanmaydi');
  const b3 = await api(SAR, 'batch_create', { type_id: KOYLAK, model: 'Malika', material: 'Atlas', color: 'Oq', lines: [{ size: '52', ready: 400 }], rid: rid() });
  bd = await api(SAR, 'batch_detail', { batch_id: b3.id });
  const L52 = bd.lines[0].line_id;
  const t350 = await api(SAR, 'transfer_create', { to_id: dilId, items: [{ line_id: L52, qty: 350 }], rid: rid() });
  await api(DIL, 'transfer_accept', { id: t350.id, rid: rid() });
  const s350 = await api(DIL, 'submit', { line_id: L52, qty: 350, rid: rid() });
  let ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  const earnedBefore = ps.earned;
  check(!ps.groups.some((g) => g.model === 'Malika'), '350 «tayyor» deyilgan, hali tekshirilmagan → haqga kirmadi');
  const inspRid = rid();
  await api(OWNER, 'inspect', { submission_id: s350.id, accepted: 348, rework: 2, reason: 'Choki qiyshiq', rid: inspRid });
  await api(OWNER, 'inspect', { submission_id: s350.id, accepted: 348, rework: 2, reason: 'Choki qiyshiq', rid: inspRid });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  const gM = ps.groups.find((g) => g.model === 'Malika');
  check(gM.qty === 348 && gM.amount === 3480000, '348 × 10 000 = 3 480 000 so‘m (qayta yuborilgan so‘rov ikki marta hisoblamadi)', gM);
  sh = await api(DIL, 'sew_home');
  check(sh.lines.find((l) => l.line_id === L52).rework === 2, 'Qolgan 2 dona «qayta ishlashda» alohida ko‘rinadi, haqga kirmagan');
  // Dilnozaning 8 donasi (Gulnoza) hali tekshirilmagan → haqga kirmaydi
  check(!ps.groups.some((g) => g.model === 'Gulnoza'), 'Tekshiruvni kutayotgan 8 dona (Gulnoza) haqga kirmagan');

  // ---------- 10 ----------
  test(10, '348×10 000 = 3 480 000; kelishilgan 200 000 hisoblashishdan so‘ng 3 280 000');
  // Taqqoslash uchun Gulnoza 8 donasini qaytarib qo'yamiz (qayta ishlash) — haq o'zgarmaydi
  const subD = (await api(OWNER, 'insp_list')).find((s) => s.sewer_id === dilId && s.line_id === L46);
  await api(OWNER, 'inspect', { submission_id: subD.id, rework: 8, reason: 'Tugmalari yo‘q', rid: rid() });
  const tk = await api(DIL, 'tk_create', { kind: 'service', name: 'O‘zim uchun 2 ta ko‘ylak tiktirdim', qty: 2, unit: 'dona', proposed: null, rid: rid() });
  let tkl = await api(DIL, 'tk_list');
  check(tkl.find((x) => x.id === tk.id).amount === null && tkl.find((x) => x.id === tk.id).status === 'submitted', 'Narx noma’lum («Rahbar belgilaydi») → nol yoki taxminiy qarz yaratilmadi');
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(ps.now.payable === 3480000, 'Narxi belgilanmagan yozuv oylikni kamaytirmadi (3 480 000)', ps.now);
  await api(OWNER, 'tk_set', { id: tk.id, amount: 200000, pay_method: 'payroll', rid: rid() });
  r = await raw(DIL, 'tk_confirm', { id: tk.id, consent: false });
  check(!r.ok && r.error === 'need_consent', 'Oylikdan ushlash uchun xodimning aniq roziligi shart', r);
  await api(DIL, 'tk_confirm', { id: tk.id, consent: true, rid: rid() });
  await api(OWNER, 'tk_settle', { id: tk.id, how: 'payroll', rid: rid() });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(ps.earned === 3480000 && ps.ded === 200000 && ps.now.payable === 3280000, '3 480 000 − 200 000 = 3 280 000 beriladi', { earned: ps.earned, ded: ps.ded, payable: ps.now.payable });
  r = await raw(OWNER, 'tk_settle', { id: tk.id, how: 'payroll' });
  check(!r.ok && r.error === 'already_paid', 'Shu yozuvni qayta ayirib bo‘lmaydi', r);

  // ---------- 11 ----------
  test(11, '«Пул бердим» → kutish → «Pulni oldim» → tasdiq; e’tiroz, qisman to‘lov, takror bosish');
  const pr = rid();
  const p1 = await api(OWNER, 'pay_create', { user_id: dilId, amount: 2000000, from: '2026-11-01', to: '2026-11-30', rid: pr });
  const p1b = await api(OWNER, 'pay_create', { user_id: dilId, amount: 2000000, from: '2026-11-01', to: '2026-11-30', rid: pr });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  const pend = ps.payments.find((p) => p.id === p1.id);
  check(p1.id === p1b.id && ps.payments.filter((p) => p.status === 'pending').length === 1, 'Takror bosish ikkinchi to‘lov yaratmadi');
  check(pend.status === 'pending' && ps.now.pending === 2000000 && ps.now.payable === 1280000, 'Holat «Ходим тасдиғи кутилмоқда»; kutayotgan pul qayta to‘lashga taklif qilinmaydi', ps.now);
  check(tgSent.some((m) => m.chat_id === DIL && /2 000 000 so‘m/.test(m.text)), 'Xodimga aniq summa va davr bilan xabar ketdi');
  r = await raw(OWNER, 'pay_create', { user_id: dilId, amount: 1500000 });
  check(!r.ok && r.error === 'over_payable' && r.params.payable === 1280000, 'Beriladigan puldan ortiq «oylik» yozib bo‘lmaydi', r);
  r = await raw(RUX, 'pay_confirm', { id: p1.id });
  check(!r.ok && r.status === 403, 'Boshqa xodim Dilnozaning pulini tasdiqlay olmaydi', r);
  await api(DIL, 'pay_confirm', { id: p1.id, rid: rid() });
  r = await api(DIL, 'pay_confirm', { id: p1.id, rid: rid() });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(r.already && ps.paidConfirmed === 2000000 && ps.now.payable === 1280000, 'Ikki tomon tasdiqladi; qayta bosish o‘zgartirmadi', ps.now);
  check(ps.earned - ps.paidConfirmed === 1480000, 'Qisman to‘lov: 3 480 000 − 2 000 000 = 1 480 000 (hisoblashishsiz holat)');
  const p2 = await api(OWNER, 'pay_create', { user_id: dilId, amount: 1000000, rid: rid() });
  await api(DIL, 'pay_dispute', { id: p2.id, note: 'Menga 900 ming berildi', amount: 900000, rid: rid() });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(ps.payments.find((p) => p.id === p2.id).status === 'disputed' && ps.paidConfirmed === 2000000 && ps.blockers.includes('payment_open'), 'E’tiroz: bahsli summa alohida, tasdiqlanganga qo‘shilmadi, oylik yopilmaydi');
  await api(OWNER, 'pay_cancel', { id: p2.id, reason: 'Xodim 900 ming olganini aytdi, qaytadan yoziladi', rid: rid() });
  const p3 = await api(OWNER, 'pay_create', { user_id: dilId, amount: 900000, rid: rid() });
  await api(DIL, 'pay_confirm', { id: p3.id, rid: rid() });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(ps.now.payable === 380000 && ps.blockers.includes('payable_left'), 'Qolgan beriladigan pul 380 000, oylik hali yopilmaydi', ps.now);
  const p4 = await api(OWNER, 'pay_create', { user_id: dilId, amount: 380000, rid: rid() });
  await api(DIL, 'pay_confirm', { id: p4.id, rid: rid() });
  ps = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(ps.blockers.length === 0, 'Barcha majburiyatlar yopildi → oylik yopilishi mumkin', ps.blockers);
  await api(OWNER, 'period_close', { user_id: dilId, from: '2026-11-01', to: '2026-11-30', rid: rid() });
  // Tasdiqlangan to'lovni yashirin o'chirib bo'lmaydi
  r = await raw(OWNER, 'pay_cancel', { id: p1.id, reason: 'test' });
  check(!r.ok && r.error === 'bad_state', 'Tasdiqlangan to‘lov oddiy bekor qilinmaydi (faqat sabab + xodim qayta tasdig‘i bilan)', r);

  // ---------- 12 ----------
  test(12, 'Oldin to‘langan xarid qayta ayirilmaydi; bahsli/noma’lum narx kamaytirmaydi; keyingi oy takror ayirish yo‘q');
  const before = (await api(OWNER, 'payslip', { user_id: ruxId, from: '2026-11-01', to: '2026-11-30' })).now;
  const tA = await api(RUX, 'tk_create', { kind: 'material', name: 'Mato 3 metr', qty: 3, unit: 'metr', proposed: 60000, rid: rid() });
  await api(OWNER, 'tk_set', { id: tA.id, amount: 60000, pay_method: 'prepaid', stock_ref: 'Ombor chiqim №17', rid: rid() });
  await api(RUX, 'tk_confirm', { id: tA.id, rid: rid() });
  const tB = await api(RUX, 'tk_create', { kind: 'product', name: 'Tayyor xalat', qty: 1, rid: rid() });
  await api(OWNER, 'tk_set', { id: tB.id, amount: 150000, pay_method: 'payroll', rid: rid() });
  await api(RUX, 'tk_dispute', { id: tB.id, note: 'Narxi 120 ming edi', rid: rid() });
  const tC = await api(RUX, 'tk_create', { kind: 'product', name: 'Bolalar ko‘ylagi', qty: 2, rid: rid() });
  let after = (await api(OWNER, 'payslip', { user_id: ruxId, from: '2026-11-01', to: '2026-11-30' })).now;
  check(after.payable === before.payable && after.debt === 0, 'Oldindan to‘langan (60 000), bahsli (150 000) va narxsiz yozuvlar oylikni kamaytirmadi', { before, after });
  r = await raw(OWNER, 'tk_settle', { id: tA.id, how: 'payroll' });
  check(!r.ok && r.error === 'already_paid', 'Oldin to‘langan xaridni oylikdan ayirib bo‘lmaydi', r);
  const dec = await api(OWNER, 'payslip', { user_id: dilId, from: '2026-12-01', to: '2026-12-31' });
  check(dec.ded === 0 && dec.opening === 0 && dec.now.payable === 0, 'Dekabr: noyabrdagi 200 000 qayta ayirilmadi, ochilish qoldig‘i 0', { ded: dec.ded, opening: dec.opening });
  // Qarz oylikdan katta: Ruxshona
  const tD = await api(RUX, 'tk_create', { kind: 'product', name: 'Kostyum', qty: 1, rid: rid() });
  await api(OWNER, 'tk_set', { id: tD.id, amount: 5000000, pay_method: 'payroll', rid: rid() });
  await api(RUX, 'tk_confirm', { id: tD.id, consent: true, rid: rid() });
  const avail = (await api(OWNER, 'payslip', { user_id: ruxId, from: '2026-11-01', to: '2026-11-30' })).now.payable;
  const se = await api(OWNER, 'tk_settle', { id: tD.id, how: 'payroll', rid: rid() });
  after = (await api(OWNER, 'payslip', { user_id: ruxId, from: '2026-11-01', to: '2026-11-30' })).now;
  check(se.amount === avail && after.payable === 0 && after.balance === 0 && after.debt === 5000000 - avail,
    `Qarz (5 000 000) oylikdan (${avail}) katta → manfiy to‘lov yo‘q, qolgan qarz ${5000000 - avail} alohida`, { se, after });

  // ---------- 13 ----------
  test(13, 'Bichuvchi ham, tikuvchi ham o‘z haqi, olganlari va pul tasdig‘idan foydalanadi; tariflar aralashmaydi');
  ps = await api(SAR, 'payslip', { from: '2026-11-01', to: '2026-11-30' });
  const works = [...new Set(ps.groups.map((g) => g.work))];
  check(works.length === 1 && works[0] === 'bichish', 'Bichuvchi varaqasida faqat «bichish» tarifi', ps.groups);
  const sarAcc = ps.groups.reduce((a, g) => a + g.qty, 0);
  check(ps.earned === sarAcc * 2000 && sarAcc === 8 + 10 + 6 + 2 + 350, `Bichuvchi haqi tikuvchi sanab qabul qilgan bichimdan: ${sarAcc} × 2 000`, { sarAcc, earned: ps.earned });
  const dps = await api(DIL, 'payslip', { from: '2026-11-01', to: '2026-11-30' });
  check(dps.groups.every((g) => g.work === 'tikish'), 'Tikuvchi varaqasida faqat «tikish» tarifi');
  const tS = await api(SAR, 'tk_create', { kind: 'material', name: 'Ip', qty: 5, proposed: 10000, rid: rid() });
  await api(OWNER, 'tk_set', { id: tS.id, amount: 10000, pay_method: 'payroll', rid: rid() });
  await api(SAR, 'tk_confirm', { id: tS.id, consent: true, rid: rid() });
  await api(OWNER, 'tk_settle', { id: tS.id, how: 'payroll', rid: rid() });
  const ps2 = await api(OWNER, 'pay_create', { user_id: sarId, amount: 100000, kind: 'avans', rid: rid() });
  await api(SAR, 'pay_confirm', { id: ps2.id, rid: rid() });
  const sp = await api(SAR, 'payslip', { from: '2026-11-01', to: '2026-11-30' });
  check(sp.ded === 10000 && sp.paidConfirmed === 100000 && sp.now.payable === sp.earned - 110000, 'Bichuvchi: olgani ushlandi, avans tasdiqlandi, qoldiq to‘g‘ri', sp.now);
  r = await raw(SAR, 'payslip', { user_id: dilId, from: '2026-11-01', to: '2026-11-30' });
  check(!r.ok && r.status === 403, 'Bichuvchi tikuvchining puli ko‘rmaydi');

  // ---------- Qo'shimcha: hisob tenglamasi, ovoz, tug'ilgan kun ----------
  test('+', 'Qo‘shimcha: hisob tenglamasi, ovozli kiritish ajratuvchisi, tug‘ilgan kun eslatmasi');
  const pr2 = await api(OWNER, 'prod_report', { from: '2026-11-01', to: '2026-11-30' });
  check(pr2.eq.ok, `Boshlang‘ich + yangi tayyor bichim = barcha holatlardagi qoldiq (${pr2.eq.start} + ${pr2.eq.newReady} = ${pr2.eq.end})`, pr2.eq);
  const wr = await api(OWNER, 'where_report', {});
  check(wr.some((w) => w.state === 'rework' && w.name.startsWith('Dilnoza') && w.qty === 2), '«Qoldiq kimda»: Dilnozada 2 dona qayta ishlashda, partiya/razmeri bilan');
  let v = await api(SAR, 'voice_parse', { text: 'Ruxshonaga 10 ta qizil paxta ko‘ylak berdim' });
  check(v.sewer && v.sewer.id === ruxId && v.qty === 10 && v.mentioned.color === 'Qizil' && v.mentioned.material === 'Paxta', 'Gap ajratildi: Ruxshona, 10, qizil, paxta, ko‘ylak', v);
  check(v.lines.length === 1 && v.lines[0].size === '50', 'Erkin qoldig‘i bor yagona mos qator topildi (P · 50), qolgani o‘ylab topilmadi', v.lines);
  v = await api(SAR, 'voice_parse', { text: 'Zuhraga o‘n besh ta yashil ko‘ylak' });
  check(!v.sewer && v.missing.includes('sewer') && v.qty === 15 && v.missing.includes('no_match'), 'Noma’lum xodim/rang → aniqlashtirish so‘raladi, yozuv yaratilmaydi', v);
  NOW = Date.parse('2026-11-02T03:00:00Z');
  let cr = await (await fetch(`${BASE}/__test/cron`, { method: 'POST', headers: { 'x-test-now': String(NOW) } })).json();
  const cr2 = await (await fetch(`${BASE}/__test/cron`, { method: 'POST', headers: { 'x-test-now': String(NOW) } })).json();
  check(cr.result.some((x) => x.user_id === ruxId && x.kind === 'soon') && cr2.result.length === 0, 'Ruxshona (4-noyabr): 2 kun oldin eslatma, qayta ishga tushganda dublikat yo‘q', { cr, cr2 });
  check(tgSent.some((m) => m.chat_id === OWNER && /туғилган куни/.test(m.text)) && !tgSent.some((m) => m.chat_id !== OWNER && /туғилган|tug‘ilgan/.test(m.text)), 'Eslatma faqat rahbarga (kirillda)');
  const snap = { staff: (await api(OWNER, 'staff_list')).users.length, audit: (await api(OWNER, 'audit_list', { limit: 500 })).length, payable: (await api(OWNER, 'payslip', { user_id: ruxId, from: '2026-11-01', to: '2026-11-30' })).now };
  const fs = await import('node:fs');
  fs.writeFileSync(new URL('./.snapshot.json', import.meta.url), JSON.stringify(snap));
}

async function afterRestart() {
  NOW = T0 + 3 * DAY;
  test(14, 'Server qayta ishga tushganda ma’lumotlar va audit saqlanadi');
  const fs = await import('node:fs');
  const snap = JSON.parse(fs.readFileSync(new URL('./.snapshot.json', import.meta.url)));
  const st = await api(OWNER, 'staff_list');
  const ruxId = st.users.find((u) => u.tg_id === RUX).id;
  const aud = await api(OWNER, 'audit_list', { limit: 500 });
  const pay = (await api(OWNER, 'payslip', { user_id: ruxId, from: '2026-11-01', to: '2026-11-30' })).now;
  check(st.users.length === snap.staff, `Xodimlar soni saqlandi (${snap.staff})`);
  check(aud.length === snap.audit, `Audit yozuvlari saqlandi (${snap.audit})`);
  check(JSON.stringify(pay) === JSON.stringify(snap.payable), 'Pul hisobi o‘zgarmadi');
  const r = await api(RUX, 'enter', { role: 'tikuvchi' });
  check(r.state === 'ok', 'Tasdiqlangan xodim qayta anketasiz kiradi');
}

try {
  if (PHASE === 'restart') await afterRestart(); else await main();
} catch (e) {
  if (cur) check(false, 'Kutilmagan xato: ' + e.message);
  else console.error(e);
}
mock.close();
let fail = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.n}. ${r.title}`);
  for (const c of r.checks) console.log(c);
  if (!r.ok) fail++;
}
console.log(`\n${results.length - fail}/${results.length} bo‘lim o‘tdi`);
process.exit(fail ? 1 : 0);
