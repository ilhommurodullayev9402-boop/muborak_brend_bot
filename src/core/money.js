// Ishbay haq hisobi, «Korxonadan olganlarim», oylik varaqasi va «Пул бердим → Pulni oldim» tasdig'i.
// Bu ichki hisob-kitob moduli; rasmiy ish haqi/soliq hisobini almashtirmaydi.
import { AppError, needInt, needText, needDay, optText, fullName, fmtSum, addDays, isDay } from './base.js';

const sum = (ctx, q, ...p) => Number(ctx.db.one(q, ...p).s || 0);

// Xodimning hisob qoldig'i (uptoDay — shu kun ham kiradi; berilmasa — hozirgacha)
export function ledger(ctx, uid, uptoDay) {
  const d = uptoDay || '9999-12-31';
  const earned = sum(ctx, 'SELECT SUM(amount) s FROM earnings WHERE user_id=? AND amount IS NOT NULL AND day<=?', uid, d);
  const adj = sum(ctx, "SELECT SUM(amount) s FROM adjustments WHERE user_id=? AND status='confirmed' AND day<=?", uid, d);
  const paid = sum(ctx, "SELECT SUM(amount) s FROM payments WHERE user_id=? AND status IN('confirmed','reverse_pending') AND day<=?", uid, d);
  // Ushlanmalar: olganlar + topshirilmagan mijoz puli (buyurtmalar), oylik hisob tasdig'ida yoziladi
  const ded = sum(ctx, "SELECT SUM(amount) s FROM settlements WHERE user_id=? AND how='payroll' AND day<=?", uid, d)
    + sum(ctx, "SELECT SUM(amount) s FROM cash_handovers WHERE user_id=? AND how='payroll' AND status='confirmed' AND day<=?", uid, d);
  return { earned, adj, paid, ded, balance: earned + adj - paid - ded };
}

export function current(ctx, uid) {
  const l = ledger(ctx, uid);
  const pending = sum(ctx, "SELECT SUM(amount) s FROM payments WHERE user_id=? AND status IN('pending','disputed')", uid);
  const debt = takeawayDebt(ctx, uid);
  return { ...l, pending, payable: Math.max(0, l.balance - pending), overpaid: Math.max(0, -l.balance), debt };
}

export function settled(ctx, tkId) { return sum(ctx, 'SELECT SUM(amount) s FROM settlements WHERE takeaway_id=?', tkId); }

// Kelishilgan, hali to'lanmagan olinganlar (qarz). Oldindan to'langanlar kirmaydi.
function takeawayDebt(ctx, uid) {
  let t = 0;
  for (const k of ctx.db.all("SELECT id,amount FROM takeaways WHERE user_id=? AND status='agreed' AND pay_method IN('debt','payroll')", uid)) {
    t += Math.max(0, k.amount - settled(ctx, k.id));
  }
  return t;
}

function tkView(ctx, k) {
  const s = settled(ctx, k.id);
  return { ...k, settled: s, remaining: k.status === 'agreed' && k.pay_method !== 'prepaid' ? Math.max(0, (k.amount || 0) - s) : 0 };
}

function ownOrRahbar(ctx, uid) {
  if (ctx.me.role === 'rahbar') return needInt(uid || ctx.me.id, 'user_id', 1);
  if (uid && Number(uid) !== ctx.me.id) throw new AppError('forbidden', {}, 403);
  return ctx.me.id;
}

export function employee(ctx, id) {
  const u = ctx.user(needInt(id, 'user_id', 1));
  if (!u || !['bichuvchi', 'tikuvchi'].includes(u.role) || u.status === 'pending' || u.status === 'rejected') throw new AppError('bad_input', { field: 'user_id' });
  return u;
}

const TK_KIND = { product: 'tayyor mahsulot', material: 'material', service: 'tikish xizmati' };
const METHOD = { prepaid: 'avval/alohida to‘langan', debt: 'hali qarz', payroll: 'oylik bilan hisoblashish' };

