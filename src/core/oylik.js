// Xodimning oylik jarayoni: «Olganlarim» tez ro'yxati, «Avans so'rash» va oy oxiridagi «Oylik hisob».
// Oqim: xodim yozadi → rahbar narx qo'yadi / avans beradi → rahbar hisobni yuboradi → xodim tasdiqlaydi → «Пул бердим».
import { AppError, needInt, needText, optText, fullName, fmtSum, addDays } from './base.js';
import { payslip, employee, createPayment, settled } from './money.js';
import { attachPhoto } from './photos.js';
import { cashHeld } from './orders.js';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

function periodOf(ctx, p) {
  const period = p ? String(p) : ctx.day.slice(0, 7);
  if (!PERIOD.test(period)) throw new AppError('bad_input', { field: 'period' });
  const from = period + '-01';
  const [y, m] = period.split('-').map(Number);
  const end = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  if (from > ctx.day) throw new AppError('bad_input', { field: 'period' });
  return { period, from, to: end < ctx.day ? end : ctx.day };
}

function whose(ctx, uid) {
  if (ctx.me.role === 'rahbar') return employee(ctx, uid).id;
  if (uid && Number(uid) !== ctx.me.id) throw new AppError('forbidden', {}, 403);
  return ctx.me.id;
}

// Hisobni hozirgi ma'lumotdan hisoblash (saqlamaydi)
export function compute(ctx, uid, p) {
  const { period, from, to } = periodOf(ctx, p);
  const ps = payslip(ctx, uid, from, to);
  const inPeriod = (x) => x.day >= from && x.day <= to;
  const conf = ps.payments.filter((x) => ['confirmed', 'reverse_pending'].includes(x.status) && inPeriod(x));
  const avans = conf.filter((x) => x.kind === 'avans').map((x) => ({ id: x.id, code: x.code, day: x.day, amount: x.amount }));
  const given = conf.filter((x) => x.kind !== 'avans').map((x) => ({ id: x.id, code: x.code, day: x.day, amount: x.amount }));
  const items = ctx.db.all("SELECT id,name,day,amount,photo_id FROM takeaways WHERE user_id=? AND status='priced' AND day<=? ORDER BY day,id", uid, to);
  const unpriced = ctx.db.all("SELECT id,name,day,photo_id FROM takeaways WHERE user_id=? AND status IN('submitted','review') AND day<=? ORDER BY day,id", uid, to);
  const prepaid = ctx.db.all("SELECT id,name,day,amount,photo_id FROM takeaways WHERE user_id=? AND status='agreed' AND pay_method='prepaid' AND day BETWEEN ? AND ? ORDER BY day,id", uid, from, to);
  const sum = (a) => a.reduce((s, x) => s + (x.amount || 0), 0);
  const itemsSum = sum(items);
  const blockers = [];
  if (ps.missingQty) blockers.push('missing_rate');
  if (unpriced.length) blockers.push('unpriced');
  if (ps.payments.some((x) => ['pending', 'disputed', 'reverse_pending'].includes(x.status))) blockers.push('payment_open');
  if (ps.adjustments.some((a) => ['pending', 'disputed'].includes(a.status))) blockers.push('adjustment_open');
  if (ctx.db.one("SELECT COUNT(*) n FROM takeaways WHERE user_id=? AND status IN('disputed','employee')", uid).n) blockers.push('takeaway_open');
  // Mijozlardan olingan, rahbarga hali topshirilmagan pul (buyurtmalar) — tasdiqlansa oylikdan ushlanadi
  const cash = cashHeld(ctx, uid);
  if (cash.pending) blockers.push('cash_open');
  const total = ps.opening + ps.earned + ps.adjConfirmed - ps.paidConfirmed - ps.ded - itemsSum - cash.held;
  return {
    user: ps.user, period, from, to, groups: ps.groups, earned: ps.earned, missingQty: ps.missingQty, opening: ps.opening,
    adj: ps.adjConfirmed, avans, avansSum: sum(avans), given, givenSum: sum(given), prevDed: ps.ded,
    items, itemsSum, unpriced, prepaid, cashHeld: cash.held, total, blockers,
  };
}

