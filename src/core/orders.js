// Alohida buyurtmalar (zakaz): bichuvchi mijozdan o'lcham olib buyurtma ochadi, aniq sana qo'yadi.
// Oqim: yangi → bichildi → tikuvchiga berildi → tikilmoqda → tikib topshirildi → tayyor → kiyib ko'rish:
//   ma'qul → topshirildi | tuzatish → tuzatishda → tayyor | olmadi → olib ketilmagan (rahbar qaror qiladi).
// Ish haqi: bichuvchiga — tikuvchi qabul qilganda, tikuvchiga — tikib topshirgani qabul qilinganda (alohida zakaz tarifi).
// Mijoz puli: kim olgani yoziladi. Bichuvchida turgan pul rahbarga topshiriladi yoki oylik hisobda ushlanadi.
import { AppError, needInt, needText, needDay, optText, fullName, fmtSum, addDays } from './base.js';
import { attachPhoto, attachVoice } from './photos.js';

const OPEN = ['new', 'cut', 'given', 'sewing', 'sewn', 'fixing', 'ready'];
// Ekrandagi bo'limlar
export const TABS = {
  cut: ['new', 'cut'],
  sew: ['given', 'sewing', 'sewn'],
  fix: ['fixing'],
  ready: ['ready'],
  done: ['delivered'],
  left: ['abandoned', 'closed'],
};
const DEFAULT_TPL = ['Bo‘y', 'Yelka', 'Ko‘krak', 'Bel', 'Son', 'Yeng uzunligi', 'Ko‘ylak uzunligi'];

const sumq = (ctx, q, ...p) => Number(ctx.db.one(q, ...p).s || 0);
const paidOf = (ctx, oid) => sumq(ctx, 'SELECT SUM(amount) s FROM order_pays WHERE order_id=? AND cancelled_at IS NULL', oid);

// Bichuvchi qo'lida turgan mijoz puli: olgani − rahbarga topshirgani (yoki oylikdan ushlangani)
export function cashHeld(ctx, uid) {
  const got = sumq(ctx, 'SELECT SUM(amount) s FROM order_pays WHERE receiver_id=? AND cancelled_at IS NULL', uid);
  const gave = sumq(ctx, "SELECT SUM(amount) s FROM cash_handovers WHERE user_id=? AND status='confirmed'", uid);
  const pending = sumq(ctx, "SELECT SUM(amount) s FROM cash_handovers WHERE user_id=? AND status='pending'", uid);
  return { held: Math.max(0, got - gave), pending };
}

function getOrder(ctx, id) {
  const o = ctx.db.one('SELECT * FROM orders WHERE id=?', needInt(id, 'id', 1));
  if (!o) throw new AppError('not_found', {}, 404);
  return o;
}
const isCutter = (ctx, o) => ctx.me.role === 'rahbar' || o.cutter_id === ctx.me.id;
function needCutter(ctx, o) { if (!isCutter(ctx, o)) throw new AppError('forbidden', {}, 403); }
function needSewer(ctx, o) { if (o.sewer_id !== ctx.me.id) throw new AppError('forbidden', {}, 403); }
function needState(o, ...st) { if (!st.includes(o.status)) throw new AppError('bad_state'); }

function event(ctx, o, kind, note, voiceId, data) {
  ctx.db.run('INSERT INTO order_events(order_id,at,actor_id,kind,note,voice_id,data) VALUES(?,?,?,?,?,?,?)',
    o.id, ctx.at, ctx.me ? ctx.me.id : null, kind, note || null, voiceId || null, data ? JSON.stringify(data) : null);
}
function setStatus(ctx, o, status, extra = {}) {
  const cols = { status, updated_at: ctx.at, ...extra };
  const keys = Object.keys(cols);
  ctx.db.run(`UPDATE orders SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`, ...keys.map((k) => cols[k]), o.id);
  ctx.audit('order_' + status, 'order', o.id, { status: o.status }, cols);
}

function normMeasures(m) {
  if (m == null) return null;
  if (typeof m !== 'object' || Array.isArray(m)) throw new AppError('bad_input', { field: 'measures' });
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(m)) {
    const key = String(k).trim().slice(0, 40), val = String(v ?? '').trim().slice(0, 40);
    if (!key || !val) continue;
    if (++n > 30) break;
    out[key] = val;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}
const phoneOk = (p) => { const s = optText(p, 30); if (s && !/^[0-9+()\- ]{5,30}$/.test(s)) throw new AppError('bad_input', { field: 'phone' }); return s; };
function futureDay(ctx, d, name = 'due_day') {
  const day = needDay(d, name);
  if (day < ctx.day || day > addDays(ctx.day, 400)) throw new AppError('bad_input', { field: name });
  return day;
}

