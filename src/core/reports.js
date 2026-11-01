// Rahbar hisobotlari: bosh ekran, ishlab chiqarish oqimi va davr oxiri qoldig'i, «qoldiq kimda», tug'ilgan kun eslatmalari.
import { leaveOn } from './murojaat.js';
import { AppError, needDay, addDays, COUNTED, STATES, fullName, lineLabel, fmtSum } from './base.js';
import { metrics } from './attendance.js';

function filterSql(b) {
  const w = [], p = [];
  if (b.batch_id) { w.push('l.batch_id=?'); p.push(Number(b.batch_id)); }
  if (b.model) { w.push('lower(bt.model)=lower(?)'); p.push(String(b.model)); }
  if (b.type_id) { w.push('bt.type_id=?'); p.push(Number(b.type_id)); }
  return { w, p };
}

function balancesAsOf(ctx, day, b, holder) {
  const f = filterSql(b);
  const hw = holder ? ' AND m.to_holder=?' : '', hw2 = holder ? ' AND m.from_holder=?' : '';
  const where = f.w.length ? ' AND ' + f.w.join(' AND ') : '';
  const q = (side, hwx) => `SELECT m.${side}_state st, SUM(m.qty) q FROM moves m JOIN lines l ON l.id=m.line_id JOIN batches bt ON bt.id=l.batch_id
    WHERE m.${side}_state IS NOT NULL AND m.day<=?${hwx}${where} GROUP BY m.${side}_state`;
  const out = {};
  for (const k of Object.keys(STATES)) out[k] = 0;
  for (const r of ctx.db.all(q('to', hw), day, ...(holder ? [holder] : []), ...f.p)) out[r.st] += r.q;
  for (const r of ctx.db.all(q('from', hw2), day, ...(holder ? [holder] : []), ...f.p)) out[r.st] -= r.q;
  return out;
}

function flows(ctx, from, to, b) {
  const f = filterSql(b);
  const w = ['m.day BETWEEN ? AND ?', ...f.w];
  const p = [from, to, ...f.p];
  if (b.user_id) { w.push('(m.actor_id=? OR m.to_holder=? OR m.from_holder=?)'); p.push(Number(b.user_id), Number(b.user_id), Number(b.user_id)); }
  const rows = ctx.db.all(`SELECT m.kind, SUM(m.qty) q FROM moves m JOIN lines l ON l.id=m.line_id JOIN batches bt ON bt.id=l.batch_id
    WHERE ${w.join(' AND ')} GROUP BY m.kind`, ...p);
  return Object.fromEntries(rows.map((r) => [r.kind, r.q]));
}

