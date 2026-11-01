// Umumiy frontend yordamchilari: server bilan aloqa, ekranlar, oyna, xabarlar, Telegram imkoniyatlari.
export const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
export const initData = tg ? tg.initData : '';
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (n == null ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
export const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
const TZ = 5 * 3600000;
export const today = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const monthStart = (d) => d.slice(0, 8) + '01';
export const monthEnd = (d) => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export const dmy = (d) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '');
export const hm = (iso) => (iso ? new Date(Date.parse(iso) + TZ).toISOString().slice(11, 16) : '');
export const dt = (iso) => (iso ? dmy(new Date(Date.parse(iso) + TZ).toISOString().slice(0, 10)) + ' ' + hm(iso) : '');
export const mins = (m) => (m == null ? '—' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);

export class ApiError extends Error { constructor(code, params) { super(code); this.code = code; this.params = params || {}; } }

export async function api(action, body = {}) {
  let r;
  try {
    r = await fetch('api/' + action, { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': initData }, body: JSON.stringify(body) });
  } catch { throw new ApiError('network'); }
  let j;
  try { j = await r.json(); } catch { throw new ApiError('server'); }
  if (!j.ok) throw new ApiError(j.error || 'server', j.params);
  return j.result;
}

// O'zgartiruvchi amal: noyob so'rov raqami bilan (qayta bosish/uzilishda dublikat bo'lmaydi), tugmani vaqtincha o'chiradi
export async function act(action, body = {}, btn) {
  if (btn) { if (btn.dataset.busy) return null; btn.dataset.busy = '1'; btn.disabled = true; }
  const key = btn && btn.dataset.rid ? btn.dataset.rid : rid();
  if (btn) btn.dataset.rid = key;
  try {
    const res = await api(action, { ...body, rid: key });
    if (btn) delete btn.dataset.rid;
    return res;
  } finally {
    if (btn) { delete btn.dataset.busy; btn.disabled = false; }
  }
}

// ---------- Xato matnlari ----------
const ERR = {
  lat: {
    network: 'Internet aloqasi yo‘q. Qayta urinib ko‘ring.', server: 'Server javob bermadi. Birozdan keyin urinib ko‘ring.',
    internal: 'Serverda xatolik. Qayta urinib ko‘ring.', auth: 'Telegram kirishi tasdiqlanmadi. Ilovani yopib, botdan qayta oching.',
    not_configured: 'Server hali sozlanmagan.', forbidden: 'Bu amal sizga ruxsat etilmagan.', no_access: 'Kirish yopiq.',
    bad_input: 'Maydonlarni tekshiring.', bad_state: 'Bu yozuv holati o‘zgargan. Sahifani yangilang.', not_found: 'Topilmadi.',
    not_enough: (p) => `Qoldiq yetarli emas: ${p.have} dona bor.`, not_enough_free: (p) => `Erkin qoldiq yetarli emas: ${p.have} dona bor.`,
    have_only: (p) => `Sizda ${p.have} dona bor. Miqdorni tekshiring.`, need_reason: 'Sababini yozing.', need_consent: 'Oylik bilan hisoblashishga roziligingizni belgilang.',
    has_takeaways: 'Bu oyda yozuvlaringiz bor.', already_marked: 'Bu bugun allaqachon belgilangan.', remote_worker: 'Siz uydan ishlaysiz, davomat belgilash shart emas.', not_rahbar: 'Bu bo‘lim faqat rahbar uchun.',
    inactive: 'Kirish yopilgan.', dup_size: (p) => `${p.size} razmer ikki marta yozilgan.`, bad_sewer: 'Tikuvchini tanlang.', self_forbidden: 'O‘zingizning ishingizni o‘zingiz tekshira olmaysiz.',
    unknown_action: 'Noma’lum amal.',
    overpay: (p) => `Mijozning qolgan qarzi ${fmt(p.left)} so‘m. Undan ko‘p yozib bo‘lmaydi.`, price_below_paid: (p) => `Mijoz allaqachon ${fmt(p.paid)} so‘m bergan. Narx undan kam bo‘lmaydi.`,
    order_has_pay: 'Mijoz pul bergan. Bekor qilishni rahbar qiladi.', cash_too_much: (p) => `Qo‘lingizda ${fmt(p.held)} so‘m bor (topshirish kutilayotgani hisobga olingan).`,
    cash_already_given: 'Bu pul rahbarga topshirilgan.', avans_pending: 'Avans so‘rovingiz hali javobsiz.',
  },
  cyr: {
    network: 'Интернет алоқаси йўқ. Қайта уриниб кўринг.', server: 'Сервер жавоб бермади. Бироздан кейин уриниб кўринг.',
    internal: 'Серверда хатолик. Қайта уриниб кўринг.', auth: 'Telegram кириши тасдиқланмади. Иловани ёпиб, ботдан қайта очинг.',
    not_configured: 'Сервер ҳали созланмаган.', forbidden: 'Бу амал сизга рухсат этилмаган.', no_access: 'Кириш ёпиқ.',
    bad_input: 'Майдонларни текширинг.', bad_state: 'Бу ёзув ҳолати ўзгарган. Саҳифани янгиланг.', not_found: 'Топилмади.',
    not_enough: (p) => `Қолдиқ етарли эмас: ${p.have} дона бор.`, not_enough_free: (p) => `Эркин қолдиқ етарли эмас: ${p.have} дона бор.`,
    have_only: (p) => `Текширувда ${p.have} дона бор. Миқдорни текширинг.`, need_reason: 'Сабабини ёзинг.', need_consent: 'Ходимнинг розилиги йўқ.',
    already_paid: 'Бу ёзув тўлиқ ҳисоблашилган ёки олдиндан тўланган.', over_remaining: (p) => `Қолган сумма: ${fmt(p.remaining)} сўм.`,
    over_available: (p) => `Ходимнинг берилмаган пули ${fmt(p.available)} сўм. Ундан кўп ушлаб бўлмайди.`, nothing_available: 'Ходимда ҳозир ушлаб қолинадиган пул йўқ. Қарз алоҳида қолади.',
    over_payable: (p) => `Бериладиган пул ${fmt(p.payable)} сўм${p.pending ? ` (кутилаётган ${fmt(p.pending)} сўм ҳисобга олинган)` : ''}. Кўпроқ бермоқчи бўлсангиз, «Аванс»ни танланг.`,
    cannot_close: 'Ойликни ёпиб бўлмайди: очиқ ишлар бор.', has_settlements: 'Ушлаб қолинган сумма бор — бекор қилиб бўлмайди.',
    owner_protected: 'Асосий раҳбарни фаолсизлантириб бўлмайди.', self_forbidden: 'Ўзингизга бу амални қила олмайсиз.', already_rahbar: 'Бу одам аллақачон раҳбар.',
    not_pending: 'Бу сўров аллақачон кўриб чиқилган.', no_in: 'Келиш қайд этилмаган.', dup_size: (p) => `${p.size} размер икки марта ёзилган.`,
    unknown_action: 'Номаълум амал.', not_rahbar: 'Бу бўлим фақат раҳбар учун.',
    overpay: (p) => `Мижознинг қолган қарзи ${fmt(p.left)} сўм. Ундан кўп ёзиб бўлмайди.`, price_below_paid: (p) => `Мижоз аллақачон ${fmt(p.paid)} сўм берган. Нарх ундан кам бўлмайди.`,
    order_has_pay: 'Мижоз пул берган.', cash_too_much: (p) => `Бичувчида ${fmt(p.held)} сўм бор.`,
    cash_already_given: 'Бу пул бичувчидан аллақачон олинган. Аввал ўша ёзувни кўриб чиқинг.', bad_sewer: 'Тикувчини танланг.',
  },
};
export function errText(e, lang) {
  const d = ERR[lang] || ERR.lat;
  const v = d[e.code] || ERR.lat[e.code] || d.server;
  return typeof v === 'function' ? v(e.params || {}) : v;
}

// ---------- Ekran va navigatsiya ----------
export const state = { lang: 'lat', stack: [], screens: {}, me: null };
export function setLang(l) { state.lang = l; document.documentElement.lang = l === 'cyr' ? 'uz-Cyrl' : 'uz'; }
export function setMain(html) { $('#main').innerHTML = html; }
export function setTop(html) { $('#top').innerHTML = html; }
export function brandTop(sub, who) {
  setTop(`<div class="brand"><span class="mark">MB</span><span><b>MUBORAK BREND</b><small>${esc(sub || '')}</small></span></div>${who ? `<span class="who">${esc(who)}</span>` : ''}`);
}

export function registerScreens(obj) { Object.assign(state.screens, obj); }
export async function show(name, params = {}, { replace = false, root = false } = {}) {
  if (root) state.stack = [];
  if (replace) state.stack.pop();
  state.stack.push({ name, params });
  await draw();
}
export async function back() {
  if (state.stack.length > 1) { state.stack.pop(); await draw(); }
}
export async function refresh() { await draw(true); }
let drawing = 0;
async function draw(keepScroll) {
  const cur = state.stack[state.stack.length - 1];
  if (!cur) return;
  const fn = state.screens[cur.name];
  const my = ++drawing;
  const y = window.scrollY;
  if (tg && tg.BackButton) { if (state.stack.length > 1) tg.BackButton.show(); else tg.BackButton.hide(); }
  try {
    const html = await fn(cur.params);
    if (my !== drawing) return;
    if (html != null) setMain(html);
    if (navHook) navHook(cur.name);
    window.scrollTo(0, keepScroll ? y : 0);
  } catch (e) {
    if (my !== drawing) return;
    setMain(`<div class="banner bad" style="margin-top:20px">${esc(errText(e, state.lang))}</div>
      <button class="btn ghost" style="margin-top:12px" data-act="retry">${state.lang === 'cyr' ? 'Қайта уриниш' : 'Qayta urinish'}</button>`);
  }
}
let navHook = null;
export function onNav(fn) { navHook = fn; }
if (tg && tg.BackButton) tg.BackButton.onClick(() => { if (!$('#sheet').hidden) closeSheet(); else back(); });

// ---------- Oyna (pastdan chiqadigan) ----------
let sheetClose = null;
export function openSheet(html, onClose) {
  const old = $('#sheetBody');
  const nb = old.cloneNode(false); // eski hodisa tinglovchilarini tozalash
  old.replaceWith(nb);
  nb.innerHTML = html;
  $('#sheet').hidden = false;
  sheetClose = onClose || null;
  if (tg && tg.BackButton) tg.BackButton.show();
  const f = $('#sheetBody [autofocus]');
  if (f) setTimeout(() => f.focus(), 250);
}
export function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheetBody').innerHTML = '';
  if (sheetClose) { const c = sheetClose; sheetClose = null; c(); }
  if (tg && tg.BackButton && state.stack.length <= 1) tg.BackButton.hide();
}
export function sheetErr(msg) {
  let el = $('#sheetBody .err');
  if (!el) { el = document.createElement('div'); el.className = 'err'; const foot = $('#sheetBody .foot'); (foot || $('#sheetBody')).prepend(el); }
  el.textContent = msg;
  el.scrollIntoView({ block: 'nearest' });
  haptic('error');
}

export function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3200);
  haptic(bad ? 'error' : 'success');
}
export function haptic(kind) { try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(kind); } catch {} }

