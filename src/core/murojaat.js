// Murojaatlar: xodim rahbarga yozadi (yozma, ovozli, rasm bilan). Faqat rahbar va murojaat egasi ko'radi.
// «Ruxsat so'rash» — kunlar bilan; rahbar ruxsat bersa, o'sha kunlar davomatda «ruxsatli» bo'ladi.
import { AppError, needInt, needDay, optText, fullName, addDays } from './base.js';
import { attachPhoto, attachVoice } from './photos.js';

export const KINDS = {
  leave: ['Ruxsat so‘rash', 'Рухсат сўраш'],
  cut_error: ['Bichimdagi xato', 'Бичимдаги хато'],
  shortage: ['Kamomad (yetishmaydi)', 'Камомад'],
  conflict: ['Xodim bilan kelishmovchilik', 'Ходим билан келишмовчилик'],
  equipment: ['Uskuna yoki mato', 'Ускуна ёки мато'],
  other: ['Boshqa', 'Бошқа'],
};

// Kun bo'yicha tasdiqlangan ruxsatlar (davomat uchun)
export function leaveOn(ctx, day) {
  return ctx.db.all("SELECT user_id FROM appeals WHERE kind='leave' AND status='approved' AND from_day<=? AND to_day>=?", day, day).map((r) => r.user_id);
}
export function leaveDays(ctx, uid, from, to) {
  let n = 0;
  for (const a of ctx.db.all("SELECT from_day,to_day FROM appeals WHERE user_id=? AND kind='leave' AND status='approved' AND from_day<=? AND to_day>=?", uid, to, from)) {
    const f = a.from_day > from ? a.from_day : from, t = a.to_day < to ? a.to_day : to;
    n += Math.round((Date.parse(t) - Date.parse(f)) / 86400000) + 1;
  }
  return n;
}

function view(ctx, a) {
  const u = ctx.user(a.user_id), r = a.answered_by ? ctx.user(a.answered_by) : null;
  return { id: a.id, kind: a.kind, text: a.text, voice_id: a.voice_id, photo_id: a.photo_id, ref: a.ref, from_day: a.from_day, to_day: a.to_day,
    status: a.status, answer: a.answer, answered_at: a.answered_at, answered_by: r ? fullName(r) : null, created_at: a.created_at,
    user_id: a.user_id, name: fullName(u), role: u ? u.role : null,
    days: a.from_day ? Math.round((Date.parse(a.to_day) - Date.parse(a.from_day)) / 86400000) + 1 : null };
}
const fileOf = (ctx, id) => { const r = id ? ctx.db.one('SELECT file_id FROM photos WHERE id=?', id) : null; return r ? r.file_id : null; };
const dm = (d) => d.slice(8, 10) + '.' + d.slice(5, 7);