export const actions = {
  r_home: {
    auth: 'rahbar',
    fn(ctx) {
      const day = ctx.day;
      const s = Object.fromEntries(ctx.db.all('SELECT k,v FROM settings').map((r) => [r.k, r.v]));
      const staff = ctx.db.all("SELECT id,first_name,last_name,role FROM users WHERE role IN('bichuvchi','tikuvchi') AND status='active' AND remote=0");
      const remoteN = ctx.db.one("SELECT COUNT(*) n FROM users WHERE role IN('bichuvchi','tikuvchi') AND status='active' AND remote=1").n;
      const att = ctx.db.all('SELECT * FROM attendance WHERE day=?', day).map((r) => ({ ...metrics(r, s, day), user_id: r.user_id }));
      const yNoOut = ctx.db.one('SELECT COUNT(*) n FROM attendance WHERE day=? AND in_at IS NOT NULL AND out_at IS NULL', addDays(day, -1)).n;
      const onLeave = leaveOn(ctx, day);
      const f = flows(ctx, day, day, {});
      const bal = balancesAsOf(ctx, '9999-12-31', {});
      const month = day.slice(0, 7);
      const n = (q, ...p) => ctx.db.one(q, ...p).n;
      return {
        day, geo_set: !!(s.lat && s.lng),
        att: { staff: staff.length, remote: remoteN, came: att.filter((a) => a.in).length, left: att.filter((a) => a.out).length,
          late: att.filter((a) => a.late > 0).length, working: att.filter((a) => a.status === 'working').length, yesterday_no_out: yNoOut,
          absent: staff.filter((u) => !onLeave.includes(u.id) && !att.find((a) => a.user_id === u.id && a.in)).map((u) => fullName(u)),
          leave: staff.filter((u) => onLeave.includes(u.id)).map((u) => fullName(u)) },
        today: { ready: (f.cut_ready || 0) + (f.partial_done || 0), partial: f.cut_partial || 0, given: f.transfer_reserve || 0,
          submitted: f.submit || 0, accepted: f.accept || 0 },
        bal,
        todo: {
          requests: n("SELECT COUNT(*) n FROM users WHERE status='pending'"),
          att_exc: n("SELECT COUNT(*) n FROM att_exc WHERE status='pending'"),
          disputes: n("SELECT COUNT(*) n FROM transfers WHERE status='disputed'"),
          inspect: n('SELECT COUNT(*) n FROM submissions WHERE open_qty>0'),
          takeaways: n("SELECT COUNT(*) n FROM takeaways WHERE status IN('submitted','review','disputed')"),
          payments: n("SELECT COUNT(*) n FROM payments WHERE status IN('disputed')"),
          missing_rate: n('SELECT COUNT(*) n FROM earnings WHERE amount IS NULL'),
          avans: n("SELECT COUNT(*) n FROM avans_req WHERE status='pending'"),
          ord_overdue: n("SELECT COUNT(*) n FROM orders WHERE status IN('new','cut','given','sewing','sewn','fixing') AND due_day<?", day),
          ord_price: n("SELECT COUNT(*) n FROM orders WHERE status NOT IN('cancelled','closed') AND price_ok=0"),
          ord_left: n("SELECT COUNT(*) n FROM orders WHERE status='abandoned'"),
          mj: n("SELECT COUNT(*) n FROM appeals WHERE status='open'"),
          cash: n("SELECT COUNT(*) n FROM cash_handovers WHERE status='pending'"),
          rk: n("SELECT COUNT(*) n FROM reckonings WHERE status IN('disputed','stale') AND id IN (SELECT MAX(id) FROM reckonings GROUP BY user_id)"),
        },
        money: {
          earned_month: ctx.db.one("SELECT COALESCE(SUM(amount),0) n FROM earnings WHERE substr(day,1,7)=?", month).n,
          paid_month: ctx.db.one("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status IN('confirmed','reverse_pending') AND substr(day,1,7)=?", month).n,
          pending: ctx.db.one("SELECT COALESCE(SUM(amount),0) n FROM payments WHERE status IN('pending','disputed')").n,
        },
      };
    },
  },

  prod_report: {
    auth: 'rahbar',
    fn(ctx, b) {
      const from = needDay(b.from, 'from'), to = needDay(b.to, 'to');
      if (from > to) throw new AppError('bad_input', { field: 'from' });
      const holder = b.user_id ? Number(b.user_id) : null;
      const fl = flows(ctx, from, to, b);
      const start = balancesAsOf(ctx, addDays(from, -1), b, holder);
      const end = balancesAsOf(ctx, to, b, holder);
      // Hisob tenglamasi (filtr faqat partiya/model bo'yicha bo'lganda to'liq ma'noga ega)
      const sumC = (o) => COUNTED.reduce((a, k) => a + o[k], 0);
      const newReady = (fl.cut_ready || 0) + (fl.partial_done || 0) + (fl.opening || 0);
      const eq = holder ? null : { start: sumC(start), newReady, end: sumC(end), ok: sumC(start) + newReady === sumC(end) };
      // Partiya/model bo'yicha jadval
      const f = filterSql(b);
      const byBatch = ctx.db.all(`SELECT bt.id, bt.code, bt.model, bt.material, bt.color, c.name type_name,
          SUM(CASE WHEN m.kind IN('cut_ready','partial_done') THEN m.qty ELSE 0 END) ready,
          SUM(CASE WHEN m.kind='cut_partial' THEN m.qty ELSE 0 END) partial,
          SUM(CASE WHEN m.kind='transfer_accept' THEN m.qty ELSE 0 END) given,
          SUM(CASE WHEN m.kind='submit' THEN m.qty ELSE 0 END) submitted,
          SUM(CASE WHEN m.kind='accept' THEN m.qty ELSE 0 END) accepted,
          SUM(CASE WHEN m.kind='writeoff' THEN m.qty ELSE 0 END) writeoff
        FROM moves m JOIN lines l ON l.id=m.line_id JOIN batches bt ON bt.id=l.batch_id LEFT JOIN catalog c ON c.id=bt.type_id
        WHERE m.day BETWEEN ? AND ?${f.w.length ? ' AND ' + f.w.join(' AND ') : ''}${holder ? ' AND (m.actor_id=? OR m.to_holder=? OR m.from_holder=?)' : ''}
        GROUP BY bt.id ORDER BY bt.id DESC LIMIT 200`, from, to, ...f.p, ...(holder ? [holder, holder, holder] : []));
      // Xodimlar bo'yicha
      const byUser = ctx.db.all(`SELECT u.id, u.first_name, u.last_name, u.role,
          (SELECT COALESCE(SUM(qty),0) FROM moves WHERE actor_id=u.id AND kind IN('cut_ready','partial_done') AND day BETWEEN ? AND ?) cut,
          (SELECT COALESCE(SUM(qty),0) FROM moves WHERE actor_id=u.id AND kind='cut_partial' AND day BETWEEN ? AND ?) partial,
          (SELECT COALESCE(SUM(qty),0) FROM moves WHERE to_holder=u.id AND kind='transfer_accept' AND day BETWEEN ? AND ?) received,
          (SELECT COALESCE(SUM(qty),0) FROM moves WHERE to_holder=u.id AND kind='submit' AND day BETWEEN ? AND ?) submitted,
          (SELECT COALESCE(SUM(qty),0) FROM moves WHERE to_holder=u.id AND kind='accept' AND day BETWEEN ? AND ?) accepted,
          (SELECT COALESCE(SUM(amount),0) FROM earnings WHERE user_id=u.id AND day BETWEEN ? AND ?) earned
        FROM users u WHERE u.role IN('bichuvchi','tikuvchi') AND u.status IN('active','inactive')${holder ? ' AND u.id=?' : ''} ORDER BY u.role, u.first_name`,
        from, to, from, to, from, to, from, to, from, to, from, to, ...(holder ? [holder] : []));
      return { from, to, flows: fl, start, end, eq, byBatch, byUser: byUser.map((u) => ({ ...u, name: fullName(u) })) };
    },
  },

  // Har bir qoldiq hozir kimda, qaysi partiya va razmerda
  where_report: {
    auth: 'rahbar',
    fn(ctx, b) {
      const f = filterSql(b);
      const rows = ctx.db.all(`SELECT bal.*, u.first_name, u.last_name FROM bal JOIN lines l ON l.id=bal.line_id JOIN batches bt ON bt.id=l.batch_id
        LEFT JOIN users u ON u.id=bal.holder WHERE bal.qty>0 AND bal.state<>'accepted' AND bal.state<>'writeoff'${f.w.length ? ' AND ' + f.w.join(' AND ') : ''}
        ${b.user_id ? ' AND bal.holder=?' : ''} ORDER BY bal.state, u.first_name`, ...f.p, ...(b.user_id ? [Number(b.user_id)] : []));
      return rows.map((r) => { const li = ctx.lineInfo(r.line_id); return { state: r.state, holder: r.holder, name: r.holder ? fullName(r) : null, qty: r.qty, label: lineLabel(li), line_id: r.line_id, batch_id: li.batch_id }; });
    },
  },

  batches_all: {
    auth: 'rahbar',
    fn(ctx) {
      return ctx.db.all(`SELECT bt.id, bt.code, bt.day, bt.model, bt.material, bt.color, bt.opening, c.name type_name, u.first_name, u.last_name
        FROM batches bt LEFT JOIN catalog c ON c.id=bt.type_id LEFT JOIN users u ON u.id=bt.cutter_id ORDER BY bt.id DESC LIMIT 300`)
        .map((r) => ({ ...r, cutter: r.first_name ? fullName(r) : null }));
    },
  },
};

