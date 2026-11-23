// Haftalik arxiv: bir hafta ichidagi barcha yozuvlar jadval (CSV, Excel'da ochiladi) ko'rinishida,
// rasmlar va ovozli izohlar bo'lim bo'yicha papkalarga, to'liq baza zaxirasi. Fayllarni yig'ish va
// yuborish worker.js'da (Durable Object ichida, alarm orqali) bajariladi; bu yerda faqat ma'lumot tayyorlanadi.
import { AppError, STATES, addDays, tDay, tHM, fullName } from './base.js';
import { KINDS } from './murojaat.js';

const BOM = '﻿';
const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// Excel (o'zbek/rus sozlamasi) uchun: ";" ajratuvchi va UTF-8 belgisi
export const csv = (head, rows) => BOM + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
const dmy = (d) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '');
const atT = (at) => (at ? dmy(tDay(Date.parse(at))) + ' ' + tHM(Date.parse(at)) : '');
const ROLE = { rahbar: 'Rahbar', bichuvchi: 'Bichuvchi', tikuvchi: 'Tikuvchi' };
const WORK = { bichish: 'Bichish', tikish: 'Tikish', bichish_yordam: 'Bichishga yordam' };
const PAY_ST = { pending: 'Tasdiq kutilmoqda', confirmed: 'Oldi (tasdiqlangan)', disputed: 'Tafovut bor', cancelled: 'Bekor qilingan', reverse_pending: 'Qaytarish so‘ralgan', reversed: 'Qaytarilgan' };
const ORD_ST = { new: 'Bichilmagan', cut: 'Bichilgan', given: 'Tikuvchiga berilgan', sewing: 'Tikilmoqda', sewn: 'Tikildi (topshirilmagan)', fixing: 'Tuzatishda',
  ready: 'Tayyor (mijoz kutilmoqda)', delivered: 'Mijozga topshirilgan', abandoned: 'Mijoz kelmadi', closed: 'Yopilgan', cancelled: 'Bekor qilingan' };
const MJ_ST = { open: 'Javob kutilmoqda', approved: 'Ruxsat berildi', declined: 'Rad etildi', answered: 'Javob berildi', cancelled: 'Bekor qilingan' };
const ORD_EV = { created: 'Qabul qilindi', price: 'Narx belgilandi', cut: 'Bichildi', given: 'Tikuvchiga berildi', accepted: 'Tikuvchi oldi', returned: 'Tikuvchi qaytardi',
  ready: 'Tayyor', fit_fix: 'Kiyib ko‘rildi: tuzatish kerak', fixed: 'Tuzatildi', delivered: 'Mijozga topshirildi', left: 'Mijoz olmadi', left_wait: 'Kutiladi',
  closed: 'Yopildi', cancelled: 'Bekor qilindi', due: 'Muddat o‘zgardi', pay: 'To‘lov olindi', pay_cancel: 'To‘lov bekor qilindi' };
const TK_KIND = { product: 'Mahsulot', material: 'Material', service: 'Xizmat' };
const WEEKDAY = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

// Fayl nomi uchun xavfsiz qism (o'zbekcha harflar qoladi)
export const safe = (s, max = 40) => String(s || '').normalize('NFC').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, '_').replace(/^[._]+|[._]+$/g, '').slice(0, max) || 'nomsiz';

// Hafta oralig'i. auto: yakshanba tugagach (dushanba 00:05 Toshkent) — o'tgan dushanba..yakshanba.
// Qo'lda: oxirgi 7 kun (bugun ham kiradi).
export function weekRange(nowMs, manual) {
  const today = tDay(nowMs);
  if (manual) return { from: addDays(today, -6), to: today };
  const wd = new Date(today + 'T00:00:00Z').getUTCDay(); // 0 = yakshanba
  const to = addDays(today, -(wd === 0 ? 7 : wd)); // o'tgan yakshanba
  return { from: addDays(to, -6), to };
}
export const isMonday = (nowMs) => new Date(tDay(nowMs) + 'T00:00:00Z').getUTCDay() === 1;

const JOB = 'archive_job';
export function getJob(db) { const r = db.one('SELECT v FROM meta WHERE k=?', JOB); return r ? JSON.parse(r.v) : null; }
export function setJob(db, job) {
  if (job) db.run('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', JOB, JSON.stringify(job));
  else db.run('DELETE FROM meta WHERE k=?', JOB);
}