// ---------- Bosish hodisalari ----------
const handlers = {};
export function on(map) { Object.assign(handlers, map); }
document.addEventListener('click', async (ev) => {
  const qb = ev.target.closest('[data-q]');
  if (qb) {
    const inp = qb.parentElement.querySelector('input');
    const max = inp.max === '' ? Infinity : Number(inp.max);
    let v = (Number(inp.value) || 0) + Number(qb.dataset.q);
    v = Math.max(Number(inp.min || 0), Math.min(max, v));
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const name = el.dataset.act;
  if (name === 'close') return closeSheet();
  if (name === 'retry') return refresh();
  if (name === 'back') return back();
  if (name === 'press') { const g = el.closest('[data-group]'); if (g) { $$('[aria-pressed]', g).forEach((b) => b.setAttribute('aria-pressed', 'false')); el.setAttribute('aria-pressed', 'true'); g.dataset.value = el.dataset.v; g.dispatchEvent(new Event('change', { bubbles: true })); } return; }
  const h = handlers[name];
  if (!h) return;
  ev.preventDefault();
  try { await h(el, ev); } catch (e) {
    if (e instanceof ApiError) { if (!$('#sheet').hidden) sheetErr(errText(e, state.lang)); else toast(errText(e, state.lang), true); }
    else { console.error(e); toast(state.lang === 'cyr' ? 'Хатолик юз берди' : 'Xatolik yuz berdi', true); }
  }
});

// ---------- Kichik bloklar ----------
export const qty = (name, val = 0, max = '', min = 0) =>
  `<div class="qty"><button type="button" data-q="-1" aria-label="−">−</button><input type="number" inputmode="numeric" name="${name}" value="${val}" min="${min}" ${max === '' ? '' : `max="${max}"`}><button type="button" data-q="1" aria-label="+">+</button></div>`;
export const val = (name, root = $('#sheetBody')) => { const el = root.querySelector(`[name="${name}"]`); return el ? el.value.trim() : ''; };
export const num = (name, root) => { const v = val(name, root); return v === '' ? 0 : Number(v); };
export const pressed = (group, root = $('#sheetBody')) => { const g = root.querySelector(`[data-group="${group}"]`); return g ? g.dataset.value || '' : ''; };
export const chips = (group, items, cur) => `<div class="chips" data-group="${group}" data-value="${esc(cur ?? '')}">${items.map(([v, label, small]) =>
  `<button type="button" class="chip" data-act="press" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(label)}${small ? `<small>${esc(small)}</small>` : ''}</button>`).join('')}</div>`;

