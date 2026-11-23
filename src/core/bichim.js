// Fasonlar va tariflar, «Bichdim» yozuvlari (har biri alohida), tuzatish tarixi («Изменить»),
// bichishga yordamchi ulushi va rahbar tanlagan sinov/xato yozuvini hisobdan chiqarish.
// Qoidalar: hech narsa jismonan o'chirilmaydi. Qoldiq faqat harakat (moves) orqali, haq faqat qo'shimcha (delta) yozuv orqali o'zgaradi.
import { attachPhoto } from './photos.js';
import { AppError, needInt, needText, needDay, optText, fullName, tHM } from './base.js';

const SIZE_RE = /^[0-9A-Za-z\-\/ ]{1,12}$/;
const normSize = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  if (!SIZE_RE.test(s)) throw new AppError('bad_input', { field: 'size' });
  return s;
};

function lineFor(ctx, batchId, size) {
  const ex = ctx.db.one('SELECT id FROM lines WHERE batch_id=? AND size=?', batchId, size);
  if (ex) return ex.id;
  return ctx.db.one('INSERT INTO lines(batch_id,size) VALUES(?,?) RETURNING id', batchId, size).id;
}

const flatPrice = (ctx, work, day) => { const r = ctx.flatRate(work, day); return r ? r.price : null; };

function cutLines(ctx, cutId) {
  return ctx.db.all(`SELECT cl.*, l.size FROM cut_lines cl JOIN lines l ON l.id=cl.line_id WHERE cl.cut_id=?
    ORDER BY CAST(l.size AS INTEGER), l.size`, cutId);
}

function snap(ctx, cut) {
  const h = cut.helper_id ? ctx.user(cut.helper_id) : null;
  const lines = cutLines(ctx, cut.id).map((l) => ({ size: l.size, ready: l.ready, partial: l.partial }));
  return { lines, ready: lines.reduce((a, l) => a + l.ready, 0), partial: lines.reduce((a, l) => a + l.partial, 0),
    helper_id: cut.helper_id || null, helper_name: h ? fullName(h) : null, helper_qty: cut.helper_qty || 0 };
}

// Shu bichim uchun kimga qancha dona haq yozilishi kerak (faqat yangi tartibdagi — «Bichdim»da haq yoziladigan — partiyalar)
function payTargets(ctx, cut, batch) {
  if (!batch.pay_on_cut || cut.status !== 'active') return [];
  const ready = ctx.db.one('SELECT COALESCE(SUM(ready),0) n FROM cut_lines WHERE cut_id=?', cut.id).n;
  const out = [];
  const cutter = cut.cutter_id ? ctx.user(cut.cutter_id) : null;
  if (cutter && cutter.role === 'bichuvchi') out.push({ user_id: cutter.id, work: 'bichish', qty: ready - (cut.helper_id ? cut.helper_qty : 0), price: cut.cut_price });
  if (cut.helper_id && cut.helper_qty > 0) out.push({ user_id: cut.helper_id, work: 'bichish_yordam', qty: cut.helper_qty, price: cut.helper_price });
  return out;
}

// Haqni kerakli holatga keltiradi: farq (delta) yangi yozuv sifatida qo'shiladi, eski yozuvlar o'zgarmaydi.
function syncPay(ctx, cut, tag, note) {
  const batch = ctx.db.one('SELECT * FROM batches WHERE id=?', cut.batch_id);
  if (!batch.pay_on_cut) return;
  const want = payTargets(ctx, cut, batch);
  const have = ctx.db.all("SELECT user_id, work, SUM(qty) q FROM earnings WHERE cut_id=? AND src LIKE 'cut:%' GROUP BY user_id, work", cut.id);
  const keys = new Map();
  for (const h of have) keys.set(h.user_id + '|' + h.work, { user_id: h.user_id, work: h.work, have: h.q, want: 0, price: null });
  for (const w of want) {
    const k = w.user_id + '|' + w.work;
    const x = keys.get(k) || { user_id: w.user_id, work: w.work, have: 0 };
    keys.set(k, { ...x, want: w.qty, price: w.price });
  }
  const firstLine = (ctx.db.one('SELECT line_id FROM cut_lines WHERE cut_id=? ORDER BY id LIMIT 1', cut.id)
    || ctx.db.one('SELECT id line_id FROM lines WHERE batch_id=? ORDER BY id LIMIT 1', cut.batch_id)).line_id;
  for (const x of keys.values()) {
    const d = x.want - x.have;
    if (!d) continue;
    // Narx o'sha bichim kunidagi tarif (cuts jadvalida saqlangan)
    const price = x.price != null ? x.price : (x.work === 'bichish' ? cut.cut_price : cut.helper_price);
    ctx.db.run(`INSERT INTO earnings(user_id,work,src,line_id,qty,day,rate_id,price,amount,created_at,cut_id,note)
      VALUES(?,?,?,?,?,?,NULL,?,?,?,?,?)`, x.user_id, x.work, `cut:${cut.id}:${tag}:${x.user_id}:${x.work}`, firstLine, d,
      tag === 'new' ? cut.day : ctx.day, price, price == null ? null : price * d, ctx.at, cut.id, note || null);
  }
}

