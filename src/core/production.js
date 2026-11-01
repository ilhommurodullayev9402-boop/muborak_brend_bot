// Partiyalar, bichim, bichuvchidan tikuvchiga topshirish, tikish, tayyor deb topshirish va tekshiruv.
import { attachPhoto, attachVoice } from './photos.js';
import { AppError, needInt, needText, optText, fullName, lineLabel, tHM } from './base.js';

const SIZE_RE = /^[0-9A-Za-z\-\/ ]{1,12}$/;

function normLines(lines, allowPartial = true) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 40) throw new AppError('bad_input', { field: 'lines' });
  const seen = new Set();
  const out = [];
  for (const l of lines) {
    const size = String(l.size ?? '').trim().toUpperCase();
    if (!SIZE_RE.test(size)) throw new AppError('bad_input', { field: 'size' });
    if (seen.has(size)) throw new AppError('dup_size', { size });
    seen.add(size);
    const ready = needInt(l.ready || 0, 'ready', 0, 100000);
    const partial = allowPartial ? needInt(l.partial || 0, 'partial', 0, 100000) : 0;
    if (ready + partial > 0) out.push({ size, ready, partial });
  }
  if (!out.length) throw new AppError('bad_input', { field: 'qty' });
  return out;
}

function lineFor(ctx, batchId, size) {
  const ex = ctx.db.one('SELECT id FROM lines WHERE batch_id=? AND size=?', batchId, size);
  if (ex) return ex.id;
  return ctx.db.one('INSERT INTO lines(batch_id,size) VALUES(?,?) RETURNING id', batchId, size).id;
}

function rememberCatalog(ctx, b) {
  for (const [kind, name] of [['model', b.model], ['material', b.material], ['color', b.color]]) {
    ctx.db.run('INSERT INTO catalog(kind,name,created_by,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING', kind, name, ctx.me.id, ctx.at);
  }
}