export const actions = {
  // Murojaatga bog'lash uchun xodimning yaqindagi ishlari (partiya / buyurtma kodlari)
  mj_meta: {
    auth: ['bichuvchi', 'tikuvchi'],
    fn(ctx) {
      const me = ctx.me.id;
      const refs = [];
      const since = addDays(ctx.day, -30);
      if (ctx.me.role === 'bichuvchi') {
        for (const b of ctx.db.all('SELECT code, model, color FROM batches WHERE cutter_id=? AND day>=? ORDER BY id DESC LIMIT 8', me, since)) refs.push([b.code, `${b.code} · ${b.model} · ${b.color}`]);
      } else {
        for (const t of ctx.db.all(`SELECT DISTINCT b.code, b.model, b.color FROM transfers t JOIN transfer_items ti ON ti.transfer_id=t.id JOIN lines l ON l.id=ti.line_id
          JOIN batches b ON b.id=l.batch_id WHERE t.to_id=? AND t.day>=? ORDER BY t.id DESC LIMIT 8`, me, since)) refs.push([t.code, `${t.code} · ${t.model} · ${t.color}`]);
      }
      for (const o of ctx.db.all("SELECT code, product FROM orders WHERE (cutter_id=? OR sewer_id=?) AND day>=? ORDER BY id DESC LIMIT 6", me, me, since)) refs.push([o.code, `${o.code} · ${o.product}`]);
      return { refs };
    },
  },

  mj_create: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      if (!KINDS[b.kind]) throw new AppError('bad_input', { field: 'kind' });
      const text = optText(b.text, 1000);
      const voice = b.voice_id ? attachVoice(ctx, b.voice_id) : null;
      const photo = b.photo_id ? attachPhoto(ctx, b.photo_id) : null;
      if (!text && !voice) throw new AppError('need_reason');
      let from = null, to = null;
      if (b.kind === 'leave') {
        from = needDay(b.from_day, 'from_day');
        to = needDay(b.to_day || b.from_day, 'to_day');
        if (from < ctx.day || to < from || to > addDays(from, 60)) throw new AppError('bad_input', { field: 'to_day' });
      }
      const ref = optText(b.ref, 40);
      const r = ctx.db.one(`INSERT INTO appeals(user_id,kind,text,voice_id,photo_id,ref,from_day,to_day,status,created_at,day)
        VALUES(?,?,?,?,?,?,?,?,'open',?,?) RETURNING id`, ctx.me.id, b.kind, text, voice, photo, ref, from, to, ctx.at, ctx.day);
      ctx.audit('appeal_created', 'appeal', r.id, null, { kind: b.kind, ref, from, to, voice: !!voice, photo: !!photo });
      const head = b.kind === 'leave'
        ? `🙋 ${fullName(ctx.me)} рухсат сўради: ${from === to ? dm(from) : dm(from) + '–' + dm(to)}`
        : `📨 ${fullName(ctx.me)} мурожаат қилди: ${KINDS[b.kind][1]}${ref ? ' (' + ref + ')' : ''}`;
      const ph = fileOf(ctx, photo), vf = fileOf(ctx, voice);
      for (const u of ctx.db.all("SELECT * FROM users WHERE role='rahbar' AND status='active'")) {
        ctx.notify.push({ tg_id: u.tg_id, text: `${head}${text ? '\n«' + text + '»' : ''}\nЖавоб бериш: иловада «Мурожаатлар».`, photo: ph, voice: vf });
      }
      return { id: r.id };
    },
  },

  mj_my: {
    auth: ['bichuvchi', 'tikuvchi'],
    fn(ctx) { return ctx.db.all('SELECT * FROM appeals WHERE user_id=? ORDER BY id DESC LIMIT 50', ctx.me.id).map((a) => view(ctx, a)); },
  },

  mj_cancel: {
    auth: ['bichuvchi', 'tikuvchi'], mut: true,
    fn(ctx, b) {
      const a = ctx.db.one('SELECT * FROM appeals WHERE id=?', needInt(b.id, 'id', 1));
      if (!a || a.user_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (a.status !== 'open') throw new AppError('bad_state');
      ctx.db.run("UPDATE appeals SET status='cancelled',answered_at=? WHERE id=?", ctx.at, a.id);
      ctx.audit('appeal_cancelled', 'appeal', a.id, { status: 'open' }, { status: 'cancelled' });
      return { ok: true };
    },
  },

  mj_list: {
    auth: 'rahbar',
    fn(ctx, b) {
      const open = ctx.db.all("SELECT * FROM appeals WHERE status='open' ORDER BY id").map((a) => view(ctx, a));
      const done = ctx.db.all(`SELECT * FROM appeals WHERE status<>'open' ${b.user_id ? 'AND user_id=?' : ''} ORDER BY id DESC LIMIT 60`, ...(b.user_id ? [Number(b.user_id)] : [])).map((a) => view(ctx, a));
      const leaveToday = leaveOn(ctx, ctx.day).map((id) => fullName(ctx.user(id)));
      return { open, done, leaveToday };
    },
  },

  // Rahbar javobi. Ruxsat so'rovi uchun — ruxsat berish yoki rad etish (izoh ixtiyoriy).
  mj_answer: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const a = ctx.db.one('SELECT * FROM appeals WHERE id=?', needInt(b.id, 'id', 1));
      if (!a || a.status !== 'open') throw new AppError('bad_state');
      const answer = optText(b.answer, 500);
      let status = 'answered';
      if (a.kind === 'leave') {
        if (!['approve', 'decline'].includes(b.decision)) throw new AppError('bad_input', { field: 'decision' });
        status = b.decision === 'approve' ? 'approved' : 'declined';
      } else if (!answer) throw new AppError('need_reason');
      ctx.db.run('UPDATE appeals SET status=?,answer=?,answered_by=?,answered_at=? WHERE id=?', status, answer, ctx.me.id, ctx.at, a.id);
      ctx.audit('appeal_' + status, 'appeal', a.id, { status: 'open' }, { status, kind: a.kind, from: a.from_day, to: a.to_day }, answer);
      const when = a.from_day ? (a.from_day === a.to_day ? dm(a.from_day) : dm(a.from_day) + '–' + dm(a.to_day)) : '';
      const msg = status === 'approved' ? `✅ Rahbar ruxsat berdi: ${when}.` : status === 'declined' ? `⛔ Rahbar ruxsat bermadi (${when}).` : `📨 Rahbar murojaatingizga javob berdi (${KINDS[a.kind][0]}).`;
      ctx.tell(a.user_id, `${msg}${answer ? '\n«' + answer + '»' : ''}`);
      return { ok: true };
    },
  },
};