export function payslip(ctx, uid, from, to) {
  const u = ctx.user(uid);
  const groups = ctx.db.all(`SELECT e.work, (e.order_id IS NOT NULL) zakaz, c.name type_name, COALESCE(b.model,'') model, e.price, SUM(e.qty) qty, SUM(e.amount) amount, COUNT(*) n
    FROM earnings e LEFT JOIN lines l ON l.id=e.line_id LEFT JOIN batches b ON b.id=l.batch_id LEFT JOIN catalog c ON c.id=b.type_id
    WHERE e.user_id=? AND e.day BETWEEN ? AND ? GROUP BY e.work, zakaz, c.name, b.model, e.price ORDER BY e.work, zakaz, c.name, b.model`, uid, from, to);
  const earned = groups.reduce((a, g) => a + (g.amount || 0), 0);
  const missingQty = groups.filter((g) => g.price == null).reduce((a, g) => a + g.qty, 0);
  const opening = ledger(ctx, uid, addDays(from, -1)).balance;
  const payments = ctx.db.all('SELECT * FROM payments WHERE user_id=? AND ((day BETWEEN ? AND ?) OR status IN(\'pending\',\'disputed\',\'reverse_pending\')) ORDER BY id', uid, from, to);
  const paidConfirmed = payments.filter((p) => ['confirmed', 'reverse_pending'].includes(p.status) && p.day >= from && p.day <= to).reduce((a, p) => a + p.amount, 0);
  const adjustments = ctx.db.all("SELECT * FROM adjustments WHERE user_id=? AND ((day BETWEEN ? AND ?) OR status IN('pending','disputed')) ORDER BY id", uid, from, to);
  const adjConfirmed = adjustments.filter((a) => a.status === 'confirmed' && a.day >= from && a.day <= to).reduce((s, a) => s + a.amount, 0);
  const deductions = ctx.db.all(`SELECT s.*, t.name, t.kind FROM settlements s JOIN takeaways t ON t.id=s.takeaway_id WHERE s.user_id=? AND s.how='payroll' AND s.day BETWEEN ? AND ? ORDER BY s.id`, uid, from, to)
    .concat(ctx.db.all(`SELECT id, amount, day, 'cash' kind, NULL name FROM cash_handovers WHERE user_id=? AND how='payroll' AND status='confirmed' AND day BETWEEN ? AND ? ORDER BY id`, uid, from, to));
  const ded = deductions.reduce((a, d) => a + d.amount, 0);
  const takeaways = ctx.db.all("SELECT * FROM takeaways WHERE user_id=? AND ((day BETWEEN ? AND ?) OR (status NOT IN('cancelled') AND status<>'agreed') OR (status='agreed' AND pay_method IN('debt','payroll'))) ORDER BY day, id", uid, from, to).map((k) => tkView(ctx, k));
  const decl = ctx.db.one('SELECT * FROM declarations WHERE user_id=? AND period=?', uid, from.slice(0, 7));
  const closed = ctx.db.one('SELECT * FROM closures WHERE user_id=? AND period_from=? AND period_to=?', uid, from, to);
  const now = current(ctx, uid);
  return {
    user: { id: u.id, name: fullName(u), role: u.role }, from, to, groups, earned, missingQty, opening,
    payments, paidConfirmed, adjustments, adjConfirmed, deductions, ded,
    closing: opening + earned + adjConfirmed - paidConfirmed - ded,
    takeaways, declaration: decl ? decl.answer : null, closed: closed ? closed.at : null, now,
  };
}

function blockers(ps) {
  const b = [];
  if (ps.missingQty) b.push('missing_rate');
  if (ps.payments.some((p) => ['pending', 'disputed', 'reverse_pending'].includes(p.status))) b.push('payment_open');
  if (ps.adjustments.some((a) => ['pending', 'disputed'].includes(a.status))) b.push('adjustment_open');
  if (ps.takeaways.some((k) => ['submitted', 'review', 'employee', 'disputed', 'priced'].includes(k.status))) b.push('takeaway_open');
  if (ps.now.payable > 0) b.push('payable_left');
  return b;
}

