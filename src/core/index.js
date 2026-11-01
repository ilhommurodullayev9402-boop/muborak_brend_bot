// Barcha amallar ro'yxati va yagona kirish nuqtasi. Yangi bo'lim qo'shish: yangi fayl yozib, shu yerda ulang.
import { AppError, Ctx } from './base.js';
import { actions as staff } from './staff.js';
import { actions as attendance } from './attendance.js';
import { actions as production } from './production.js';
import { actions as money } from './money.js';
import { actions as reports, birthdayTick } from './reports.js';
import { actions as voice } from './voice.js';
import { migrate } from '../schema.js';

export const ACTIONS = { ...staff, ...attendance, ...production, ...money, ...reports, ...voice };
export { AppError, migrate };

function authorize(auth, me) {
  if (auth === 'any') return;
  if (!me || me.status !== 'active' || !me.profile_done) {
    throw new AppError('no_access', { state: me ? me.status : 'none' }, 403);
  }
  if (auth === 'active') return;
  if (auth === 'rahbar' && me.role !== 'rahbar') throw new AppError('forbidden', {}, 403);
  if (auth === 'inspect' && !(me.role === 'rahbar' || me.can_inspect)) throw new AppError('forbidden', {}, 403);
  if (Array.isArray(auth) && !auth.includes(me.role)) throw new AppError('forbidden', {}, 403);
}

// db: { all, one, run, tx }. tg: tekshirilgan Telegram foydalanuvchisi ({ id, ... }).
export function handle(db, cfg, tg, action, body, nowMs) {
  const def = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!def) throw new AppError('unknown_action', {}, 404);
  body = body && typeof body === 'object' ? body : {};
  return db.tx(() => {
    const ctx = new Ctx(db, nowMs, cfg);
    ctx.me = db.one('SELECT * FROM users WHERE tg_id=?', tg.id) || null;
    authorize(def.auth, ctx.me);
    let key = null;
    if (def.mut && body.rid) {
      key = `${tg.id}:${action}:${String(body.rid).slice(0, 64)}`;
      const prev = db.one('SELECT result FROM idem WHERE key=?', key);
      if (prev) return { result: JSON.parse(prev.result), notify: [], replay: true };
    }
    const result = def.fn(ctx, body, tg);
    if (key) db.run('INSERT INTO idem(key,user_id,action,result,at) VALUES(?,?,?,?,?)', key, ctx.me ? ctx.me.id : null, action, JSON.stringify(result ?? null), ctx.at);
    return { result, notify: ctx.notify };
  });
}

export function cronTick(db, cfg, nowMs) {
  return db.tx(() => {
    const ctx = new Ctx(db, nowMs, cfg);
    const sent = birthdayTick(ctx);
    db.run("DELETE FROM idem WHERE at < ?", new Date(nowMs - 30 * 86400000).toISOString());
    return { sent, notify: ctx.notify };
  });
}