// Zakaz tarifi: buyurtmaning o'z tarifi (rahbar qo'ygan bo'lsa) yoki umumiy zakaz tarifi
function orderRate(ctx, o, work) {
  const own = work === 'bichish' ? o.cut_pay : o.sew_pay;
  if (own != null) return own;
  const v = ctx.setting(work === 'bichish' ? 'zakaz_bichish' : 'zakaz_tikish');
  return v == null || v === '' ? null : Number(v);
}
function earnOrder(ctx, o, userId, work) {
  const u = userId ? ctx.user(userId) : null;
  if (!u || u.role !== (work === 'bichish' ? 'bichuvchi' : 'tikuvchi')) return;
  const price = orderRate(ctx, o, work);
  ctx.db.run(`INSERT INTO earnings(user_id,work,src,line_id,qty,day,rate_id,price,amount,created_at,order_id)
    VALUES(?,?,?,0,1,?,NULL,?,?,?,?) ON CONFLICT(src) DO NOTHING`, u.id, work, `ord:${work}:${o.id}`, ctx.day, price, price, ctx.at, o.id);
}
// Tarifi keyin qo'yilgan zakaz ishlariga summani yozish (rates_fill dan chaqiriladi)
export function fillOrderRates(ctx) {
  let filled = 0;
  for (const e of ctx.db.all('SELECT * FROM earnings WHERE amount IS NULL AND order_id IS NOT NULL')) {
    const o = ctx.db.one('SELECT * FROM orders WHERE id=?', e.order_id);
    const p = o ? orderRate(ctx, o, e.work) : null;
    if (p == null) continue;
    ctx.db.run('UPDATE earnings SET price=?,amount=? WHERE id=? AND amount IS NULL', p, p * e.qty, e.id);
    ctx.audit('earning_rate_filled', 'earning', e.id, { amount: null }, { amount: p * e.qty, order_id: o.id });
    filled++;
  }
  return filled;
}

function fileOf(ctx, id) { const r = id ? ctx.db.one('SELECT file_id FROM photos WHERE id=?', id) : null; return r ? r.file_id : null; }

function view(ctx, o, full) {
  const paid = paidOf(ctx, o.id);
  const c = ctx.user(o.cutter_id), s = o.sewer_id ? ctx.user(o.sewer_id) : null;
  const sewerView = ctx.me.role === 'tikuvchi';
  const v = {
    id: o.id, code: o.code, status: o.status, product: o.product, customer: o.customer, measures: o.measures ? JSON.parse(o.measures) : {},
    note: o.note, photo_id: o.photo_id, voice_id: o.voice_id, due_day: o.due_day, day: o.day, done_day: o.done_day, fix_by: o.fix_by, fixes: o.fixes,
    cutter_id: o.cutter_id, cutter: fullName(c), sewer_id: o.sewer_id, sewer: s ? fullName(s) : null,
    overdue: OPEN.includes(o.status) && o.status !== 'ready' && o.due_day < ctx.day,
    days_left: Math.round((Date.parse(o.due_day) - Date.parse(ctx.day)) / 86400000),
  };
  // Tikuvchi mijoz telefoni va pulini ko'rmaydi
  if (!sewerView) Object.assign(v, { phone: o.phone, price: o.price, price_ok: !!o.price_ok, cut_pay: o.cut_pay, sew_pay: o.sew_pay, paid, debt: o.price != null ? Math.max(0, o.price - paid) : null });
  if (full) {
    v.events = ctx.db.all(`SELECT e.*, u.first_name, u.last_name FROM order_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.order_id=? ORDER BY e.id`, o.id)
      .filter((e) => !sewerView || !['pay', 'pay_cancel', 'price'].includes(e.kind))
      .map((e) => ({ id: e.id, at: e.at, kind: e.kind, note: e.note, voice_id: e.voice_id, data: e.data ? JSON.parse(e.data) : null, who: fullName(e) }));
    if (!sewerView) {
      v.pays = ctx.db.all(`SELECT p.*, u.first_name, u.last_name, u.role FROM order_pays p LEFT JOIN users u ON u.id=p.receiver_id WHERE p.order_id=? ORDER BY p.id`, o.id)
        .map((p) => ({ id: p.id, amount: p.amount, day: p.day, at: p.at, note: p.note, receiver: fullName(p), receiver_role: p.role, cancelled: !!p.cancelled_at, cancel_reason: p.cancel_reason }));
    }
  }
  return v;
}

function addPay(ctx, o, amount, note) {
  if (o.price != null && paidOf(ctx, o.id) + amount > o.price) throw new AppError('overpay', { left: Math.max(0, o.price - paidOf(ctx, o.id)) });
  const r = ctx.db.one('INSERT INTO order_pays(order_id,amount,day,at,receiver_id,note) VALUES(?,?,?,?,?,?) RETURNING id', o.id, amount, ctx.day, ctx.at, ctx.me.id, note);
  event(ctx, o, 'pay', note, null, { amount });
  ctx.audit('order_paid', 'order', o.id, null, { amount, receiver: ctx.me.id, pay_id: r.id }, note);
  if (ctx.me.role !== 'rahbar') ctx.tellRahbars(`${o.code}: ${fullName(ctx.me)} мижоз ${o.customer}дан ${fmtSum(amount)} сўм олди.`);
  return r.id;
}