function cutView(ctx, cut, full) {
  const b = ctx.db.one(`SELECT b.*, c.name type_name, f.name fason_name FROM batches b LEFT JOIN catalog c ON c.id=b.type_id
    LEFT JOIN fasons f ON f.id=b.fason_id WHERE b.id=?`, cut.batch_id);
  const lines = cutLines(ctx, cut.id).map((l) => ({ line_id: l.line_id, size: l.size, ready: l.ready, partial: l.partial,
    free: ctx.balance(l.line_id, 'free', 0), partial_bal: ctx.balance(l.line_id, 'partial', 0) }));
  const ready = lines.reduce((a, l) => a + l.ready, 0), partial = lines.reduce((a, l) => a + l.partial, 0);
  const cutter = cut.cutter_id ? ctx.user(cut.cutter_id) : null, helper = cut.helper_id ? ctx.user(cut.helper_id) : null;
  const pay = ctx.db.all(`SELECT e.user_id, e.work, SUM(e.qty) qty, SUM(e.amount) amount, MAX(e.price) price, SUM(e.amount IS NULL) missing
    FROM earnings e WHERE e.cut_id=? GROUP BY e.user_id, e.work`, cut.id)
    .map((p) => ({ ...p, name: fullName(ctx.user(p.user_id)) }));
  const fr = b.fason_id ? ctx.fasonRate(b.fason_id, cut.day) : null;
  const out = {
    id: cut.id, batch_id: b.id, code: b.code, day: cut.day, time: tHM(Date.parse(cut.at)), at: cut.at, status: cut.status, legacy: !!cut.legacy,
    pay_on_cut: !!b.pay_on_cut, type_name: b.type_name, model: b.model, fason_id: b.fason_id, fason_name: b.fason_name || b.model,
    material: b.material, color: b.color, photo_id: b.photo_id, note: b.note,
    cutter_id: cut.cutter_id, cutter: cutter ? fullName(cutter) : null, helper_id: cut.helper_id, helper: helper ? fullName(helper) : null,
    helper_qty: cut.helper_qty || 0, cutter_qty: ready - (cut.helper_id ? cut.helper_qty : 0),
    cut_price: cut.cut_price, helper_price: cut.helper_price,
    sew: fr ? { price: fr.sew_price, extra: fr.extra_price, extra_note: fr.extra_note } : null,
    lines, ready, partial, pay, edited_at: cut.edited_at, void_at: cut.void_at, void_reason: cut.void_reason,
    edits_n: ctx.db.one('SELECT COUNT(*) n FROM cut_edits WHERE cut_id=?', cut.id).n,
    can_edit: cut.status === 'active' && (ctx.me.role === 'rahbar' || cut.cutter_id === ctx.me.id),
  };
  if (full) {
    out.edits = ctx.db.all(`SELECT e.*, u.first_name, u.last_name FROM cut_edits e LEFT JOIN users u ON u.id=e.actor_id WHERE e.cut_id=? ORDER BY e.id DESC`, cut.id)
      .map((e) => ({ id: e.id, kind: e.kind, at: e.at, day: e.day, time: tHM(Date.parse(e.at)), actor: fullName(e), reason: e.reason,
        before: JSON.parse(e.before), after: JSON.parse(e.after) }));
  }
  return out;
}

const getCut = (ctx, id) => {
  const c = ctx.db.one('SELECT * FROM cuts WHERE id=?', needInt(id, 'cut_id', 1));
  if (!c) throw new AppError('not_found');
  return c;
};

// Shu partiya qatorlariga tegishli topshirishlar (bog'liqlikni ko'rsatish uchun)
function linkedTransfers(ctx, lineIds) {
  if (!lineIds.length) return [];
  const q = lineIds.map(() => '?').join(',');
  return ctx.db.all(`SELECT t.id, t.code, t.status, t.day, t.to_id, u.first_name, u.last_name, l.size, ti.qty,
      (SELECT COUNT(*) FROM transfer_items x JOIN lines xl ON xl.id=x.line_id WHERE x.transfer_id=t.id AND x.line_id NOT IN (${q})) other
    FROM transfer_items ti JOIN transfers t ON t.id=ti.transfer_id JOIN lines l ON l.id=ti.line_id LEFT JOIN users u ON u.id=t.to_id
    WHERE ti.line_id IN (${q}) ORDER BY t.id`, ...lineIds, ...lineIds)
    .map((r) => ({ id: r.id, code: r.code, status: r.status, day: r.day, to: fullName(r), size: r.size, qty: r.qty, mixed: r.other > 0 }));
}

function helperOk(ctx, id, keepId) {
  const u = ctx.user(needInt(id, 'helper_id', 1));
  // Tasdiqlangan (faol) tikuvchi; avval tanlangan yordamchi keyin faolsiz bo'lsa ham yozuvda qoladi
  if (!u || u.role !== 'tikuvchi' || (u.status !== 'active' && u.id !== keepId)) throw new AppError('bad_helper');
  return u;
}