// Tug'ilgan kun eslatmasi: ikki kun oldin va o'sha kuni, faqat rahbarlarga, har xodim/sana uchun bir marta.
export function birthdayTick(ctx) {
  const today = ctx.day, in2 = addDays(today, 2);
  const md = (d) => d.slice(5);
  const sent = [];
  for (const u of ctx.db.all("SELECT * FROM users WHERE status='active' AND birth_date IS NOT NULL")) {
    const b = md(u.birth_date);
    const match = (d) => b === md(d) || (b === '02-29' && md(d) === '02-28' && Number(d.slice(0, 4)) % 4 !== 0);
    for (const [d, kind] of [[today, 'today'], [in2, 'soon']]) {
      if (!match(d)) continue;
      const key = `${d.slice(0, 4)}-${kind}`;
      const ex = ctx.db.one('SELECT 1 x FROM reminders WHERE user_id=? AND key=?', u.id, key);
      if (ex) continue;
      ctx.db.run('INSERT INTO reminders(user_id,key,at) VALUES(?,?,?)', u.id, key, ctx.at);
      ctx.tellRahbars(kind === 'today' ? `🎂 Бугун ${fullName(u)}нинг туғилган куни.` : `🎂 Икки кундан кейин (${d}) ${fullName(u)}нинг туғилган куни.`);
      sent.push({ user_id: u.id, kind });
    }
  }
  return sent;
}
export { fmtSum };