export const actions = {
  // O'lcham shabloni: har bichuvchining o'z ro'yxati
  ord_tpl: {
    auth: ['bichuvchi', 'rahbar'],
    fn(ctx) {
      const r = ctx.db.one('SELECT fields FROM measure_tpl WHERE user_id=?', ctx.me.id);
      return { fields: r ? JSON.parse(r.fields) : DEFAULT_TPL };
    },
  },
  ord_tpl_set: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      if (!Array.isArray(b.fields)) throw new AppError('bad_input', { field: 'fields' });
      const f = [...new Set(b.fields.map((x) => String(x ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
      if (!f.length) throw new AppError('bad_input', { field: 'fields' });
      ctx.db.run('INSERT INTO measure_tpl(user_id,fields) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET fields=excluded.fields', ctx.me.id, JSON.stringify(f));
      return { fields: f };
    },
  },

  ord_create: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const customer = needText(b.customer, 'customer', 80);
      const product = needText(b.product, 'product', 80);
      const due = futureDay(ctx, b.due_day);
      const price = b.price == null || b.price === '' ? null : needInt(b.price, 'price', 0, 1e10);
      const prepay = b.prepay == null || b.prepay === '' ? 0 : needInt(b.prepay, 'prepay', 0, 1e10);
      const photo = b.photo_id ? attachPhoto(ctx, b.photo_id) : null;
      const voice = b.voice_id ? attachVoice(ctx, b.voice_id) : null;
      const r = ctx.db.one(`INSERT INTO orders(code,cutter_id,customer,phone,product,measures,note,photo_id,voice_id,price,price_ok,due_day,status,day,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?) RETURNING id`, 'tmp' + ctx.now + Math.random(), ctx.me.id, customer, phoneOk(b.phone), product,
        normMeasures(b.measures), optText(b.note, 500), photo, voice, price, ctx.me.role === 'rahbar' && price != null ? 1 : 0, due, ctx.day, ctx.at, ctx.at);
      const code = 'Z-' + String(r.id).padStart(4, '0');
      ctx.db.run('UPDATE orders SET code=? WHERE id=?', code, r.id);
      const o = ctx.db.one('SELECT * FROM orders WHERE id=?', r.id);
      event(ctx, o, 'created', null, null, { due, price });
      ctx.audit('order_created', 'order', r.id, null, { code, customer, product, due, price });
      if (prepay > 0) addPay(ctx, o, prepay, null);
      if (ctx.me.role !== 'rahbar') ctx.tellRahbars(`Янги буюртма ${code}: ${product}, мижоз ${customer}, муддат ${due}${price != null ? ', нарх таклифи ' + fmtSum(price) + ' сўм (тасдиқланг)' : ', нарх қўйилмаган'}.`);
      return { id: r.id, code };
    },
  },

  ord_update: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (!OPEN.includes(o.status) && o.status !== 'abandoned') throw new AppError('bad_state');
      const up = {};
      if (b.customer !== undefined) up.customer = needText(b.customer, 'customer', 80);
      if (b.phone !== undefined) up.phone = phoneOk(b.phone);
      if (b.product !== undefined) up.product = needText(b.product, 'product', 80);
      if (b.measures !== undefined) up.measures = normMeasures(b.measures);
      if (b.note !== undefined) up.note = optText(b.note, 500);
      if (b.photo_id) up.photo_id = attachPhoto(ctx, b.photo_id);
      const keys = Object.keys(up);
      if (!keys.length) return { ok: true };
      ctx.db.run(`UPDATE orders SET ${keys.map((k) => k + '=?').join(',')},updated_at=? WHERE id=?`, ...keys.map((k) => up[k]), ctx.at, o.id);
      ctx.audit('order_updated', 'order', o.id, Object.fromEntries(keys.map((k) => [k, o[k]])), up);
      return { ok: true };
    },
  },

  // Muddatni o'zgartirish (sabab bilan; eslatmalar yangi sanaga qayta ishlaydi)
  ord_due: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (!OPEN.includes(o.status)) throw new AppError('bad_state');
      const due = futureDay(ctx, b.due_day);
      const note = optText(b.note, 300);
      ctx.db.run('UPDATE orders SET due_day=?,updated_at=? WHERE id=?', due, ctx.at, o.id);
      event(ctx, o, 'due', note, null, { from: o.due_day, to: due });
      ctx.audit('order_due', 'order', o.id, { due_day: o.due_day }, { due_day: due }, note);
      if (o.sewer_id && ['given', 'sewing', 'fixing'].includes(o.status)) ctx.tell(o.sewer_id, `${o.code} (${o.product}) muddati o‘zgardi: ${due}.`);
      return { ok: true };
    },
  },

  // Narx: bichuvchi taklif qiladi, rahbar tasdiqlaydi. Rahbar shu zakaz uchun alohida ish haqi ham qo'yishi mumkin.
  ord_price: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (['cancelled', 'closed'].includes(o.status)) throw new AppError('bad_state');
      const price = needInt(b.price, 'price', 0, 1e10);
      const paid = paidOf(ctx, o.id);
      if (price < paid) throw new AppError('price_below_paid', { paid });
      const up = { price, price_ok: ctx.me.role === 'rahbar' ? 1 : 0 };
      if (ctx.me.role === 'rahbar') {
        for (const k of ['cut_pay', 'sew_pay']) if (b[k] !== undefined) up[k] = b[k] === '' || b[k] == null ? null : needInt(b[k], k, 0, 1e9);
      }
      const keys = Object.keys(up);
      ctx.db.run(`UPDATE orders SET ${keys.map((k) => k + '=?').join(',')},updated_at=? WHERE id=?`, ...keys.map((k) => up[k]), ctx.at, o.id);
      event(ctx, o, 'price', null, null, { from: o.price, to: price, ok: !!up.price_ok });
      ctx.audit('order_priced', 'order', o.id, { price: o.price, price_ok: o.price_ok, cut_pay: o.cut_pay, sew_pay: o.sew_pay }, up);
      if (ctx.me.role === 'rahbar' && o.cutter_id !== ctx.me.id) ctx.tell(o.cutter_id, `${o.code} (${o.customer}) narxi rahbar tomonidan belgilandi: ${fmtSum(price)} so‘m.`);
      if (ctx.me.role !== 'rahbar') ctx.tellRahbars(`${o.code}: ${fullName(ctx.me)} нархни ${fmtSum(price)} сўм деб ёзди. Тасдиқланг.`);
      return { ok: true };
    },
  },

  ord_cut: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (o.status === 'cut') return { ok: true };
      needState(o, 'new');
      setStatus(ctx, o, 'cut');
      event(ctx, o, 'cut');
      return { ok: true };
    },
  },

  ord_give: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      needState(o, 'new', 'cut');
      const to = ctx.user(needInt(b.sewer_id, 'sewer_id', 1));
      if (!to || to.role !== 'tikuvchi' || to.status !== 'active') throw new AppError('bad_sewer');
      const note = optText(b.note, 300);
      const voice = b.voice_id ? attachVoice(ctx, b.voice_id) : null;
      setStatus(ctx, o, 'given', { sewer_id: to.id });
      event(ctx, o, 'given', note, voice, { sewer_id: to.id });
      const m = o.measures ? Object.entries(JSON.parse(o.measures)).map(([k, v]) => `${k}: ${v}`).join(', ') : '';
      ctx.notify.push({
        tg_id: to.tg_id,
        text: `Sizga alohida buyurtma berildi (${o.code}), ${fullName(ctx.me)}dan: ${o.product}. Muddat: ${o.due_day}.${m ? '\nO‘lchamlar: ' + m : ''}${note ? '\nIzoh: ' + note : ''}\nIlovada «Qabul qildim» ni bosing.`,
        photo: fileOf(ctx, o.photo_id), voice: fileOf(ctx, voice),
      });
      return { ok: true };
    },
  },

  // Tikuvchi: qabul qildi → bichuvchiga zakaz bichish haqi yoziladi
  ord_accept: {
    auth: ['tikuvchi'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needSewer(ctx, o);
      if (o.status === 'sewing') return { ok: true, already: true };
      needState(o, 'given');
      setStatus(ctx, o, 'sewing');
      event(ctx, o, 'accepted');
      earnOrder(ctx, o, o.cutter_id, 'bichish');
      ctx.tell(o.cutter_id, `${fullName(ctx.me)} ${o.code} (${o.product}) buyurtmasini qabul qildi.`);
      return { ok: true };
    },
  },

  // Tikuvchi: qabul qilmay qaytardi (sabab bilan)
  ord_return: {
    auth: ['tikuvchi'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needSewer(ctx, o);
      needState(o, 'given');
      const note = needText(b.note, 'note', 300);
      setStatus(ctx, o, 'cut', { sewer_id: null });
      event(ctx, o, 'returned', note);
      ctx.tell(o.cutter_id, `${fullName(ctx.me)} ${o.code} buyurtmasini qaytardi: ${note}`);
      return { ok: true };
    },
  },

  // Tikuvchi: tikib bo'ldim (yoki tuzatib bo'ldim), topshirdim
  ord_sewn: {
    auth: ['tikuvchi'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needSewer(ctx, o);
      if (!(o.status === 'sewing' || (o.status === 'fixing' && o.fix_by === 'sewer'))) throw new AppError('bad_state');
      setStatus(ctx, o, 'sewn');
      event(ctx, o, o.status === 'fixing' ? 'fixed' : 'sewn', optText(b.note, 300));
      ctx.tell(o.cutter_id, `${fullName(ctx.me)} ${o.code} (${o.product}) ni ${o.status === 'fixing' ? 'tuzatib' : 'tikib'} topshirdi. Ilovada «Qabul qildim» ni bosing.`);
      return { ok: true };
    },
  },

  // Bichuvchi tikilgan ishni qabul qildi → tayyor; tikuvchiga zakaz tikish haqi (bir marta)
  ord_receive: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (o.status === 'ready') return { ok: true, already: true };
      needState(o, 'sewn');
      setStatus(ctx, o, 'ready', { fix_by: null });
      event(ctx, o, 'ready');
      earnOrder(ctx, o, o.sewer_id, 'tikish');
      if (o.sewer_id) ctx.tell(o.sewer_id, `${o.code} (${o.product}) qabul qilindi. Rahmat!`);
      return { ok: true };
    },
  },

  // Bichuvchining o'zi tuzatadigan holat: tuzatdim → tayyor
  ord_fixed: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (!(o.status === 'fixing' && o.fix_by === 'cutter')) throw new AppError('bad_state');
      setStatus(ctx, o, 'ready', { fix_by: null });
      event(ctx, o, 'fixed', optText(b.note, 300));
      return { ok: true };
    },
  },

  // Kiyib ko'rish natijasi: ok — topshirildi; fix — tuzatishga (kim tuzatadi, yangi sana, izoh); left — mijoz olmadi
  ord_fit: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      needState(o, 'ready');
      const pay = b.pay == null || b.pay === '' ? 0 : needInt(b.pay, 'pay', 0, 1e10);
      if (b.result === 'ok') {
        if (pay > 0) addPay(ctx, o, pay, null);
        setStatus(ctx, o, 'delivered', { done_day: ctx.day });
        event(ctx, o, 'delivered', optText(b.note, 300));
        const debt = o.price != null ? Math.max(0, o.price - paidOf(ctx, o.id)) : null;
        if (debt) ctx.tellRahbars(`${o.code} мижозга топширилди. Мижоз ${o.customer} қарзи: ${fmtSum(debt)} сўм.`);
        return { ok: true, debt };
      }
      if (b.result === 'fix') {
        const by = b.fix_by === 'sewer' && o.sewer_id ? 'sewer' : 'cutter';
        const note = optText(b.note, 500);
        const voice = b.voice_id ? attachVoice(ctx, b.voice_id) : null;
        if (!note && !voice) throw new AppError('need_reason');
        const due = futureDay(ctx, b.due_day);
        if (pay > 0) addPay(ctx, o, pay, null);
        setStatus(ctx, o, 'fixing', { fix_by: by, due_day: due, fixes: o.fixes + 1 });
        event(ctx, o, 'fit_fix', note, voice, { by, due, from: o.due_day });
        if (by === 'sewer') {
          const s = ctx.user(o.sewer_id);
          if (s && s.status === 'active') ctx.notify.push({ tg_id: s.tg_id, text: `${o.code} (${o.product}) mijozga to‘g‘ri kelmadi, tuzatish kerak. Yangi muddat: ${due}.${note ? '\nIzoh: ' + note : ''}`, voice: fileOf(ctx, voice) });
        }
        return { ok: true };
      }
      if (b.result === 'left') {
        const note = optText(b.note, 300);
        if (pay > 0) addPay(ctx, o, pay, null);
        setStatus(ctx, o, 'abandoned', { done_day: ctx.day });
        event(ctx, o, 'left', note);
        ctx.tellRahbars(`${o.code}: мижоз ${o.customer} кийимни олиб кетмади${note ? ' («' + note + '»)' : ''}. Олдиндан тўлов: ${fmtSum(paidOf(ctx, o.id))} сўм. Қарор: Буюртмалар → Олиб кетилмаган.`);
        return { ok: true };
      }
      throw new AppError('bad_input', { field: 'result' });
    },
  },

  // Olib ketilmagan: rahbar qaror qiladi — kutish (yangi sana bilan tayyorga qaytadi) yoki yopish (sotuvga / omborga)
  ord_left_decide: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needState(o, 'abandoned');
      const note = optText(b.note, 300);
      if (b.decision === 'wait') {
        const due = futureDay(ctx, b.due_day);
        setStatus(ctx, o, 'ready', { due_day: due, done_day: null });
        event(ctx, o, 'left_wait', note, null, { due });
        ctx.tell(o.cutter_id, `${o.code}: rahbar mijozni ${due} gacha kutishga qaror qildi.`);
        return { ok: true };
      }
      if (b.decision === 'close') {
        if (!note) throw new AppError('need_reason');
        setStatus(ctx, o, 'closed');
        event(ctx, o, 'closed', note);
        return { ok: true };
      }
      throw new AppError('bad_input', { field: 'decision' });
    },
  },

  // Mijoz to'lovi: kim olgan bo'lsa, o'sha yozadi (bichuvchi yoki rahbar)
  ord_pay: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      if (['cancelled'].includes(o.status)) throw new AppError('bad_state');
      const amount = needInt(b.amount, 'amount', 1, 1e10);
      return { id: addPay(ctx, o, amount, optText(b.note, 200)) };
    },
  },

  // Xato yozilgan to'lovni bekor qilish — faqat rahbar, sabab bilan
  ord_pay_cancel: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM order_pays WHERE id=?', needInt(b.pay_id, 'pay_id', 1));
      if (!p || p.cancelled_at) throw new AppError('bad_state');
      const reason = needText(b.reason, 'reason', 300);
      const held = cashHeld(ctx, p.receiver_id).held;
      const rec = ctx.user(p.receiver_id);
      if (rec.role !== 'rahbar' && held < p.amount) throw new AppError('cash_already_given', { held });
      ctx.db.run('UPDATE order_pays SET cancelled_at=?,cancel_reason=? WHERE id=?', ctx.at, reason, p.id);
      const o = ctx.db.one('SELECT * FROM orders WHERE id=?', p.order_id);
      event(ctx, o, 'pay_cancel', reason, null, { amount: p.amount });
      ctx.audit('order_pay_cancelled', 'order', o.id, { pay_id: p.id, amount: p.amount }, null, reason);
      if (rec.role !== 'rahbar') ctx.tell(rec, `${o.code}: ${fmtSum(p.amount)} so‘mlik to‘lov yozuvi rahbar tomonidan bekor qilindi. Sabab: ${reason}`);
      return { ok: true };
    },
  },

  ord_cancel: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      needCutter(ctx, o);
      needState(o, 'new', 'cut');
      const reason = needText(b.reason, 'reason', 300);
      if (paidOf(ctx, o.id) > 0 && ctx.me.role !== 'rahbar') throw new AppError('order_has_pay');
      setStatus(ctx, o, 'cancelled');
      event(ctx, o, 'cancelled', reason);
      if (ctx.me.role !== 'rahbar') ctx.tellRahbars(`${o.code} буюртмаси бекор қилинди (${fullName(ctx.me)}): ${reason}`);
      return { ok: true };
    },
  },

  // Ro'yxat: muddati yaqini tepada. Bichuvchi — o'zinikini, tikuvchi — o'ziga berilganini, rahbar — hammasini.
  ord_list: {
    auth: 'active',
    fn(ctx, b) {
      const tab = TABS[b.tab] ? b.tab : null;
      const w = [], p = [];
      if (ctx.me.role === 'bichuvchi') { w.push('cutter_id=?'); p.push(ctx.me.id); }
      else if (ctx.me.role === 'tikuvchi') {
        w.push("sewer_id=? AND (status IN('given','sewing','sewn') OR (status='fixing' AND fix_by='sewer') OR (status IN('ready','delivered') AND updated_at>=?))");
        p.push(ctx.me.id, new Date(ctx.now - 7 * 86400000).toISOString());
      } else if (b.cutter_id) { w.push('cutter_id=?'); p.push(Number(b.cutter_id)); }
      const base = w.length ? 'WHERE ' + w.join(' AND ') : '';
      const counts = {};
      for (const [k, st] of Object.entries(TABS)) {
        counts[k] = ctx.db.one(`SELECT COUNT(*) n FROM orders ${base ? base + ' AND' : 'WHERE'} status IN(${st.map(() => '?').join(',')})`, ...p, ...st).n;
      }
      const st = tab ? TABS[tab] : OPEN;
      const done = tab === 'done' || tab === 'left';
      const rows = ctx.db.all(`SELECT * FROM orders ${base ? base + ' AND' : 'WHERE'} status IN(${st.map(() => '?').join(',')})
        ORDER BY ${done ? 'COALESCE(done_day, day) DESC, id DESC' : 'due_day, id'} LIMIT 200`, ...p, ...st);
      return { counts, rows: rows.map((o) => view(ctx, o, false)) };
    },
  },

  ord_detail: {
    auth: 'active',
    fn(ctx, b) {
      const o = getOrder(ctx, b.id);
      if (!(isCutter(ctx, o) || o.sewer_id === ctx.me.id)) throw new AppError('forbidden', {}, 403);
      const v = view(ctx, o, true);
      if (isCutter(ctx, o)) v.sewers = ctx.db.all("SELECT id,first_name,last_name FROM users WHERE role='tikuvchi' AND status='active' ORDER BY first_name").map((u) => ({ id: u.id, name: fullName(u) }));
      return v;
    },
  },

  // Rahbar uchun umumiy ko'rinish
  ord_summary: {
    auth: 'rahbar',
    fn(ctx) {
      const n = (q, ...p) => ctx.db.one(q, ...p).n;
      const ph = OPEN.map(() => '?').join(',');
      const debts = ctx.db.all(`SELECT o.* FROM orders o WHERE o.price IS NOT NULL AND o.status NOT IN('cancelled','closed')`)
        .map((o) => ({ o, debt: Math.max(0, o.price - paidOf(ctx, o.id)) })).filter((x) => x.debt > 0);
      const cutters = ctx.db.all("SELECT * FROM users WHERE role='bichuvchi' AND status IN('active','inactive')").map((u) => ({ id: u.id, name: fullName(u), ...cashHeld(ctx, u.id) }))
        .filter((c) => c.held || c.pending);
      const hand = ctx.db.all(`SELECT h.*, u.first_name, u.last_name FROM cash_handovers h JOIN users u ON u.id=h.user_id WHERE h.status='pending' ORDER BY h.id`)
        .map((h) => ({ id: h.id, user_id: h.user_id, name: fullName(h), amount: h.amount, day: h.day, note: h.note }));
      return {
        open: n(`SELECT COUNT(*) n FROM orders WHERE status IN(${ph})`, ...OPEN),
        overdue: n(`SELECT COUNT(*) n FROM orders WHERE status IN(${ph}) AND status<>'ready' AND due_day<?`, ...OPEN, ctx.day),
        price_wait: n(`SELECT COUNT(*) n FROM orders WHERE status NOT IN('cancelled','closed') AND price_ok=0`),
        left: n("SELECT COUNT(*) n FROM orders WHERE status='abandoned'"),
        delivered_month: n("SELECT COUNT(*) n FROM orders WHERE status='delivered' AND substr(done_day,1,7)=?", ctx.day.slice(0, 7)),
        debt_sum: debts.reduce((a, x) => a + x.debt, 0),
        debts: debts.slice(0, 50).map((x) => ({ id: x.o.id, code: x.o.code, customer: x.o.customer, phone: x.o.phone, status: x.o.status, debt: x.debt })),
        cutters, handovers: hand,
        rates: { bichish: ctx.setting('zakaz_bichish'), tikish: ctx.setting('zakaz_tikish') },
      };
    },
  },

  // Zakaz tariflari (umumiy). Avval yozilgan ish haqlari o'zgarmaydi.
  ord_rates_set: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const before = { bichish: ctx.setting('zakaz_bichish'), tikish: ctx.setting('zakaz_tikish') };
      const after = {};
      for (const k of ['bichish', 'tikish']) {
        if (b[k] === undefined) continue;
        const v = needInt(b[k], k, 0, 1e9);
        ctx.db.run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', 'zakaz_' + k, String(v));
        after[k] = v;
      }
      ctx.audit('order_rates_set', 'settings', 'zakaz', before, after);
      return { ok: true };
    },
  },

  // ---------- Bichuvchidagi mijoz puli ----------
  cash_my: {
    auth: ['bichuvchi'],
    fn(ctx) {
      const list = ctx.db.all('SELECT * FROM cash_handovers WHERE user_id=? ORDER BY id DESC LIMIT 30', ctx.me.id);
      const pays = ctx.db.all(`SELECT p.*, o.code, o.customer FROM order_pays p JOIN orders o ON o.id=p.order_id WHERE p.receiver_id=? AND p.cancelled_at IS NULL ORDER BY p.id DESC LIMIT 50`, ctx.me.id)
        .map((p) => ({ id: p.id, amount: p.amount, day: p.day, code: p.code, customer: p.customer, order_id: p.order_id }));
      return { ...cashHeld(ctx, ctx.me.id), list, pays };
    },
  },
  cash_give: {
    auth: ['bichuvchi'], mut: true,
    fn(ctx, b) {
      const amount = needInt(b.amount, 'amount', 1, 1e10);
      const c = cashHeld(ctx, ctx.me.id);
      if (amount > c.held - c.pending) throw new AppError('cash_too_much', { held: Math.max(0, c.held - c.pending) });
      const note = optText(b.note, 200);
      const r = ctx.db.one("INSERT INTO cash_handovers(user_id,amount,how,status,day,note,created_at) VALUES(?,?,'cash','pending',?,?,?) RETURNING id", ctx.me.id, amount, ctx.day, note, ctx.at);
      ctx.audit('cash_handover', 'cash', r.id, null, { amount }, note);
      ctx.tellRahbars(`${fullName(ctx.me)} мижозлардан олинган ${fmtSum(amount)} сўмни сизга топширганини ёзди. Олган бўлсангиз тасдиқланг: Буюртмалар бўлими.`);
      return { id: r.id };
    },
  },
  cash_cancel: {
    auth: ['bichuvchi'], mut: true,
    fn(ctx, b) {
      const h = ctx.db.one('SELECT * FROM cash_handovers WHERE id=?', needInt(b.id, 'id', 1));
      if (!h || h.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (h.status !== 'pending') throw new AppError('bad_state');
      ctx.db.run("UPDATE cash_handovers SET status='cancelled',decided_at=? WHERE id=?", ctx.at, h.id);
      ctx.audit('cash_handover_cancelled', 'cash', h.id, { status: 'pending' }, { status: 'cancelled' });
      return { ok: true };
    },
  },
  cash_decide: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const h = ctx.db.one('SELECT * FROM cash_handovers WHERE id=?', needInt(b.id, 'id', 1));
      if (!h || h.status !== 'pending') throw new AppError('bad_state');
      const note = optText(b.note, 200);
      if (b.ok) {
        ctx.db.run("UPDATE cash_handovers SET status='confirmed',decided_at=?,decided_by=?,answer_note=? WHERE id=?", ctx.at, ctx.me.id, note, h.id);
        ctx.audit('cash_handover_confirmed', 'cash', h.id, { status: 'pending' }, { status: 'confirmed', amount: h.amount });
        ctx.tell(h.user_id, `Rahbar siz topshirgan ${fmtSum(h.amount)} so‘mni olganini tasdiqladi.`);
      } else {
        if (!note) throw new AppError('need_reason');
        ctx.db.run("UPDATE cash_handovers SET status='rejected',decided_at=?,decided_by=?,answer_note=? WHERE id=?", ctx.at, ctx.me.id, note, h.id);
        ctx.audit('cash_handover_rejected', 'cash', h.id, { status: 'pending' }, { status: 'rejected' }, note);
        ctx.tell(h.user_id, `Rahbar ${fmtSum(h.amount)} so‘mni olmaganini yozdi: ${note}`);
      }
      return { ok: true };
    },
  },
};