export const STATE_COLORS = { partial: 'var(--c-partial)', free: 'var(--c-free)', reserved: 'var(--c-reserved)', sewing: 'var(--c-sewing)', rework: 'var(--c-rework)', review: 'var(--c-review)', accepted: 'var(--c-accepted)', writeoff: 'var(--c-writeoff)' };
export const STATE_NAMES = {
  lat: { partial: 'Chala bichim', free: 'Tarqatilmagan', reserved: 'Qabul kutilmoqda', sewing: 'Tikuvchida', rework: 'Qayta ishlashda', review: 'Tekshiruvda', accepted: 'Qabul qilingan', writeoff: 'Hisobdan chiqarilgan' },
  cyr: { partial: 'Чала бичим', free: 'Тарқатилмаган', reserved: 'Қабул кутилмоқда', sewing: 'Тикувчида', rework: 'Қайта ишлашда', review: 'Текширувда', accepted: 'Қабул қилинган', writeoff: 'Ҳисобдан чиқарилган' },
};
export function tape(st, lang, order = ['accepted', 'review', 'rework', 'sewing', 'reserved', 'free', 'writeoff']) {
  const ks = order.filter((k) => (st[k] || 0) > 0);
  if (!ks.length) return '';
  return `<div class="tape" role="img">${ks.map((k) => `<i style="flex:${st[k]} 0 0;background:${STATE_COLORS[k]}"></i>`).join('')}</div>
  <div class="legend">${ks.map((k) => `<span style="--c:${STATE_COLORS[k]}">${STATE_NAMES[lang][k]} <b>${fmt(st[k])}</b></span>`).join('')}</div>`;
}