function newBatch(ctx, b, opening) {
  const typeId = needInt(b.type_id, 'type_id', 1);
  if (!ctx.db.one("SELECT id FROM catalog WHERE id=? AND kind='type' AND active=1", typeId)) throw new AppError('bad_input', { field: 'type_id' });
  const model = needText(b.model, 'model', 60), material = needText(b.material, 'material', 60), color = needText(b.color, 'color', 40);
  const tmp = 'tmp-' + ctx.now + '-' + Math.random();
  const r = ctx.db.one(`INSERT INTO batches(code,day,cutter_id,type_id,model,material,color,note,opening,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, tmp, ctx.day, opening ? null : ctx.me.id, typeId, model, material, color,
    optText(b.note, 300), opening ? 1 : 0, ctx.me.id, ctx.at);
  const code = 'P-' + String(r.id).padStart(4, '0');
  ctx.db.run('UPDATE batches SET code=? WHERE id=?', code, r.id);
  rememberCatalog(ctx, { model, material, color });
  return { id: r.id, code };
}

function addCut(ctx, batchId, lines) {
  let ready = 0, partial = 0;
  for (const l of lines) {
    const lid = lineFor(ctx, batchId, l.size);
    if (l.ready) { ctx.move(lid, l.ready, null, 0, 'free', 0, 'cut_ready', 'b:' + batchId); ready += l.ready; }
    if (l.partial) { ctx.move(lid, l.partial, null, 0, 'partial', 0, 'cut_partial', 'b:' + batchId); partial += l.partial; }
  }
  return { ready, partial };
}

function batchView(ctx, batchId, withHolders) {
  const b = ctx.db.one('SELECT b.*, c.name type_name, u.first_name cf, u.last_name cl FROM batches b LEFT JOIN catalog c ON c.id=b.type_id LEFT JOIN users u ON u.id=b.cutter_id WHERE b.id=?', batchId);
  if (!b) return null;
  const lines = ctx.db.all('SELECT * FROM lines WHERE batch_id=? ORDER BY CAST(size AS INTEGER), size', batchId);
  const bals = ctx.db.all(`SELECT bal.*, u.first_name, u.last_name FROM bal LEFT JOIN users u ON u.id=bal.holder
    WHERE line_id IN (SELECT id FROM lines WHERE batch_id=?) AND qty>0`, batchId);
  const out = { id: b.id, code: b.code, day: b.day, type_name: b.type_name, type_id: b.type_id, model: b.model, material: b.material, color: b.color, photo_id: b.photo_id,
    note: b.note, opening: !!b.opening, cutter: b.cutter_id ? `${b.cf} ${b.cl}` : null, cutter_id: b.cutter_id, lines: [], totals: {} };
  for (const l of lines) {
    const lb = bals.filter((x) => x.line_id === l.id);
    const st = {};
    for (const x of lb) st[x.state] = (st[x.state] || 0) + x.qty;
    const cut = ctx.db.one("SELECT COALESCE(SUM(CASE WHEN kind IN('cut_ready','partial_done','opening') THEN qty END),0) ready FROM moves WHERE line_id=?", l.id);
    const row = { line_id: l.id, size: l.size, states: st, ready_total: cut.ready };
    if (withHolders) row.holders = lb.filter((x) => x.holder).map((x) => ({ state: x.state, holder: x.holder, name: `${x.first_name} ${x.last_name}`, qty: x.qty }));
    out.lines.push(row);
    for (const [k, v] of Object.entries(st)) out.totals[k] = (out.totals[k] || 0) + v;
    out.totals.ready_total = (out.totals.ready_total || 0) + cut.ready;
  }
  return out;
}

function canSeeBatch(ctx, batch) {
  return ctx.me.role === 'rahbar' || (ctx.me.role === 'bichuvchi' && batch.cutter_id === ctx.me.id);
}

function transferView(ctx, t) {
  const items = ctx.db.all('SELECT * FROM transfer_items WHERE transfer_id=? ORDER BY id', t.id).map((i) => {
    const li = ctx.lineInfo(i.line_id);
    return { ...i, label: lineLabel(li), code: li.code, size: li.size, model: li.model, material: li.material, color: li.color, type_name: li.type_name, photo_id: li.photo_id };
  });
  const f = ctx.user(t.from_id), to = ctx.user(t.to_id);
  return { ...t, from_name: fullName(f), to_name: fullName(to), items, total: items.reduce((a, i) => a + i.qty, 0), time: tHM(Date.parse(t.created_at)) };
}

function earnCutter(ctx, item) {
  const li = ctx.lineInfo(item.line_id);
  if (li.opening || !li.cutter_id) return;
  const cutter = ctx.user(li.cutter_id);
  if (!cutter || cutter.role !== 'bichuvchi') return;
  ctx.earn(cutter.id, 'bichish', 'tr:' + item.id, item.line_id, item.accepted);
}

const lineOk = (ctx, lineId) => { const li = ctx.lineInfo(needInt(lineId, 'line_id', 1)); if (!li) throw new AppError('not_found'); return li; };

export const actions = {
  prod_meta: {
    auth: 'active',
    fn(ctx) {
      const types = ctx.db.all("SELECT id,name FROM catalog WHERE kind='type' AND active=1 ORDER BY name");
      const sewers = ctx.me.role === 'tikuvchi' ? [] : ctx.db.all("SELECT id,first_name,last_name FROM users WHERE role='tikuvchi' AND status='active' ORDER BY first_name")
        .map((u) => ({ id: u.id, name: fullName(u) }));
      const sugg = {};
      for (const k of ['model', 'material', 'color']) sugg[k] = ctx.db.all('SELECT name FROM catalog WHERE kind=? AND active=1 ORDER BY name', k).map((r) => r.name);
      return { types, sewers, sugg };
    },
  },

  batch_create: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const lines = normLines(b.lines);
      const nb = newBatch(ctx, b, false);
      if (b.photo_id) ctx.db.run('UPDATE batches SET photo_id=? WHERE id=?', attachPhoto(ctx, b.photo_id), nb.id);
      const tot = addCut(ctx, nb.id, lines);
      ctx.audit('batch_created', 'batch', nb.id, null, { code: nb.code, lines });
      return { ...nb, ...tot };
    },
  },

  cut_add: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const batch = ctx.db.one('SELECT * FROM batches WHERE id=?', needInt(b.batch_id, 'batch_id', 1));
      if (!batch || batch.opening) throw new AppError('not_found');
      if (ctx.me.role !== 'rahbar' && batch.cutter_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      const lines = normLines(b.lines);
      if (b.photo_id) ctx.db.run('UPDATE batches SET photo_id=? WHERE id=?', attachPhoto(ctx, b.photo_id), batch.id);
      const tot = addCut(ctx, batch.id, lines);
      ctx.audit('cut_added', 'batch', batch.id, null, { lines });
      return { id: batch.id, code: batch.code, ...tot };
    },
  },

  partial_done: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const li = lineOk(ctx, b.line_id);
      if (ctx.me.role !== 'rahbar' && li.cutter_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      const qty = needInt(b.qty, 'qty', 1, 100000);
      ctx.move(li.line_id, qty, 'partial', 0, 'free', 0, 'partial_done', 'b:' + li.batch_id);
      return { ok: true };
    },
  },

  // Boshlang'ich qoldiq: tizimga o'tishdan oldingi bichim/ish qoldiqlari (faqat rahbar, izoh bilan)
  opening_add: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const reason = needText(b.reason, 'reason', 300);
      const state = b.state === 'sewing' ? 'sewing' : 'free';
      let holder = 0;
      if (state === 'sewing') {
        const u = ctx.user(needInt(b.holder_id, 'holder_id', 1));
        if (!u || u.role !== 'tikuvchi' || u.status !== 'active') throw new AppError('bad_input', { field: 'holder_id' });
        holder = u.id;
      }
      const lines = normLines(b.lines, false);
      const nb = newBatch(ctx, b, true);
      for (const l of lines) ctx.move(lineFor(ctx, nb.id, l.size), l.ready, null, 0, state, holder, 'opening', 'b:' + nb.id, reason);
      ctx.audit('opening_added', 'batch', nb.id, null, { state, holder, lines }, reason);
      return nb;
    },
  },

  cut_home: {
    auth: ['bichuvchi', 'rahbar'],
    fn(ctx) {
      const me = ctx.me.id;
      const ids = ctx.db.all(`SELECT DISTINCT b.id FROM batches b WHERE ${ctx.me.role === 'rahbar' ? '1=1' : 'b.cutter_id=?'}
        AND (b.day >= date(?, '-30 day') OR EXISTS(SELECT 1 FROM bal JOIN lines l ON l.id=bal.line_id WHERE l.batch_id=b.id AND bal.state IN('free','partial','reserved') AND bal.qty>0))
        ORDER BY b.id DESC LIMIT 60`, ...(ctx.me.role === 'rahbar' ? [] : [me]), ctx.day).map((r) => r.id);
      const batches = ids.map((id) => batchView(ctx, id, false));
      const today = ctx.db.one(`SELECT
        COALESCE(SUM(CASE WHEN m.kind IN('cut_ready','partial_done') THEN m.qty END),0) ready,
        COALESCE(SUM(CASE WHEN m.kind='cut_partial' THEN m.qty END),0) partial,
        COALESCE(SUM(CASE WHEN m.kind='transfer_reserve' THEN m.qty END),0) given
        FROM moves m WHERE m.day=? AND m.actor_id=?`, ctx.day, me);
      const transfers = ctx.db.all('SELECT * FROM transfers WHERE from_id=? ORDER BY id DESC LIMIT 30', me).map((t) => transferView(ctx, t));
      return { today, batches, transfers };
    },
  },

  batch_detail: {
    auth: 'active',
    fn(ctx, b) {
      const batch = ctx.db.one('SELECT * FROM batches WHERE id=?', needInt(b.batch_id, 'batch_id', 1));
      if (!batch || !canSeeBatch(ctx, batch)) throw new AppError('forbidden', {}, 403);
      const v = batchView(ctx, batch.id, true);
      v.moves = ctx.db.all(`SELECT m.*, l.size, a.first_name af, a.last_name al, fh.first_name ff, th.first_name tf FROM moves m JOIN lines l ON l.id=m.line_id
        LEFT JOIN users a ON a.id=m.actor_id LEFT JOIN users fh ON fh.id=m.from_holder LEFT JOIN users th ON th.id=m.to_holder
        WHERE l.batch_id=? ORDER BY m.id DESC LIMIT 200`, batch.id);
      return v;
    },
  },

  transfer_create: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const to = ctx.user(needInt(b.to_id, 'to_id', 1));
      if (!to || to.role !== 'tikuvchi' || to.status !== 'active') throw new AppError('bad_sewer');
      if (!Array.isArray(b.items) || !b.items.length || b.items.length > 40) throw new AppError('bad_input', { field: 'items' });
      const items = [];
      const seen = new Set();
      for (const it of b.items) {
        const li = lineOk(ctx, it.line_id);
        if (seen.has(li.line_id)) throw new AppError('bad_input', { field: 'items' });
        seen.add(li.line_id);
        if (ctx.me.role !== 'rahbar' && li.cutter_id !== ctx.me.id && !li.opening) throw new AppError('forbidden', {}, 403);
        items.push({ li, qty: needInt(it.qty, 'qty', 1, 100000) });
      }
      const voice = b.voice_id ? attachVoice(ctx, b.voice_id) : null;
      const t = ctx.db.one(`INSERT INTO transfers(code,from_id,to_id,status,via,note,created_at,day,voice_id) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id`,
        'tmp' + ctx.now + Math.random(), ctx.me.id, to.id, 'pending', b.via === 'voice' ? 'voice' : 'manual', optText(b.note, 300), ctx.at, ctx.day, voice);
      const code = 'T-' + String(t.id).padStart(4, '0');
      ctx.db.run('UPDATE transfers SET code=? WHERE id=?', code, t.id);
      for (const it of items) {
        try {
          ctx.move(it.li.line_id, it.qty, 'free', 0, 'reserved', to.id, 'transfer_reserve', 't:' + t.id);
        } catch (e) {
          if (e.code === 'not_enough') throw new AppError('not_enough_free', { have: e.params.have, label: lineLabel(it.li) });
          throw e;
        }
        ctx.db.run('INSERT INTO transfer_items(transfer_id,line_id,qty) VALUES(?,?,?)', t.id, it.li.line_id, it.qty);
      }
      ctx.audit('transfer_created', 'transfer', t.id, null, { code, to: to.id, items: items.map((i) => [i.li.line_id, i.qty]) });
      const total = items.reduce((a, i) => a + i.qty, 0);
      const desc = items.map((i) => `• ${lineLabel(i.li)}: ${i.qty} dona`).join('\n');
      const text = `Sizga ${total} dona ish berildi (${code}), ${fullName(ctx.me)}dan:\n${desc}${b.note ? '\nIzoh: ' + optText(b.note, 300) : ''}\nIlovada sanab, «Qabul qildim» tugmasini bosing.`;
      // Partiya rasmi bo'lsa — xabar rasm bilan boradi (har xil partiya bo'lsa, birinchisining rasmi)
      const ph = items.map((i) => i.li.photo_id).find(Boolean);
      const file = ph ? ctx.db.one('SELECT file_id FROM photos WHERE id=?', ph) : null;
      const vf = voice ? ctx.db.one('SELECT file_id FROM photos WHERE id=?', voice) : null;
      if (to.status === 'active') ctx.notify.push({ tg_id: to.tg_id, text, photo: file ? file.file_id : null, voice: vf ? vf.file_id : null });
      return { id: t.id, code, total };
    },
  },

  transfer_cancel: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const t = ctx.db.one('SELECT * FROM transfers WHERE id=?', needInt(b.id, 'id', 1));
      if (!t) throw new AppError('not_found');
      if (ctx.me.role !== 'rahbar' && t.from_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (!['pending', 'disputed'].includes(t.status)) throw new AppError('bad_state');
      const reason = needText(b.reason, 'reason', 300);
      for (const i of ctx.db.all('SELECT * FROM transfer_items WHERE transfer_id=?', t.id)) {
        ctx.move(i.line_id, i.qty, 'reserved', t.to_id, 'free', 0, 'transfer_release', 't:' + t.id, reason);
      }
      ctx.db.run("UPDATE transfers SET status='cancelled',decided_at=?,decided_by=?,resolve_note=? WHERE id=?", ctx.at, ctx.me.id, reason, t.id);
      ctx.audit('transfer_cancelled', 'transfer', t.id, { status: t.status }, { status: 'cancelled' }, reason);
      ctx.tell(t.to_id, `${t.code} topshirig‘i bekor qilindi. Sabab: ${reason}`);
      return { ok: true };
    },
  },

  sew_home: {
    auth: ['tikuvchi'],
    fn(ctx) {
      const me = ctx.me.id;
      const incoming = ctx.db.all("SELECT * FROM transfers WHERE to_id=? AND status IN('pending','disputed') ORDER BY id", me).map((t) => transferView(ctx, t));
      const hold = ctx.db.all("SELECT line_id, state, qty FROM bal WHERE holder=? AND state IN('sewing','rework','review') AND qty>0", me);
      const byLine = {};
      for (const h of hold) {
        const x = (byLine[h.line_id] ||= { line_id: h.line_id, sewing: 0, rework: 0, review: 0 });
        x[h.state] += h.qty;
      }
      const lines = Object.values(byLine).map((x) => { const li = ctx.lineInfo(x.line_id); return { ...x, label: lineLabel(li), code: li.code, size: li.size, model: li.model, material: li.material, color: li.color, type_name: li.type_name, photo_id: li.photo_id }; });
      const sum = (k) => lines.reduce((a, l) => a + l[k], 0);
      const month = ctx.day.slice(0, 7);
      const acc = ctx.db.one("SELECT COALESCE(SUM(qty),0) q FROM moves WHERE kind='accept' AND to_holder=? AND substr(day,1,7)=?", me, month);
      return { incoming, lines, totals: { sewing: sum('sewing'), rework: sum('rework'), review: sum('review'), accepted_month: acc.q } };
    },
  },

  transfer_accept: {
    auth: ['tikuvchi'], mut: true,
    fn(ctx, b) {
      const t = ctx.db.one('SELECT * FROM transfers WHERE id=?', needInt(b.id, 'id', 1));
      if (!t || t.to_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (t.status === 'accepted') return { ok: true, already: true };
      if (t.status !== 'pending') throw new AppError('bad_state');
      for (const i of ctx.db.all('SELECT * FROM transfer_items WHERE transfer_id=?', t.id)) {
        ctx.move(i.line_id, i.qty, 'reserved', t.to_id, 'sewing', t.to_id, 'transfer_accept', 't:' + t.id);
        ctx.db.run('UPDATE transfer_items SET counted=?, accepted=? WHERE id=?', i.qty, i.qty, i.id);
        earnCutter(ctx, { ...i, accepted: i.qty });
      }
      ctx.db.run("UPDATE transfers SET status='accepted',decided_at=?,decided_by=? WHERE id=?", ctx.at, ctx.me.id, t.id);
      ctx.audit('transfer_accepted', 'transfer', t.id, { status: 'pending' }, { status: 'accepted' });
      ctx.tell(t.from_id, `${fullName(ctx.me)} ${t.code} ni sanab qabul qildi.`);
      return { ok: true };
    },
  },

  transfer_dispute: {
    auth: ['tikuvchi'], mut: true,
    fn(ctx, b) {
      const t = ctx.db.one('SELECT * FROM transfers WHERE id=?', needInt(b.id, 'id', 1));
      if (!t || t.to_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (t.status !== 'pending') throw new AppError('bad_state');
      const note = needText(b.note, 'note', 300);
      const items = ctx.db.all('SELECT * FROM transfer_items WHERE transfer_id=?', t.id);
      for (const c of b.counted || []) {
        const it = items.find((i) => i.id === Number(c.item_id));
        if (!it) throw new AppError('bad_input', { field: 'item_id' });
        ctx.db.run('UPDATE transfer_items SET counted=? WHERE id=?', needInt(c.counted, 'counted', 0, 100000), it.id);
      }
      ctx.db.run("UPDATE transfers SET status='disputed',dispute_note=? WHERE id=?", note, t.id);
      ctx.audit('transfer_disputed', 'transfer', t.id, { status: 'pending' }, { status: 'disputed', counted: b.counted || [] }, note);
      ctx.tell(t.from_id, `${fullName(ctx.me)} ${t.code} bo‘yicha aniqlashtirish so‘radi: ${note}`);
      ctx.tellRahbars(`${fullName(ctx.me)} ${t.code} бўйича тафовут ёзди: ${note}`);
      return { ok: true };
    },
  },

  // Tafovutni rahbar hal qiladi: sanalgan qismi tikuvchiga, qolgani tarqatilmaganga qaytadi yoki izoh bilan hisobdan chiqariladi.
  transfer_resolve: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const t = ctx.db.one('SELECT * FROM transfers WHERE id=?', needInt(b.id, 'id', 1));
      if (!t || !['pending', 'disputed'].includes(t.status)) throw new AppError('bad_state');
      const note = needText(b.note, 'note', 300);
      const rest = b.rest === 'writeoff' ? 'writeoff' : 'free';
      const items = ctx.db.all('SELECT * FROM transfer_items WHERE transfer_id=?', t.id);
      for (const i of items) {
        const spec = (b.items || []).find((x) => Number(x.item_id) === i.id);
        const acc = needInt(spec ? spec.accept : (i.counted ?? i.qty), 'accept', 0, i.qty);
        if (acc > 0) {
          ctx.move(i.line_id, acc, 'reserved', t.to_id, 'sewing', t.to_id, 'transfer_accept', 't:' + t.id, note);
          earnCutter(ctx, { ...i, accepted: acc });
        }
        const r = i.qty - acc;
        if (r > 0) ctx.move(i.line_id, r, 'reserved', t.to_id, rest, rest === 'writeoff' ? t.to_id : 0, rest === 'writeoff' ? 'writeoff' : 'transfer_release', 't:' + t.id, note);
        ctx.db.run('UPDATE transfer_items SET accepted=? WHERE id=?', acc, i.id);
      }
      ctx.db.run("UPDATE transfers SET status='resolved',decided_at=?,decided_by=?,resolve_note=? WHERE id=?", ctx.at, ctx.me.id, note, t.id);
      ctx.audit('transfer_resolved', 'transfer', t.id, { status: t.status }, { status: 'resolved', rest, items: b.items || null }, note);
      ctx.tell(t.to_id, `${t.code} bo‘yicha rahbar qaror qildi: ${note}`);
      ctx.tell(t.from_id, `${t.code} bo‘yicha rahbar qaror qildi: ${note}`);
      return { ok: true };
    },
  },

  transfers_list: {
    auth: 'rahbar',
    fn(ctx, b) {
      const st = ['pending', 'disputed', 'accepted', 'cancelled', 'resolved'].includes(b.status) ? b.status : 'disputed';
      return ctx.db.all('SELECT * FROM transfers WHERE status=? ORDER BY id DESC LIMIT 100', st).map((t) => transferView(ctx, t));
    },
  },

  // Tikuvchi: «Tayyorladim / Topshirdim». Faqat o'zidagi qoldiqdan.
  submit: {
    auth: ['tikuvchi'], mut: true,
    fn(ctx, b) {
      const li = lineOk(ctx, b.line_id);
      const from = b.from === 'rework' ? 'rework' : 'sewing';
      const qty = needInt(b.qty, 'qty', 1, 100000);
      const have = ctx.balance(li.line_id, from, ctx.me.id);
      if (qty > have) throw new AppError('have_only', { have });
      const s = ctx.db.one('INSERT INTO submissions(sewer_id,line_id,qty,open_qty,from_state,at,day) VALUES(?,?,?,?,?,?,?) RETURNING id',
        ctx.me.id, li.line_id, qty, qty, from, ctx.at, ctx.day);
      ctx.move(li.line_id, qty, from, ctx.me.id, 'review', ctx.me.id, 'submit', 's:' + s.id);
      ctx.audit('submitted', 'submission', s.id, null, { line_id: li.line_id, qty, from });
      return { id: s.id, left: have - qty };
    },
  },

  insp_list: {
    auth: 'inspect',
    fn(ctx) {
      return ctx.db.all("SELECT s.*, u.first_name, u.last_name FROM submissions s JOIN users u ON u.id=s.sewer_id WHERE s.open_qty>0 ORDER BY s.id")
        .map((s) => { const li = ctx.lineInfo(s.line_id); return { ...s, name: fullName(s), label: lineLabel(li), code: li.code, size: li.size, model: li.model, material: li.material, color: li.color, type_name: li.type_name, photo_id: li.photo_id, time: tHM(Date.parse(s.at)), own: s.sewer_id === ctx.me.id }; });
    },
  },

  // Jismoniy tekshiruv: qabul / qayta ishlashga / brak. Har bir dona aniq holatga o'tadi.
  inspect: {
    auth: 'inspect', mut: true,
    fn(ctx, b) {
      const s = ctx.db.one('SELECT * FROM submissions WHERE id=?', needInt(b.submission_id, 'submission_id', 1));
      if (!s) throw new AppError('not_found');
      if (s.sewer_id === ctx.me.id) throw new AppError('self_forbidden');
      const acc = needInt(b.accepted || 0, 'accepted', 0, 100000), rw = needInt(b.rework || 0, 'rework', 0, 100000), wo = needInt(b.writeoff || 0, 'writeoff', 0, 100000);
      const n = acc + rw + wo;
      if (n < 1) throw new AppError('bad_input', { field: 'qty' });
      if (n > s.open_qty) throw new AppError('have_only', { have: s.open_qty });
      const reason = optText(b.reason, 300);
      if ((rw || wo) && !reason) throw new AppError('need_reason');
      const insp = ctx.db.one('INSERT INTO inspections(submission_id,accepted,rework,writeoff,reason,inspector_id,at,day) VALUES(?,?,?,?,?,?,?,?) RETURNING id',
        s.id, acc, rw, wo, reason, ctx.me.id, ctx.at, ctx.day);
      const ref = 'i:' + insp.id;
      if (acc) ctx.move(s.line_id, acc, 'review', s.sewer_id, 'accepted', s.sewer_id, 'accept', ref);
      if (rw) ctx.move(s.line_id, rw, 'review', s.sewer_id, 'rework', s.sewer_id, 'rework', ref, reason);
      if (wo) ctx.move(s.line_id, wo, 'review', s.sewer_id, 'writeoff', s.sewer_id, 'writeoff', ref, reason);
      ctx.db.run('UPDATE submissions SET open_qty=open_qty-? WHERE id=?', n, s.id);
      if (acc) ctx.earn(s.sewer_id, 'tikish', 'insp:' + insp.id, s.line_id, acc);
      ctx.audit('inspected', 'submission', s.id, { open_qty: s.open_qty }, { accepted: acc, rework: rw, writeoff: wo }, reason);
      const parts = [acc && `${acc} dona qabul qilindi`, rw && `${rw} dona qayta ishlashga qaytdi`, wo && `${wo} dona brak deb hisobdan chiqarildi`].filter(Boolean).join(', ');
      ctx.tell(s.sewer_id, `Tekshiruv natijasi: ${parts}.${reason ? ' Izoh: ' + reason : ''}`);
      return { id: insp.id };
    },
  },

  // Hujjatlashtirilgan hisobdan chiqarish (yo'qolgan, buzilgan va h.k.), faqat rahbar, sabab bilan
  writeoff: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const li = lineOk(ctx, b.line_id);
      const state = b.state;
      if (!['free', 'sewing', 'rework'].includes(state)) throw new AppError('bad_input', { field: 'state' });
      const holder = state === 'free' ? 0 : needInt(b.holder, 'holder', 1);
      const qty = needInt(b.qty, 'qty', 1, 100000);
      const reason = needText(b.reason, 'reason', 300);
      ctx.move(li.line_id, qty, state, holder, 'writeoff', holder, 'writeoff', 'doc', reason);
      ctx.audit('writeoff', 'line', li.line_id, null, { state, holder, qty }, reason);
      return { ok: true };
    },
  },

  my_moves: {
    auth: ['bichuvchi', 'tikuvchi'],
    fn(ctx, b) {
      const me = ctx.me.id;
      const from = b.from || '2000-01-01', to = b.to || '2999-12-31';
      return ctx.db.all(`SELECT m.*, l.size, bt.code, bt.model, bt.material, bt.color, c.name type_name FROM moves m JOIN lines l ON l.id=m.line_id
        JOIN batches bt ON bt.id=l.batch_id LEFT JOIN catalog c ON c.id=bt.type_id
        WHERE (m.actor_id=? OR m.to_holder=? OR m.from_holder=?) AND m.day BETWEEN ? AND ? ORDER BY m.id DESC LIMIT 300`, me, me, me, from, to)
        .map((m) => ({ ...m, time: tHM(Date.parse(m.at)) }));
    },
  },
};