// Har kuni ertalab: muddati 2 kun qolgan, bugun va o'tib ketgan buyurtmalar uchun eslatma (har biri bir marta)
export function orderTick(ctx) {
  const sent = [];
  const once = (uid, key) => {
    if (ctx.db.one('SELECT 1 x FROM reminders WHERE user_id=? AND key=?', uid, key)) return false;
    ctx.db.run('INSERT INTO reminders(user_id,key,at) VALUES(?,?,?)', uid, key, ctx.at);
    return true;
  };
  const in2 = addDays(ctx.day, 2), y1 = addDays(ctx.day, -1);
  for (const o of ctx.db.all("SELECT * FROM orders WHERE status IN('new','cut','given','sewing','sewn','fixing') AND due_day<=?", in2)) {
    const kind = o.due_day === in2 ? 'soon' : o.due_day === ctx.day ? 'today' : o.due_day === y1 ? 'late' : null;
    if (!kind) continue;
    const key = `ord:${o.id}:${o.due_day}:${kind}`;
    const txt = { soon: 'muddatiga 2 kun qoldi', today: 'muddati bugun', late: 'muddati kecha o‘tdi' }[kind];
    const sewerTurn = o.sewer_id && (['given', 'sewing'].includes(o.status) || (o.status === 'fixing' && o.fix_by === 'sewer'));
    const who = sewerTurn ? [o.cutter_id, o.sewer_id] : [o.cutter_id];
    for (const uid of who) {
      if (!once(uid, key)) continue;
      ctx.tell(uid, `⏰ ${o.code} · ${o.product} (${o.customer}) — ${txt} (${o.due_day}).`);
      sent.push({ order: o.id, uid, kind });
    }
    if (kind === 'late') {
      for (const r of ctx.db.all("SELECT id FROM users WHERE role='rahbar' AND status='active'")) {
        if (once(r.id, key)) ctx.tell(r.id, `⏰ ${o.code} · ${o.product} (${o.customer}, ${fullName(ctx.user(o.cutter_id))}) муддати ўтди: ${o.due_day}.`);
      }
    }
  }
  // Tayyor, lekin mijoz muddatdan 7 kun o'tib ham kelmagan — rahbarga bir marta
  for (const o of ctx.db.all("SELECT * FROM orders WHERE status='ready' AND due_day<=?", addDays(ctx.day, -7))) {
    for (const r of ctx.db.all("SELECT id FROM users WHERE role='rahbar' AND status='active'")) {
      if (once(r.id, `ord:${o.id}:${o.due_day}:nocome`)) ctx.tell(r.id, `${o.code} тайёр, лекин мижоз ${o.customer} ${o.due_day} дан бери келмади.${o.phone ? ' Тел: ' + o.phone : ''}`);
    }
    if (once(o.cutter_id, `ord:${o.id}:${o.due_day}:nocome`)) ctx.tell(o.cutter_id, `${o.code} tayyor, lekin mijoz ${o.customer} hali kelmadi.${o.phone ? ' Tel: ' + o.phone : ''} Qo‘ng‘iroq qilib ko‘ring.`);
  }
  return sent;
}
