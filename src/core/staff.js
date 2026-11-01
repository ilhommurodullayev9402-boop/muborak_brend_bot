// Kirish, bir martalik ro'yxatdan o'tish, xodimlar, sozlamalar, katalog va tariflar.
import { fillOrderRates } from './orders.js';
import { AppError, needText, needInt, needDay, optText, fullName, addDays } from './base.js';

const ROLES = ['rahbar', 'bichuvchi', 'tikuvchi'];

function birthDate(b) {
  const d = needInt(b.bd, 'bd', 1, 31), m = needInt(b.bm, 'bm', 1, 12), y = needInt(b.by, 'by', 1930, 2020);
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(s + 'T00:00:00Z');
  if (t.getUTCDate() !== d) throw new AppError('bad_input', { field: 'bd' });
  return s;
}

export function enterState(ctx, tg, role) {
  const me = ctx.db.one('SELECT * FROM users WHERE tg_id=?', tg.id);
  const isOwner = ctx.cfg.ownerIds.includes(Number(tg.id));
  if (!me) {
    if (role === 'rahbar') return isOwner ? { state: 'register', role: 'rahbar', auto: true } : { state: 'not_rahbar' };
    if (isOwner) return { state: 'register', role: 'rahbar', auto: true, redirected: true };
    return { state: 'register', role };
  }
  const base = { myRole: me.role, name: fullName(me) };
  if (me.status === 'pending') return { ...base, state: 'pending', role: me.role };
  if (me.status === 'rejected') return { ...base, state: 'rejected', role: me.role, note: me.note };
  if (me.status === 'inactive') return { ...base, state: 'inactive' };
  if (!me.profile_done) return { ...base, state: 'register', role: me.role, auto: true };
  if (role && role !== me.role) return { ...base, state: 'wrong_role' };
  return { ...base, state: 'ok', role: me.role, canInspect: !!me.can_inspect || me.role === 'rahbar' };
}