const AV = ['#C2477A', '#2E8C8C', '#7A5BD0', '#3E6FD8', '#1C7F51', '#B5641F', '#5A4630', '#8C2E5E'];
export const ava = (name, id = 0, size = 40) => `<span class="ava" style="background:${AV[id % AV.length]};width:${size}px;height:${size}px">${esc((name || '?').trim()[0] || '?')}</span>`;

// Davr tanlash: bugun / 10 kun / oy / ixtiyoriy
export function periodRange(key, from, to) {
  const d = today();
  if (key === 'day') return { from: d, to: d };
  if (key === '10') return { from: addDays(d, -9), to: d };
  if (key === 'prev') { const p = addDays(monthStart(d), -1); return { from: monthStart(p), to: monthEnd(p) }; }
  if (key === 'custom' && from && to) return { from, to };
  return { from: monthStart(d), to: monthEnd(d) };
}
export function periodPicker(lang, p, actName) {
  const L = lang === 'cyr' ? { day: 'Бугун', '10': '10 кун', month: 'Шу ой', prev: 'Ўтган ой', custom: 'Бошқа', go: 'Кўрсатиш' }
    : { day: 'Bugun', '10': '10 kun', month: 'Shu oy', prev: 'O‘tgan oy', custom: 'Boshqa', go: 'Ko‘rsatish' };
  const keys = ['day', '10', 'month', 'prev', 'custom'];
  return `<div class="seg">${keys.map((k) => `<button data-act="${actName}" data-k="${k}" aria-pressed="${p.key === k}">${L[k]}</button>`).join('')}</div>
  ${p.key === 'custom' ? `<div class="row2" style="margin-top:8px"><input class="txt" type="date" id="pFrom" value="${p.from}"><input class="txt" type="date" id="pTo" value="${p.to}"></div>
  <button class="btn ghost sm" style="margin-top:8px" data-act="${actName}" data-k="custom" data-go="1">${L.go}</button>` : `<div class="sub" style="margin-top:6px">${dmy(p.from)} — ${dmy(p.to)}</div>`}`;
}
export function periodFromBtn(el, cur) {
  const k = el.dataset.k;
  if (k === 'custom') {
    if (el.dataset.go) { const f = $('#pFrom').value, t = $('#pTo').value; if (f && t && f <= t) return { key: 'custom', from: f, to: t }; return cur; }
    return { key: 'custom', from: cur.from, to: cur.to };
  }
  return { key: k, ...periodRange(k) };
}