// Avtomatik haftalik ish: har dushanba 00:05 (Toshkent) cron chaqiradi. Bir hafta ikki marta yuborilmaydi.
export function scheduleWeekly(db, nowMs) {
  if (!isMonday(nowMs)) return null;
  const { from, to } = weekRange(nowMs, false);
  const last = db.one("SELECT v FROM meta WHERE k='archive_last'");
  if ((last && last.v === from) || getJob(db)) return null;
  const job = { from, to, manual: false, by: null, attempts: 0 };
  setJob(db, job);
  return job;
}

export const actions = {
  archive_now: {
    auth: 'rahbar', mut: true,
    fn(ctx) {
      if (getJob(ctx.db)) throw new AppError('archive_busy');
      const { from, to } = weekRange(ctx.now, true);
      setJob(ctx.db, { from, to, manual: true, by: ctx.me.tg_id, attempts: 0 });
      ctx.audit('archive_requested', 'archive', null, null, { from, to });
      return { from, to };
    },
  },
};

// Bitta hafta uchun barcha hisobot fayllari va media ro'yxati
export function buildArchive(db, from, to, nowMs) {
  const users = new Map(db.all('SELECT * FROM users').map((u) => [u.id, u]));
  const nm = (id) => (id == null ? '' : fullName(users.get(id)) || '#' + id);
  const fromIso = new Date(Date.parse(from + 'T00:00:00Z') - 5 * 3600000).toISOString();
  const toIso = new Date(Date.parse(to + 'T00:00:00Z') + 19 * 3600000).toISOString();
  const lineCache = new Map();
  const line = (id) => {
    if (!lineCache.has(id)) lineCache.set(id, db.one(`SELECT l.size, b.code, b.model, b.material, b.color, c.name type_name FROM lines l
      JOIN batches b ON b.id=l.batch_id LEFT JOIN catalog c ON c.id=b.type_id WHERE l.id=?`, id) || {});
    return lineCache.get(id);
  };
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const files = [];
  const add = (name, text) => files.push({ name, text });

  // ---- Ish haqi (ishbay) ----
  const earn = db.all(`SELECT e.*, o.code ocode, o.product oproduct, o.customer ocust FROM earnings e LEFT JOIN orders o ON o.id=e.order_id
    WHERE e.day BETWEEN ? AND ? ORDER BY e.day, e.id`, from, to);
  add('hisobot/ish_haqi_batafsil.csv', csv(['Sana', 'Xodim', 'Ish', 'Turi', 'Partiya / buyurtma', 'Mahsulot', 'Model', 'O‘lcham', 'Dona', 'Narx', 'Summa', 'Izoh'],
    earn.map((e) => {
      const z = e.order_id != null, li = z ? {} : line(e.line_id);
      return [dmy(e.day), nm(e.user_id), WORK[e.work] || e.work, z ? 'Buyurtma (zakaz)' : 'Oddiy', z ? e.ocode : li.code, z ? e.oproduct : li.type_name,
        z ? '' : li.model, z ? '' : li.size, e.qty, e.price ?? 'tarif yo‘q', e.amount ?? '', e.note || ''];
    })));

  const sumBy = (q, ...p) => { const m = new Map(); for (const r of db.all(q, ...p)) m.set(r.user_id, r); return m; };
  const pays = sumBy(`SELECT user_id, SUM(CASE WHEN kind='oylik' THEN amount ELSE 0 END) oylik, SUM(CASE WHEN kind='avans' THEN amount ELSE 0 END) avans
    FROM payments WHERE day BETWEEN ? AND ? AND status IN('confirmed','pending','disputed') GROUP BY user_id`, from, to);
  const tks = sumBy("SELECT user_id, SUM(amount) s FROM takeaways WHERE day BETWEEN ? AND ? AND status='agreed' GROUP BY user_id", from, to);
  const cash = sumBy("SELECT receiver_id user_id, SUM(amount) s FROM order_pays WHERE day BETWEEN ? AND ? AND cancelled_at IS NULL GROUP BY receiver_id", from, to);
  const per = new Map();
  for (const e of earn) {
    const p = per.get(e.user_id) || { od: 0, os: 0, zd: 0, zs: 0, nr: 0 };
    if (e.order_id != null) { p.zd += e.qty; p.zs += e.amount || 0; } else { p.od += e.qty; p.os += e.amount || 0; }
    if (e.amount == null) p.nr += e.qty;
    per.set(e.user_id, p);
  }
  const staff = [...users.values()].filter((u) => u.role !== 'rahbar' && (u.status === 'active' || per.has(u.id) || pays.has(u.id)))
    .sort((a, b) => (a.role + fullName(a)).localeCompare(b.role + fullName(b)));
  const tot = { od: 0, os: 0, zd: 0, zs: 0, oylik: 0, avans: 0 };
  add('hisobot/ish_haqi.csv', csv(['Xodim', 'Lavozim', 'Oddiy (dona)', 'Oddiy (so‘m)', 'Buyurtma (dona)', 'Buyurtma (so‘m)', 'Jami ishlagan (so‘m)', 'Tarifsiz (dona)',
    'Shu hafta berilgan pul', 'Shu hafta avans', 'Olganlari (so‘m)', 'Mijozdan olgan naqd'],
  staff.map((u) => {
    const p = per.get(u.id) || { od: 0, os: 0, zd: 0, zs: 0, nr: 0 }, pp = pays.get(u.id) || {};
    tot.od += p.od; tot.os += p.os; tot.zd += p.zd; tot.zs += p.zs; tot.oylik += pp.oylik || 0; tot.avans += pp.avans || 0;
    return [fullName(u), ROLE[u.role], p.od, p.os, p.zd, p.zs, p.os + p.zs, p.nr || '', pp.oylik || 0, pp.avans || 0, (tks.get(u.id) || {}).s || 0, (cash.get(u.id) || {}).s || 0];
  })));

  // ---- Davomat ----
  const att = new Map(db.all('SELECT * FROM attendance WHERE day BETWEEN ? AND ?', from, to).map((a) => [a.user_id + ':' + a.day, a]));
  const leaves = db.all("SELECT user_id, from_day, to_day FROM appeals WHERE kind='leave' AND status='approved' AND from_day<=? AND to_day>=?", to, from);
  const onLeave = (uid, d) => leaves.some((l) => l.user_id === uid && l.from_day <= d && l.to_day >= d);
  const attRows = [];
  for (const u of staff.filter((x) => x.status === 'active')) {
    for (const d of days) {
      const a = att.get(u.id + ':' + d), wd = WEEKDAY[new Date(d + 'T00:00:00Z').getUTCDay()];
      const st = a && a.in_at ? 'Keldi' : onLeave(u.id, d) ? 'Ruxsatli' : u.remote ? 'Uydan ishlaydi' : wd === 'Yakshanba' ? 'Dam olish' : 'Kelmadi';
      attRows.push([fullName(u), dmy(d), wd, st, a && a.in_at ? tHM(Date.parse(a.in_at)) : '', a && a.out_at ? tHM(Date.parse(a.out_at)) : '']);
    }
  }
  add('hisobot/davomat.csv', csv(['Xodim', 'Sana', 'Kun', 'Holat', 'Keldi', 'Ketdi'], attRows));

  // ---- Bichim, berish, topshirish (barcha harakatlar) ----
  const MOVE = { cut_ready: 'Bichildi', cut_partial: 'Chala bichildi', partial_done: 'Chala bichim tugatildi', transfer_reserve: 'Tikuvchiga berildi', transfer_release: 'Qaytarildi',
    transfer_accept: 'Tikuvchi qabul qildi', submit: 'Tikib topshirildi', accept: 'Qabul qilindi', rework: 'Qayta ishlashga', writeoff: 'Hisobdan chiqarildi', cut_fix: 'Bichim tuzatildi', cut_void: 'Bichim yozuvi hisobdan chiqarildi' };
  const pl = (s, h) => (s ? (STATES[s] || s) + (h ? ' (' + nm(h) + ')' : '') : '');
  add('hisobot/harakatlar.csv', csv(['Vaqt', 'Amal', 'Partiya', 'Mahsulot', 'Model', 'Mato', 'Rang', 'O‘lcham', 'Dona', 'Qayerdan', 'Qayerga', 'Kim bajardi', 'Izoh'],
    db.all('SELECT * FROM moves WHERE day BETWEEN ? AND ? ORDER BY id', from, to).map((m) => {
      const li = line(m.line_id);
      return [atT(m.at), MOVE[m.kind] || m.kind, li.code, li.type_name, li.model, li.material, li.color, li.size, m.qty, pl(m.from_state, m.from_holder), pl(m.to_state, m.to_holder), nm(m.actor_id), m.note];
    })));
  add('hisobot/bichimlar.csv', csv(['Sana', 'Partiya', 'Bichuvchi', 'Mahsulot', 'Model', 'Mato', 'Rang', 'O‘lchamlar', 'Jami dona', 'Izoh'],
    db.all(`SELECT b.*, c.name type_name, (SELECT group_concat(size, ', ') FROM lines WHERE batch_id=b.id) sizes,
      (SELECT SUM(cl.ready+cl.partial) FROM cut_lines cl JOIN cuts ct ON ct.id=cl.cut_id WHERE ct.batch_id=b.id AND ct.status='active') qty
      FROM batches b LEFT JOIN catalog c ON c.id=b.type_id WHERE b.day BETWEEN ? AND ? ORDER BY b.id`, from, to)
      .map((b) => [dmy(b.day), b.code, nm(b.cutter_id), b.type_name, b.model, b.material, b.color, b.sizes, b.qty || 0, b.note])));
  const TR_ST = { pending: 'Qabul kutilmoqda', accepted: 'Qabul qilindi', disputed: 'Tafovut', resolved: 'Hal qilindi', cancelled: 'Bekor qilindi', rejected: 'Rad etildi', partial: 'Qisman qabul' };
  add('hisobot/tikuvchiga_berish.csv', csv(['Vaqt', 'Kod', 'Kimdan', 'Kimga', 'Dona', 'Holat', 'Izoh', 'Tafovut izohi'],
    db.all(`SELECT t.*, (SELECT SUM(qty) FROM transfer_items WHERE transfer_id=t.id) qty FROM transfers t WHERE t.day BETWEEN ? AND ? ORDER BY t.id`, from, to)
      .map((t) => [atT(t.created_at), t.code, nm(t.from_id), nm(t.to_id), t.qty || 0, TR_ST[t.status] || t.status, t.note, t.dispute_note])));
  add('hisobot/tekshiruv.csv', csv(['Vaqt', 'Tikuvchi', 'Partiya', 'O‘lcham', 'Topshirgan', 'Qabul', 'Qayta ishlash', 'Hisobdan chiqarildi', 'Tekshirgan', 'Sabab'],
    db.all(`SELECT i.*, s.sewer_id, s.line_id, s.qty sq FROM inspections i JOIN submissions s ON s.id=i.submission_id WHERE i.day BETWEEN ? AND ? ORDER BY i.id`, from, to)
      .map((i) => { const li = line(i.line_id); return [atT(i.at), nm(i.sewer_id), li.code, li.size, i.sq, i.accepted, i.rework, i.writeoff, nm(i.inspector_id), i.reason]; })));

  // ---- Pul ----
  const money = db.all('SELECT * FROM payments WHERE day BETWEEN ? AND ? ORDER BY id', from, to)
    .map((p) => [dmy(p.day), p.code, nm(p.user_id), p.kind === 'avans' ? 'Avans' : 'Ish haqi', p.amount, PAY_ST[p.status] || p.status,
      p.period_from ? dmy(p.period_from) + ' – ' + dmy(p.period_to) : '', [p.dispute_note, p.cancel_reason, p.reverse_reason].filter(Boolean).join(' / ')])
    .concat(db.all('SELECT * FROM adjustments WHERE day BETWEEN ? AND ? ORDER BY id', from, to)
      .map((a) => [dmy(a.day), 'TUZ-' + a.id, nm(a.user_id), 'Tuzatish (' + a.kind + ')', a.amount, a.status, '', a.reason]))
    .concat(db.all('SELECT * FROM cash_handovers WHERE day BETWEEN ? AND ? ORDER BY id', from, to)
      .map((c) => [dmy(c.day), 'NAQD-' + c.id, nm(c.user_id), c.how === 'cash' ? 'Mijoz pulini rahbarga berdi' : 'Mijoz puli ish haqidan ushlandi', c.amount, c.status, '', c.note || c.answer_note]));
  add('hisobot/pul.csv', csv(['Sana', 'Kod', 'Xodim', 'Turi', 'Summa', 'Holat', 'Davr', 'Izoh'], money));
  add('hisobot/avans_sorovlari.csv', csv(['So‘ralgan', 'Xodim', 'Summa', 'Holat', 'Izoh', 'Rahbar javobi'],
    db.all('SELECT * FROM avans_req WHERE created_at BETWEEN ? AND ? ORDER BY id', fromIso, toIso)
      .map((a) => [atT(a.created_at), nm(a.user_id), a.amount, a.status, a.note, a.answer_note])));
  add('hisobot/olganlar.csv', csv(['Sana', 'Xodim', 'Turi', 'Nomi', 'Miqdor', 'Birlik', 'Summa', 'To‘lov usuli', 'Holat', 'Izoh'],
    db.all('SELECT * FROM takeaways WHERE day BETWEEN ? AND ? ORDER BY id', from, to)
      .map((k) => [dmy(k.day), nm(k.user_id), TK_KIND[k.kind] || k.kind, k.name, k.qty, k.unit, k.amount, k.pay_method, k.status, k.note || k.dispute_note])));

  // ---- Buyurtmalar (zakaz) ----
  const ords = db.all(`SELECT o.*, (SELECT SUM(amount) FROM order_pays WHERE order_id=o.id AND cancelled_at IS NULL) paid FROM orders o
    WHERE o.day BETWEEN ? AND ? OR o.status NOT IN('delivered','closed','cancelled') OR o.done_day BETWEEN ? AND ?
    OR EXISTS(SELECT 1 FROM order_events e WHERE e.order_id=o.id AND e.at BETWEEN ? AND ?) ORDER BY o.id`, from, to, from, to, fromIso, toIso);
  add('hisobot/buyurtmalar.csv', csv(['Kod', 'Qabul qilingan', 'Mijoz', 'Telefon', 'Mahsulot', 'O‘lchamlar', 'Narxi', 'To‘langan', 'Qoldiq', 'Tayyor bo‘lish sanasi',
    'Holat', 'Bichuvchi', 'Tikuvchi', 'Tuzatishlar soni', 'Bichish haqi', 'Tikish haqi', 'Izoh'],
  ords.map((o) => {
    let ms = o.measures || '';
    try { const j = JSON.parse(ms); if (j && typeof j === 'object') ms = (Array.isArray(j) ? j.map((x) => [x.k || x.name, x.v || x.value]) : Object.entries(j)).map(([k, v]) => k + ': ' + v).join(', '); } catch { /* matn */ }
    return [o.code, dmy(o.day), o.customer, o.phone, o.product, ms, o.price, o.paid || 0, o.price != null ? o.price - (o.paid || 0) : '', dmy(o.due_day),
      ORD_ST[o.status] || o.status, nm(o.cutter_id), nm(o.sewer_id), o.fixes, o.cut_pay, o.sew_pay, o.note];
  })));
  add('hisobot/buyurtma_tarixi.csv', csv(['Vaqt', 'Buyurtma', 'Kim', 'Voqea', 'Izoh'],
    db.all('SELECT e.*, o.code FROM order_events e JOIN orders o ON o.id=e.order_id WHERE e.at BETWEEN ? AND ? ORDER BY e.id', fromIso, toIso)
      .map((e) => [atT(e.at), e.code, nm(e.actor_id), ORD_EV[e.kind] || e.kind, e.note])));
  add('hisobot/buyurtma_tolovlar.csv', csv(['Sana', 'Buyurtma', 'Mijoz', 'Summa', 'Kim oldi', 'Holat', 'Izoh'],
    db.all('SELECT p.*, o.code, o.customer FROM order_pays p JOIN orders o ON o.id=p.order_id WHERE p.day BETWEEN ? AND ? ORDER BY p.id', from, to)
      .map((p) => [dmy(p.day), p.code, p.customer, p.amount, nm(p.receiver_id), p.cancelled_at ? 'Bekor qilingan' : 'Olingan', p.cancel_reason || p.note])));

  // ---- Murojaatlar ----
  const apps = db.all('SELECT * FROM appeals WHERE day BETWEEN ? AND ? OR answered_at BETWEEN ? AND ? ORDER BY id', from, to, fromIso, toIso);
  add('hisobot/murojaatlar.csv', csv(['Yuborilgan', 'Xodim', 'Turi', 'Kunlar', 'Bog‘liq', 'Matn', 'Ovoz', 'Rasm', 'Holat', 'Javob', 'Javob bergan', 'Javob vaqti'],
    apps.map((a) => [atT(a.created_at), nm(a.user_id), (KINDS[a.kind] || [a.kind])[0], a.from_day ? dmy(a.from_day) + (a.to_day !== a.from_day ? ' – ' + dmy(a.to_day) : '') : '',
      a.ref, a.text, a.voice_id ? 'bor' : '', a.photo_id ? 'bor' : '', MJ_ST[a.status] || a.status, a.answer, nm(a.answered_by), atT(a.answered_at)])));

  // ---- Barcha o'zgarishlar jurnali ----
  add('hisobot/audit_jurnal.csv', csv(['Vaqt', 'Kim', 'Amal', 'Obyekt', 'ID', 'Oldin', 'Keyin', 'Sabab'],
    db.all('SELECT * FROM audit WHERE at BETWEEN ? AND ? ORDER BY id', fromIso, toIso)
      .map((a) => [atT(a.at), nm(a.actor_id), a.action, a.entity, a.entity_id, a.before, a.after, a.reason])));

  // ---- Rasmlar va ovozlar: qaysi bo'limga tegishli ekani bo'yicha nomlanadi ----
  const use = new Map();
  const put = (id, dir, parts) => { if (id && !use.has(id)) use.set(id, { dir, base: parts.filter(Boolean).map((p) => safe(p, 30)).join('_') }); };
  const ph = db.all('SELECT * FROM photos WHERE created_at BETWEEN ? AND ? ORDER BY id', fromIso, toIso);
  if (ph.length) {
    const ids = ph.map((p) => p.id), q = ids.map(() => '?').join(',');
    for (const b of db.all(`SELECT photo_id, code, cutter_id, model, color FROM batches WHERE photo_id IN(${q})`, ...ids)) put(b.photo_id, 'bichim', [b.code, nm(b.cutter_id), b.model, b.color]);
    for (const k of db.all(`SELECT photo_id, user_id, name FROM takeaways WHERE photo_id IN(${q})`, ...ids)) put(k.photo_id, 'olganlar', [nm(k.user_id), k.name]);
    for (const t of db.all(`SELECT voice_id, code, from_id, to_id FROM transfers WHERE voice_id IN(${q})`, ...ids)) put(t.voice_id, 'izoh', [t.code, nm(t.from_id), 'to', nm(t.to_id)]);
    for (const o of db.all(`SELECT id, photo_id, voice_id, code, cutter_id, customer FROM orders WHERE photo_id IN(${q}) OR voice_id IN(${q})`, ...ids, ...ids)) {
      put(o.photo_id, 'buyurtma', [o.code, nm(o.cutter_id), o.customer]); put(o.voice_id, 'buyurtma', [o.code, nm(o.cutter_id), o.customer]);
    }
    for (const e of db.all(`SELECT e.voice_id, e.kind, e.actor_id, o.code FROM order_events e JOIN orders o ON o.id=e.order_id WHERE e.voice_id IN(${q})`, ...ids)) put(e.voice_id, 'buyurtma', [e.code, nm(e.actor_id), ORD_EV[e.kind] || e.kind]);
    for (const a of db.all(`SELECT photo_id, voice_id, user_id, kind FROM appeals WHERE photo_id IN(${q}) OR voice_id IN(${q})`, ...ids, ...ids)) {
      const k = (KINDS[a.kind] || [a.kind])[0];
      put(a.photo_id, 'murojaat', [nm(a.user_id), k]); put(a.voice_id, 'murojaat', [nm(a.user_id), k]);
    }
  }
  const media = ph.map((p) => {
    const u = use.get(p.id) || { dir: 'boshqa', base: safe(nm(p.owner_id), 30) };
    const voice = p.kind === 'voice';
    const ext = voice ? (/mp4|m4a|aac/.test(p.mime || '') ? '.m4a' : /ogg/.test(p.mime || '') ? '.ogg' : /mpeg/.test(p.mime || '') ? '.mp3' : '.webm') : '.jpg';
    const d = tDay(Date.parse(p.created_at));
    return { id: p.id, file_id: p.file_id, path: `${voice ? 'ovozlar' : 'rasmlar'}/${u.dir}/${d}_${tHM(Date.parse(p.created_at)).replace(':', '-')}_${u.base}${ext}`,
      who: nm(p.owner_id), at: atT(p.created_at), voice };
  });
  add('hisobot/rasm_va_ovozlar_royxati.csv', csv(['Fayl', 'Kim yubordi', 'Vaqt', 'Turi'], media.map((m) => [m.path, m.who, m.at, m.voice ? 'Ovoz' : 'Rasm'])));

  // ---- Qisqa xulosa ----
  const cnt = (q, ...p) => (db.one(q, ...p) || {}).n || 0;
  const cut = cnt("SELECT SUM(CASE WHEN kind IN('cut_ready','cut_partial') OR (kind='cut_fix' AND to_state IS NOT NULL) THEN qty WHEN kind='cut_fix' THEN -qty END) n FROM moves WHERE day BETWEEN ? AND ? AND kind IN('cut_ready','cut_partial','cut_fix')", from, to);
  const accepted = cnt("SELECT SUM(qty) n FROM moves WHERE day BETWEEN ? AND ? AND kind='accept'", from, to);
  const fmt = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const summary = [
    `MUBORAK BREND — haftalik hisobot`,
    `Davr: ${dmy(from)} – ${dmy(to)}`,
    `Tuzilgan: ${atT(new Date(nowMs).toISOString())}`,
    '',
    `Bichildi: ${fmt(cut)} dona`,
    `Tikib qabul qilindi: ${fmt(accepted)} dona`,
    `Buyurtma (zakaz) ishlari: ${fmt(tot.zd)} ta`,
    '',
    `Ish haqi (oddiy ishlar): ${fmt(tot.os)} so‘m`,
    `Ish haqi (buyurtmalar): ${fmt(tot.zs)} so‘m`,
    `Shu hafta berilgan ish haqi: ${fmt(tot.oylik)} so‘m`,
    `Shu hafta berilgan avans: ${fmt(tot.avans)} so‘m`,
    `Mijozlardan olingan pul (buyurtmalar): ${fmt(cnt('SELECT SUM(amount) n FROM order_pays WHERE day BETWEEN ? AND ? AND cancelled_at IS NULL', from, to))} so‘m`,
    '',
    `Yangi buyurtmalar: ${cnt('SELECT COUNT(*) n FROM orders WHERE day BETWEEN ? AND ?', from, to)}`,
    `Mijozga topshirilgan buyurtmalar: ${cnt("SELECT COUNT(*) n FROM orders WHERE status='delivered' AND done_day BETWEEN ? AND ?", from, to)}`,
    `Murojaatlar: ${apps.length}`,
    `Rasmlar: ${media.filter((m) => !m.voice).length}, ovozli izohlar: ${media.filter((m) => m.voice).length}`,
  ].join('\r\n') + '\r\n';
  add('hisobot/xulosa.txt', summary);
  add('README.txt', [
    'MUBORAK BREND — haftalik arxiv',
    `Davr: ${dmy(from)} – ${dmy(to)}`,
    '',
    'hisobot/  — jadvallar. .csv fayllarni Excel bilan oching (ustunlar ";" bilan ajratilgan).',
    '   xulosa.txt                 — haftaning qisqa natijasi',
    '   ish_haqi.csv               — har xodim: oddiy va buyurtma ishlari, berilgan pul, avans',
    '   ish_haqi_batafsil.csv      — har bir ish yozuvi (sana, partiya, o‘lcham, narx)',
    '   davomat.csv                — har kuni kim keldi, ketdi, ruxsatli',
    '   bichimlar.csv, tikuvchiga_berish.csv, tekshiruv.csv, harakatlar.csv — ishlab chiqarish',
    '   pul.csv, avans_sorovlari.csv, olganlar.csv — pul harakatlari',
    '   buyurtmalar.csv, buyurtma_tarixi.csv, buyurtma_tolovlar.csv — alohida buyurtmalar',
    '   murojaatlar.csv            — ruxsat so‘rovlari va boshqa murojaatlar',
    '   audit_jurnal.csv           — ilovadagi barcha o‘zgarishlar (kim, qachon, nimani)',
    'rasmlar/, ovozlar/ — bo‘lim bo‘yicha. Fayl nomi: sana_vaqt_kod_xodim',
    'baza/toliq_zaxira.json — butun bazaning to‘liq nusxasi (tiklash uchun)',
  ].join('\r\n') + '\r\n');
  return { files, media, summary };
}

// To'liq zaxira (export_all bilan bir xil, biometrik xesh chiqarilmaydi)
export function fullDump(db, at) {
  const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'idem'").map((r) => r.name);
  const out = { exported_at: at, tables: {} };
  for (const t of tables) out.tables[t] = db.all(`SELECT * FROM "${t}"`);
  for (const u of out.tables.users || []) delete u.bio_hash;
  return out;
}