export const actions = {
  enter: {
    auth: 'any',
    fn(ctx, b, tg) {
      if (b.role && !ROLES.includes(b.role)) throw new AppError('bad_input', { field: 'role' });
      return enterState(ctx, tg, b.role);
    },
  },

  register: {
    auth: 'any', mut: true,
    fn(ctx, b, tg) {
      if (!ROLES.includes(b.role)) throw new AppError('bad_input', { field: 'role' });
      const fn = needText(b.first_name, 'first_name', 40), ln = needText(b.last_name, 'last_name', 40);
      const bd = birthDate(b);
      const isOwner = ctx.cfg.ownerIds.includes(Number(tg.id));
      let me = ctx.db.one('SELECT * FROM users WHERE tg_id=?', tg.id);
      if (!me) {
        if (b.role === 'rahbar' && !isOwner) throw new AppError('not_rahbar', {}, 403);
        const role = isOwner ? 'rahbar' : b.role;
        const status = isOwner ? 'active' : 'pending';
        me = ctx.db.one(`INSERT INTO users(tg_id,first_name,last_name,birth_date,role,status,created_at,decided_at)
          VALUES(?,?,?,?,?,?,?,?) RETURNING *`, tg.id, fn, ln, bd, role, status, ctx.at, isOwner ? ctx.at : null);
        ctx.me = me;
        ctx.audit(isOwner ? 'owner_registered' : 'request_created', 'user', me.id, null, { role, status });
        if (!isOwner) ctx.tellRahbars(`Янги сўров: ${fn} ${ln} — ${role === 'bichuvchi' ? 'Бичувчи' : 'Тикувчи'}. «Ходимлар» бўлимида тасдиқланг.`);
      } else if (me.status === 'pending') {
        // takroriy bosish — yangi so'rov yaratilmaydi
      } else if (me.status === 'rejected') {
        if (b.role === 'rahbar') throw new AppError('not_rahbar', {}, 403);
        ctx.me = me;
        ctx.db.run('UPDATE users SET first_name=?,last_name=?,birth_date=?,role=?,status=?,note=NULL WHERE id=?', fn, ln, bd, b.role, 'pending', me.id);
        ctx.audit('request_resent', 'user', me.id, { status: 'rejected', role: me.role }, { status: 'pending', role: b.role });
        ctx.tellRahbars(`Қайта сўров: ${fn} ${ln}. «Ходимлар» бўлимида кўринг.`);
      } else if (me.status === 'active' && !me.profile_done) {
        ctx.me = me;
        ctx.db.run('UPDATE users SET first_name=?,last_name=?,birth_date=?,profile_done=1 WHERE id=?', fn, ln, bd, me.id);
        ctx.audit('profile_filled', 'user', me.id, null, { first_name: fn, last_name: ln });
      } else if (me.status === 'inactive') {
        throw new AppError('inactive', {}, 403);
      }
      return enterState(ctx, tg, null);
    },
  },

  me: {
    auth: 'active',
    fn(ctx) {
      const m = ctx.me;
      return { id: m.id, role: m.role, first_name: m.first_name, last_name: m.last_name, canInspect: !!m.can_inspect || m.role === 'rahbar', remote: !!m.remote,
        bio: !!m.bio_hash, day: ctx.day };
    },
  },

  staff_list: {
    auth: 'rahbar',
    fn(ctx) {
      const all = ctx.db.all('SELECT id,tg_id,first_name,last_name,birth_date,role,status,can_inspect,remote,profile_done,created_at,decided_at,note FROM users ORDER BY status, first_name');
      const today = ctx.day;
      const bdays = [];
      for (const u of all) {
        if (u.status !== 'active' || !u.birth_date) continue;
        for (let i = 0; i <= 30; i++) {
          const d = addDays(today, i);
          if (d.slice(5) === u.birth_date.slice(5) || (u.birth_date.slice(5) === '02-29' && d.slice(5) === '02-28' && Number(d.slice(0, 4)) % 4 !== 0)) {
            bdays.push({ id: u.id, name: fullName(u), day: d, inDays: i, age: Number(d.slice(0, 4)) - Number(u.birth_date.slice(0, 4)) });
            break;
          }
        }
      }
      return { users: all, birthdays: bdays };
    },
  },

  staff_decide: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = ctx.user(needInt(b.user_id, 'user_id', 1));
      if (!u || u.status !== 'pending') throw new AppError('not_pending');
      if (b.approve) {
        const role = b.role || u.role;
        if (!['bichuvchi', 'tikuvchi'].includes(role)) throw new AppError('bad_input', { field: 'role' });
        ctx.db.run("UPDATE users SET status='active',role=?,decided_by=?,decided_at=? WHERE id=?", role, ctx.me.id, ctx.at, u.id);
        ctx.audit('request_approved', 'user', u.id, { status: 'pending', role: u.role }, { status: 'active', role });
        ctx.notify.push({ tg_id: u.tg_id, text: `So‘rovingiz tasdiqlandi. MUBORAK BREND ilovasini ochib, «${role === 'bichuvchi' ? 'Bichuvchi' : 'Tikuvchi'}» tugmasini bosing.` });
      } else {
        const note = optText(b.note, 200);
        ctx.db.run("UPDATE users SET status='rejected',note=?,decided_by=?,decided_at=? WHERE id=?", note, ctx.me.id, ctx.at, u.id);
        ctx.audit('request_rejected', 'user', u.id, { status: 'pending' }, { status: 'rejected' }, note);
        ctx.notify.push({ tg_id: u.tg_id, text: `So‘rovingiz rad etildi.${note ? ' Sabab: ' + note : ''}` });
      }
      return { ok: true };
    },
  },

  staff_status: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = ctx.user(needInt(b.user_id, 'user_id', 1));
      const reason = needText(b.reason, 'reason', 300);
      if (!u) throw new AppError('not_found');
      if (b.active) {
        if (u.status !== 'inactive') throw new AppError('bad_state');
        ctx.db.run("UPDATE users SET status='active' WHERE id=?", u.id);
        ctx.audit('user_reactivated', 'user', u.id, { status: 'inactive' }, { status: 'active' }, reason);
      } else {
        if (u.status !== 'active') throw new AppError('bad_state');
        if (ctx.cfg.ownerIds.includes(Number(u.tg_id))) throw new AppError('owner_protected');
        if (u.id === ctx.me.id) throw new AppError('self_forbidden');
        ctx.db.run("UPDATE users SET status='inactive' WHERE id=?", u.id);
        ctx.audit('user_deactivated', 'user', u.id, { status: 'active' }, { status: 'inactive' }, reason);
      }
      return { ok: true };
    },
  },

  staff_inspect: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = ctx.user(needInt(b.user_id, 'user_id', 1));
      if (!u || u.status !== 'active') throw new AppError('not_found');
      const on = b.on ? 1 : 0;
      ctx.db.run('UPDATE users SET can_inspect=? WHERE id=?', on, u.id);
      ctx.audit('inspect_right', 'user', u.id, { can_inspect: u.can_inspect }, { can_inspect: on });
      return { ok: true };
    },
  },

  // Uydan ishlaydigan xodim: davomat so‘ralmaydi, «kelmadi» deb hisoblanmaydi. Ish va pul jarayoni o‘zgarmaydi.
  staff_remote: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const u = ctx.user(needInt(b.user_id, 'user_id', 1));
      if (!u || u.status !== 'active' || u.role === 'rahbar') throw new AppError('not_found');
      const on = b.on ? 1 : 0;
      if (u.remote === on) return { ok: true };
      ctx.db.run('UPDATE users SET remote=? WHERE id=?', on, u.id);
      ctx.audit('remote_changed', 'user', u.id, { remote: u.remote }, { remote: on });
      ctx.notify.push({ tg_id: u.tg_id, text: on ? 'Rahbar sizni «Uydan ishlaydi» deb belgiladi. Endi «Ishga keldim» belgilash shart emas.' : 'Rahbar sizni korxonada ishlaydigan qilib belgiladi. Har kuni «Ishga keldim» va «Ishdan ketdim»ni belgilang.' });
      return { ok: true };
    },
  },

  staff_add_rahbar: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const tgId = needInt(b.tg_id, 'tg_id', 1, 1e13);
      const ex = ctx.db.one('SELECT * FROM users WHERE tg_id=?', tgId);
      if (ex) {
        if (ex.status !== 'active') throw new AppError('bad_state');
        if (ex.role === 'rahbar') throw new AppError('already_rahbar');
        ctx.db.run("UPDATE users SET role='rahbar' WHERE id=?", ex.id);
        ctx.audit('rahbar_added', 'user', ex.id, { role: ex.role }, { role: 'rahbar' }, optText(b.reason));
        return { ok: true, id: ex.id };
      }
      const fn = needText(b.first_name, 'first_name', 40), ln = needText(b.last_name, 'last_name', 40);
      const u = ctx.db.one(`INSERT INTO users(tg_id,first_name,last_name,role,status,profile_done,created_at,decided_by,decided_at)
        VALUES(?,?,?,'rahbar','active',0,?,?,?) RETURNING id`, tgId, fn, ln, ctx.at, ctx.me.id, ctx.at);
      ctx.audit('rahbar_added', 'user', u.id, null, { role: 'rahbar', tg_id: tgId }, optText(b.reason));
      return { ok: true, id: u.id };
    },
  },

  settings_get: {
    auth: 'active',
    fn(ctx) {
      const s = Object.fromEntries(ctx.db.all('SELECT k,v FROM settings').map((r) => [r.k, r.v]));
      if (ctx.me.role !== 'rahbar') { delete s.lat; delete s.lng; } // xodimga korxona koordinatasi kerak emas
      s.geo_set = !!(ctx.setting('lat') && ctx.setting('lng'));
      return s;
    },
  },

  settings_set: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const allowed = {
        lat: (v) => { const n = Number(v); if (!(n >= -90 && n <= 90)) throw new AppError('bad_input', { field: 'lat' }); return String(n); },
        lng: (v) => { const n = Number(v); if (!(n >= -180 && n <= 180)) throw new AppError('bad_input', { field: 'lng' }); return String(n); },
        radius: (v) => String(needInt(v, 'radius', 20, 5000)),
        max_acc: (v) => String(needInt(v, 'max_acc', 10, 1000)),
        work_start: hm, work_end: hm, break_start: hm,
        break_min: (v) => String(needInt(v, 'break_min', 0, 240)),
        grace_min: (v) => String(needInt(v, 'grace_min', 0, 120)),
        full_min: (v) => String(needInt(v, 'full_min', 30, 1000)),
        require_bio: (v) => (v ? '1' : '0'),
      };
      function hm(v) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw new AppError('bad_input', { field: 'time' }); return String(v); }
      const changed = {};
      for (const [k, v] of Object.entries(b.values || {})) {
        if (!allowed[k]) continue;
        const nv = allowed[k](v);
        const old = ctx.setting(k);
        if (old !== nv) {
          ctx.db.run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, nv);
          changed[k] = [old, nv];
        }
      }
      if (Object.keys(changed).length) ctx.audit('settings_changed', 'settings', null, null, changed);
      return { ok: true, changed: Object.keys(changed) };
    },
  },

  catalog_list: {
    auth: 'active',
    fn(ctx) {
      const rows = ctx.db.all('SELECT id,kind,name FROM catalog WHERE active=1 ORDER BY kind, name');
      const out = { type: [], model: [], material: [], color: [] };
      for (const r of rows) out[r.kind].push({ id: r.id, name: r.name });
      return out;
    },
  },

  catalog_add: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      if (!['type', 'model', 'material', 'color'].includes(b.kind)) throw new AppError('bad_input', { field: 'kind' });
      const name = needText(b.name, 'name', 60);
      const ex = ctx.db.one('SELECT id FROM catalog WHERE kind=? AND lower(name)=lower(?)', b.kind, name);
      if (ex) return { id: ex.id, existed: true };
      const r = ctx.db.one('INSERT INTO catalog(kind,name,created_by,created_at) VALUES(?,?,?,?) RETURNING id', b.kind, name, ctx.me.id, ctx.at);
      ctx.audit('catalog_added', 'catalog', r.id, null, { kind: b.kind, name });
      return { id: r.id };
    },
  },

  rates_list: {
    auth: 'active',
    fn(ctx) {
      const rows = ctx.db.all(`SELECT r.*, c.name type_name FROM rates r LEFT JOIN catalog c ON c.id=r.type_id ORDER BY r.work, c.name, r.model, r.valid_from DESC, r.id DESC`);
      const missing = ctx.db.one('SELECT COUNT(*) n, COALESCE(SUM(qty),0) q FROM earnings WHERE amount IS NULL');
      // Xodim faqat o'z ishiga tegishli tariflarni ko'radi
      const mine = ctx.me.role === 'rahbar' ? rows : rows.filter((r) => r.work === (ctx.me.role === 'bichuvchi' ? 'bichish' : 'tikish'));
      const z = (k) => { const v = ctx.setting('zakaz_' + k); return v == null || v === '' ? null : Number(v); };
      return { rates: mine, missing: ctx.me.role === 'rahbar' ? missing : null, zakaz: { bichish: z('bichish'), tikish: z('tikish') } };
    },
  },

  rate_add: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      if (!['bichish', 'tikish'].includes(b.work)) throw new AppError('bad_input', { field: 'work' });
      const typeId = needInt(b.type_id, 'type_id', 1);
      if (!ctx.db.one("SELECT id FROM catalog WHERE id=? AND kind='type'", typeId)) throw new AppError('bad_input', { field: 'type_id' });
      const price = needInt(b.price, 'price', 0, 100000000);
      const from = needDay(b.valid_from, 'valid_from');
      const model = optText(b.model, 60) || '';
      const r = ctx.db.one(`INSERT INTO rates(work,type_id,model,price,valid_from,note,created_by,created_at)
        VALUES(?,?,?,?,?,?,?,?) RETURNING id`, b.work, typeId, model, price, from, optText(b.note), ctx.me.id, ctx.at);
      ctx.audit('rate_added', 'rate', r.id, null, { work: b.work, type_id: typeId, model, price, valid_from: from }, optText(b.note));
      return { id: r.id };
    },
  },

  // Tarifi yo'q bo'lgan (summasi bo'sh) yozuvlarga, o'sha kunga amal qiladigan tarif topilsa, summani qo'yadi.
  // Mavjud summalar o'zgartirilmaydi.
  rates_fill: {
    auth: 'rahbar', mut: true,
    fn(ctx) {
      let filled = 0;
      filled += fillOrderRates(ctx);
      for (const e of ctx.db.all('SELECT * FROM earnings WHERE amount IS NULL AND order_id IS NULL')) {
        const li = ctx.lineInfo(e.line_id);
        const r = ctx.findRate(e.work, li.type_id, li.model, e.day);
        if (!r) continue;
        ctx.db.run('UPDATE earnings SET rate_id=?,price=?,amount=? WHERE id=? AND amount IS NULL', r.id, r.price, r.price * e.qty, e.id);
        ctx.audit('earning_rate_filled', 'earning', e.id, { amount: null }, { rate_id: r.id, amount: r.price * e.qty });
        filled++;
      }
      return { filled };
    },
  },

  audit_list: {
    auth: 'rahbar',
    fn(ctx, b) {
      const lim = Math.min(Number(b.limit) || 100, 500);
      // Кимга тегишли: амал қайси ходимга таъсир қилганини ҳам қайтарамиз (экранда одам номи кўрсатилади).
      return ctx.db.all(`SELECT a.*, u.first_name, u.last_name, s.first_name AS s_first, s.last_name AS s_last FROM audit a
        LEFT JOIN users u ON u.id=a.actor_id
        LEFT JOIN users s ON s.id = CASE a.entity
          WHEN 'user' THEN a.entity_id
          WHEN 'payment' THEN (SELECT user_id FROM payments WHERE id=a.entity_id)
          WHEN 'adjustment' THEN (SELECT user_id FROM adjustments WHERE id=a.entity_id)
          WHEN 'takeaway' THEN (SELECT user_id FROM takeaways WHERE id=a.entity_id)
          WHEN 'att_exc' THEN (SELECT user_id FROM att_exc WHERE id=a.entity_id)
          WHEN 'transfer' THEN (SELECT to_id FROM transfers WHERE id=a.entity_id)
          WHEN 'submission' THEN (SELECT sewer_id FROM submissions WHERE id=a.entity_id)
          ELSE NULL END
        ORDER BY a.id DESC LIMIT ?`, lim);
    },
  },

  export_all: {
    auth: 'rahbar',
    fn(ctx) {
      const tables = ctx.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'idem'").map((r) => r.name);
      const out = { exported_at: ctx.at, tables: {} };
      for (const t of tables) out.tables[t] = ctx.db.all(`SELECT * FROM "${t}"`);
      for (const u of out.tables.users || []) delete u.bio_hash;
      ctx.audit('export', 'db', null, null, { tables: tables.length });
      return out;
    },
  },
};
