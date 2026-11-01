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
const tgPhotos = [];
let phN = 0;
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks), d = buf.toString('latin1');
    if (req.url.includes('/file/bot')) { res.setHeader('content-type', 'image/jpeg'); return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])); }
    const method = req.url.split('/').pop();
    if (['sendPhoto', 'sendDocument'].includes(method) && /multipart/.test(req.headers['content-type'] || '')) {
      const chat = (d.match(/name="chat_id"\r\n\r\n([^\r]*)/) || [])[1];
      const caption = Buffer.from((d.match(/name="caption"\r\n\r\n([^\r]*)/) || [])[1] || '', 'latin1').toString('utf8');
      phN++; tgPhotos.push({ chat, caption, bytes: buf.length, method });
      if (method === 'sendDocument' && /ovozli-izoh/.test(d)) return res.end(JSON.stringify({ ok: true, result: { message_id: phN, document: { file_id: 'VOICE' + phN, file_unique_id: 'V' + phN } } }));
      if (method === 'sendDocument') { try {} catch {} return res.end('{"ok":true,"result":{"message_id":0}}'); }
      return res.end(JSON.stringify({ ok: true, result: { message_id: phN, photo: [{ file_id: 'small' + phN, file_unique_id: 's' + phN, width: 90, height: 90 }, { file_id: 'FILE' + phN, file_unique_id: 'U' + phN, width: 800, height: 600 }] } }));
    }
    if (method === 'getFile') return res.end(JSON.stringify({ ok: true, result: { file_path: 'photos/f.jpg' } }));
    try { const j = JSON.parse(buf.toString('utf8')); j._method = method; tgSent.push(j); } catch {}
    res.end('{"ok":true}');
  });
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
  check(tgSent.some((m) => m.chat_id === RUX && /Sizga 10 dona/.test(m.text || m.caption)), 'Tikuvchiga lotincha bildirishnoma ketdi');
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
  test(15, 'Qo‘shimcha: uydan ishlaydigan xodim — davomat so‘ralmaydi, ish va pul odatdagidek');
  let qh0 = await api(OWNER, 'r_home');
  await api(OWNER, 'staff_remote', { user_id: dilId, on: true, rid: 'rem-1' });
  await api(OWNER, 'staff_remote', { user_id: dilId, on: true, rid: 'rem-1' });
  let qh1 = await api(OWNER, 'r_home');
  check(qh1.att.staff === qh0.att.staff - 1 && qh1.att.remote === 1 && !qh1.att.absent.some((n) => n.startsWith('Dilnoza')), 'Rahbar ekranida u «kelmadi» ro‘yxatida yo‘q, alohida sanaladi', qh1.att);
  check((await api(DIL, 'me')).remote === true, 'Xodimning o‘zi «uydan ishlaydi» holatini ko‘radi');
  const qam = await api(DIL, 'att_mark', { kind: 'in', loc: { lat: 1, lng: 1, acc: 5 }, bio: 'ok' });
  check(qam.ok === false && qam.reason === 'remote', 'Davomat belgilash talab qilinmaydi (server ham qabul qilmaydi)', qam);
  const qex = await raw(DIL, 'att_exception', { kind: 'in', reason: 'other' });
  check(qex.status >= 400, 'Uydagi xodimdan davomat so‘rovi ham olinmaydi');
  const qpr = await api(DIL, 'sew_home');
  check(qpr && typeof qpr === 'object', 'Ish bo‘limi odatdagidek ochiladi');
  await new Promise((r) => setTimeout(r, 400));
  const qau = await api(OWNER, 'audit_list', { limit: 5 });
  check(qau.filter((x) => x.action === 'remote_changed').length === 1 && tgSent.some((m) => m.chat_id === DIL && /uydan ishlaydi/i.test(m.text)), 'Audit bitta yozuv (qayta bosish takrorlamaydi), xodimga xabar ketdi');
  await api(OWNER, 'staff_remote', { user_id: dilId, on: false });
  check((await api(OWNER, 'r_home')).att.staff === qh0.att.staff, 'Qaytarib «korxonada» qilinganda yana davomatda hisoblanadi');

  test(16, 'Qo‘shimcha: rasm va ovozli izoh, «Olganlarim» ro‘yxati, avans so‘rash, oylik hisob tasdig‘i');
  const SAVE_NOW = NOW;
  NOW = Date.parse('2026-11-05T06:00:00Z');
  const NOD = 2020;
  await api(NOD, 'register', { role: 'tikuvchi', first_name: 'Nodira', last_name: 'Karimova', bd: 1, bm: 2, by: 1999, rid: rid() });
  const nodId = (await api(OWNER, 'staff_list')).users.find((u) => u.tg_id === NOD).id;
  await api(OWNER, 'staff_decide', { user_id: nodId, approve: true, rid: rid() });
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 7), Buffer.from([0xff, 0xd9])]).toString('base64');
  const ph = await api(SAR, 'photo_upload', { data: 'data:image/jpeg;base64,' + JPG, what: 'Bahor', sec: 'bichim' });
  const lastPh = tgPhotos[tgPhotos.length - 1];
  check(ph.id > 0 && lastPh.chat === '-1001234567890' && /^#bichim 📷 .* · \d\d\.\d\d\.2026 · Bahor$/.test(lastPh.caption), 'Rasm yopiq kanalga yuklandi (izoh bilan), bazada faqat havola', lastPh);
  check((await raw(SAR, 'photo_save', { file_id: 'soxta' })).status === 404 && (await raw(SAR, 'photo_upload', { data: Buffer.from('salom').toString('base64') })).status === 400, 'Soxta havola yoki rasm bo‘lmagan fayl qabul qilinmaydi');
  const bb = await api(SAR, 'batch_create', { type_id: KOYLAK, model: 'Bahor', material: 'Pombaxt', color: 'Sariq', lines: [{ size: '48', ready: 30 }], photo_id: ph.id, rid: rid() });
  check((await raw(SAR, 'batch_create', { type_id: KOYLAK, model: 'X', material: 'Y', color: 'Z', lines: [{ size: '48', ready: 1 }], photo_id: ph.id })).error === 'bad_input', 'Bitta rasm ikki partiyaga biriktirilmaydi');
  const bline = (await api(SAR, 'batch_detail', { batch_id: bb.id })).lines[0].line_id;
  const vc = await api(SAR, 'voice_upload', { data: 'data:audio/webm;base64,' + Buffer.alloc(900, 3).toString('base64'), mime: 'audio/webm' });
  const t16 = await api(SAR, 'transfer_create', { to_id: nodId, items: [{ line_id: bline, qty: 30 }], note: 'Yoqasi ikki qavat', voice_id: vc.id, rid: rid() });
  await new Promise((r) => setTimeout(r, 400));
  const pm = tgSent.find((m) => m._method === 'sendPhoto' && m.chat_id === NOD);
  const vm = tgSent.find((m) => m._method === 'sendDocument' && m.chat_id === NOD && /VOICE/.test(m.document));
  check(pm && /30 dona/.test(pm.caption) && /Bahor/.test(pm.caption) && /Yoqasi ikki qavat/.test(pm.caption) && vm, 'Tikuvchiga Telegram’da rasm + tavsif + ovozli izoh bordi', { pm, vm });
  const inc = (await api(NOD, 'sew_home')).incoming.find((x) => x.id === t16.id);
  check(inc && inc.items[0].photo_id === ph.id && inc.voice_id === vc.id && inc.note === 'Yoqasi ikki qavat', 'Ilovada ham rasm, yozma va ovozli izoh ko‘rinadi');
  const getMedia = async (tg, action, id) => {
    const init = await signInitData({ auth_date: String(Math.floor(NOW / 1000)), user: JSON.stringify({ id: tg, first_name: 'T' }) }, TOKEN);
    const r = await fetch(`${BASE}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': init, 'x-test-now': String(NOW) }, body: JSON.stringify({ id }) });
    return { status: r.status, type: r.headers.get('content-type') };
  };
  let g1 = await getMedia(NOD, 'photo_get', ph.id), g2 = await getMedia(DIL, 'photo_get', ph.id), g3 = await getMedia(NOD, 'voice_get', vc.id), g4 = await getMedia(DIL, 'voice_get', vc.id);
  check(g1.status === 200 && /image/.test(g1.type) && g3.status === 200 && /audio/.test(g3.type) && g2.status === 403 && g4.status === 403, 'Rasm/ovozni ish berilgan tikuvchi ochadi, begona xodim ocha olmaydi', { g1, g2, g3, g4 });
  await api(NOD, 'transfer_accept', { id: t16.id, rid: rid() });
  await api(NOD, 'submit', { line_id: bline, qty: 30, rid: rid() });
  const sub16 = (await api(OWNER, 'insp_list')).find((x) => x.sewer_id === nodId);
  await api(OWNER, 'inspect', { submission_id: sub16.id, accepted: 30, rid: rid() });
  // Olganlarim
  const tph = await api(NOD, 'photo_upload', { data: JPG, what: 'Olganim' });
  const k1 = await api(NOD, 'tk_add', { name: '3 metr pombaxt', photo_id: tph.id, rid: rid() });
  const k2 = await api(NOD, 'tk_add', { name: '3 ta zamok', rid: rid() });
  const k3 = await api(NOD, 'tk_add', { name: '1 ta ko‘ylak tiktirdim', rid: rid() });
  check((await getMedia(DIL, 'photo_get', tph.id)).status === 403 && (await getMedia(OWNER, 'photo_get', tph.id)).status === 200, '«Olganlarim» rasmini rahbar ko‘radi, boshqa xodim ko‘rmaydi');
  check(tgSent.filter((m) => m.chat_id === OWNER && /олганларини ёзмоқда/.test(m.text || '')).length === 1, 'Ketma-ket ro‘yxat uchun rahbarga bitta xabar (har qatorga emas)');
  let rs = await raw(OWNER, 'rk_send', { user_id: nodId });
  check(rs.error === 'cannot_send' && rs.params.blockers.includes('unpriced'), 'Narx qo‘yilmaguncha hisob yuborilmaydi', rs);
  await api(OWNER, 'tk_price', { id: k1.id, amount: 75000, rid: rid() });
  await api(OWNER, 'tk_price', { id: k2.id, amount: 6000, rid: rid() });
  await api(OWNER, 'tk_price', { id: k3.id, amount: 50000, prepaid: true, rid: rid() });
  // Avans
  const av = await api(NOD, 'av_request', { amount: 100000, note: 'uy uchun', rid: rid() });
  check((await raw(NOD, 'av_request', { amount: 50000 })).error === 'avans_pending', 'Javobsiz avans so‘rovi turganda ikkinchisi yuborilmaydi');
  check((await api(OWNER, 'r_home')).todo.avans === 1, 'Rahbar bosh ekranida «Аванс сўровлари»');
  const avd = await api(OWNER, 'av_decide', { id: av.id, give: true, amount: 80000, rid: rid() });
  await api(NOD, 'pay_confirm', { id: avd.payment_id, rid: rid() });
  let rv = await api(NOD, 'rk_view', {});
  const LV = rv.live;
  check(LV.earned === 300000 && LV.avansSum === 80000 && LV.itemsSum === 81000 && LV.total === 139000 && LV.prepaid.length === 1 && !LV.blockers.length,
    'Hisob: 30×10 000 = 300 000 − avans 80 000 − olganlar 81 000 = 139 000 (alohida to‘langan ko‘ylak ayirilmaydi)', LV);
  const sent = await api(OWNER, 'rk_send', { user_id: nodId, rid: rid() });
  // Yuborilgandan keyin yangi narxli yozuv qo'shilsa — eski hisob tasdiqlanmaydi
  const k4 = await api(NOD, 'tk_add', { name: '1 g‘altak ip', rid: rid() });
  await api(OWNER, 'tk_price', { id: k4.id, amount: 4000, rid: rid() });
  let ans = await api(NOD, 'rk_answer', { id: sent.id, agree: true, rid: rid() });
  check(ans.stale === true && (await api(OWNER, 'r_home')).todo.rk === 1, 'Yuborilgandan keyin o‘zgarsa — eskisi tasdiqlanmaydi, rahbarga «qayta yuboring»', ans);
  const sent2 = await api(OWNER, 'rk_send', { user_id: nodId, rid: rid() });
  check(sent2.total === 135000, 'Qayta yuborilgan hisob: 135 000', sent2);
  const rid16 = rid();
  await api(NOD, 'rk_answer', { id: sent2.id, agree: true, rid: rid16 });
  await api(NOD, 'rk_answer', { id: sent2.id, agree: true, rid: rid16 });
  let ps16 = await api(OWNER, 'payslip', { user_id: nodId, from: '2026-11-01', to: '2026-11-30' });
  check(ps16.now.payable === 135000 && ps16.ded === 85000, 'Tasdiqdan keyin olganlar oylikdan bir marta ushlandi, beriladigan: 135 000', { payable: ps16.now.payable, ded: ps16.ded });
  const rv2 = await api(NOD, 'rk_view', {});
  check(rv2.rk.status === 'confirmed' && rv2.live.total === 135000 && rv2.live.items.length === 0, 'Qayta hisoblaganda o‘sha natija, ikki marta ushlanmaydi', rv2.live);
  const py = await api(OWNER, 'pay_create', { user_id: nodId, amount: 135000, kind: 'oylik', rid: rid() });
  await api(NOD, 'pay_confirm', { id: py.id, rid: rid() });
  ps16 = await api(OWNER, 'payslip', { user_id: nodId, from: '2026-11-01', to: '2026-11-30' });
  check(ps16.now.payable === 0 && ps16.now.balance === 0, '«Пул бердим» → «Pulni oldim»: hisob nolga tushdi');
  // E'tiroz yo'li
  const k5 = await api(NOD, 'tk_add', { name: '2 metr paplin', rid: rid() });
  await api(OWNER, 'tk_price', { id: k5.id, amount: 30000, rid: rid() });
  const s3 = await api(OWNER, 'rk_send', { user_id: nodId, rid: rid() });
  check(s3.total === -30000, 'Olgani ishidan ko‘p bo‘lsa — qarz sifatida aniq ko‘rinadi (−30 000)', s3);
  await api(NOD, 'rk_answer', { id: s3.id, agree: false, note: 'paplin 1 metr edi', rid: rid() });
  rv = await api(OWNER, 'rk_view', { user_id: nodId });
  check(rv.rk.status === 'disputed' && rv.rk.dispute_note === 'paplin 1 metr edi' && (await api(OWNER, 'payslip', { user_id: nodId, from: '2026-11-01', to: '2026-11-30' })).ded === 85000, 'E’tiroz: hech narsa ushlanmaydi, rahbar izohni ko‘radi');
  check((await raw(DIL, 'rk_view', { user_id: nodId })).status === 403 && (await raw(NOD, 'tk_price', { id: k5.id, amount: 1 })).status === 403, 'Boshqa xodim hisobini ko‘rib bo‘lmaydi, xodim o‘ziga narx qo‘ya olmaydi');

  test(17, 'Qo‘shimcha: alohida buyurtma (zakaz) — o‘lcham, muddat, eslatma, kiyib ko‘rish, mijoz puli');
  NOW = Date.parse('2026-11-06T05:00:00Z');
  const sarU = sarId;
  const tpl0 = await api(SAR, 'ord_tpl');
  await api(SAR, 'ord_tpl_set', { fields: ['Bo‘y', 'Bel', 'Ko‘krak', 'Bo‘y', ''], rid: rid() });
  const tpl1 = await api(SAR, 'ord_tpl');
  check(tpl0.fields.length > 3 && tpl1.fields.join() === 'Bo‘y,Bel,Ko‘krak', 'O‘lcham shabloni: standart ro‘yxat, bichuvchi o‘zinikini saqlaydi (takrorlar olib tashlanadi)', tpl1);
  check((await raw(SAR, 'ord_create', { customer: 'Gulnora', product: 'Ko‘ylak', due_day: '2026-11-01' })).error === 'bad_input', 'O‘tib ketgan sana bilan buyurtma ochilmaydi');
  const oph = await api(SAR, 'photo_upload', { data: JPG, what: 'Zakaz: Gulnora' });
  const o1 = await api(SAR, 'ord_create', { customer: 'Gulnora', phone: '+998 90 123 45 67', product: 'To‘y ko‘ylagi', measures: { 'Bo‘y': '165', Bel: '70', 'Ko‘krak': '' },
    note: 'Yengi uzun', due_day: '2026-11-15', price: 100000, prepay: 30000, photo_id: oph.id, rid: rid() });
  await new Promise((r) => setTimeout(r, 300));
  check(/^Z-\d{4}$/.test(o1.code) && tgSent.some((m) => m.chat_id === OWNER && /Янги буюртма/.test(m.text || '') && /тасдиқланг/.test(m.text)), 'Buyurtma ochildi, rahbarga «narxni tasdiqlang» xabari', o1);
  let od = await api(SAR, 'ord_detail', { id: o1.id });
  check(od.status === 'new' && od.measures['Bel'] === '70' && !('Ko‘krak' in od.measures) && od.paid === 30000 && od.debt === 70000 && od.price_ok === false, 'O‘lcham, oldindan to‘lov 30 000, qarz 70 000; narx hali tasdiqlanmagan', od);
  check((await api(OWNER, 'r_home')).todo.ord_price === 1, 'Rahbar bosh ekranida «нарх тасдиқлаш»');
  await api(OWNER, 'ord_price', { id: o1.id, price: 100000, rid: rid() });
  await api(OWNER, 'ord_rates_set', { bichish: 20000, tikish: 20000, rid: rid() });
  check((await raw(NOD, 'ord_detail', { id: o1.id })).status === 403, 'Tikuvchi o‘ziga berilmagan buyurtmani ko‘rmaydi');
  await api(SAR, 'ord_cut', { id: o1.id, rid: rid() });
  const ovc = await api(SAR, 'voice_upload', { data: 'data:audio/webm;base64,' + Buffer.alloc(700, 5).toString('base64'), mime: 'audio/webm' });
  await api(SAR, 'ord_give', { id: o1.id, sewer_id: nodId, note: 'Yoqasi tik', voice_id: ovc.id, rid: rid() });
  await new Promise((r) => setTimeout(r, 400));
  const om = tgSent.find((m) => m._method === 'sendPhoto' && m.chat_id === NOD && /Z-/.test(m.caption || ''));
  check(om && /Bel: 70/.test(om.caption) && /Yoqasi tik/.test(om.caption), 'Tikuvchiga rasm, o‘lchamlar va izoh bilan bordi', om);
  const nl = await api(NOD, 'ord_list', {});
  const nv = nl.rows.find((x) => x.id === o1.id);
  check(nv && nv.phone === undefined && nv.price === undefined && nv.paid === undefined, 'Tikuvchi mijoz telefoni va pulini ko‘rmaydi', nv);
  check((await getMedia(NOD, 'voice_get', ovc.id)).status === 200 && (await getMedia(NOD, 'photo_get', oph.id)).status === 200 && (await getMedia(DIL, 'photo_get', oph.id)).status === 403, 'Buyurtma rasmi/ovozini shu tikuvchi ochadi, begona ocha olmaydi');
  await api(NOD, 'ord_accept', { id: o1.id, rid: rid() });
  // Eslatmalar: muddatdan 2 kun oldin bichuvchi va tikuvchiga, takrorlanmaydi
  NOW = Date.parse('2026-11-13T03:00:00Z');
  const oc1 = await (await fetch(`${BASE}/__test/cron`, { method: 'POST', headers: { 'x-test-now': String(NOW) } })).json();
  const oc2 = await (await fetch(`${BASE}/__test/cron`, { method: 'POST', headers: { 'x-test-now': String(NOW) } })).json();
  check(oc1.result.filter((x) => x.order === o1.id && x.kind === 'soon').length === 2 && !oc2.result.some((x) => x.order), '2 kun qolganda bichuvchi va tikuvchiga eslatma, qayta yuborilmaydi', oc1);
  await api(NOD, 'ord_sewn', { id: o1.id, rid: rid() });
  await api(SAR, 'ord_receive', { id: o1.id, rid: rid() });
  // Kiyib ko'rish: tuzatish kerak (tikuvchida), yangi sana
  check((await raw(SAR, 'ord_fit', { id: o1.id, result: 'fix', fix_by: 'sewer', due_day: '2026-11-18' })).error === 'need_reason', 'Tuzatishga sababsiz yuborilmaydi');
  await api(SAR, 'ord_fit', { id: o1.id, result: 'fix', fix_by: 'sewer', note: 'Beli tor', due_day: '2026-11-18', rid: rid() });
  od = await api(SAR, 'ord_detail', { id: o1.id });
  check(od.status === 'fixing' && od.fix_by === 'sewer' && od.due_day === '2026-11-18' && od.fixes === 1 && (await api(NOD, 'ord_list', { tab: 'fix' })).rows.length === 1, 'Tuzatishga qaytdi: tikuvchida, yangi muddat, tarixda sabab');
  await api(NOD, 'ord_sewn', { id: o1.id, rid: rid() });
  await api(SAR, 'ord_receive', { id: o1.id, rid: rid() });
  const zN = (await api(OWNER, 'payslip', { user_id: nodId, from: '2026-11-01', to: '2026-11-30' })).groups.filter((g) => g.zakaz);
  const zS = (await api(OWNER, 'payslip', { user_id: sarU, from: '2026-11-01', to: '2026-11-30' })).groups.filter((g) => g.zakaz);
  check(zN.length === 1 && zN[0].amount === 20000 && zS.length === 1 && zS[0].amount === 20000, 'Zakaz haqi alohida qatorda: bichuvchiga 20 000, tikuvchiga 20 000 (tuzatish uchun qayta to‘lanmaydi)', { zN, zS });
  check((await raw(SAR, 'ord_fit', { id: o1.id, result: 'ok', pay: 80000 })).error === 'overpay', 'Narxdan ortiq to‘lov yozilmaydi');
  const fit = await api(SAR, 'ord_fit', { id: o1.id, result: 'ok', pay: 50000, rid: rid() });
  check(fit.debt === 20000, 'Topshirildi, mijoz qarzi 20 000', fit);
  let sm = await api(OWNER, 'ord_summary');
  const sc = sm.cutters.find((c) => c.id === sarU);
  check(sm.debt_sum === 20000 && sc && sc.held === 80000, 'Rahbar: mijozlar qarzi 20 000, bichuvchida 80 000 naqd', sm);
  check((await raw(SAR, 'cash_give', { amount: 90000 })).error === 'cash_too_much', 'Qo‘lidagidan ko‘p topshirib bo‘lmaydi');
  const h1 = await api(SAR, 'cash_give', { amount: 50000, rid: rid() });
  let rvS = await api(OWNER, 'rk_view', { user_id: sarU });
  check(rvS.live.blockers.includes('cash_open'), 'Topshirish tasdiqlanmaguncha oylik hisob yuborilmaydi');
  await api(OWNER, 'cash_decide', { id: h1.id, ok: true, rid: rid() });
  rvS = await api(OWNER, 'rk_view', { user_id: sarU });
  check(rvS.live.cashHeld === 30000 && !rvS.live.blockers.includes('cash_open'), 'Topshirilmagan 30 000 oylik hisobda ushlanadi', rvS.live);
  if (!rvS.live.blockers.length) {
    const sS = await api(OWNER, 'rk_send', { user_id: sarU, rid: rid() });
    await api(SAR, 'rk_answer', { id: sS.id, agree: true, rid: rid() });
    const after = await api(SAR, 'cash_my');
    const rv3 = await api(SAR, 'rk_view', {});
    check(after.held === 0 && rv3.live.cashHeld === 0 && rv3.live.total === sS.total, 'Tasdiqdan keyin pul ushlandi, qayta ushlanmaydi', { after, live: rv3.live.total, sent: sS.total });
  } else check(false, 'Bichuvchi hisobida boshqa to‘siq', rvS.live.blockers);
  // Mijoz olmadi → rahbar qarori
  const o2 = await api(SAR, 'ord_create', { customer: 'Zarina', product: 'Xalat', due_day: '2026-11-20', rid: rid() });
  await api(SAR, 'ord_give', { id: o2.id, sewer_id: nodId, rid: rid() });
  await api(NOD, 'ord_accept', { id: o2.id, rid: rid() });
  await api(NOD, 'ord_sewn', { id: o2.id, rid: rid() });
  await api(SAR, 'ord_receive', { id: o2.id, rid: rid() });
  await api(SAR, 'ord_fit', { id: o2.id, result: 'left', note: 'yoqmadi', rid: rid() });
  check((await api(OWNER, 'r_home')).todo.ord_left === 1, 'Olib ketilmagan buyurtma rahbarga ko‘rinadi');
  check((await raw(OWNER, 'ord_left_decide', { id: o2.id, decision: 'close' })).error === 'need_reason', 'Yopish uchun izoh kerak');
  await api(OWNER, 'ord_left_decide', { id: o2.id, decision: 'close', note: 'sotuvga chiqarildi', rid: rid() });
  const lst = await api(SAR, 'ord_list', { tab: 'left' });
  check(lst.rows[0].status === 'closed' && lst.counts.done === 1, 'Bo‘limlar bo‘yicha sanoq to‘g‘ri', lst.counts);
  check((await raw(DIL, 'ord_detail', { id: o1.id })).status === 403 && (await raw(NOD, 'ord_pay', { id: o1.id, amount: 1 })).status === 403, 'Begona xodim va tikuvchi mijoz pulini yoza olmaydi');

  test(18, 'Qo‘shimcha: murojaat — ruxsat so‘rash (kunlar bilan), muammo yozish, faqat rahbar ko‘radi');
  NOW = Date.parse('2026-11-20T04:00:00Z');
  check((await raw(NOD, 'mj_create', { kind: 'leave', from_day: '2026-11-21', to_day: '2026-11-23' })).error === 'need_reason', 'Sababsiz (yozma ham, ovoz ham yo‘q) yuborilmaydi');
  check((await raw(NOD, 'mj_create', { kind: 'leave', text: 'x', from_day: '2026-11-19', to_day: '2026-11-19' })).error === 'bad_input', 'O‘tgan kunga ruxsat so‘ralmaydi');
  const mjv = await api(NOD, 'voice_upload', { data: 'data:audio/webm;base64,' + Buffer.alloc(700, 9).toString('base64'), mime: 'audio/webm', sec: 'murojaat' });
  const m1 = await api(NOD, 'mj_create', { kind: 'leave', text: 'To‘yga boraman', voice_id: mjv.id, from_day: '2026-11-21', to_day: '2026-11-23', rid: rid() });
  await new Promise((r) => setTimeout(r, 400));
  check(tgSent.some((m) => m.chat_id === OWNER && /рухсат сўради: 21\.11–23\.11/.test(m.text || m.caption || '')) && tgSent.some((m) => m._method === 'sendDocument' && m.chat_id === OWNER && /VOICE/.test(m.document)), 'Rahbarga Telegram’da xabar va ovozli sabab bordi');
  const mph = await api(NOD, 'photo_upload', { data: JPG, what: 'yeng', sec: 'murojaat' });
  const m2 = await api(NOD, 'mj_create', { kind: 'shortage', text: '10 tadan 1 tasida yeng yo‘q', ref: 'P-0001', photo_id: mph.id, rid: rid() });
  check((await api(OWNER, 'r_home')).todo.mj === 2, 'Rahbar bosh ekranida «Мурожаатлар: 2»');
  check((await raw(DIL, 'mj_list', {})).status === 403 && (await getMedia(DIL, 'photo_get', mph.id)).status === 403 && (await getMedia(OWNER, 'photo_get', mph.id)).status === 200, 'Boshqa xodim murojaatni ham, rasmini ham ko‘rmaydi');
  check((await raw(OWNER, 'mj_answer', { id: m1.id })).error === 'bad_input' && (await raw(OWNER, 'mj_answer', { id: m2.id })).error === 'need_reason', 'Ruxsatga qaror, muammoga javob matni shart');
  await api(OWNER, 'mj_answer', { id: m1.id, decision: 'approve', answer: 'Mayli, tabriklaymiz', rid: rid() });
  await api(OWNER, 'mj_answer', { id: m2.id, answer: 'Bichuvchiga qayta bichtiraman', rid: rid() });
  await new Promise((r) => setTimeout(r, 300));
  const my = await api(NOD, 'mj_my');
  check(my.find((a) => a.id === m1.id).status === 'approved' && my.find((a) => a.id === m2.id).answer === 'Bichuvchiga qayta bichtiraman' && tgSent.some((m) => m.chat_id === NOD && /ruxsat berdi: 21\.11–23\.11/.test(m.text || '')), 'Xodim javobni ilovada va Telegram’da ko‘radi');
  NOW = Date.parse('2026-11-22T05:00:00Z');
  const hm22 = await api(OWNER, 'r_home');
  check(hm22.att.leave.includes('Nodira Karimova') && !hm22.att.absent.includes('Nodira Karimova'), 'Ruxsatli kuni «kelmadi» emas, «ruxsatda» bo‘lib ko‘rinadi');
  const ar = await api(OWNER, 'att_report', { from: '2026-11-01', to: '2026-11-30', user_id: nodId });
  check(ar.users[0].leave === 3, 'Davomat hisobotida: ruxsatli 3 kun', ar.users[0]);
  NOW = SAVE_NOW;

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
