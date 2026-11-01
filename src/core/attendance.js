// Kelish-ketish davomati. Vaqt faqat serverdan olinadi. Joylashuv faqat tugma bosilganda tekshiriladi,
// koordinatalar saqlanmaydi (faqat masofa natijasi).
import { AppError, needDay, needInt, optText, hmToMin, minOfDay, tHM, fullName } from './base.js';

export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function S(ctx) {
  const s = Object.fromEntries(ctx.db.all('SELECT k,v FROM settings').map((r) => [r.k, r.v]));
  return s;
}

// Bir kunlik davomat ko'rsatkichlari
export function metrics(row, s, today) {
  const out = { day: row.day, in: row.in_at ? tHM(Date.parse(row.in_at)) : null, out: row.out_at ? tHM(Date.parse(row.out_at)) : null,
    in_how: row.in_how, out_how: row.out_how, late: 0, gross: null, net: null, full: false, status: '' };
  if (!row.in_at) { out.status = 'no_in'; return out; }
  const inM = minOfDay(row.in_at);
  const start = hmToMin(s.work_start || '08:00') + Number(s.grace_min || 0);
  out.late = Math.max(0, inM - start);
  if (!row.out_at) { out.status = row.day < today ? 'no_out' : 'working'; return out; }
  const outM = minOfDay(row.out_at);
  const gross = Math.max(0, outM - inM);
  const bs = hmToMin(s.break_start || '13:00'), be = bs + Number(s.break_min || 0);
  const overlap = Math.max(0, Math.min(outM, be) - Math.max(inM, bs));
  out.gross = gross;
  out.net = Math.max(0, gross - overlap);
  out.full = out.net >= Number(s.full_min || 480);
  out.status = out.full ? 'full' : 'short';
  return out;
}