// ---------- Telegram: joylashuv va biometrika ----------
// Joylashuv faqat tugma bosilganda bir marta olinadi; doimiy kuzatuv yo'q.
// Telegram ba’zi qurilmalarda javob bermay qolishi mumkin — tugma hech qachon “osilib” qolmasin.
const within = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
// Avval Telegram LocationManager, javob bo‘lmasa brauzer orqali. Har bosqich vaqt bilan cheklangan.
function viaTelegram() {
  return new Promise((resolve) => {
    const lm = tg && tg.LocationManager;
    if (!lm || !(tg.isVersionAtLeast && tg.isVersionAtLeast('8.0'))) return resolve(null);
    try {
      lm.init(() => {
        if (!lm.isLocationAvailable) return resolve(null);
        lm.getLocation((d) => {
          if (!d) return resolve({ error: 'loc_off', canSettings: true });
          resolve({ lat: d.latitude, lng: d.longitude, acc: d.horizontal_accuracy || 9999 });
        });
      });
    } catch { resolve(null); }
  });
}
function viaBrowser() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'loc_off' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve({ error: 'loc_off' }), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
export async function getLocation() {
  // Telegram ruxsat oynasini ko‘rsatishi mumkin, shuning uchun unga ko‘proq vaqt beramiz.
  const t = await within(viaTelegram(), 20000, { error: 'loc_timeout' });
  if (t && !t.error) return t;
  if (t && t.canSettings) return t;
  const b = await within(viaBrowser(), 12000, { error: 'loc_timeout' });
  if (!b.error) return b;
  return t && t.error === 'loc_timeout' ? { error: 'loc_timeout', canSettings: !!(tg && tg.LocationManager) } : b;
}
export function openLocationSettings() { try { tg.LocationManager.openSettings(); } catch {} }

function bmInit() {
  return new Promise((res) => {
    const bm = tg && tg.BiometricManager;
    if (!bm || !(tg.isVersionAtLeast && tg.isVersionAtLeast('7.2'))) return res(null);
    try { bm.init(() => res(bm)); } catch { res(null); }
  }).then((x) => x, () => null);
}
// Natija: { bio: 'ok'|'none'|'denied'|'failed', token? }
export async function biometric(reason, enroll, force) {
  const bm = await within(bmInit(), 6000, null);
  if (!bm || !bm.isBiometricAvailable) return { bio: 'none' };
  if (!bm.isAccessGranted) {
    const granted = await within(new Promise((r) => bm.requestAccess({ reason }, r)), 60000, false);
    if (!granted) return { bio: 'denied' };
  }
  if (!bm.isBiometricTokenSaved || force) {
    const token = await enroll();
    const saved = await within(new Promise((r) => bm.updateBiometricToken(token, r)), 15000, false);
    if (!saved) return { bio: 'failed' };
  }
  const [ok, token] = await within(new Promise((r) => bm.authenticate({ reason }, (a, b) => r([a, b]))), 60000, [false]);
  if (!ok || !token) return { bio: 'failed' };
  return { bio: 'ok', token };
}