const sig = (c) => JSON.stringify([c.total, c.items.map((i) => [i.id, i.amount]), c.cashHeld || 0]);

function openRk(ctx, uid) {
  return ctx.db.one("SELECT * FROM reckonings WHERE user_id=? AND status IN('sent','disputed') ORDER BY id DESC LIMIT 1", uid);
}

export const actions = {
  // ---------- Olganlarim: tez ro'yxat ----------
  tk_add: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const name = needText(b.name, 'name', 120);
      const photo = b.photo_id ? attachPhoto(ctx, b.photo_id) : null;
      // Rahbarga bitta xabar: ketma-ket yozilgan ro'yxat uchun har qatorda emas
      const recent = ctx.db.one("SELECT COUNT(*) n FROM takeaways WHERE user_id=? AND status='submitted' AND created_at>?", ctx.me.id,
        new Date(ctx.now - 30 * 60000).toISOString()).n;
      const r = ctx.db.one(`INSERT INTO takeaways(user_id,day,kind,name,qty,unit,status,photo_id,created_at,updated_at)
        VALUES(?,?,'material',?,1,'','submitted',?,?,?) RETURNING id`, ctx.me.id, ctx.day, name, photo, ctx.at, ctx.at);
      ctx.db.run(`INSERT INTO declarations(user_id,period,answer,at) VALUES(?,?,'added',?) ON CONFLICT(user_id,period) DO UPDATE SET answer='added',at=excluded.at`, ctx.me.id, ctx.day.slice(0, 7), ctx.at);
      ctx.audit('takeaway_created', 'takeaway', r.id, null, { name, photo: !!photo });
      if (!recent) ctx.tellRahbars(`${fullName(ctx.me)} корхонадан олганларини ёзмоқда: ${name}${photo ? ' (расм билан)' : ''}. Нарх қўйиш: Пул → Олинганлар.`);
      return { id: r.id };
    },
  },

  // Rahbar narx qo'yadi. «Pul alohida to'langan» bo'lsa oylikdan ushlanmaydi.
  tk_price: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', needInt(b.id, 'id', 1));
      if (!k || !['submitted', 'review', 'priced', 'disputed', 'employee'].includes(k.status)) throw new AppError('bad_state');
      if (settled(ctx, k.id) > 0) throw new AppError('bad_state');
      const amount = needInt(b.amount, 'amount', 0, 1e10);
      const prepaid = !!b.prepaid;
      ctx.db.run('UPDATE takeaways SET amount=?,pay_method=?,status=?,updated_at=? WHERE id=?',
        amount, prepaid ? 'prepaid' : 'payroll', prepaid ? 'agreed' : 'priced', ctx.at, k.id);
      ctx.audit('takeaway_priced', 'takeaway', k.id, { amount: k.amount, status: k.status }, { amount, pay_method: prepaid ? 'prepaid' : 'payroll' });
      return { ok: true };
    },
  },

  // ---------- Avans so'rash ----------
  av_request: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const amount = needInt(b.amount, 'amount', 1000, 1e10);
      if (ctx.db.one("SELECT id FROM avans_req WHERE user_id=? AND status='pending'", ctx.me.id)) throw new AppError('avans_pending');
      const note = optText(b.note, 200);
      const r = ctx.db.one("INSERT INTO avans_req(user_id,amount,note,status,created_at) VALUES(?,?,?,'pending',?) RETURNING id", ctx.me.id, amount, note, ctx.at);
      ctx.audit('avans_requested', 'avans', r.id, null, { amount }, note);
      ctx.tellRahbars(`${fullName(ctx.me)} ${fmtSum(amount)} сўм аванс сўради${note ? ': «' + note + '»' : ''}. Жавоб: Пул бўлими.`);
      return { id: r.id };
    },
  },

  av_cancel: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const a = ctx.db.one('SELECT * FROM avans_req WHERE id=?', needInt(b.id, 'id', 1));
      if (!a || a.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (a.status !== 'pending') return { ok: true };
      ctx.db.run("UPDATE avans_req SET status='cancelled',decided_at=? WHERE id=?", ctx.at, a.id);
      ctx.audit('avans_cancelled', 'avans', a.id, { status: 'pending' }, { status: 'cancelled' });
      return { ok: true };
    },
  },

  // Rahbar: berdi (summasini o'zgartirishi mumkin) yoki rad etdi. Berilsa — «Пул бердим» yozuvi, xodim «Pulni oldim» bosadi.
  av_decide: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const a = ctx.db.one('SELECT * FROM avans_req WHERE id=?', needInt(b.id, 'id', 1));
      if (!a || a.status !== 'pending') throw new AppError('bad_state');
      const u = employee(ctx, a.user_id);
      if (b.give) {
        const amount = b.amount == null || b.amount === '' ? a.amount : needInt(b.amount, 'amount', 1, 1e10);
        const p = createPayment(ctx, u, amount, 'avans', ctx.day, null, null);
        ctx.db.run("UPDATE avans_req SET status='given',decided_at=?,decided_by=?,payment_id=? WHERE id=?", ctx.at, ctx.me.id, p.id, a.id);
        ctx.audit('avans_given', 'avans', a.id, { status: 'pending', amount: a.amount }, { status: 'given', amount, payment: p.code });
        return { ok: true, payment_id: p.id };
      }
      const note = optText(b.note, 200);
      ctx.db.run("UPDATE avans_req SET status='declined',decided_at=?,decided_by=?,answer_note=? WHERE id=?", ctx.at, ctx.me.id, note, a.id);
      ctx.audit('avans_declined', 'avans', a.id, { status: 'pending' }, { status: 'declined' }, note);
      ctx.tell(u, `Avans so‘rovingiz (${fmtSum(a.amount)} so‘m) hozircha rad etildi${note ? ': ' + note : ''}.`);
      return { ok: true };
    },
  },

  av_list: {
    auth: 'active',
    fn(ctx, b) {
      if (ctx.me.role === 'rahbar') {
        return ctx.db.all(`SELECT a.*, u.first_name, u.last_name FROM avans_req a JOIN users u ON u.id=a.user_id
          ${b.user_id ? 'WHERE a.user_id=?' : ''} ORDER BY (a.status='pending') DESC, a.id DESC LIMIT 100`, ...(b.user_id ? [Number(b.user_id)] : []))
          .map((a) => ({ ...a, name: fullName(a) }));
      }
      return ctx.db.all('SELECT * FROM avans_req WHERE user_id=? ORDER BY id DESC LIMIT 30', ctx.me.id);
    },
  },

  // ---------- Oylik hisob ----------
  rk_view: {
    auth: 'active',
    fn(ctx, b) {
      const uid = whose(ctx, b.user_id);
      const live = compute(ctx, uid, b.period);
      const rk = ctx.db.one('SELECT * FROM reckonings WHERE user_id=? AND period=? ORDER BY id DESC LIMIT 1', uid, live.period);
      const open = openRk(ctx, uid);
      const view = (r) => r && { id: r.id, period: r.period, status: r.status, total: r.total, created_at: r.created_at, answered_at: r.answered_at,
        dispute_note: r.dispute_note, data: JSON.parse(r.data), stale: r.status === 'sent' && r.period === live.period && sig(JSON.parse(r.data)) !== sig(live) };
      return { live, rk: view(rk), open: open && open.period !== live.period ? view(open) : null };
    },
  },

  rk_send: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = employee(ctx, b.user_id);
      const c = compute(ctx, u.id, b.period);
      if (c.blockers.length) throw new AppError('cannot_send', { blockers: c.blockers });
      ctx.db.run("UPDATE reckonings SET status='replaced' WHERE user_id=? AND status IN('sent','disputed')", u.id);
      const r = ctx.db.one(`INSERT INTO reckonings(user_id,period,from_day,to_day,data,total,status,created_by,created_at)
        VALUES(?,?,?,?,?,?,'sent',?,?) RETURNING id`, u.id, c.period, c.from, c.to, JSON.stringify(c), c.total, ctx.me.id, ctx.at);
      ctx.audit('reckoning_sent', 'user', u.id, null, { period: c.period, total: c.total, items: c.items.length });
      ctx.tell(u, `Rahbar ${c.period} oyi hisobini yubordi: ${c.total >= 0 ? 'qo‘lingizga tegadi ' + fmtSum(c.total) : 'qarzingiz ' + fmtSum(-c.total)} so‘m. Ilovada «Mening hisobim» bo‘limida tekshirib, tasdiqlang.`);
      return { id: r.id, total: c.total };
    },
  },

  rk_answer: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const r = ctx.db.one('SELECT * FROM reckonings WHERE id=?', needInt(b.id, 'id', 1));
      if (!r || r.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (r.status === 'confirmed') return { ok: true, already: true };
      if (r.status !== 'sent') throw new AppError('bad_state');
      const name = fullName(ctx.me);
      if (!b.agree) {
        const note = needText(b.note, 'note', 300);
        ctx.db.run("UPDATE reckonings SET status='disputed',dispute_note=?,answered_at=? WHERE id=?", note, ctx.at, r.id);
        ctx.audit('reckoning_disputed', 'user', ctx.me.id, null, { period: r.period }, note);
        ctx.tellRahbars(`${name} ${r.period} ҳисобига эътироз билдирди: «${note}»`);
        return { ok: true };
      }
      const data = JSON.parse(r.data);
      const live = compute(ctx, ctx.me.id, r.period);
      if (sig(live) !== sig(data)) {
        // Yuborilgandan keyin nimadir o'zgargan — eski hisob tasdiqlanmaydi, rahbar yangisini yuboradi
        ctx.db.run("UPDATE reckonings SET status='stale',answered_at=? WHERE id=?", ctx.at, r.id);
        ctx.tellRahbars(`${name} ${r.period} ҳисобини очди, лекин ундан кейин маълумот ўзгарган. Ҳисобни қайта юборинг.`);
        return { ok: false, stale: true };
      }
      for (const it of data.items) {
        const k = ctx.db.one('SELECT * FROM takeaways WHERE id=?', it.id);
        if (!k || k.status !== 'priced' || k.amount !== it.amount) throw new AppError('bad_state');
        ctx.db.run("UPDATE takeaways SET status='agreed',pay_method='payroll',consent_at=?,updated_at=? WHERE id=?", ctx.at, ctx.at, k.id);
        if (k.amount > 0) {
          ctx.db.run('INSERT INTO settlements(takeaway_id,user_id,how,amount,day,at,by_id,note) VALUES(?,?,?,?,?,?,?,?)',
            k.id, ctx.me.id, 'payroll', k.amount, r.to_day, ctx.at, ctx.me.id, 'oylik hisob ' + r.period);
        }
      }
      if (data.cashHeld > 0) {
        ctx.db.run("INSERT INTO cash_handovers(user_id,amount,how,status,day,note,created_at,decided_at) VALUES(?,?,'payroll','confirmed',?,?,?,?)",
          ctx.me.id, data.cashHeld, r.to_day, 'oylik hisob ' + r.period, ctx.at, ctx.at);
      }
      ctx.db.run("UPDATE reckonings SET status='confirmed',answered_at=? WHERE id=?", ctx.at, r.id);
      ctx.audit('reckoning_confirmed', 'user', ctx.me.id, null, { period: r.period, total: r.total, items: data.items.length });
      ctx.tellRahbars(`${name} ${r.period} ҳисобини тасдиқлади. ${r.total >= 0 ? 'Қўлига берилади: ' + fmtSum(r.total) : 'Қарзи: ' + fmtSum(-r.total)} сўм.`);
      return { ok: true };
    },
  },
};
