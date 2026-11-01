// Ovozli (yoki yozma) gapni topshirish qoralamasiga ajratish. AI emas: faqat mavjud katalog, partiya va xodimlardan
// aniq moslarini topadi. Noaniq yoki topilmagan narsani o'ylab topmaydi — aniqlashtirishni so'raydi.
import { AppError, needText, fullName, lineLabel } from './base.js';

export const norm = (s) => String(s || '').toLowerCase()
  .replace(/[‘’ʻʼ`´]/g, "'").replace(/o'/g, 'o\'').replace(/g'/g, 'g\'')
  .replace(/[^a-z0-9'\-\s]/g, ' ').replace(/\s+/g, ' ').trim();

const NUM = { bir: 1, ikki: 2, uch: 3, "to'rt": 4, tort: 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9, toqqiz: 9,
  "o'n": 10, on: 10, yigirma: 20, "o'ttiz": 30, ottiz: 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90, toqson: 90 };

// So'zlar bilan aytilgan sonlarni raqamga aylantirish: "o'n besh ta" -> "15 ta"
export function wordsToDigits(text) {
  const t = text.split(' ');
  const out = [];
  let acc = null;
  const flush = () => { if (acc !== null) { out.push(String(acc)); acc = null; } };
  for (const w of t) {
    const base = w.replace(/(ta|tasi|tani)$/, '');
    if (NUM[w] !== undefined) { acc = (acc || 0) + NUM[w]; continue; }
    if (w === 'yuz') { acc = (acc || 1) * 100; continue; }
    if (NUM[base] !== undefined && base !== w) { acc = (acc || 0) + NUM[base]; flush(); out.push('ta'); continue; }
    flush();
    out.push(w);
  }
  flush();
  return out.join(' ');
}

const tokMatch = (tok, w) => tok === w || tok.startsWith(w) || (w.length >= 5 && tok.startsWith(w.slice(0, -2)));

// Matnda qiymat (bir yoki bir necha so'z) bormi; topilsa ishlatilgan so'zlarni belgilaydi
function findValue(tokens, used, value) {
  const ws = norm(value).split(' ').filter(Boolean);
  if (!ws.length) return false;
  const idx = [];
  for (const w of ws) {
    const i = tokens.findIndex((t, k) => !used.has(k) && !idx.includes(k) && tokMatch(t, w));
    if (i < 0) return false;
    idx.push(i);
  }
  idx.forEach((i) => used.add(i));
  return true;
}

export function parse(ctx, text) {
  const raw = needText(text, 'text', 300);
  const t = wordsToDigits(norm(raw));
  const tokens = t.split(' ');
  const used = new Set();
  const res = { text: raw, qty: null, size: null, sewer: null, sewerOptions: [], lines: [], mentioned: {}, missing: [] };

  // Razmer: "48 razmer", "razmer 48", "48-razmer", "o'lcham 50"
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^(\d{2,3})-?(razmer|razmerli|o'lcham)$/);
    if (m) { res.size = m[1]; used.add(i); break; }
    if (/^(razmer|razmerli|o'lcham|razmeri)$/.test(tokens[i])) {
      if (/^\d{2,3}$/.test(tokens[i + 1] || '')) { res.size = tokens[i + 1]; used.add(i); used.add(i + 1); break; }
      if (/^\d{2,3}$/.test(tokens[i - 1] || '')) { res.size = tokens[i - 1]; used.add(i); used.add(i - 1); break; }
    }
  }
  // Soni: "10 ta", "10ta", "10 dona", aks holda birinchi ishlatilmagan son
  for (let i = 0; i < tokens.length && res.qty === null; i++) {
    if (used.has(i)) continue;
    const m = tokens[i].match(/^(\d{1,5})(ta|tasi|dona)?$/);
    if (m && (m[2] || /^(ta|dona)$/.test(tokens[i + 1] || ''))) { res.qty = Number(m[1]); used.add(i); }
  }
  for (let i = 0; i < tokens.length && res.qty === null; i++) {
    if (!used.has(i) && /^\d{1,5}$/.test(tokens[i])) { res.qty = Number(tokens[i]); used.add(i); }
  }

  // Tikuvchi: ism + qo'shimchalar (Ruxshonaga, Ruxshonaning...)
  const sewers = ctx.db.all("SELECT id,first_name,last_name FROM users WHERE role='tikuvchi' AND status='active'");
  const hits = [];
  tokens.forEach((tok, i) => {
    if (used.has(i)) return;
    const stem = tok.replace(/(ning|niki|ga|ka|qa|ni|dan|da)$/, '');
    for (const s of sewers) {
      const fn = norm(s.first_name), ln = norm(s.last_name);
      if (stem.length >= 3 && (fn === stem || fn === tok || (tok.startsWith(fn) && fn.length >= 3) || ln === stem)) hits.push({ s, i });
    }
  });
  const uniq = [...new Map(hits.map((h) => [h.s.id, h])).values()];
  if (uniq.length === 1) { res.sewer = { id: uniq[0].s.id, name: fullName(uniq[0].s) }; used.add(uniq[0].i); }
  else if (uniq.length > 1) res.sewerOptions = uniq.map((h) => ({ id: h.s.id, name: fullName(h.s) }));
  else res.missing.push('sewer');

  // Partiya kodi: "p-12", "partiya 12"
  let code = null;
  tokens.forEach((tok, i) => {
    const m = tok.match(/^p-?(\d{1,5})$/);
    if (m) { code = 'P-' + m[1].padStart(4, '0'); used.add(i); }
    if (/^partiya/.test(tok) && /^\d{1,5}$/.test(tokens[i + 1] || '')) { code = 'P-' + tokens[i + 1].padStart(4, '0'); used.add(i); used.add(i + 1); }
  });

  // Erkin qoldig'i bor qatorlar (bichuvchi — o'z partiyalari)
  const own = ctx.me.role === 'rahbar' ? '' : ' AND (b.cutter_id=? OR b.opening=1)';
  const cand = ctx.db.all(`SELECT l.id line_id, l.size, b.code, b.model, b.material, b.color, b.type_id, c.name type_name, bal.qty free
    FROM bal JOIN lines l ON l.id=bal.line_id JOIN batches b ON b.id=l.batch_id LEFT JOIN catalog c ON c.id=b.type_id
    WHERE bal.state='free' AND bal.holder=0 AND bal.qty>0${own}`, ...(ctx.me.role === 'rahbar' ? [] : [ctx.me.id]));

  // Aytilgan xususiyatlar (eng uzun qiymatdan boshlab)
  const values = {};
  for (const c of cand) for (const k of ['type_name', 'model', 'material', 'color']) (values[k] ||= new Set()).add(c[k]);
  for (const r of ctx.db.all('SELECT kind,name FROM catalog WHERE active=1')) {
    const k = r.kind === 'type' ? 'type_name' : r.kind;
    (values[k] ||= new Set()).add(r.name);
  }
  const order = [];
  for (const [k, set] of Object.entries(values)) for (const v of set) order.push([k, v]);
  order.sort((a, b) => norm(b[1]).split(' ').length - norm(a[1]).split(' ').length || norm(b[1]).length - norm(a[1]).length);
  for (const [k, v] of order) {
    if (res.mentioned[k]) continue;
    if (findValue(tokens, used, v)) res.mentioned[k] = v;
  }

  // Katalogda yo'q, lekin rang/mato sifatida aytilgan so'zlar — o'ylab topilmaydi, aniqlashtiriladi
  const LEX = { color: ['qizil', "ko'k", 'yashil', 'sariq', 'oq', 'qora', 'pushti', 'binafsha', 'jigarrang', 'kulrang', 'havorang', 'moviy', 'bordo', 'zangori', 'siyohrang', 'oltinrang', 'kumushrang', 'bej', 'malla', 'qaymoqrang'],
    material: ['paxta', 'atlas', 'shtapel', 'ipak', 'jinsi', 'chit', 'satin', 'trikotaj', 'shifon', 'velvet', 'kashemir', "zig'ir", 'flanel', 'xlopok', 'adras', 'krep', 'barxat'] };
  res.unknown = {};
  tokens.forEach((tok, i) => {
    if (used.has(i)) return;
    for (const [k, words] of Object.entries(LEX)) {
      if (res.mentioned[k]) continue;
      if (words.some((w) => tok === w || (tok.startsWith(w) && tok.length - w.length <= 3))) res.unknown[k] = tok;
    }
  });
  let lines = cand;
  if (Object.keys(res.unknown).length) lines = [];
  if (code) lines = lines.filter((c) => c.code === code);
  if (res.size) lines = lines.filter((c) => String(c.size) === res.size);
  for (const [k, v] of Object.entries(res.mentioned)) lines = lines.filter((c) => norm(c[k]) === norm(v));
  if (code) res.mentioned.code = code;

  const anyMention = Object.keys(res.mentioned).length || res.size || Object.keys(res.unknown).length;
  if (!anyMention) { res.missing.push('product'); lines = []; }
  res.lines = lines.slice(0, 12).map((c) => ({ line_id: c.line_id, free: c.free, label: lineLabel(c), code: c.code, size: c.size }));
  if (anyMention && !lines.length) res.missing.push('no_match');
  if (lines.length > 1) res.missing.push('choose_line');
  if (res.qty === null) res.missing.push('qty');
  if (res.qty !== null && lines.length === 1 && res.qty > lines[0].free) res.missing.push('over_free');
  return res;
}

export const actions = {
  voice_parse: {
    auth: ['bichuvchi', 'rahbar'],
    fn(ctx, b) { return parse(ctx, b.text); },
  },
};
export { AppError };