export const actions = {
  bio_enroll: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      if (!b.token_hash || !/^[0-9a-f]{64}$/.test(b.token_hash)) throw new AppError('bad_input', { field: 'token' });
      const had = !!ctx.me.bio_hash;
      ctx.db.run('UPDATE users SET bio_hash=? WHERE id=?', b.token_hash, ctx.me.id);
      ctx.audit(had ? 'bio_reenrolled' : 'bio_enrolled', 'user', ctx.me.id, null, null);
      return { ok: true };
    },
  },

  att_today: {
    auth: ['bichuvchi', 'tikuvchi'],
    fn(ctx) {
      const s = S(ctx);
      const row = ctx.db.one('SELECT * FROM attendance WHERE user_id=? AND day=?', ctx.me.id, ctx.day);
      const exc = ctx.db.all("SELECT id,kind,reason,status,at FROM att_exc WHERE user_id=? AND day=? ORDER BY id", ctx.me.id, ctx.day);
      return { day: ctx.day, now: tHM(ctx.now), row: row ? metrics(row, s, ctx.day) : null, exc,
        geo_set: !!(s.lat && s.lng), require_bio: s.require_bio === '1', bio: !!ctx.me.bio_hash,
        work_start: s.work_start, work_end: s.work_end, radius: Number(s.radius), max_acc: Number(s.max_acc) };
    },
  },

  att_mark: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const kind = b.kind;
      if (!['in', 'out'].includes(kind)) throw new AppError('bad_input', { field: 'kind' });
      const s = S(ctx);
      const row = ctx.db.one('SELECT * FROM attendance WHERE user_id=? AND day=?', ctx.me.id, ctx.day);
      if (kind === 'in' && row && row.in_at) return { ok: true, already: true, at: tHM(Date.parse(row.in_at)) };
      if (kind === 'out') {
        if (!row || !row.in_at) return { ok: false, reason: 'no_in' };
        if (row.out_at) return { ok: true, already: true, at: tHM(Date.parse(row.out_at)) };
      }
      const fail = (reason, params = {}) => ({ ok: false, reason, params });
      if (!(s.lat && s.lng)) return fail('geo_not_set');
      const loc = b.loc;
      if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return fail('loc_off');
      const acc = Number(loc.acc);
      if (!(acc > 0) || acc > Number(s.max_acc)) return fail('low_accuracy', { acc: Math.round(acc) || null, max: Number(s.max_acc) });
      const dist = Math.round(distanceM(Number(s.lat), Number(s.lng), loc.lat, loc.lng));
      if (dist > Number(s.radius)) return fail('outside', { dist, radius: Number(s.radius) });
      if (s.require_bio === '1') {
        if (b.bio !== 'ok') return fail('bio_' + (['none', 'denied', 'failed'].includes(b.bio) ? b.bio : 'failed'));
        if (!ctx.me.bio_hash || b.bio_token_hash !== ctx.me.bio_hash) return fail('bio_token');
      }
      if (kind === 'in') {
        ctx.db.run(`INSERT INTO attendance(user_id,day,in_at,in_how,in_dist) VALUES(?,?,?,?,?)
          ON CONFLICT(user_id,day) DO UPDATE SET in_at=excluded.in_at,in_how=excluded.in_how,in_dist=excluded.in_dist WHERE attendance.in_at IS NULL`,
          ctx.me.id, ctx.day, ctx.at, 'auto', dist);
      } else {
        ctx.db.run('UPDATE attendance SET out_at=?,out_how=?,out_dist=? WHERE id=? AND out_at IS NULL', ctx.at, 'auto', dist, row.id);
      }
      return { ok: true, at: tHM(ctx.now), dist };
    },
  },

  att_exception: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      if (!['in', 'out'].includes(b.kind)) throw new AppError('bad_input', { field: 'kind' });
      const reason = String(b.reason || 'other').slice(0, 40);
      const ex = ctx.db.one("SELECT id FROM att_exc WHERE user_id=? AND day=? AND kind=? AND status='pending'", ctx.me.id, ctx.day, b.kind);
      if (ex) return { id: ex.id, existed: true };
      const row = ctx.db.one('SELECT * FROM attendance WHERE user_id=? AND day=?', ctx.me.id, ctx.day);
      if (b.kind === 'in' && row && row.in_at) throw new AppError('already_marked');
      if (b.kind === 'out' && row && row.out_at) throw new AppError('already_marked');
      const r = ctx.db.one('INSERT INTO att_exc(user_id,day,kind,at,reason,note) VALUES(?,?,?,?,?,?) RETURNING id',
        ctx.me.id, ctx.day, b.kind, ctx.at, reason, optText(b.note, 300));
      ctx.audit('att_exception_requested', 'att_exc', r.id, null, { kind: b.kind, reason });
      ctx.tellRahbars(`Давомат истиснои: ${fullName(ctx.me)} — ${b.kind === 'in' ? 'келди' : 'кетди'} ${tHM(ctx.now)}. «Давомат» бўлимида кўринг.`);
      return { id: r.id };
    },
  },

  att_exc_list: {
    auth: 'rahbar',
    fn(ctx) {
      return ctx.db.all(`SELECT e.*, u.first_name, u.last_name, d.first_name d_first, d.last_name d_last FROM att_exc e
        JOIN users u ON u.id=e.user_id LEFT JOIN users d ON d.id=e.decided_by
        ORDER BY (e.status='pending') DESC, e.id DESC LIMIT 100`).map((e) => ({ ...e, time: tHM(Date.parse(e.at)) }));
    },
  },

  att_exc_decide: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const e = ctx.db.one('SELECT * FROM att_exc WHERE id=?', needInt(b.id, 'id', 1));
      if (!e || e.status !== 'pending') throw new AppError('bad_state');
      const note = optText(b.note, 300);
      if (b.approve) {
        const how = 'exc:' + e.id;
        if (e.kind === 'in') {
          ctx.db.run(`INSERT INTO attendance(user_id,day,in_at,in_how) VALUES(?,?,?,?)
            ON CONFLICT(user_id,day) DO UPDATE SET in_at=excluded.in_at,in_how=excluded.in_how WHERE attendance.in_at IS NULL`, e.user_id, e.day, e.at, how);
        } else {
          const row = ctx.db.one('SELECT * FROM attendance WHERE user_id=? AND day=?', e.user_id, e.day);
          if (!row || !row.in_at) throw new AppError('no_in');
          ctx.db.run('UPDATE attendance SET out_at=?,out_how=? WHERE id=? AND out_at IS NULL', e.at, how, row.id);
        }
      }
      ctx.db.run('UPDATE att_exc SET status=?,decided_by=?,decided_at=?,decide_note=? WHERE id=?', b.approve ? 'approved' : 'rejected', ctx.me.id, ctx.at, note, e.id);
      ctx.audit(b.approve ? 'att_exception_approved' : 'att_exception_rejected', 'att_exc', e.id, { status: 'pending' }, { status: b.approve ? 'approved' : 'rejected' }, note);
      ctx.tell(e.user_id, `Davomat so‘rovingiz ${b.approve ? 'tasdiqlandi' : 'rad etildi'}.${note ? ' Izoh: ' + note : ''}`);
      return { ok: true };
    },
  },

  att_history: {
    auth: 'active',
    fn(ctx, b) {
      const from = needDay(b.from, 'from'), to = needDay(b.to, 'to');
      let uid = ctx.me.id;
      if (b.user_id && Number(b.user_id) !== ctx.me.id) {
        if (ctx.me.role !== 'rahbar') throw new AppError('forbidden', {}, 403);
        uid = needInt(b.user_id, 'user_id', 1);
      }
      const s = S(ctx);
      return ctx.db.all('SELECT * FROM attendance WHERE user_id=? AND day BETWEEN ? AND ? ORDER BY day DESC', uid, from, to).map((r) => metrics(r, s, ctx.day));
    },
  },

  att_report: {
    auth: 'rahbar',
    fn(ctx, b) {
      const from = needDay(b.from, 'from'), to = needDay(b.to, 'to');
      const s = S(ctx);
      const users = ctx.db.all("SELECT id,first_name,last_name,role,status FROM users WHERE role IN('bichuvchi','tikuvchi') AND (status='active' OR status='inactive') ORDER BY first_name");
      const rows = ctx.db.all('SELECT * FROM attendance WHERE day BETWEEN ? AND ?' + (b.user_id ? ' AND user_id=?' : ''), from, to, ...(b.user_id ? [Number(b.user_id)] : []));
      const by = {};
      for (const r of rows) (by[r.user_id] ||= []).push(metrics(r, s, ctx.day));
      const out = [];
      for (const u of users) {
        if (b.user_id && u.id !== Number(b.user_id)) continue;
        const days = (by[u.id] || []).sort((a, c) => (a.day < c.day ? 1 : -1));
        if (!days.length && u.status === 'inactive') continue;
        out.push({ id: u.id, name: fullName(u), role: u.role, status: u.status, days,
          came: days.filter((d) => d.in).length, late: days.filter((d) => d.late > 0).length,
          no_out: days.filter((d) => d.status === 'no_out').length, full: days.filter((d) => d.full).length,
          net: days.reduce((a, d) => a + (d.net || 0), 0) });
      }
      return { from, to, users: out, settings: { work_start: s.work_start, work_end: s.work_end, full_min: Number(s.full_min) } };
    },
  },
};