// «Пул бердим» yozuvi (oylik yoki avans). Xodim «Pulni oldim» bosguncha hisobga kirmaydi.
export function createPayment(ctx, u, amount, kind, day, from, to) {
  const r = ctx.db.one(`INSERT INTO payments(code,user_id,amount,day,period_from,period_to,method,kind,status,created_by,created_at)
    VALUES(?,?,?,?,?,?,'naqd',?,'pending',?,?) RETURNING id`, 'tmp' + ctx.now + Math.random(), u.id, amount, day, from, to, kind, ctx.me.id, ctx.at);
  const code = 'PUL-' + String(r.id).padStart(4, '0');
  ctx.db.run('UPDATE payments SET code=? WHERE id=?', code, r.id);
  ctx.audit('payment_created', 'payment', r.id, null, { code, user_id: u.id, amount, kind, day, from, to });
  ctx.tell(u, `Rahbar sizga ${fmtSum(amount)} so‘m naqd berganini qayd etdi (${kind === 'avans' ? 'avans' : 'hisob'}${from ? ', ' + from + ' — ' + to : ''}). Ilovada «Pulni oldim» yoki «Tafovut bor» ni bosing.`);
  return { id: r.id, code };
}

export const actions = {
  // ---------- Korxonadan olganlarim ----------
  tk_create: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      if (!TK_KIND[b.kind]) throw new AppError('bad_input', { field: 'kind' });
      const day = needDay(b.day || ctx.day, 'day');
      if (day > ctx.day) throw new AppError('bad_input', { field: 'day' });
      const qty = Number(b.qty);
      if (!(qty > 0 && qty < 100000)) throw new AppError('bad_input', { field: 'qty' });
      const proposed = b.proposed === null || b.proposed === undefined || b.proposed === '' ? null : needInt(b.proposed, 'proposed', 1, 1e9);
      const r = ctx.db.one(`INSERT INTO takeaways(user_id,day,kind,name,qty,unit,note,proposed,status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,'submitted',?,?) RETURNING id`, ctx.me.id, day, b.kind, needText(b.name, 'name', 80), qty,
        optText(b.unit, 20) || 'dona', optText(b.note, 300), proposed, ctx.at, ctx.at);
      ctx.db.run(`INSERT INTO declarations(user_id,period,answer,at) VALUES(?,?,'added',?) ON CONFLICT(user_id,period) DO UPDATE SET answer='added',at=excluded.at`, ctx.me.id, day.slice(0, 7), ctx.at);
      ctx.audit('takeaway_created', 'takeaway', r.id, null, { kind: b.kind, name: b.name, qty, proposed });
      ctx.tellRahbars(`${fullName(ctx.me)} корхонадан олганини ёзди: ${b.name}, ${qty}. Нархини белгиланг.`);
      return { id: r.id };
    },
  },

  declare_none: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const period = String(b.period || ctx.day.slice(0, 7));
      if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError('bad_input', { field: 'period' });
      const has = ctx.db.one("SELECT COUNT(*) n FROM takeaways WHERE user_id=? AND substr(day,1,7)=? AND status<>'cancelled'", ctx.me.id, period).n;
      if (has) throw new AppError('has_takeaways');
      ctx.db.run(`INSERT INTO declarations(user_id,period,answer,at) VALUES(?,?,'none',?) ON CONFLICT(user_id,period) DO UPDATE SET answer='none',at=excluded.at`, ctx.me.id, period, ctx.at);
      return { ok: true };
    },
  },

  tk_list: {
    auth: 'active',
    fn(ctx, b) {
      if (ctx.me.role === 'rahbar') {
        const rows = ctx.db.all(`SELECT t.*, u.first_name, u.last_name FROM takeaways t JOIN users u ON u.id=t.user_id
          ${b.user_id ? 'WHERE t.user_id=?' : ''} ORDER BY (t.status IN('submitted','review','disputed')) DESC, t.id DESC LIMIT 200`, ...(b.user_id ? [Number(b.user_id)] : []));
        return rows.map((k) => ({ ...tkView(ctx, k), uname: fullName(k) }));
      }
      return ctx.db.all('SELECT * FROM takeaways WHERE user_id=? ORDER BY id DESC LIMIT 200', ctx.me.id).map((k) => tkView(ctx, k));
    },
  },

  tk_set: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k || !['submitted', 'review', 'disputed', 'employee'].includes(k.status)) throw new AppError('bad_state');
      const amount = needInt(b.amount, 'amount', 1, 1e10);
      if (!METHOD[b.pay_method]) throw new AppError('bad_input', { field: 'pay_method' });
      const ref = optText(b.stock_ref, 80);
      ctx.db.run("UPDATE takeaways SET amount=?,pay_method=?,stock_ref=?,status='employee',consent_at=NULL,updated_at=? WHERE id=?", amount, b.pay_method, ref, ctx.at, k.id);
      ctx.audit('takeaway_priced', 'takeaway', k.id, { amount: k.amount, pay_method: k.pay_method, status: k.status }, { amount, pay_method: b.pay_method, stock_ref: ref }, optText(b.note));
      ctx.tell(k.user_id, `«${k.name}» uchun rahbar summani belgiladi: ${fmtSum(amount)} so‘m (${METHOD[b.pay_method]}). Ilovada tasdiqlang yoki e’tiroz bildiring.`);
      return { ok: true };
    },
  },

  tk_review: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k || k.status !== 'submitted') return { ok: true };
      ctx.db.run("UPDATE takeaways SET status='review',updated_at=? WHERE id=?", ctx.at, k.id);
      return { ok: true };
    },
  },

  tk_confirm: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k || k.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (k.status === 'agreed') return { ok: true, already: true };
      if (k.status !== 'employee') throw new AppError('bad_state');
      if (k.pay_method === 'payroll' && !b.consent) throw new AppError('need_consent');
      ctx.db.run("UPDATE takeaways SET status='agreed',consent_at=?,updated_at=? WHERE id=?", k.pay_method === 'payroll' ? ctx.at : null, ctx.at, k.id);
      ctx.audit('takeaway_agreed', 'takeaway', k.id, { status: 'employee' }, { status: 'agreed', amount: k.amount, pay_method: k.pay_method, consent: k.pay_method === 'payroll' });
      ctx.tellRahbars(`${fullName(ctx.me)} «${k.name}» бўйича ${fmtSum(k.amount)} сўмни тасдиқлади.`);
      return { ok: true };
    },
  },

  tk_dispute: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k || k.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (k.status !== 'employee') throw new AppError('bad_state');
      const note = needText(b.note, 'note', 300);
      ctx.db.run("UPDATE takeaways SET status='disputed',dispute_note=?,updated_at=? WHERE id=?", note, ctx.at, k.id);
      ctx.audit('takeaway_disputed', 'takeaway', k.id, { status: 'employee' }, { status: 'disputed' }, note);
      ctx.tellRahbars(`${fullName(ctx.me)} «${k.name}» бўйича эътироз билдирди: ${note}`);
      return { ok: true };
    },
  },

  tk_cancel: {
    auth: 'active', mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k) throw new AppError('not_found');
      const reason = optText(b.reason, 300);
      if (ctx.me.role === 'rahbar') {
        if (k.status === 'cancelled') return { ok: true };
        if (!reason) throw new AppError('need_reason');
        if (settled(ctx, k.id) > 0) throw new AppError('has_settlements');
      } else {
        if (k.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
        if (!['submitted', 'review'].includes(k.status)) throw new AppError('bad_state');
      }
      ctx.db.run("UPDATE takeaways SET status='cancelled',updated_at=? WHERE id=?", ctx.at, k.id);
      ctx.audit('takeaway_cancelled', 'takeaway', k.id, { status: k.status }, { status: 'cancelled' }, reason);
      if (ctx.me.role === 'rahbar') ctx.tell(k.user_id, `«${k.name}» yozuvi bekor qilindi. Sabab: ${reason}`);
      return { ok: true };
    },
  },

  // Kelishilgan summani hisoblashish: oylikdan (faqat xodim roziligi bilan) yoki xodim naqd qaytargan bo'lsa.
  tk_settle: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k || k.status !== 'agreed') throw new AppError('bad_state');
      if (k.pay_method === 'prepaid') throw new AppError('already_paid');
      const how = b.how === 'cash' ? 'cash' : 'payroll';
      const remaining = k.amount - settled(ctx, k.id);
      if (remaining <= 0) throw new AppError('already_paid');
      let amount = b.amount == null || b.amount === '' ? remaining : needInt(b.amount, 'amount', 1, 1e10);
      if (amount > remaining) throw new AppError('over_remaining', { remaining });
      if (how === 'payroll') {
        if (k.pay_method !== 'payroll' || !k.consent_at) throw new AppError('need_consent');
        const avail = current(ctx, k.user_id).payable;
        if (avail <= 0) throw new AppError('nothing_available', { available: 0 });
        if (b.amount == null || b.amount === '') amount = Math.min(amount, avail);
        if (amount > avail) throw new AppError('over_available', { available: avail });
      }
      const r = ctx.db.one('INSERT INTO settlements(takeaway_id,user_id,how,amount,day,at,by_id,note) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
        k.id, k.user_id, how, amount, ctx.day, ctx.at, ctx.me.id, optText(b.note));
      ctx.audit('takeaway_settled', 'takeaway', k.id, { remaining }, { how, amount, remaining: remaining - amount }, optText(b.note));
      ctx.tell(k.user_id, `«${k.name}»: ${fmtSum(amount)} so‘m ${how === 'payroll' ? 'oylik hisobidan ushlandi' : 'naqd qaytarilgani qayd etildi'}. Qolgan: ${fmtSum(remaining - amount)} so‘m.`);
      return { id: r.id, amount, remaining: remaining - amount };
    },
  },

  // ---------- To'lovlar ----------
  pay_create: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = employee(ctx, b.user_id);
      const amount = needInt(b.amount, 'amount', 1, 1e11);
      const kind = b.kind === 'avans' ? 'avans' : 'oylik';
      const day = b.day ? needDay(b.day, 'day') : ctx.day;
      if (day > ctx.day) throw new AppError('bad_input', { field: 'day' });
      const from = b.from && isDay(b.from) ? b.from : null, to = b.to && isDay(b.to) ? b.to : null;
      const cur = current(ctx, u.id);
      if (kind === 'oylik' && amount > cur.payable) throw new AppError('over_payable', { payable: cur.payable, pending: cur.pending });
      return createPayment(ctx, u, amount, kind, day, from, to);
    },
  },

  pay_confirm: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM payments WHERE id=?', needInt(b.id, 'id', 1));
      if (!p || p.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (p.status === 'confirmed') return { ok: true, already: true };
      if (!['pending', 'disputed'].includes(p.status)) throw new AppError('bad_state');
      ctx.db.run("UPDATE payments SET status='confirmed',confirmed_at=? WHERE id=?", ctx.at, p.id);
      ctx.audit('payment_confirmed', 'payment', p.id, { status: p.status }, { status: 'confirmed' });
      ctx.tell(p.created_by, `${fullName(ctx.me)} ${fmtSum(p.amount)} сўмни олганини тасдиқлади (${p.code}).`);
      return { ok: true };
    },
  },

  pay_dispute: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM payments WHERE id=?', needInt(b.id, 'id', 1));
      if (!p || p.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (p.status !== 'pending') throw new AppError('bad_state');
      const note = needText(b.note, 'note', 300);
      const got = b.amount === undefined || b.amount === null || b.amount === '' ? null : needInt(b.amount, 'amount', 0, 1e11);
      ctx.db.run("UPDATE payments SET status='disputed',dispute_note=?,dispute_amount=? WHERE id=?", note, got, p.id);
      ctx.audit('payment_disputed', 'payment', p.id, { status: 'pending' }, { status: 'disputed', got }, note);
      ctx.tell(p.created_by, `${fullName(ctx.me)} ${p.code} бўйича тафовут ёзди${got != null ? ' (олдим: ' + fmtSum(got) + ' сўм)' : ''}: ${note}`);
      return { ok: true };
    },
  },

  pay_cancel: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM payments WHERE id=?', needInt(b.id, 'id', 1));
      if (!p || !['pending', 'disputed'].includes(p.status)) throw new AppError('bad_state');
      const reason = needText(b.reason, 'reason', 300);
      ctx.db.run("UPDATE payments SET status='cancelled',cancel_reason=? WHERE id=?", reason, p.id);
      ctx.audit('payment_cancelled', 'payment', p.id, { status: p.status }, { status: 'cancelled' }, reason);
      ctx.tell(p.user_id, `${p.code} (${fmtSum(p.amount)} so‘m) yozuvi bekor qilindi. Sabab: ${reason}`);
      return { ok: true };
    },
  },

  // Tasdiqlangan to'lovni bekor qilish faqat xodimning qayta tasdig'i bilan
  pay_reverse: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM payments WHERE id=?', needInt(b.id, 'id', 1));
      if (!p || p.status !== 'confirmed') throw new AppError('bad_state');
      const reason = needText(b.reason, 'reason', 300);
      ctx.db.run("UPDATE payments SET status='reverse_pending',reverse_reason=? WHERE id=?", reason, p.id);
      ctx.audit('payment_reverse_requested', 'payment', p.id, { status: 'confirmed' }, { status: 'reverse_pending' }, reason);
      ctx.tell(p.user_id, `Rahbar ${p.code} (${fmtSum(p.amount)} so‘m) to‘lovini bekor qilishni so‘radi. Sabab: ${reason}. Ilovada javob bering.`);
      return { ok: true };
    },
  },

  pay_reverse_answer: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM payments WHERE id=?', needInt(b.id, 'id', 1));
      if (!p || p.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (p.status !== 'reverse_pending') throw new AppError('bad_state');
      const st = b.agree ? 'reversed' : 'confirmed';
      ctx.db.run('UPDATE payments SET status=? WHERE id=?', st, p.id);
      ctx.audit(b.agree ? 'payment_reversed' : 'payment_reverse_refused', 'payment', p.id, { status: 'reverse_pending' }, { status: st });
      ctx.tell(p.created_by, `${fullName(ctx.me)} ${p.code} бекор қилишга ${b.agree ? 'рози бўлди' : 'рози бўлмади'}.`);
      return { ok: true };
    },
  },

  // Boshlang'ich avans/qarz yoki tuzatish — faqat sabab, audit va xodim tasdig'i bilan hisobga kiradi
  adj_create: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = employee(ctx, b.user_id);
      const amount = needInt(b.amount, 'amount', -1e11, 1e11);
      if (amount === 0) throw new AppError('bad_input', { field: 'amount' });
      const kind = ['opening', 'correction'].includes(b.kind) ? b.kind : 'correction';
      const reason = needText(b.reason, 'reason', 300);
      const r = ctx.db.one(`INSERT INTO adjustments(user_id,amount,kind,reason,status,day,created_by,created_at) VALUES(?,?,?,?,'pending',?,?,?) RETURNING id`,
        u.id, amount, kind, reason, ctx.day, ctx.me.id, ctx.at);
      ctx.audit('adjustment_created', 'adjustment', r.id, null, { user_id: u.id, amount, kind }, reason);
      ctx.tell(u, `Rahbar hisobingizga ${amount > 0 ? 'qo‘shish' : 'ayirish'} kiritdi: ${fmtSum(Math.abs(amount))} so‘m. Sabab: ${reason}. Ilovada tasdiqlang yoki e’tiroz bildiring.`);
      return { id: r.id };
    },
  },

  adj_answer: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const a = ctx.db.one('SELECT * FROM adjustments WHERE id=?', needInt(b.id, 'id', 1));
      if (!a || a.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (a.status === 'confirmed') return { ok: true, already: true };
      if (!['pending', 'disputed'].includes(a.status)) throw new AppError('bad_state');
      if (b.agree) {
        ctx.db.run("UPDATE adjustments SET status='confirmed',decided_at=? WHERE id=?", ctx.at, a.id);
      } else {
        const note = needText(b.note, 'note', 300);
        ctx.db.run("UPDATE adjustments SET status='disputed',dispute_note=?,decided_at=? WHERE id=?", note, ctx.at, a.id);
      }
      ctx.audit(b.agree ? 'adjustment_confirmed' : 'adjustment_disputed', 'adjustment', a.id, { status: a.status }, { status: b.agree ? 'confirmed' : 'disputed' }, b.note || null);
      ctx.tell(a.created_by, `${fullName(ctx.me)} ҳисоб тузатишига ${b.agree ? 'рози бўлди' : 'эътироз билдирди'}.`);
      return { ok: true };
    },
  },

  adj_cancel: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const a = ctx.db.one('SELECT * FROM adjustments WHERE id=?', needInt(b.id, 'id', 1));
      if (!a || !['pending', 'disputed'].includes(a.status)) throw new AppError('bad_state');
      const reason = needText(b.reason, 'reason', 300);
      ctx.db.run("UPDATE adjustments SET status='cancelled' WHERE id=?", a.id);
      ctx.audit('adjustment_cancelled', 'adjustment', a.id, { status: a.status }, { status: 'cancelled' }, reason);
      return { ok: true };
    },
  },

  // ---------- Oylik varaqasi ----------
  payslip: {
    auth: 'active',
    fn(ctx, b) {
      const uid = ownOrRahbar(ctx, b.user_id);
      const from = needDay(b.from, 'from'), to = needDay(b.to, 'to');
      if (from > to) throw new AppError('bad_input', { field: 'from' });
      const ps = payslip(ctx, uid, from, to);
      ps.blockers = blockers(ps);
      return ps;
    },
  },

  // Xodimning javob kutayotgan pul ishlari (bosh ekran uchun)
  my_money: {
    auth: ['bichuvchi', 'tikuvchi'],
    fn(ctx) {
      const me = ctx.me.id;
      const period = ctx.day.slice(0, 7);
      return {
        payments: ctx.db.all("SELECT * FROM payments WHERE user_id=? AND status IN('pending','reverse_pending') ORDER BY id", me),
        adjustments: ctx.db.all("SELECT * FROM adjustments WHERE user_id=? AND status='pending' ORDER BY id", me),
        takeaways: ctx.db.all("SELECT * FROM takeaways WHERE user_id=? AND status='employee' ORDER BY id", me),
        declaration: (ctx.db.one('SELECT answer FROM declarations WHERE user_id=? AND period=?', me, period) || {}).answer || null,
        period, now: current(ctx, me),
        rk: ctx.db.one("SELECT id, period, total FROM reckonings WHERE user_id=? AND status='sent' ORDER BY id DESC LIMIT 1", me) || null,
        avans: ctx.db.one("SELECT * FROM avans_req WHERE user_id=? AND status='pending'", me) || null,
      };
    },
  },

  money_summary: {
    auth: 'rahbar',
    fn(ctx) {
      const users = ctx.db.all("SELECT * FROM users WHERE role IN('bichuvchi','tikuvchi') AND status IN('active','inactive') ORDER BY status, first_name");
      return users.map((u) => ({ id: u.id, name: fullName(u), role: u.role, status: u.status, ...current(ctx, u.id),
        missing: ctx.db.one('SELECT COUNT(*) n FROM earnings WHERE user_id=? AND amount IS NULL', u.id).n,
        avans: ctx.db.one("SELECT amount FROM avans_req WHERE user_id=? AND status='pending'", u.id)?.amount || 0,
        rk: ctx.db.one('SELECT status, period, total FROM reckonings WHERE user_id=? ORDER BY id DESC LIMIT 1', u.id) || null,
        open: ctx.db.one("SELECT (SELECT COUNT(*) FROM payments WHERE user_id=? AND status IN('pending','disputed','reverse_pending')) + (SELECT COUNT(*) FROM takeaways WHERE user_id=? AND status IN('submitted','review','disputed','employee')) n", u.id, u.id).n }))
        .filter((r) => r.status === 'active' || r.balance !== 0 || r.debt || r.pending);
    },
  },

  period_close: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = employee(ctx, b.user_id);
      const from = needDay(b.from, 'from'), to = needDay(b.to, 'to');
      const ps = payslip(ctx, u.id, from, to);
      const bl = blockers(ps);
      if (bl.length) throw new AppError('cannot_close', { blockers: bl });
      ctx.db.run('INSERT INTO closures(user_id,period_from,period_to,at,by_id) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING', u.id, from, to, ctx.at, ctx.me.id);
      ctx.audit('period_closed', 'user', u.id, null, { from, to, earned: ps.earned, paid: ps.paidConfirmed, ded: ps.ded });
      return { ok: true };
    },
  },
};