// ---------- Rasmlar ----------
// Rasm telefonda kichraytiriladi (eng uzun tomoni 1280 px, JPEG), keyin serverga yuboriladi.
// Ko'rsatish: <img data-photo="id"> — kuzatuvchi o'zi yuklaydi (imzo sarlavhasi bilan), bosilsa katta ochiladi.
const photoUrls = new Map();
export function pickPhoto(what, sec) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return resolve(null);
      try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(f); });
        const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        const data = c.toDataURL('image/jpeg', 0.8);
        toast(state.lang === 'cyr' ? 'Расм юкланмоқда…' : 'Rasm yuklanmoqda…');
        const r = await api('photo_upload', { data, what: what || '', sec: sec || '' });
        const blob = await (await fetch(data)).blob();
        photoUrls.set(String(r.id), URL.createObjectURL(blob));
        resolve({ id: r.id, url: photoUrls.get(String(r.id)) });
      } catch (e) {
        toast(e instanceof ApiError ? errText(e) : 'Rasmni yuklab bo‘lmadi');
        resolve(null);
      }
    }, { once: true });
    inp.click();
  });
}
export const photoTag = (id, cls = 'ph') => (id ? `<img class="${cls}" data-photo="${Number(id)}" alt="rasm">` : '');
async function loadPhoto(img) {
  const id = img.dataset.photo;
  img.dataset.loading = '1';
  try {
    if (!photoUrls.has(id)) {
      const r = await fetch('api/photo_get', { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': initData }, body: JSON.stringify({ id: Number(id) }) });
      if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) throw new Error('photo');
      photoUrls.set(id, URL.createObjectURL(await r.blob()));
    }
    img.src = photoUrls.get(id);
  } catch { img.classList.add('ph-bad'); }
}
new MutationObserver(() => {
  for (const img of document.querySelectorAll('img[data-photo]:not([src]):not([data-loading])')) loadPhoto(img);
}).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('click', (ev) => {
  const img = ev.target.closest('img[data-photo]');
  if (!img || !img.src) return;
  ev.stopPropagation(); ev.preventDefault();
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${img.src}" alt="">`;
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}, true);

// ---------- Ovozli izoh ----------
// Telefon mikrofonidan yozish (MediaRecorder). Ba'zi telefonlarda Telegram ichida mikrofon ruxsati yo'q — unda null qaytadi.
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
let rec = null;
export async function recordStart() {
  if (!canRecord()) return { error: 'unsupported' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.start();
    const timer = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 120000); // ko'pi bilan 2 daqiqa
    rec = { mr, stream, chunks, timer, done: new Promise((r) => { mr.onstop = r; }) };
    return { ok: true };
  } catch { return { error: 'denied' }; }
}
export async function recordStop(what, sec) {
  if (!rec) return null;
  const r = rec; rec = null;
  clearTimeout(r.timer);
  if (r.mr.state === 'recording') r.mr.stop();
  await r.done;
  r.stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(r.chunks, { type: (r.mr.mimeType || 'audio/webm').split(';')[0] });
  if (blob.size < 500) return null;
  const data = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
  toast(state.lang === 'cyr' ? 'Овоз юкланмоқда…' : 'Ovoz yuklanmoqda…');
  try {
    const res = await api('voice_upload', { data, mime: blob.type, what: what || '', sec: sec || '' });
    mediaUrls.set('v' + res.id, URL.createObjectURL(blob));
    return { id: res.id };
  } catch (e) { toast(e instanceof ApiError ? errText(e) : 'Ovozni yuklab bo‘lmadi'); return null; }
}
export const isRecording = () => !!rec;
export const voiceTag = (id) => (id ? `<audio class="voice" data-voice="${Number(id)}" controls preload="none"></audio>` : '');
const mediaUrls = new Map();
async function loadVoice(el) {
  const id = el.dataset.voice;
  el.dataset.loading = '1';
  try {
    if (!mediaUrls.has('v' + id)) {
      const r = await fetch('api/voice_get', { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': initData }, body: JSON.stringify({ id: Number(id) }) });
      if (!r.ok || !(r.headers.get('content-type') || '').startsWith('audio/')) throw new Error('voice');
      mediaUrls.set('v' + id, URL.createObjectURL(await r.blob()));
    }
    el.src = mediaUrls.get('v' + id);
  } catch { el.replaceWith(Object.assign(document.createElement('span'), { className: 'sub', textContent: 'Ovozni ochib bo‘lmadi' })); }
}
new MutationObserver(() => {
  for (const a of document.querySelectorAll('audio[data-voice]:not([src]):not([data-loading])')) loadVoice(a);
}).observe(document.documentElement, { childList: true, subtree: true });
