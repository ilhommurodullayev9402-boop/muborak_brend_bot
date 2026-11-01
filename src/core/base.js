// Umumiy yordamchilar: xato turi, vaqt (Asia/Tashkent), audit, qoldiq harakati.
export class AppError extends Error {
  constructor(code, params = {}, status = 400) {
    super(code);
    this.code = code;
    this.params = params;
    this.status = status;
  }
}

const TZ_MS = 5 * 3600 * 1000; // Asia/Tashkent = UTC+5, yozgi vaqt yo'q
export const tDay = (ms) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
export const tHM = (ms) => new Date(ms + TZ_MS).toISOString().slice(11, 16);
export const iso = (ms) => new Date(ms).toISOString();
export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const hmToMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
// ISO vaqtni Toshkent sutkasidagi daqiqaga aylantirish
export const minOfDay = (isoStr) => { const d = new Date(Date.parse(isoStr) + TZ_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

export const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export function needDay(s, name = 'day') { if (!isDay(s)) throw new AppError('bad_input', { field: name }); return s; }
export function needInt(v, name, min = 0, max = 1e12) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError('bad_input', { field: name });
  return n;
}
export function needText(v, name, max = 200, min = 1) {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (s.length < min || s.length > max) throw new AppError('bad_input', { field: name });
  return s;
}
export const optText = (v, max = 500) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

// Holatlar (bir dona har doim faqat bittasida turadi)
export const STATES = {
  partial: 'Chala bichim',
  free: 'Tarqatilmagan',
  reserved: 'Qabul kutilmoqda',
  sewing: 'Tikuvchida',
  rework: 'Qayta ishlashda',
  review: 'Tekshiruvda',
  accepted: 'Qabul qilingan',
  writeoff: 'Hisobdan chiqarilgan',
};
// Sanoqqa kiradigan holatlar (chala bichim alohida yuritiladi)
export const COUNTED = ['free', 'reserved', 'sewing', 'rework', 'review', 'accepted', 'writeoff'];

export class Ctx {
  constructor(db, nowMs, cfg) {
    this.db = db;
    this.now = nowMs;
    this.cfg = cfg; // { ownerIds: [tg_id,...] }
    this.day = tDay(nowMs);
    this.at = iso(nowMs);
    this.notify = []; // { tg_id, text } — tranzaksiyadan keyin yuboriladi
    this.me = null;
  }
  audit(action, entity, entityId, before, after, reason) {
    this.db.run('INSERT INTO audit(at,actor_id,action,entity,entity_id,before,after,reason) VALUES(?,?,?,?,?,?,?,?)',
      this.at, this.me ? this.me.id : null, action, entity, entityId == null ? null : String(entityId),
      before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), reason || null);
  }
  setting(k) { const r = this.db.one('SELECT v FROM settings WHERE k=?', k); return r ? r.v : null; }
  user(id) { return this.db.one('SELECT * FROM users WHERE id=?', id); }
  tell(userOrId, text) {
    const u = typeof userOrId === 'object' ? userOrId : this.user(userOrId);
    if (u && u.status === 'active') this.notify.push({ tg_id: u.tg_id, text });
  }
  tellRahbars(text, exceptId) {
    for (const u of this.db.all("SELECT * FROM users WHERE role='rahbar' AND status='active'")) {
      if (u.id !== exceptId) this.notify.push({ tg_id: u.tg_id, text });
    }
  }
  balance(lineId, state, holder = 0) {
    const r = this.db.one('SELECT qty FROM bal WHERE line_id=? AND state=? AND holder=?', lineId, state, holder);
    return r ? r.qty : 0;
  }
  // Qoldiq harakati: from holatdan qty donani to holatga o'tkazadi. Yetmasa — xato, hech narsa yozilmaydi.
  move(lineId, qty, from, fromH, to, toH, kind, ref, note) {
    if (!(qty > 0)) throw new AppError('bad_input', { field: 'qty' });
    if (from) {
      const have = this.balance(lineId, from, fromH || 0);
      if (have < qty) throw new AppError('not_enough', { have, state: from });
      this.db.run('UPDATE bal SET qty=qty-? WHERE line_id=? AND state=? AND holder=?', qty, lineId, from, fromH || 0);
    }
    if (to) {
      this.db.run(`INSERT INTO bal(line_id,state,holder,qty) VALUES(?,?,?,?)
        ON CONFLICT(line_id,state,holder) DO UPDATE SET qty=qty+excluded.qty`, lineId, to, toH || 0, qty);
    }
    const r = this.db.one(`INSERT INTO moves(at,day,line_id,qty,from_state,from_holder,to_state,to_holder,kind,ref,actor_id,note)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, this.at, this.day, lineId, qty, from || null, from ? (fromH || 0) : null,
      to || null, to ? (toH || 0) : null, kind, ref || null, this.me ? this.me.id : null, note || null);
    return r.id;
  }
  lineInfo(lineId) {
    return this.db.one(`SELECT l.id line_id, l.size, b.id batch_id, b.code, b.model, b.material, b.color, b.type_id, b.cutter_id, b.opening, b.photo_id,
      c.name type_name FROM lines l JOIN batches b ON b.id=l.batch_id LEFT JOIN catalog c ON c.id=b.type_id WHERE l.id=?`, lineId);
  }
  // Tarif: ish turi + mahsulot turi (+ model) + amal qilish sanasi. Topilmasa null — taxmin qilinmaydi.
  findRate(work, typeId, model, day) {
    return this.db.one(`SELECT * FROM rates WHERE work=? AND type_id=? AND (model='' OR lower(model)=lower(?)) AND valid_from<=?
      ORDER BY (model<>'') DESC, valid_from DESC, id DESC LIMIT 1`, work, typeId, model || '', day);
  }
  // Ishbay haq yozuvi. src noyob — bir ish uchun ikki marta yozilmaydi.
  earn(userId, work, src, lineId, qty) {
    if (!userId || qty <= 0) return;
    const li = this.lineInfo(lineId);
    const rate = this.findRate(work, li.type_id, li.model, this.day);
    this.db.run(`INSERT INTO earnings(user_id,work,src,line_id,qty,day,rate_id,price,amount,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(src) DO NOTHING`, userId, work, src, lineId, qty, this.day,
      rate ? rate.id : null, rate ? rate.price : null, rate ? rate.price * qty : null, this.at);
  }
}

export const fmtSum = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const fullName = (u) => u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '';
export const lineLabel = (li) => `${li.code} · ${li.type_name || ''} «${li.model}» · ${li.material} · ${li.color} · ${li.size}`;
