// Rasmlar va ovozli izohlar. Faylning o'zi Telegram'da (yopiq kanalda) saqlanadi, bazada faqat havola (file_id).
// Yuklash va ko'rsatish worker.js da: bu yerda faqat ruxsat va bog'lash.
import { AppError, needInt } from './base.js';

function attach(ctx, mediaId, kind) {
  const id = needInt(mediaId, kind === 'voice' ? 'voice_id' : 'photo_id', 1);
  const p = ctx.db.one('SELECT * FROM photos WHERE id=?', id);
  if (!p || p.owner_id !== ctx.me.id || p.kind !== kind) throw new AppError('bad_input', { field: kind });
  const used = ctx.db.one(`SELECT (SELECT COUNT(*) FROM batches WHERE photo_id=?) + (SELECT COUNT(*) FROM takeaways WHERE photo_id=?)
    + (SELECT COUNT(*) FROM transfers WHERE voice_id=?) + (SELECT COUNT(*) FROM orders WHERE photo_id=? OR voice_id=?)
    + (SELECT COUNT(*) FROM order_events WHERE voice_id=?) + (SELECT COUNT(*) FROM appeals WHERE photo_id=? OR voice_id=?) n`, id, id, id, id, id, id, id, id).n;
  if (used) throw new AppError('bad_input', { field: kind });
  return id;
}
// Faqat o'zi yuklagan va hali hech qayerga biriktirilmagan fayl biriktiriladi
export const attachPhoto = (ctx, id) => attach(ctx, id, 'photo');
export const attachVoice = (ctx, id) => attach(ctx, id, 'voice');

export const actions = {
  // Yuklashdan oldin: faqat faol foydalanuvchi fayl yubora oladi
  photo_can: { auth: 'active', fn() { return { ok: true }; } },

  // Faqat worker.js ichidan chaqiriladi (tashqaridan bloklangan): Telegram bergan file_id ni yozadi
  photo_save: {
    auth: 'active', mut: true,
    fn(ctx, b) {
      if (typeof b.file_id !== 'string' || !b.file_id) throw new AppError('bad_input', { field: 'file_id' });
      const kind = b.kind === 'voice' ? 'voice' : 'photo';
      const r = ctx.db.one('INSERT INTO photos(owner_id,file_id,uniq,w,h,created_at,kind,mime) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
        ctx.me.id, b.file_id.slice(0, 300), String(b.uniq || '').slice(0, 100), Number(b.w) || null, Number(b.h) || null, ctx.at,
        kind, kind === 'voice' ? String(b.mime || 'audio/webm').slice(0, 60) : 'image/jpeg');
      return { id: r.id };
    },
  },

  // Ko'rish/eshitish huquqi: rahbar — hammasi; egasi — o'zinikini; partiya rasmi — shu partiya bilan ishlaganlar;
  // ovozli izoh — ish berilgan tikuvchi.
  photo_meta: {
    auth: 'active',
    fn(ctx, b) {
      const p = ctx.db.one('SELECT * FROM photos WHERE id=?', needInt(b.id, 'id', 1));
      if (!p) throw new AppError('not_found', {}, 404);
      let ok = ctx.me.role === 'rahbar' || p.owner_id === ctx.me.id;
      if (!ok && p.kind === 'photo') {
        ok = !!ctx.db.one(`SELECT 1 FROM batches bt JOIN lines l ON l.batch_id=bt.id
          WHERE bt.photo_id=? AND (bt.cutter_id=? OR EXISTS(SELECT 1 FROM bal WHERE bal.line_id=l.id AND bal.holder=?)
            OR EXISTS(SELECT 1 FROM transfer_items ti JOIN transfers t ON t.id=ti.transfer_id WHERE ti.line_id=l.id AND t.to_id=?)) LIMIT 1`,
          p.id, ctx.me.id, ctx.me.id, ctx.me.id);
        if (!ok && ctx.me.can_inspect) ok = !!ctx.db.one('SELECT 1 FROM batches WHERE photo_id=?', p.id);
      }
      if (!ok && p.kind === 'voice') ok = !!ctx.db.one('SELECT 1 FROM transfers WHERE voice_id=? AND to_id=?', p.id, ctx.me.id);
      // Buyurtma rasmi/ovozi: shu buyurtmaning bichuvchisi va tikuvchisi
      if (!ok) ok = !!ctx.db.one(`SELECT 1 FROM orders o WHERE (o.cutter_id=? OR o.sewer_id=?) AND (o.photo_id=? OR o.voice_id=?
        OR EXISTS(SELECT 1 FROM order_events e WHERE e.order_id=o.id AND e.voice_id=?)) LIMIT 1`, ctx.me.id, ctx.me.id, p.id, p.id, p.id);
      if (!ok) throw new AppError('forbidden', {}, 403);
      return { file_id: p.file_id, uniq: p.uniq || String(p.id), mime: p.mime || 'image/jpeg' };
    },
  },
};