function sig(o) {
  const s = JSON.stringify(o);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Hisobdan chiqarish ta'siri: nima o'zgaradi va to'sqinlik bormi
function voidImpact(ctx, cut) {
  const batch = ctx.db.one('SELECT * FROM batches WHERE id=?', cut.batch_id);
  const active = ctx.db.one("SELECT COUNT(*) n FROM cuts WHERE batch_id=? AND status='active'", batch.id).n;
  const allLines = ctx.db.all('SELECT id, size FROM lines WHERE batch_id=?', batch.id);
  const lineIds = allLines.map((l) => l.id);
  const mode = active <= 1 ? 'chain' : 'stock';
  const blockers = [];
  let stock = [];
  const cls = cutLines(ctx, cut.id);
  if (mode === 'stock') {
    // Bir partiyada bir nechta bichim bor (eski yozuvlar): faqat shu bichimning erkin/chala qismi olinadi
    for (const l of cls) {
      if (l.ready) stock.push({ size: l.size, state: 'free', holder: 0, name: null, qty: l.ready, have: ctx.balance(l.line_id, 'free', 0), line_id: l.line_id });
      if (l.partial) stock.push({ size: l.size, state: 'partial', holder: 0, name: null, qty: l.partial, have: ctx.balance(l.line_id, 'partial', 0), line_id: l.line_id });
    }
    const short = stock.filter((s) => s.have < s.qty);
    if (short.length) blockers.push({ code: 'given', items: short.map((s) => ({ size: s.size, state: s.state, need: s.qty, have: s.have })) });
  } else if (lineIds.length) {
    const q = lineIds.map(() => '?').join(',');
    stock = ctx.db.all(`SELECT bal.line_id, bal.state, bal.holder, bal.qty, l.size, u.first_name, u.last_name FROM bal JOIN lines l ON l.id=bal.line_id
      LEFT JOIN users u ON u.id=bal.holder WHERE bal.line_id IN (${q}) AND bal.qty>0 ORDER BY l.size, bal.state`, ...lineIds)
      .map((r) => ({ size: r.size, state: r.state, holder: r.holder, name: r.holder ? fullName(r) : null, qty: r.qty, line_id: r.line_id }));
  }
  const transfers = linkedTransfers(ctx, mode === 'chain' ? lineIds : cls.map((l) => l.line_id));
  if (mode === 'chain' && transfers.some((t) => t.mixed)) {
    blockers.push({ code: 'mixed_transfer', codes: [...new Set(transfers.filter((t) => t.mixed).map((t) => t.code))] });
  }
  // Qaytariladigan haq: shu partiya qatorlariga yozilgan barcha haq (bichish, yordam, tikish), sof qoldig'i
  let earn = [];
  if (mode === 'chain' && lineIds.length) {
    const q = lineIds.map(() => '?').join(',');
    earn = ctx.db.all(`SELECT e.user_id, e.work, e.price, e.extra, SUM(e.qty) qty, SUM(e.amount) amount, SUM(e.amount IS NULL) missing, MIN(e.day) first_day, MAX(e.day) last_day
      FROM earnings e WHERE e.line_id IN (${q}) AND e.order_id IS NULL GROUP BY e.user_id, e.work, e.price, e.extra HAVING SUM(e.qty)<>0`, ...lineIds)
      .map((e) => ({ ...e, name: fullName(ctx.user(e.user_id)) }));
  } else if (batch.pay_on_cut) {
    earn = ctx.db.all(`SELECT e.user_id, e.work, e.price, e.extra, SUM(e.qty) qty, SUM(e.amount) amount, SUM(e.amount IS NULL) missing, MIN(e.day) first_day, MAX(e.day) last_day
      FROM earnings e WHERE e.cut_id=? GROUP BY e.user_id, e.work, e.price, e.extra HAVING SUM(e.qty)<>0`, cut.id).map((e) => ({ ...e, name: fullName(ctx.user(e.user_id)) }));
  }
  // Ogohlantirish: haq yopilgan davrga yoki xodim tasdiqlagan oylik hisobga kirgan bo'lsa (qaytarish bugungi sana bilan yoziladi)
  const warns = [];
  for (const e of earn) {
    const cl = ctx.db.one('SELECT period_from, period_to FROM closures WHERE user_id=? AND period_to>=? AND period_from<=? ORDER BY period_to DESC LIMIT 1', e.user_id, e.first_day, e.last_day);
    const rk = ctx.db.one("SELECT period FROM reckonings WHERE user_id=? AND status='confirmed' AND to_day>=? AND from_day<=? ORDER BY id DESC LIMIT 1", e.user_id, e.first_day, e.last_day);
    if (cl || rk) warns.push({ name: e.name, closed: cl ? cl.period_from + ' — ' + cl.period_to : null, rk: rk ? rk.period : null });
  }
  const openSubs = lineIds.length ? ctx.db.one(`SELECT COALESCE(SUM(open_qty),0) n FROM submissions WHERE line_id IN (${lineIds.map(() => '?').join(',')})`, ...lineIds).n : 0;
  const body = { mode, stock: stock.map(({ line_id, state, holder, qty }) => [line_id, state, holder, qty]), earn: earn.map((e) => [e.user_id, e.work, e.price, e.qty, e.amount]) };
  return { mode, stock, transfers, earn, warns, open_submissions: mode === 'chain' ? openSubs : 0, blockers, sig: sig(body), cut: cutView(ctx, cut, false) };
}

export const actions = {
  // ---------- Fasonlar va tariflar ----------
  tariffs: {
    auth: 'active',
    fn(ctx) {
      const day = ctx.day;
      const fasons = ctx.db.all(`SELECT f.*, c.name type_name FROM fasons f LEFT JOIN catalog c ON c.id=f.type_id ORDER BY f.active DESC, c.name, f.name`).map((f) => {
        const cur = ctx.fasonRate(f.id, day);
        const hist = ctx.me.role === 'rahbar' ? ctx.db.all('SELECT * FROM fason_rates WHERE fason_id=? ORDER BY valid_from DESC, id DESC', f.id) : [];
        const next = ctx.db.one('SELECT * FROM fason_rates WHERE fason_id=? AND valid_from>? ORDER BY valid_from, id LIMIT 1', f.id, day);
        return { id: f.id, name: f.name, type_id: f.type_id, type_name: f.type_name, active: !!f.active,
          sew: cur ? { price: cur.sew_price, extra: cur.extra_price, extra_note: cur.extra_note, total: cur.sew_price + cur.extra_price, valid_from: cur.valid_from } : null,
          next: next ? { price: next.sew_price, extra: next.extra_price, valid_from: next.valid_from } : null, history: hist };
      });
      const flat = {};
      for (const w of ['bichish', 'bichish_yordam']) {
        const cur = ctx.flatRate(w, day);
        flat[w] = { price: cur ? cur.price : null, valid_from: cur ? cur.valid_from : null,
          history: ctx.me.role === 'rahbar' ? ctx.db.all('SELECT * FROM flat_rates WHERE work=? ORDER BY valid_from DESC, id DESC', w) : [] };
      }
      const types = ctx.db.all("SELECT id,name FROM catalog WHERE kind='type' AND active=1 ORDER BY name");
      const missing = ctx.me.role === 'rahbar' ? ctx.db.one('SELECT COUNT(*) n, COALESCE(SUM(qty),0) q FROM earnings WHERE amount IS NULL') : null;
      return { fasons: ctx.me.role === 'rahbar' ? fasons : fasons.filter((f) => f.active), flat, types, missing };
    },
  },

  fason_save: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const name = needText(b.name, 'name', 60);
      const typeId = needInt(b.type_id, 'type_id', 1);
      if (!ctx.db.one("SELECT id FROM catalog WHERE id=? AND kind='type'", typeId)) throw new AppError('bad_input', { field: 'type_id' });
      if (b.id) {
        const f = ctx.db.one('SELECT * FROM fasons WHERE id=?', needInt(b.id, 'id', 1));
        if (!f) throw new AppError('not_found');
        const dup = ctx.db.one('SELECT id FROM fasons WHERE type_id=? AND lower(name)=lower(?) AND id<>?', typeId, name, f.id);
        if (dup) throw new AppError('fason_exists');
        const active = b.active === undefined ? f.active : (b.active ? 1 : 0);
        ctx.db.run('UPDATE fasons SET name=?, type_id=?, active=? WHERE id=?', name, typeId, active, f.id);
        ctx.audit('fason_updated', 'fason', f.id, { name: f.name, type_id: f.type_id, active: f.active }, { name, type_id: typeId, active });
        return { id: f.id };
      }
      if (ctx.db.one('SELECT id FROM fasons WHERE type_id=? AND lower(name)=lower(?)', typeId, name)) throw new AppError('fason_exists');
      const r = ctx.db.one('INSERT INTO fasons(name,type_id,active,created_by,created_at) VALUES(?,?,1,?,?) RETURNING id', name, typeId, ctx.me.id, ctx.at);
      ctx.audit('fason_created', 'fason', r.id, null, { name, type_id: typeId });
      if (b.sew_price !== undefined && b.sew_price !== null && b.sew_price !== '') actions.fason_rate_set.fn(ctx, { fason_id: r.id, sew_price: b.sew_price, extra_price: b.extra_price, extra_note: b.extra_note, valid_from: ctx.day });
      return { id: r.id };
    },
  },

  // Tikish tarifi: asosiy narx va alohida qo'shimcha haq (aplikatsiya, tosh terish...). Dona uchun jami = asosiy + qo'shimcha (bir marta).
  // Yangi versiya sanadan amal qiladi; oldingi hisoblar o'sha paytdagi narx bilan qoladi.
  fason_rate_set: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const f = ctx.db.one('SELECT * FROM fasons WHERE id=?', needInt(b.fason_id, 'fason_id', 1));
      if (!f) throw new AppError('not_found');
      const sew = needInt(b.sew_price, 'sew_price', 0, 100000000);
      const extra = b.extra_price === undefined || b.extra_price === null || b.extra_price === '' ? 0 : needInt(b.extra_price, 'extra_price', 0, 100000000);
      const extraNote = extra ? optText(b.extra_note, 80) : null;
      const from = needDay(b.valid_from || ctx.day, 'valid_from');
      const before = ctx.fasonRate(f.id, from);
      const r = ctx.db.one(`INSERT INTO fason_rates(fason_id,sew_price,extra_price,extra_note,valid_from,note,created_by,created_at)
        VALUES(?,?,?,?,?,?,?,?) RETURNING id`, f.id, sew, extra, extraNote, from, optText(b.note, 200), ctx.me.id, ctx.at);
      ctx.audit('fason_rate_set', 'fason', f.id, before ? { sew_price: before.sew_price, extra_price: before.extra_price, valid_from: before.valid_from } : null,
        { name: f.name, sew_price: sew, extra_price: extra, extra_note: extraNote, total: sew + extra, valid_from: from }, optText(b.note, 200));
      return { id: r.id, total: sew + extra };
    },
  },

  flat_rate_set: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      if (!['bichish', 'bichish_yordam'].includes(b.work)) throw new AppError('bad_input', { field: 'work' });
      const price = needInt(b.price, 'price', 0, 100000000);
      const from = needDay(b.valid_from || ctx.day, 'valid_from');
      const before = ctx.flatRate(b.work, from);
      const r = ctx.db.one('INSERT INTO flat_rates(work,price,valid_from,note,created_by,created_at) VALUES(?,?,?,?,?,?) RETURNING id',
        b.work, price, from, optText(b.note, 200), ctx.me.id, ctx.at);
      ctx.audit('flat_rate_set', 'rate', r.id, before ? { price: before.price, valid_from: before.valid_from } : null, { work: b.work, price, valid_from: from });
      return { id: r.id };
    },
  },

  // ---------- «Bichdim» ----------
  cut_meta: {
    auth: ['bichuvchi', 'rahbar'],
    fn(ctx) {
      const fasons = ctx.db.all("SELECT f.id, f.name, c.name type_name FROM fasons f LEFT JOIN catalog c ON c.id=f.type_id WHERE f.active=1 ORDER BY c.name, f.name");
      const helpers = ctx.db.all("SELECT id, first_name, last_name FROM users WHERE role='tikuvchi' AND status='active' AND profile_done=1 ORDER BY first_name, last_name")
        .map((u) => ({ id: u.id, name: fullName(u) }));
      const sugg = {};
      for (const k of ['material', 'color']) sugg[k] = ctx.db.all('SELECT name FROM catalog WHERE kind=? AND active=1 ORDER BY name', k).map((r) => r.name);
      return { fasons, helpers, sugg, cut_price: flatPrice(ctx, 'bichish', ctx.day), helper_price: flatPrice(ctx, 'bichish_yordam', ctx.day) };
    },
  },

  cut_create: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const f = ctx.db.one('SELECT * FROM fasons WHERE id=? AND active=1', needInt(b.fason_id, 'fason_id', 1));
      if (!f) throw new AppError('bad_input', { field: 'fason_id' });
      const material = needText(b.material, 'material', 60), color = needText(b.color, 'color', 40);
      if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 40) throw new AppError('bad_input', { field: 'lines' });
      const seen = new Set(), lines = [];
      for (const l of b.lines) {
        const size = normSize(l.size);
        if (seen.has(size)) throw new AppError('dup_size', { size });
        seen.add(size);
        const ready = needInt(l.ready || 0, 'ready', 0, 100000), partial = needInt(l.partial || 0, 'partial', 0, 100000);
        if (ready + partial > 0) lines.push({ size, ready, partial });
      }
      if (!lines.length) throw new AppError('bad_input', { field: 'qty' });
      const ready = lines.reduce((a, l) => a + l.ready, 0), partial = lines.reduce((a, l) => a + l.partial, 0);
      let helper = null, helperQty = 0;
      if (b.helper_id) {
        helper = helperOk(ctx, b.helper_id);
        helperQty = needInt(b.helper_qty, 'helper_qty', 0, 100000);
        if (helperQty > ready) throw new AppError('helper_too_much', { max: ready });
        if (!helperQty) helper = null;
      }
      const tmp = 'tmp-' + ctx.now + '-' + Math.random();
      const bt = ctx.db.one(`INSERT INTO batches(code,day,cutter_id,type_id,model,material,color,note,opening,created_by,created_at,fason_id,pay_on_cut)
        VALUES(?,?,?,?,?,?,?,?,0,?,?,?,1) RETURNING id`, tmp, ctx.day, ctx.me.id, f.type_id, f.name, material, color, optText(b.note, 300), ctx.me.id, ctx.at, f.id);
      const code = 'P-' + String(bt.id).padStart(4, '0');
      ctx.db.run('UPDATE batches SET code=? WHERE id=?', code, bt.id);
      if (b.photo_id) ctx.db.run('UPDATE batches SET photo_id=? WHERE id=?', attachPhoto(ctx, b.photo_id), bt.id);
      for (const [kind, name] of [['material', material], ['color', color]]) {
        ctx.db.run('INSERT INTO catalog(kind,name,created_by,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING', kind, name, ctx.me.id, ctx.at);
      }
      const c = ctx.db.one(`INSERT INTO cuts(batch_id,cutter_id,day,at,status,legacy,helper_id,helper_qty,cut_price,helper_price,created_by)
        VALUES(?,?,?,?,'active',0,?,?,?,?,?) RETURNING id`, bt.id, ctx.me.id, ctx.day, ctx.at, helper ? helper.id : null, helperQty,
        flatPrice(ctx, 'bichish', ctx.day), helper ? flatPrice(ctx, 'bichish_yordam', ctx.day) : null, ctx.me.id);
      for (const l of lines) {
        const lid = lineFor(ctx, bt.id, l.size);
        ctx.db.run('INSERT INTO cut_lines(cut_id,line_id,ready,partial) VALUES(?,?,?,?)', c.id, lid, l.ready, l.partial);
        if (l.ready) ctx.move(lid, l.ready, null, 0, 'free', 0, 'cut_ready', 'c:' + c.id);
        if (l.partial) ctx.move(lid, l.partial, null, 0, 'partial', 0, 'cut_partial', 'c:' + c.id);
      }
      const cut = ctx.db.one('SELECT * FROM cuts WHERE id=?', c.id);
      syncPay(ctx, cut, 'new');
      ctx.audit('cut_created', 'cut', c.id, null, { code, fason: f.name, lines, helper_id: helper ? helper.id : null, helper_qty: helperQty });
      if (helper) ctx.tell(helper, `${fullName(ctx.me)} sizni bichishga yordamchi qilib yozdi: ${code}, «${f.name}», ${helperQty} dona. Bu «Bichishga yordam» bo‘lib hisobingizga yoziladi.`);
      return { id: c.id, batch_id: bt.id, code, ready, partial, helper_qty: helperQty };
    },
  },

  cut_list: {
    auth: ['bichuvchi', 'rahbar'],
    fn(ctx, b) {
      const w = [], p = [];
      if (ctx.me.role !== 'rahbar') { w.push('c.cutter_id=?'); p.push(ctx.me.id); } else if (b.cutter_id) { w.push('c.cutter_id=?'); p.push(Number(b.cutter_id)); }
      if (b.status === 'active' || b.status === 'void') { w.push('c.status=?'); p.push(b.status); }
      if (b.from) { w.push('c.day>=?'); p.push(needDay(b.from, 'from')); }
      if (b.to) { w.push('c.day<=?'); p.push(needDay(b.to, 'to')); }
      if (b.edited) w.push('EXISTS(SELECT 1 FROM cut_edits e WHERE e.cut_id=c.id)');
      const lim = Math.min(Number(b.limit) || 60, 300);
      return ctx.db.all(`SELECT c.* FROM cuts c ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.id DESC LIMIT ?`, ...p, lim).map((c) => cutView(ctx, c, false));
    },
  },

  cut_detail: {
    auth: ['bichuvchi', 'rahbar'],
    fn(ctx, b) {
      const c = getCut(ctx, b.cut_id);
      if (ctx.me.role !== 'rahbar' && c.cutter_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      const v = cutView(ctx, c, true);
      v.transfers = linkedTransfers(ctx, v.lines.map((l) => l.line_id));
      if (ctx.me.role === 'rahbar' || c.cutter_id === ctx.me.id) v.helpers = actions.cut_meta.fn(ctx).helpers;
      return v;
    },
  },

  // «Изменить»: razmerlar bo'yicha sonni tuzatish (0 gacha), yordamchi va ulushni o'zgartirish. Sabab majburiy.
  cut_edit: {
    auth: ['bichuvchi', 'rahbar'], mut: true,
    fn(ctx, b) {
      const cut = getCut(ctx, b.cut_id);
      if (ctx.me.role !== 'rahbar' && cut.cutter_id !== ctx.me.id) throw new AppError('forbidden', {}, 403);
      if (cut.status !== 'active') throw new AppError('bad_state');
      const reason = String(b.reason ?? '').trim().replace(/\s+/g, ' ');
      if (reason.length < 3) throw new AppError('need_reason');
      if (reason.length > 300) throw new AppError('bad_input', { field: 'reason' });
      const batch = ctx.db.one('SELECT * FROM batches WHERE id=?', cut.batch_id);
      if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 40) throw new AppError('bad_input', { field: 'lines' });
      const old = new Map(cutLines(ctx, cut.id).map((l) => [l.size, l]));
      const seen = new Set(), plan = [];
      for (const l of b.lines) {
        const size = normSize(l.size);
        if (seen.has(size)) throw new AppError('dup_size', { size });
        seen.add(size);
        const ready = needInt(l.ready || 0, 'ready', 0, 100000), partial = needInt(l.partial || 0, 'partial', 0, 100000);
        const o = old.get(size);
        if (!o && !ready && !partial) continue;
        plan.push({ size, o, ready, partial, dr: ready - (o ? o.ready : 0), dp: partial - (o ? o.partial : 0) });
      }
      // Ko'rsatilmagan eski razmerlar o'zgarmaydi
      const newReady = [...old.values()].filter((o) => !seen.has(o.size)).reduce((a, o) => a + o.ready, 0) + plan.reduce((a, x) => a + x.ready, 0);
      // Yordamchi (faqat yangi tartibdagi bichimlarda)
      let helperId = cut.helper_id || null, helperQty = cut.helper_qty || 0;
      if (b.helper_id !== undefined) {
        if (b.helper_id === null || b.helper_id === '' || b.helper_id === 0) { helperId = null; helperQty = 0; } else {
          if (!batch.pay_on_cut) throw new AppError('helper_legacy');
          helperId = helperOk(ctx, b.helper_id, cut.helper_id).id;
          helperQty = needInt(b.helper_qty, 'helper_qty', 0, 100000);
          if (!helperQty) helperId = null;
        }
      }
      if (helperId && helperQty > newReady) throw new AppError('helper_too_much', { max: newReady });
      if (!helperId) helperQty = 0;
      // Bog'liqlik: tikuvchiga berilgan (erkin bo'lmagan) donadan pastga tushirib bo'lmaydi
      const conflicts = [];
      for (const x of plan) {
        if (!x.o) continue;
        if (x.dr < 0) { const free = ctx.balance(x.o.line_id, 'free', 0); if (free < -x.dr) conflicts.push({ size: x.size, kind: 'ready', from: x.o.ready, to: x.ready, min: x.o.ready - free, free }); }
        if (x.dp < 0) { const pb = ctx.balance(x.o.line_id, 'partial', 0); if (pb < -x.dp) conflicts.push({ size: x.size, kind: 'partial', from: x.o.partial, to: x.partial, min: x.o.partial - pb, free: pb }); }
      }
      if (conflicts.length) {
        const ids = conflicts.map((c) => old.get(c.size).line_id);
        throw new AppError('cut_conflict', { items: conflicts, transfers: linkedTransfers(ctx, ids).filter((t) => t.status !== 'cancelled') });
      }
      const changed = plan.some((x) => x.dr || x.dp) || helperId !== (cut.helper_id || null) || helperQty !== (cut.helper_qty || 0);
      if (!changed) throw new AppError('no_change');
      const before = snap(ctx, cut);
      for (const x of plan) {
        const lid = x.o ? x.o.line_id : lineFor(ctx, batch.id, x.size);
        if (x.dr > 0) ctx.move(lid, x.dr, null, 0, 'free', 0, 'cut_fix', 'c:' + cut.id, reason);
        if (x.dr < 0) ctx.move(lid, -x.dr, 'free', 0, null, 0, 'cut_fix', 'c:' + cut.id, reason);
        if (x.dp > 0) ctx.move(lid, x.dp, null, 0, 'partial', 0, 'cut_fix', 'c:' + cut.id, reason);
        if (x.dp < 0) ctx.move(lid, -x.dp, 'partial', 0, null, 0, 'cut_fix', 'c:' + cut.id, reason);
        if (x.o) ctx.db.run('UPDATE cut_lines SET ready=?, partial=? WHERE id=?', x.ready, x.partial, x.o.id);
        else ctx.db.run('INSERT INTO cut_lines(cut_id,line_id,ready,partial) VALUES(?,?,?,?)', cut.id, lid, x.ready, x.partial);
      }
      const helperPrice = helperId ? (cut.helper_price != null && cut.helper_id ? cut.helper_price : flatPrice(ctx, 'bichish_yordam', cut.day)) : cut.helper_price;
      ctx.db.run('UPDATE cuts SET helper_id=?, helper_qty=?, helper_price=?, edited_at=? WHERE id=?', helperId, helperQty, helperPrice, ctx.at, cut.id);
      const cur = ctx.db.one('SELECT * FROM cuts WHERE id=?', cut.id);
      const after = snap(ctx, cur);
      const e = ctx.db.one(`INSERT INTO cut_edits(cut_id,kind,at,day,actor_id,reason,before,after) VALUES(?,'edit',?,?,?,?,?,?) RETURNING id`,
        cut.id, ctx.at, ctx.day, ctx.me.id, reason, JSON.stringify(before), JSON.stringify(after));
      syncPay(ctx, cur, 'e' + e.id, 'Tuzatish');
      ctx.audit('cut_edited', 'cut', cut.id, before, after, reason);
      const desc = `${batch.code}: jami ${before.ready} → ${after.ready} dona${before.helper_qty !== after.helper_qty || before.helper_id !== after.helper_id ? `, yordamchi ${before.helper_name || '—'} ${before.helper_qty} → ${after.helper_name || '—'} ${after.helper_qty}` : ''}`;
      if (ctx.me.role !== 'rahbar') ctx.tellRahbars(`✏️ ${fullName(ctx.me)} бичимни тузатди — ${desc}. Сабаб: ${reason}`);
      for (const hid of new Set([before.helper_id, after.helper_id].filter(Boolean))) ctx.tell(hid, `✏️ Bichim tuzatildi — ${desc}. Sabab: ${reason}`);
      return cutView(ctx, cur, true);
    },
  },

  // ---------- Rahbar: tanlangan yozuvni hisobdan chiqarish ----------
  cut_void_preview: {
    auth: 'rahbar',
    fn(ctx, b) {
      const cut = getCut(ctx, b.cut_id);
      if (cut.status !== 'active') throw new AppError('bad_state');
      return voidImpact(ctx, cut);
    },
  },

  cut_void: {
    auth: 'rahbar', mut: true,
    fn(ctx, b) {
      const cut = getCut(ctx, b.cut_id);
      if (cut.status !== 'active') throw new AppError('bad_state');
      const reason = String(b.reason ?? '').trim().replace(/\s+/g, ' ');
      if (reason.length < 3) throw new AppError('need_reason');
      if (b.confirm !== true) throw new AppError('need_confirm');
      const imp = voidImpact(ctx, cut);
      if (b.sig !== imp.sig) throw new AppError('impact_changed');
      if (imp.blockers.length) throw new AppError('void_blocked', { blockers: imp.blockers });
      const batch = ctx.db.one('SELECT * FROM batches WHERE id=?', cut.batch_id);
      const before = snap(ctx, cut);
      const ref = 'c:' + cut.id;
      if (imp.mode === 'stock') {
        for (const s of imp.stock) ctx.move(s.line_id, s.qty, s.state, 0, null, 0, 'cut_void', ref, reason);
      } else {
        for (const s of imp.stock) ctx.move(s.line_id, s.qty, s.state, s.holder, null, 0, 'cut_void', ref, reason);
        const lineIds = ctx.db.all('SELECT id FROM lines WHERE batch_id=?', batch.id).map((r) => r.id);
        if (lineIds.length) {
          const q = lineIds.map(() => '?').join(',');
          ctx.db.run(`UPDATE submissions SET open_qty=0 WHERE line_id IN (${q})`, ...lineIds);
          for (const t of imp.transfers.filter((t) => ['pending', 'disputed'].includes(t.status))) {
            ctx.db.run("UPDATE transfers SET status='voided', decided_at=?, decided_by=?, resolve_note=? WHERE id=? AND status IN('pending','disputed')", ctx.at, ctx.me.id, reason, t.id);
          }
          // Haqni qaytarish: har guruh uchun teskari yozuv (bugungi sana bilan). Eski yozuvlar o'zgarmaydi.
          let n = 0;
          for (const e of imp.earn) {
            n++;
            ctx.db.run(`INSERT INTO earnings(user_id,work,src,line_id,qty,day,rate_id,price,amount,created_at,cut_id,extra,note)
              VALUES(?,?,?,?,?,?,NULL,?,?,?,?,?,?)`, e.user_id, e.work, `void:${cut.id}:${n}`, lineIds[0], -e.qty, ctx.day, e.price,
              e.missing ? null : -e.amount, ctx.at, cut.id, e.extra, 'Hisobdan chiqarildi');
          }
        }
        ctx.db.run("UPDATE cuts SET status='void', void_at=?, void_by=?, void_reason=? WHERE batch_id=? AND status='active'", ctx.at, ctx.me.id, reason, batch.id);
      }
      ctx.db.run("UPDATE cuts SET status='void', void_at=?, void_by=?, void_reason=? WHERE id=?", ctx.at, ctx.me.id, reason, cut.id);
      const after = { ...before, void: true, mode: imp.mode };
      ctx.db.run(`INSERT INTO cut_edits(cut_id,kind,at,day,actor_id,reason,before,after) VALUES(?,'void',?,?,?,?,?,?)`,
        cut.id, ctx.at, ctx.day, ctx.me.id, reason, JSON.stringify(before), JSON.stringify(after));
      ctx.audit('cut_voided', 'cut', cut.id, before, { mode: imp.mode, stock: imp.stock.length, earn: imp.earn.map((e) => [e.user_id, e.work, -e.qty, e.amount == null ? null : -e.amount]) }, reason);
      const who = new Set([cut.cutter_id, cut.helper_id, ...imp.stock.map((s) => s.holder), ...imp.earn.map((e) => e.user_id)].filter(Boolean));
      for (const id of who) { const u = ctx.user(id); if (u && u.role !== 'rahbar') ctx.tell(u, `Rahbar ${batch.code} bichim yozuvini hisobdan chiqardi (xato/sinov yozuvi). Sabab: ${reason}`); }
      return { ok: true, mode: imp.mode };
    },
  },
};

// Chala bichim tugatilganda yangi tartibdagi partiyada bichuvchiga haq yoziladi (production.partial_done dan)
export function earnPartialDone(ctx, li, qty, moveId) {
  if (!li.pay_on_cut || !li.cutter_id) return;
  const cutter = ctx.user(li.cutter_id);
  if (!cutter || cutter.role !== 'bichuvchi') return;
  const cut = ctx.db.one("SELECT * FROM cuts WHERE batch_id=? AND status='active' ORDER BY id LIMIT 1", li.batch_id);
  const price = flatPrice(ctx, 'bichish', ctx.day);
  ctx.db.run(`INSERT INTO earnings(user_id,work,src,line_id,qty,day,rate_id,price,amount,created_at,cut_id,note)
    VALUES(?,?,?,?,?,?,NULL,?,?,?,?,?) ON CONFLICT(src) DO NOTHING`, cutter.id, 'bichish', 'pd:' + moveId, li.line_id, qty, ctx.day,
    price, price == null ? null : price * qty, ctx.at, cut ? cut.id : null, 'Chala bichim tugatildi');
}
