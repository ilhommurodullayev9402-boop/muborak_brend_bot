// Bichuvchi va tikuvchi ekranlari (o'zbek lotin yozuvida).
import {
  api, act, esc, fmt, show, refresh, registerScreens, on, state, setLang, brandTop, openSheet, closeSheet, sheetErr, toast, $, $$,
  qty, val, num, pressed, chips, tape, STATE_NAMES, ava, periodPicker, periodFromBtn, periodRange, dmy, hm, dt, mins, today,
  getLocation, openLocationSettings, biometric, errText, ApiError, tg, pickPhoto, photoTag, canRecord, recordStart, recordStop, isRecording, voiceTag,
} from './core.js';
import { initOrders } from './buyurtma.js';

const L = 'lat';
let ROLE = 'tikuvchi';
let ME = null;
let cache = {};
const RN = { bichuvchi: 'Bichuvchi', tikuvchi: 'Tikuvchi' };
const KIND = { cut_ready: 'Tayyor bichim', cut_partial: 'Chala bichim', partial_done: 'Chala bichim tugatildi', opening: 'Boshlang‘ich qoldiq',
  transfer_reserve: 'Berildi (qabul kutilmoqda)', transfer_accept: 'Sanab qabul qilindi', transfer_release: 'Bekor qilindi / qaytdi', submit: 'Tayyor deb topshirildi',
  accept: 'Tekshirib qabul qilindi', rework: 'Qayta ishlashga qaytdi', writeoff: 'Hisobdan chiqarildi' };
const TK_ST = { priced: ['Narx qo‘yildi', 'blue'], submitted: ['Narx kutilmoqda', ''], review: ['Rahbar tekshiruvida', 'blue'], employee: ['Sizning tasdig‘ingizda', 'warn'], agreed: ['Ikki tomon tasdiqlagan', 'ok'], disputed: ['Bahsli', 'bad'], cancelled: ['Bekor qilingan', ''] };
const TK_KIND = { product: 'Tayyor mahsulot', material: 'Material', service: 'Tikish xizmati' };
const METHOD = { prepaid: 'Avval/alohida to‘langan', debt: 'Hali qarz', payroll: 'Oylik bilan hisoblashish' };
const PAY_ST = { pending: ['Sizning tasdig‘ingiz kutilmoqda', 'warn'], confirmed: ['Tasdiqlangan', 'ok'], disputed: ['Tafovut yozilgan', 'bad'], cancelled: ['Bekor qilingan', ''], reverse_pending: ['Bekor qilish so‘ralgan', 'warn'], reversed: ['Bekor qilingan', ''] };
const TR_ST = { pending: ['Qabul kutilmoqda', 'blue'], accepted: ['Qabul qildi', 'ok'], disputed: ['Aniqlashtirish so‘raldi', 'bad'], cancelled: ['Bekor qilingan', ''], resolved: ['Rahbar hal qildi', 'ok'] };
const tag = ([t, c]) => `<span class="tag ${c}">${esc(t)}</span>`;
const gl = (g) => (g.zakaz ? 'Buyurtma (zakaz)' : `${esc(g.type_name)} «${esc(g.model)}»`);
const prodLabel = (x) => `${esc(x.type_name || '')} «${esc(x.model)}» · ${esc(x.material)} · ${esc(x.color)}`;

export async function start(role) {
  ROLE = role;
  setLang(L);
  document.getElementById('nav').hidden = true;
  ME = await api('me');
  initOrders(top, role);
  await show('w_home', {}, { root: true });
}

function top(sub) { brandTop(sub || RN[ROLE], `${ME.first_name} ${ME.last_name}`); }

// ---------- Davomat kartasi ----------
async function attCard() {
  if (ME.remote) return `<div class="card"><div class="att"><div class="grow"><div class="title">🏠 Siz uydan ishlaysiz</div><div class="sub">«Ishga keldim» belgilash shart emas. Ishni olganda va topshirganda ilovada qayd eting.</div></div></div></div>`;
  const a = await api('att_today');
  cache.att = a;
  const r = a.row;
  const pend = a.exc.filter((e) => e.status === 'pending');
  let body;
  if (!r || !r.in) {
    body = `<div class="att"><div class="grow"><div class="title">Bugun hali kelish belgilanmagan</div><div class="sub">Ish boshlanishi ${esc(a.work_start)}</div></div></div>
      <div class="actions"><button class="btn" data-act="att" data-k="in">Ishga keldim</button></div>`;
  } else if (!r.out) {
    body = `<div class="att"><div class="grow"><div class="sub">Keldingiz</div><div class="clock">${r.in}</div>${r.late ? `<span class="tag warn">${r.late} daqiqa kechikish</span>` : ''}</div></div>
      <div class="actions"><button class="btn dark" data-act="att" data-k="out">Ishdan ketdim</button></div>`;
  } else {
    body = `<div class="att"><div class="grow"><div class="sub">Bugun</div><div class="clock">${r.in} — ${r.out}</div>
      <div class="sub">Sof ish vaqti ${mins(r.net)} ${r.full ? '<span class="tag ok">To‘liq kun</span>' : ''}</div></div></div>`;
  }
  return `<div class="card">${body}${pend.length ? `<div class="banner warn" style="margin-top:10px">Davomat so‘rovingiz rahbarda: ${pend.map((e) => (e.kind === 'in' ? 'kelish' : 'ketish')).join(', ')}</div>` : ''}</div>`;
}

const ATT_REASON = {
  geo_not_set: () => 'Rahbar korxona joylashuvini hali sozlamagan.',
  loc_off: () => 'Joylashuv o‘chiq yoki Telegram’ga ruxsat berilmagan.',
  loc_timeout: () => 'Telefon joylashuvni aniqlay olmadi. Telefon sozlamalarida joylashuv (GPS) yoqilganini va Telegram’ga ruxsat berilganini tekshiring.',
  low_accuracy: (p) => `Joylashuv aniqligi yetarli emas${p.acc ? ` (±${p.acc} m)` : ''}. Kerak: ±${p.max} m. Ochiqroq joyda qayta urinib ko‘ring.`,
  outside: (p) => `Siz korxona hududidan tashqaridasiz: ${p.dist} m (ruxsat ${p.radius} m).`,
  bio_none: () => 'Bu telefonda Face ID / barmoq izi yo‘q yoki Telegram’da yoqilmagan.',
  bio_denied: () => 'Biometrik tasdiqqa ruxsat berilmadi.',
  bio_failed: () => 'Biometrik tasdiq o‘tmadi.',
  bio_token: () => 'Bu telefon hisobingizga ulanmagan (yangi telefon bo‘lishi mumkin).',
  no_in: () => 'Avval «Ishga keldim»ni belgilang.',
  remote: () => 'Siz uydan ishlaysiz, davomat belgilash shart emas.',
};

async function doAtt(kind, el, force) {
  const a = cache.att || (await api('att_today'));
  openSheet('<h3>Tekshirilmoqda…</h3><p class="lead">Joylashuv aniqlanmoqda. Telegram ruxsat so‘rasa, «Ruxsat berish»ni bosing. Bu 30 soniyagacha davom etishi mumkin.</p>');
  const loc = await getLocation();
  closeSheet();
  let bio = { bio: 'skip' };
  if (a.require_bio) bio = await biometric('Davomatni tasdiqlash', async () => (await act('bio_enroll')).token, force);
  const r0 = await act('att_mark', { kind, loc: loc.error ? null : loc, bio: bio.bio, bio_token: bio.token }, el);
  if (!r0) return;
  const r = !r0.ok && r0.reason === 'loc_off' && loc.error === 'loc_timeout' ? { ...r0, reason: 'loc_timeout' } : r0;
  if (r.ok) { toast(r.already ? `Allaqachon belgilangan: ${r.at}` : `${kind === 'in' ? 'Kelish' : 'Ketish'} qayd etildi: ${r.at}`); closeSheet(); return refresh(); }
  const why = (ATT_REASON[r.reason] || (() => 'Tasdiqlab bo‘lmadi.'))(r.params || {});
  openSheet(`<h3>Avtomatik tasdiqlanmadi</h3><p class="lead">${esc(why)}</p>
    <div class="stack">
      <button class="btn dark" data-act="att" data-k="${kind}">Qayta urinish</button>
      ${r.reason === 'bio_token' ? `<button class="btn ghost" data-act="attForce" data-k="${kind}">Bu telefonni hisobimga ulash</button>` : ''}
      ${(r.reason === 'loc_off' || r.reason === 'loc_timeout') && loc.canSettings ? '<button class="btn ghost" data-act="locSettings">Joylashuv ruxsatini ochish</button>' : ''}
    </div>
    <h2>Yoki rahbarga so‘rov</h2>
    <div class="field"><textarea class="txt" name="note" maxlength="300" placeholder="Izoh (ixtiyoriy): masalan, telefonimda barmoq izi yo‘q"></textarea></div>
    <button class="btn ghost" data-act="attExc" data-k="${kind}" data-r="${esc(r.reason)}">Rahbarga so‘rov yuborish</button>
    <p class="hint">Vaqt serverdan olinadi. Joylashuv faqat shu tekshiruv uchun ishlatiladi, koordinatalar saqlanmaydi. Telefon tekshiruvi joy va shaxsni mutlaq kafolatlamaydi.</p>`);
}

// ---------- Bosh ekran ----------
async function home() {
  top();
  const [att, money, mj] = await Promise.all([attCard(), api('my_money'), api('mj_my')]);
  // Javob kelgan, hali ko'rilmagan murojaatlar (oxirgi 3 kun)
  const mjN = mj.filter((a) => a.status !== 'open' && a.status !== 'cancelled' && a.answered_at && Date.now() - Date.parse(a.answered_at) < 3 * 86400000).length;
  const leaveNow = mj.find((a) => a.status === 'approved' && a.from_day <= today() && a.to_day >= today());
  cache.money = money;
  const todo = money.payments.length + money.adjustments.length + money.takeaways.length + (money.rk ? 1 : 0);
  const moneyBanner = todo ? `<button class="banner warn tap" data-act="go" data-s="w_money" style="margin-top:12px;width:100%">💵 Sizdan tasdiq kutilmoqda: ${todo} ta yozuv. Ochish ›</button>` : '';
  const tiles = `<h2>Hisob</h2><div class="grid2">
    <button class="big" data-act="go" data-s="w_money"><span class="ic">💵</span><span>Mening hisobim<small>Haq va pul</small></span>${todo ? `<span class="cnt">${todo}</span>` : ''}</button>
    <button class="big" data-act="go" data-s="w_tk"><span class="ic">🧾</span><span>Olganlarim<small>Olgan zahoti yozing</small></span></button>
    <button class="big" data-act="avans"><span class="ic">💸</span><span>Avans so‘rash<small>${money.avans ? 'So‘rov: ' + fmt(money.avans.amount) + ' so‘m' : 'Rahbarga so‘rov'}</small></span></button>
    ${ME.remote ? '' : '<button class="big" data-act="go" data-s="w_att"><span class="ic">🕘</span><span>Davomat tarixi</span></button>'}
    <button class="big" data-act="go" data-s="w_mj"><span class="ic">📨</span><span>Murojaat<small>Ruxsat so‘rash, muammo</small></span>${mjN ? `<span class="cnt">${mjN}</span>` : ''}</button>
    <button class="big" data-act="go" data-s="w_moves"><span class="ic">📜</span><span>Ish tarixi</span></button>
    ${ME.canInspect ? '<button class="big" data-act="go" data-s="w_insp"><span class="ic">✔︎</span><span>Tekshirish<small>Maxsus vakolat</small></span></button>' : ''}
  </div>`;
  const leaveB = leaveNow ? `<div class="banner ok" style="margin-top:12px">✅ Sizga ${dmy(leaveNow.from_day)} — ${dmy(leaveNow.to_day)} ruxsat berilgan.</div>` : '';
  if (ROLE === 'bichuvchi') return leaveB + att + moneyBanner + (await cutterHome()) + tiles;
  return leaveB + att + moneyBanner + (await sewerHome()) + tiles;
}

async function cutterHome() {
  const h = await api('cut_home');
  cache.cut = h;
  const bs = h.batches;
  const od = await api('ord_list', {});
  const late = od.rows.filter((o) => o.overdue || (o.days_left <= 2 && o.status !== 'ready')).length;
  const waitMe = od.rows.filter((o) => o.status === 'sewn').length;
  return `<h2>Bichuv</h2>
  <div class="stack">
    <button class="big primary" data-act="cut"><span class="ic">✂︎</span><span>Bichdim<small>Tayyor va chala bichimni kiritish</small></span></button>
    <button class="big" data-act="go" data-s="o_list"><span class="ic">📐</span><span>Buyurtmalar (zakaz)<small>${od.rows.length ? `${od.rows.length} ta jarayonda${late ? ` · <b style="color:var(--bad)">${late} tasining muddati yaqin</b>` : ''}${waitMe ? ` · ${waitMe} ta qabul kutmoqda` : ''}` : 'Mijozdan alohida buyurtma'}</small></span>${late + waitMe ? `<span class="cnt">${late + waitMe}</span>` : ''}</button>
    <div class="grid2">
      <button class="big" data-act="give"><span class="ic">➜</span><span>Tikuvchiga berish<small>Kimga, nechta</small></span></button>
      <button class="big" data-act="voice"><span class="ic">🎙</span><span>Gapirib berish<small>Ovoz yoki matn</small></span></button>
    </div>
  </div>
  <h2>Bugun</h2>
  <div class="stats">
    <div class="stat" style="--c:var(--c-free)"><b class="num">${fmt(h.today.ready)}</b><span>Tayyor bichim</span></div>
    <div class="stat" style="--c:var(--c-partial)"><b class="num">${fmt(h.today.partial)}</b><span>Chala bichim</span></div>
    <div class="stat" style="--c:var(--c-reserved)"><b class="num">${fmt(h.today.given)}</b><span>Berildi</span></div>
  </div>
  <h2>Partiyalar</h2>
  ${bs.length ? bs.map((b) => `<button class="card tap" data-act="go" data-s="w_batch" data-id="${b.id}">
      <div class="row">${photoTag(b.photo_id)}<div class="grow"><div class="title">${prodLabel(b)}</div><div class="mono">${esc(b.code)} · ${dmy(b.day)} · ${b.lines.map((l) => esc(l.size)).join(', ')}</div></div>
      <div class="bignum num">${fmt(b.totals.free || 0)}<small>erkin</small></div></div>
      ${b.totals.partial ? `<div class="sub" style="margin-top:4px">Chala bichim: <b>${fmt(b.totals.partial)}</b> (tarqatilmaydi)</div>` : ''}
      ${tape(b.totals, L)}</button>`).join('') : '<div class="empty">Hali partiya yo‘q. «Bichdim» bilan boshlang.</div>'}
  <h2>Berilganlar</h2>
  ${h.transfers.length ? `<div class="list">${h.transfers.slice(0, 15).map((t) => `<div class="li">${ava(t.to_name, t.to_id, 34)}<div class="grow"><b>${esc(t.to_name)}</b> · ${fmt(t.total)} dona
      <div class="sub">${esc(t.code)} · ${dmy(t.day)} ${t.time} · ${t.items.map((i) => esc(i.code + ' ' + i.size + ': ' + i.qty)).join(', ')}</div>
      ${t.status === 'disputed' ? `<div class="sub" style="color:var(--bad)">Tikuvchi: ${esc(t.dispute_note)}</div>` : ''}</div>
      <div style="text-align:right">${tag(TR_ST[t.status] || [t.status, ''])}${['pending', 'disputed'].includes(t.status) ? `<br><button class="link" data-act="trCancel" data-id="${t.id}">Bekor qilish</button>` : ''}</div></div>`).join('')}</div>`
    : '<div class="empty">Hali hech kimga berilmadi.</div>'}`;
}

async function sewerHome() {
  const h = await api('sew_home');
  cache.sew = h;
  const od = await api('ord_list', {});
  const oNew = od.rows.filter((o) => o.status === 'given').length;
  const oWork = od.rows.filter((o) => ['sewing', 'fixing'].includes(o.status)).length;
  const ordTile = `<h2>Buyurtma ko‘ylaklar</h2><button class="big ${oNew ? 'primary' : ''}" data-act="go" data-s="o_list" style="width:100%"><span class="ic">📐</span><span>Buyurtma ko‘ylaklar<small>${od.rows.length ? `${oNew ? `${oNew} ta yangi, qabul qiling · ` : ''}${oWork} ta qo‘limda (topshirilmagan)` : 'Hozircha yo‘q'}</small></span>${oNew ? `<span class="cnt">${oNew}</span>` : ''}</button>`;
  return `${ordTile}<h2>Kelgan ishlar</h2>
  ${h.incoming.length ? h.incoming.map((t) => `<div class="card">
      <div class="row">${ava(t.from_name, t.from_id, 36)}<div class="grow"><div class="title">${fmt(t.total)} dona · ${esc(t.from_name)}dan</div><div class="mono">${esc(t.code)} · ${dmy(t.day)} ${t.time}</div></div></div>
      <div class="list" style="margin-top:10px;box-shadow:none;background:var(--soft)">${t.items.map((i) => `<div class="li">${photoTag(i.photo_id)}<div class="grow">${prodLabel(i)}<div class="mono">${esc(i.code)} · razmer ${esc(i.size)}</div></div><div class="r">${fmt(i.qty)} dona</div></div>`).join('')}</div>
      ${t.note ? `<div class="banner" style="margin-top:10px">📝 ${esc(t.note)}</div>` : ''}${voiceTag(t.voice_id)}
      ${t.status === 'disputed' ? `<div class="banner bad" style="margin-top:10px">Aniqlashtirish so‘ralgan: ${esc(t.dispute_note)}. Rahbar yoki bichuvchi javobini kuting.</div>`
        : `<div class="actions"><button class="btn ok" data-act="trAccept" data-id="${t.id}">Sanadim, qabul qildim</button><button class="btn ghost" data-act="trDispute" data-id="${t.id}">Soni mos emas — tafovut bor</button></div>`}
    </div>`).join('') : '<div class="empty">Yangi kelgan ish yo‘q.</div>'}
  <h2>Mendagi ish</h2>
  <div class="stats">
    <div class="stat" style="--c:var(--c-sewing)"><b class="num">${fmt(h.totals.sewing + h.totals.rework)}</b><span>Qo‘limda</span></div>
    <div class="stat" style="--c:var(--c-review)"><b class="num">${fmt(h.totals.review)}</b><span>Tekshiruvda</span></div>
    <div class="stat" style="--c:var(--c-accepted)"><b class="num">${fmt(h.totals.accepted_month)}</b><span>Bu oy qabul qilingan</span></div>
  </div>
  ${h.lines.length ? h.lines.map((l) => `<div class="card">
      <div class="row">${photoTag(l.photo_id)}<div class="grow"><div class="title">${prodLabel(l)}</div><div class="mono">${esc(l.code)} · razmer ${esc(l.size)}</div></div></div>
      <div class="bal" style="margin-top:10px">
        <span>Qo‘limda (tikilmoqda)</span><span class="v">${fmt(l.sewing)}</span>
        ${l.rework ? `<span>Qayta ishlashga qaytgan</span><span class="v" style="color:var(--c-rework)">${fmt(l.rework)}</span>` : ''}
        ${l.review ? `<span>Tekshiruvni kutmoqda</span><span class="v">${fmt(l.review)}</span>` : ''}
      </div>
      ${l.sewing + l.rework > 0 ? `<div class="actions"><button class="btn" data-act="submit" data-id="${l.line_id}">Tayyorladim / Topshirdim</button></div>` : `<div class="banner ok" style="margin-top:10px">Shu ish bo‘yicha qo‘lingizda qoldiq yo‘q — hammasi topshirilgan.</div>`}
    </div>`).join('') : '<div class="empty">Qo‘lingizda ish yo‘q.</div>'}`;
}

// ---------- Bichdim ----------
function sizeRow(size = '', ready = 0, partial = 0) {
  return `<div class="szrow"><input class="txt" name="size" value="${esc(size)}" placeholder="48" maxlength="10" inputmode="text">
    <input class="txt" name="ready" type="number" inputmode="numeric" min="0" value="${ready || ''}" placeholder="0">
    <input class="txt" name="partial" type="number" inputmode="numeric" min="0" value="${partial || ''}" placeholder="0">
    <button type="button" class="x" style="position:static;width:36px;height:36px" data-act="rmSize" aria-label="O‘chirish">×</button></div>`;
}
async function cutSheet(batchId) {
  const meta = cache.meta || (cache.meta = await api('prod_meta'));
  const own = (cache.cut ? cache.cut.batches : []).filter((b) => !b.opening).slice(0, 8);
  const b = batchId ? own.find((x) => x.id === Number(batchId)) : null;
  const dl = (id, arr) => `<datalist id="${id}">${arr.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  openSheet(`<h3>Bichdim</h3>
    <div class="field"><div class="lbl">Qaysi partiya</div>
      ${chips('batch', [['new', '+ Yangi partiya'], ...own.map((x) => [x.id, x.code, `${x.type_name} «${x.model}» · ${x.color}`])], b ? b.id : 'new')}</div>
    <div id="newBatch" ${b ? 'hidden' : ''}>
      <div class="field"><div class="lbl">Mahsulot turi</div>${chips('type', meta.types.map((t) => [t.id, t.name]), '')}</div>
      <div class="field"><div class="lbl">Model</div><input class="txt" name="model" list="dlModel" maxlength="60" placeholder="masalan: Lola">${dl('dlModel', meta.sugg.model)}</div>
      <div class="row2"><div class="field"><div class="lbl">Material</div><input class="txt" name="material" list="dlMat" maxlength="60" placeholder="Paxta">${dl('dlMat', meta.sugg.material)}</div>
      <div class="field"><div class="lbl">Rang</div><input class="txt" name="color" list="dlCol" maxlength="40" placeholder="Qizil">${dl('dlCol', meta.sugg.color)}</div></div>
    </div>
    <div class="field"><div class="lbl"><span>Razmerlar</span><span>har razmer alohida qator</span></div>
      <div class="szhead"><span>Razmer</span><span>Tayyor</span><span>Chala</span><span></span></div>
      <div id="sizes">${b ? b.lines.map((l) => sizeRow(l.size)).join('') : sizeRow()}</div>
      <button class="link" data-act="addSize">+ Razmer qo‘shish</button>
      <p class="hint">Chala bichim alohida hisoblanadi va tugatilmaguncha tikuvchiga berilmaydi.</p></div>
    <div class="field"><div class="lbl">Mahsulot rasmi <span>ixtiyoriy</span></div>
      <div class="phbtn"><span id="cutPh">${b && b.photo_id ? photoTag(b.photo_id) : ''}</span><button class="btn ghost" data-act="cutPhoto" style="flex:1">📷 Rasm olish</button></div>
      <p class="hint">Tikuvchi ishni olganda qaysi model ekanini rasmdan ko‘radi.</p></div>
    <div class="foot"><div class="sub" id="cutTot" style="margin-bottom:8px"></div><button class="btn dark" data-act="cutSave">Saqlash</button></div>`);
  cache.cutPhoto = null;
  const upd = () => {
    const rows = $$('#sizes .szrow');
    const r = rows.reduce((a, x) => a + (Number(x.querySelector('[name=ready]').value) || 0), 0), p = rows.reduce((a, x) => a + (Number(x.querySelector('[name=partial]').value) || 0), 0);
    $('#cutTot').textContent = `Jami tayyor: ${fmt(r)} · chala: ${fmt(p)}`;
  };
  $('#sheetBody').addEventListener('input', upd);
  $('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.group === 'batch') $('#newBatch').hidden = e.target.dataset.value !== 'new'; });
  upd();
}

// ---------- Tikuvchiga berish ----------
async function giveSheet(pre = {}) {
  cache.voiceId = null; cache.vSec = 'izoh'; cache.vWhat = 'Tikuvchiga izoh';
  const meta = cache.meta || (cache.meta = await api('prod_meta'));
  const lines = [];
  for (const b of (cache.cut || (await api('cut_home'))).batches) for (const l of b.lines) if ((l.states.free || 0) > 0) lines.push({ ...l, b });
  if (!meta.sewers.length) return openSheet('<h3>Tikuvchiga berish</h3><div class="empty">Tasdiqlangan tikuvchi yo‘q.</div>');
  if (!lines.length) return openSheet('<h3>Tikuvchiga berish</h3><div class="empty">Tarqatilmagan tayyor bichim yo‘q.</div>');
  openSheet(`<h3>Tikuvchiga berish</h3>
    <div class="field"><div class="lbl">Kimga</div>${chips('to', meta.sewers.map((s) => [s.id, s.name]), pre.to || '')}</div>
    <div class="field"><div class="lbl"><span>Partiya va razmer</span><span>erkin qoldiq</span></div>
      ${lines.map((l) => `<div class="card" style="padding:12px"><div class="row">${photoTag(l.b.photo_id)}<div class="grow"><b>${prodLabel(l.b)}</b><div class="mono">${esc(l.b.code)} · razmer ${esc(l.size)} · erkin ${fmt(l.states.free)}</div></div></div>
        <div style="margin-top:8px" data-line="${l.line_id}">${qty('q' + l.line_id, pre.line === l.line_id ? pre.qty : 0, l.states.free)}</div></div>`).join('')}</div>
    <div class="field"><div class="lbl">Izoh <span>ixtiyoriy</span></div><textarea class="txt" name="note" maxlength="300" placeholder="Qanday tikish kerak: masalan, yoqasi ikki qavat, cho‘ntagi yo‘q"></textarea>
      ${canRecord() ? `<div id="vBox" style="margin-top:8px"><button class="btn ghost" data-act="vRec" id="vRecBtn">🎙 Ovozli izoh yozish</button></div>`
        : '<p class="hint">Ovoz bilan aytish uchun izoh maydoniga bosib, klaviaturadagi 🎤 tugmasidan foydalaning, telefon gapingizni yozuvga aylantiradi.</p>'}</div>
    <div class="foot"><button class="btn dark" data-act="giveSave" data-via="${pre.via || 'manual'}">Berish</button>
    <p class="hint">Yuborilgach miqdor band qilinadi va tikuvchi sanab «Qabul qildim»ni bosguncha boshqa odamga berilmaydi.</p></div>`);
}

async function stopVoice() {
  const b = $('#vRecBtn'); if (b) { b.disabled = true; b.textContent = 'Saqlanmoqda…'; }
  const v = await recordStop(cache.vWhat || 'Tikuvchiga izoh', cache.vSec || 'izoh');
  if (!v) { if (b) { b.disabled = false; b.classList.remove('rec'); b.textContent = '🎙 Ovozli izoh yozish'; } return; }
  cache.voiceId = v.id;
  $('#vBox').innerHTML = `${voiceTag(v.id)}<button class="link" data-act="vDel">Ovozni o‘chirish</button>`;
}

// ---------- Ovoz ----------
function voiceSheet() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  openSheet(`<h3>Gapirib berish</h3>
    <p class="lead">Masalan: «Ruxshonaga 10 ta qizil paxta ko‘ylak berdim». Tizim faqat mavjud partiya va xodimlardan qidiradi; topolmasa, so‘raydi.</p>
    ${SR ? '<button class="mic" data-act="mic" aria-label="Gapirish">🎙</button><p class="hint" style="text-align:center" id="micHint">Bosing va gapiring</p>'
      : '<div class="banner warn">Bu telefonda ilova ichida ovozni matnga aylantirish mavjud emas. Pastdagi maydonga bosib, klaviaturadagi 🎤 (diktovka) tugmasi bilan gapirishingiz yoki yozishingiz mumkin.</div>'}
    <div class="field"><textarea class="txt" name="vtext" id="vtext" maxlength="300" placeholder="Gapni shu yerga yozing yoki ayting"></textarea></div>
    <button class="btn ghost" data-act="vParse">Ajratish</button>
    <div id="vres"></div>`);
}

let rec = null;
function micToggle(btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = 'uz-UZ';
  rec.interimResults = true;
  rec.onresult = (e) => { $('#vtext').value = [...e.results].map((r) => r[0].transcript).join(' '); };
  rec.onerror = (e) => { $('#micHint').textContent = e.error === 'not-allowed' ? 'Mikrofonga ruxsat berilmadi. Matn bilan yozing.' : 'Ovozni tanib bo‘lmadi. Matn bilan yozing.'; };
  rec.onend = () => { btn.classList.remove('on'); rec = null; if ($('#vtext') && $('#vtext').value) $('[data-act=vParse]').click(); };
  btn.classList.add('on');
  $('#micHint').textContent = 'Eshitilmoqda… tugatish uchun yana bosing';
  try { rec.start(); } catch { btn.classList.remove('on'); rec = null; }
}

function voiceResult(v) {
  const meta = cache.meta;
  const ask = (t) => `<span class="src ask">${t}</span>`, said = '<span class="src said">aytildi</span>';
  const lineOpts = v.lines;
  return `<h2>Tekshiring</h2>
    <div class="pf"><span class="k">Kimga</span><span class="v">${v.sewer ? esc(v.sewer.name) : '—'}</span>${v.sewer ? said : ask(v.sewerOptions.length ? 'tanlang' : 'topilmadi')}</div>
    ${v.sewer ? '' : `<div class="field">${chips('vto', (v.sewerOptions.length ? v.sewerOptions : meta.sewers).map((s) => [s.id, s.name]), '')}</div>`}
    <div class="pf"><span class="k">Mahsulot</span><span class="v">${esc([v.mentioned.type_name, v.mentioned.model, v.mentioned.material, v.mentioned.color, v.size && v.size + '-razmer', v.mentioned.code].filter(Boolean).join(', ') || '—')}</span>${Object.keys(v.mentioned).length ? said : ask('aytilmadi')}</div>
    ${Object.keys(v.unknown || {}).length ? `<div class="banner bad">Katalogda yo‘q: ${esc(Object.values(v.unknown).join(', '))}. Tizim o‘ylab topmaydi — partiyani o‘zingiz tanlang yoki gapni tuzating.</div>` : ''}
    <div class="field"><div class="lbl">Partiya qatori</div>
      ${lineOpts.length ? chips('vline', lineOpts.map((l) => [l.line_id, l.label, 'erkin ' + l.free]), lineOpts.length === 1 ? lineOpts[0].line_id : '')
        : `<div class="banner bad">Mos erkin qoldiq topilmadi. «Tikuvchiga berish» orqali qo‘lda tanlang.</div>`}</div>
    <div class="field"><div class="lbl">Soni ${v.qty == null ? ask('aytilmadi') : said}</div>${qty('vqty', v.qty || 0, '', 1)}</div>
    ${v.missing.includes('over_free') ? '<div class="banner bad">Aytilgan son erkin qoldiqdan ko‘p.</div>' : ''}
    <div class="foot"><button class="btn dark" data-act="vSave" ${lineOpts.length ? '' : 'disabled'}>Tasdiqlash va berish</button>
    <p class="hint">Faqat tasdiqlaganingizdan keyin yoziladi. Tikuvchi baribir o‘zi sanab «Qabul qildim»ni bosadi.</p></div>`;
}

// ---------- Topshirish (tikuvchi) ----------
function submitSheet(lineId) {
  const l = cache.sew.lines.find((x) => x.line_id === Number(lineId));
  const both = l.sewing > 0 && l.rework > 0;
  const from = l.sewing > 0 ? 'sewing' : 'rework';
  openSheet(`<h3>Tayyorladim / Topshirdim</h3><p class="lead">${prodLabel(l)} · ${esc(l.code)} · razmer ${esc(l.size)}</p>
    ${both ? `<div class="field"><div class="lbl">Qaysi ishdan</div>${chips('from', [['sewing', 'Tikilganlar', l.sewing + ' dona'], ['rework', 'Qayta ishlangan', l.rework + ' dona']], 'sewing')}</div>` : `<input type="hidden" name="from1" value="${from}">`}
    <div class="field"><div class="lbl"><span>Nechta tayyor</span><span id="haveTxt">Sizda ${fmt(from === 'sewing' ? l.sewing : l.rework)} dona bor</span></div>${qty('n', 0, '', 1)}</div>
    <p class="hint">Tayyor deb yuborilgan mahsulot tekshiruvga o‘tadi. Haq faqat tekshirib qabul qilingandan keyin hisoblanadi. Qolgani qo‘lingizda shu partiya bilan qoladi.</p>
    <div class="foot"><button class="btn dark" data-act="submitSave" data-id="${l.line_id}">Topshirdim</button></div>`);
  $('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.group === 'from') $('#haveTxt').textContent = `Sizda ${fmt(e.target.dataset.value === 'rework' ? l.rework : l.sewing)} dona bor`; });
}

// ---------- Ekranlar ----------
async function batchScreen({ id }) {
  top('Partiya');
  const b = await api('batch_detail', { batch_id: id });
  const S = STATE_NAMES[L];
  return `<button class="back" data-act="back">‹ Orqaga</button>
  <h1 class="page">${prodLabel(b)}</h1><div class="mono">${esc(b.code)} · ${dmy(b.day)}${b.cutter ? ' · ' + esc(b.cutter) : ''}</div>
  ${photoTag(b.photo_id, 'ph lg')}
  ${tape(b.totals, L)}
  <h2>Razmerlar <button data-act="cut" data-id="${b.id}">+ Bichim qo‘shish</button></h2>
  <div class="card scrollx"><table class="t"><tr><th>Razmer</th><th>Tayyor jami</th><th>Erkin</th><th>Chala</th><th>Tikuvchilarda</th><th>Qabul</th></tr>
    ${b.lines.map((l) => { const s = l.states; return `<tr><td><b>${esc(l.size)}</b></td><td>${fmt(l.ready_total)}</td><td>${fmt(s.free || 0)}</td><td>${fmt(s.partial || 0)}${s.partial ? `<br><button class="link" data-act="partial" data-id="${l.line_id}" data-max="${s.partial}">tugatdim</button>` : ''}</td>
      <td>${fmt((s.reserved || 0) + (s.sewing || 0) + (s.rework || 0) + (s.review || 0))}</td><td>${fmt(s.accepted || 0)}</td></tr>`; }).join('')}
  </table></div>
  <h2>Kimda</h2>
  ${b.lines.some((l) => l.holders.length) ? `<div class="list">${b.lines.flatMap((l) => l.holders.map((h) => `<div class="li"><div class="grow"><b>${esc(h.name)}</b><div class="sub">razmer ${esc(l.size)} · ${S[h.state]}</div></div><div class="r">${fmt(h.qty)}</div></div>`)).join('')}</div>` : '<div class="empty">Hali hech kimga berilmagan.</div>'}
  <h2>Harakatlar</h2>
  <div class="list">${b.moves.slice(0, 40).map((m) => `<div class="li"><div class="grow">${KIND[m.kind] || m.kind}${m.tf ? ' → ' + esc(m.tf) : m.ff ? ' · ' + esc(m.ff) : ''}<div class="sub">${dt(m.at)} · razmer ${esc(m.size)}${m.note ? ' · ' + esc(m.note) : ''}</div></div><div class="r">${fmt(m.qty)}</div></div>`).join('')}</div>`;
}

let moneyP = null;
async function moneyScreen() {
  top('Mening hisobim');
  moneyP = moneyP || { key: 'month', ...periodRange('month') };
  const [m, ps, cur] = await Promise.all([api('my_money'), api('payslip', { from: moneyP.from, to: moneyP.to }), api('rk_view', {})]);
  const sent = m.rk ? (m.rk.period === cur.live.period ? cur.rk : (await api('rk_view', { period: m.rk.period })).rk) : null;
  const rkHtml = sent && sent.status === 'sent'
    ? `<div class="card" style="border:2px solid var(--warn)"><div class="title">${sent.period} oyi hisobi — rahbar yubordi</div><div class="sub">Tekshirib ko‘ring. Tasdiqlasangiz, olganlaringiz oylikdan ushlanadi va qolgan pul beriladi.</div>
        ${rkTable(sent.data)}
        <div class="actions row2"><button class="btn ok" data-act="rkOk" data-id="${sent.id}">Tasdiqlayman</button><button class="btn ghost" data-act="rkNo" data-id="${sent.id}">Tafovut bor</button></div></div>`
    : `<div class="card"><div class="title">Shu oy hozircha (${cur.live.period})</div><div class="sub">Oy oxirida rahbar hisobni yuboradi, siz tasdiqlaysiz.</div>
        ${rkTable(cur.live)}
        ${cur.live.unpriced.length ? `<div class="banner warn" style="margin-top:8px">${cur.live.unpriced.length} ta olganingizga hali narx qo‘yilmagan.</div>` : ''}</div>`;
  const avHtml = m.avans
    ? `<div class="card"><div class="row"><div class="grow"><div class="title">Avans so‘rovingiz: ${fmt(m.avans.amount)} so‘m</div><div class="sub">Rahbar javobini kutyapti${m.avans.note ? ' · «' + esc(m.avans.note) + '»' : ''}</div></div></div>
        <div class="actions"><button class="btn ghost" data-act="avCancel" data-id="${m.avans.id}">So‘rovni bekor qilish</button></div></div>`
    : `<button class="big" data-act="avans" style="width:100%"><span class="ic">💸</span><span>Avans so‘rash<small>Summani yozing, rahbarga boradi</small></span></button>`;
  const pays = m.payments.map((p) => `<div class="card"><div class="row"><div class="grow"><div class="title">${fmt(p.amount)} so‘m</div>
      <div class="sub">${p.status === 'reverse_pending' ? 'Rahbar bu to‘lovni bekor qilishni so‘radi: ' + esc(p.reverse_reason) : `Rahbar sizga naqd ${p.kind === 'avans' ? 'avans' : 'pul'} berganini qayd etdi`}</div>
      <div class="mono">${esc(p.code)} · ${dmy(p.day)}${p.period_from ? ` · davr ${dmy(p.period_from)}—${dmy(p.period_to)}` : ''}</div></div></div>
      <div class="actions">${p.status === 'reverse_pending'
        ? `<div class="row2"><button class="btn ok" data-act="revAns" data-id="${p.id}" data-a="1">Roziman</button><button class="btn ghost" data-act="revAns" data-id="${p.id}" data-a="0">Rozi emasman</button></div>`
        : `<button class="btn ok" data-act="payOk" data-id="${p.id}">Pulni oldim</button><button class="btn ghost" data-act="payNo" data-id="${p.id}" data-amount="${p.amount}">Tafovut bor</button>`}</div></div>`).join('');
  const adjs = m.adjustments.map((a) => `<div class="card"><div class="title">${a.amount > 0 ? '+' : '−'}${fmt(Math.abs(a.amount))} so‘m</div>
      <div class="sub">${a.kind === 'opening' ? 'Boshlang‘ich qoldiq' : 'Hisob tuzatishi'}: ${esc(a.reason)}</div>
      <div class="actions row2"><button class="btn ok" data-act="adjAns" data-id="${a.id}" data-a="1">Roziman</button><button class="btn ghost" data-act="adjAns" data-id="${a.id}" data-a="0">E’tiroz</button></div></div>`).join('');
  const tks = m.takeaways.map((k) => tkConfirmCard(k)).join('');
  const W = { bichish: 'Bichish', tikish: 'Tikish' };
  return `<button class="back" data-act="back">‹ Orqaga</button>
  ${pays || adjs || tks ? `<h2>Sizning tasdig‘ingiz kerak</h2>${pays}${adjs}${tks}` : ''}
  <h2>Oylik hisobim</h2>
  ${rkHtml}
  <div style="margin-top:10px">${avHtml}</div>
  <h2>Hozirgi holat</h2>
  <div class="stats">
    <div class="stat" style="--c:var(--ok)"><b class="num">${fmt(ps.now.payable)}</b><span>Beriladigan pul, so‘m</span></div>
    <div class="stat" style="--c:var(--warn)"><b class="num">${fmt(ps.now.pending)}</b><span>Tasdiq kutayotgan</span></div>
    <div class="stat" style="--c:var(--bad)"><b class="num">${fmt(ps.now.debt + ps.now.overpaid)}</b><span>Qarz</span></div>
  </div>
  <h2>Oylik varaqasi</h2>
  ${periodPicker(L, moneyP, 'mPer')}
  <div class="card" style="margin-top:10px">
    ${ps.groups.length ? `<table class="t"><tr><th>Ish</th><th>Dona</th><th>Tarif</th><th>Summa</th></tr>${ps.groups.map((g) => `<tr><td>${W[g.work]}: ${gl(g)}</td><td>${fmt(g.qty)}</td><td>${g.price == null ? '<span class="tag warn">yo‘q</span>' : fmt(g.price)}</td><td>${g.amount == null ? '—' : fmt(g.amount)}</td></tr>`).join('')}</table>`
      : '<div class="sub">Bu davrda qabul qilingan ish yo‘q.</div>'}
    ${ps.missingQty ? `<div class="banner warn" style="margin-top:8px">${fmt(ps.missingQty)} dona uchun tarif hali belgilanmagan. Summa taxmin qilinmaydi, rahbar belgilagach qo‘shiladi.</div>` : ''}
    <div class="bal" style="margin-top:12px">
      <span>Davr boshidagi qoldiq</span><span class="v">${fmt(ps.opening)}</span>
      <span>Hisoblangan ishbay haq</span><span class="v">+${fmt(ps.earned)}</span>
      ${ps.adjConfirmed ? `<span>Tuzatishlar</span><span class="v">${ps.adjConfirmed > 0 ? '+' : '−'}${fmt(Math.abs(ps.adjConfirmed))}</span>` : ''}
      <span>Olgan pulingiz (tasdiqlangan)</span><span class="v">−${fmt(ps.paidConfirmed)}</span>
      <span>Ushlab qolingan (olganlar, mijoz puli)</span><span class="v">−${fmt(ps.ded)}</span>
      <span class="hr"></span><span class="tot">Davr oxiri qoldiq</span><span class="v tot">${fmt(ps.closing)} so‘m</span>
    </div>
    ${ps.closed ? '<div class="banner ok" style="margin-top:10px">Bu davr yopilgan.</div>' : ''}
  </div>
  ${ps.payments.length ? `<h2>To‘lovlar</h2><div class="list">${ps.payments.map((p) => `<div class="li"><div class="grow">${fmt(p.amount)} so‘m · ${p.kind}<div class="sub">${esc(p.code)} · ${dmy(p.day)}${p.dispute_note ? ' · ' + esc(p.dispute_note) : ''}${p.cancel_reason ? ' · ' + esc(p.cancel_reason) : ''}</div></div>${tag(PAY_ST[p.status] || [p.status, ''])}</div>`).join('')}</div>` : ''}
  <p class="hint">Bu korxonaning ichki ishbay hisobi. Rasmiy ish haqi va soliq hisobini almashtirmaydi.</p>`;
}

function tkConfirmCard(k) {
  return `<div class="card"><div class="title">${esc(k.name)} — ${fmt(k.amount)} so‘m</div>
    <div class="sub">${TK_KIND[k.kind]} · ${k.qty} ${esc(k.unit || '')} · ${dmy(k.day)} · ${METHOD[k.pay_method]}</div>
    ${k.pay_method === 'payroll' ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="cons${k.id}"> Shu summani oylik hisobimdan ushlab qolishga roziman</label>` : ''}
    <div class="actions row2"><button class="btn ok" data-act="tkOk" data-id="${k.id}" data-m="${k.pay_method}">Tasdiqlayman</button><button class="btn ghost" data-act="tkNo" data-id="${k.id}">E’tiroz</button></div></div>`;
}

async function tkScreen() {
  top('Olganlarim');
  const list = await api('tk_list');
  cache.tkPhoto = null;
  const open = list.filter((k) => ['submitted', 'review', 'priced', 'disputed', 'employee'].includes(k.status));
  const fin = list.filter((k) => k.status === 'agreed').slice(0, 40);
  const row = (k) => `<div class="li">${photoTag(k.photo_id)}<div class="grow"><b>${esc(k.name)}</b>
      <div class="sub">${dmy(k.day)}${k.amount != null ? ` · <b>${fmt(k.amount)} so‘m</b>` : ''}${k.pay_method === 'prepaid' ? ' · pul alohida to‘langan' : ''}</div></div>
      <div style="text-align:right">${tag(TK_ST[k.status] || [k.status, ''])}${['submitted', 'review'].includes(k.status) ? `<br><button class="link" data-act="tkCancel" data-id="${k.id}">O‘chirish</button>` : ''}</div></div>`;
  return `<button class="back" data-act="back">‹ Orqaga</button>
  <h1 class="page">Olganlarim</h1>
  <p class="lead">Korxonadan nima olsangiz, shu zahoti yozib qo‘ying, oy oxirida esdan chiqmaydi. Narxini rahbar qo‘yadi, oylik hisobda ko‘rasiz.</p>
  <div class="card">
    <div class="field"><div class="lbl">Nima oldingiz?</div><input class="txt" name="tkname" id="tkname" maxlength="120" placeholder="masalan: 3 metr pombaxt" enterkeyhint="done"></div>
    <div class="phbtn"><span id="tkPh"></span><button class="btn ghost" data-act="tkPhoto" style="flex:1">📷 Rasm (ixtiyoriy)</button></div>
    <button class="btn dark" style="margin-top:10px" data-act="tkAddNew">+ Ro‘yxatga qo‘shish</button>
  </div>
  <h2>Oylik hisobga kirmagan · ${open.length}</h2>
  ${open.length ? `<div class="list">${open.map(row).join('')}</div>` : '<div class="empty">Hozircha yozuv yo‘q.</div>'}
  ${fin.length ? `<h2>Hisobga kiritilganlar</h2><div class="list">${fin.map(row).join('')}</div>` : ''}`;
}

// Oylik hisob jadvali (xodim ko'radigan ko'rinish)
function rkTable(d) {
  const sg = (n) => (n < 0 ? '−' : '') + fmt(Math.abs(n));
  return `<div class="bal">
    ${d.opening ? `<span>O‘tgan davrdan ${d.opening > 0 ? 'qoldiq' : 'qarz'}</span><span class="v">${sg(d.opening)}</span>` : ''}
    <span>Qilgan ishlarim</span><span class="v">+${fmt(d.earned)}</span>
    ${d.adj ? `<span>Tuzatishlar</span><span class="v">${d.adj > 0 ? '+' : ''}${sg(d.adj)}</span>` : ''}
    <span>Olgan avanslarim</span><span class="v">−${fmt(d.avansSum)}</span>
    ${d.givenSum ? `<span>Berilgan pul</span><span class="v">−${fmt(d.givenSum)}</span>` : ''}
    ${d.prevDed ? `<span>Avval ushlangan</span><span class="v">−${fmt(d.prevDed)}</span>` : ''}
    <span>Korxonadan olganlarim</span><span class="v">−${fmt(d.itemsSum)}</span>
    ${d.cashHeld ? `<span>Qo‘limdagi mijoz puli (topshirilmagan)</span><span class="v">−${fmt(d.cashHeld)}</span>` : ''}
    <span class="hr"></span><span class="tot">${d.total >= 0 ? 'Qo‘limga tegadi' : 'Qarzim (keyingi oyga o‘tadi)'}</span><span class="v tot">${fmt(Math.abs(d.total))} so‘m</span>
  </div>
  ${d.items.length ? `<details style="margin-top:10px"><summary>Olganlarim ro‘yxati · ${d.items.length} ta</summary><div class="list" style="margin-top:8px">${d.items.map((k) => `<div class="li">${photoTag(k.photo_id)}<div class="grow">${esc(k.name)}<div class="sub">${dmy(k.day)}</div></div><div class="r">${fmt(k.amount)}</div></div>`).join('')}</div></details>` : ''}
  ${d.avans.length ? `<details style="margin-top:6px"><summary>Avanslar · ${d.avans.length} ta</summary><div class="list" style="margin-top:8px">${d.avans.map((p) => `<div class="li"><div class="grow">${dmy(p.day)}<div class="sub">${esc(p.code)}</div></div><div class="r">${fmt(p.amount)}</div></div>`).join('')}</div></details>` : ''}
  ${d.groups.length ? `<details style="margin-top:6px"><summary>Qilgan ishlarim</summary><table class="t" style="margin-top:8px"><tr><th>Ish</th><th>Dona</th><th>Summa</th></tr>${d.groups.map((g) => `<tr><td>${g.work === 'bichish' ? 'Bichish' : 'Tikish'}: ${gl(g)}</td><td>${fmt(g.qty)}</td><td>${g.amount == null ? '—' : fmt(g.amount)}</td></tr>`).join('')}</table></details>` : ''}`;
}

const RK_WHY = { cash_open: 'rahbarga topshirgan pulingiz hali tasdiqlanmagan', missing_rate: 'ba’zi ishlarga tarif qo‘yilmagan', unpriced: 'ba’zi olganlaringizga hali narx qo‘yilmagan', payment_open: 'tasdiqlanmagan to‘lov bor',
  adjustment_open: 'tasdiqlanmagan tuzatish bor', takeaway_open: 'bahsli yozuv bor' };

let attP = null;
async function attScreen() {
  top('Davomat tarixi');
  attP = attP || { key: 'month', ...periodRange('month') };
  const rows = await api('att_history', { from: attP.from, to: attP.to });
  const st = (r) => r.status === 'no_out' ? tag(['Ketish qayd etilmagan', 'bad']) : r.status === 'working' ? tag(['Ishda', 'blue']) : r.full ? tag(['To‘liq kun', 'ok']) : r.status === 'short' ? tag(['Qisqa kun', 'warn']) : '';
  return `<button class="back" data-act="back">‹ Orqaga</button><h1 class="page">Davomat tarixi</h1>
  ${periodPicker(L, attP, 'aPer')}
  <div class="stats two" style="margin-top:10px"><div class="stat"><b>${rows.filter((r) => r.in).length}</b><span>Kelgan kunlar</span></div><div class="stat"><b>${rows.filter((r) => r.full).length}</b><span>To‘liq kunlar</span></div></div>
  ${rows.length ? `<div class="list" style="margin-top:10px">${rows.map((r) => `<div class="li"><div class="grow"><b>${dmy(r.day)}</b><div class="sub">${r.in || '—'} → ${r.out || '—'} · sof ${mins(r.net)}${r.late ? ` · ${r.late} daq kechikish` : ''}${(r.in_how || '').startsWith('exc') ? ' · rahbar tasdig‘i bilan' : ''}</div></div>${st(r)}</div>`).join('')}</div>` : '<div class="empty" style="margin-top:10px">Bu davrda yozuv yo‘q.</div>'}`;
}

async function movesScreen() {
  top('Ish tarixi');
  const rows = await api('my_moves', {});
  return `<button class="back" data-act="back">‹ Orqaga</button><h1 class="page">Ish tarixi</h1>
  ${rows.length ? `<div class="list">${rows.map((m) => `<div class="li"><div class="grow">${KIND[m.kind] || m.kind}<div class="sub">${dmy(m.day)} ${m.time} · ${esc(m.code)} ${esc(m.type_name)} «${esc(m.model)}» ${esc(m.color)} · ${esc(m.size)}${m.note ? ' · ' + esc(m.note) : ''}</div></div><div class="r">${fmt(m.qty)}</div></div>`).join('')}</div>` : '<div class="empty">Hali yozuv yo‘q.</div>'}`;
}

async function inspScreen() {
  top('Tekshirish');
  const list = await api('insp_list');
  cache.insp = list;
  return `<button class="back" data-act="back">‹ Orqaga</button><h1 class="page">Tekshirish</h1><p class="lead">Tayyor deb yuborilgan mahsulotni sanab, qabul qiling yoki sababi bilan qaytaring.</p>
  ${list.length ? list.map((s) => `<div class="card"><div class="row">${photoTag(s.photo_id) || ava(s.name, s.sewer_id, 36)}<div class="grow"><div class="title">${esc(s.name)} · ${fmt(s.open_qty)} dona</div><div class="sub">${prodLabel(s)} · ${esc(s.code)} · ${esc(s.size)}</div></div></div>
    <div class="actions">${s.own ? '<div class="sub">O‘zingizning ishingiz — boshqa tekshiruvchi qabul qiladi.</div>' : `<button class="btn dark" data-act="inspOpen" data-id="${s.id}">Tekshirish</button>`}</div></div>`).join('') : '<div class="empty">Tekshiruv kutayotgan mahsulot yo‘q.</div>'}`;
}

const MJ_K = { leave: 'Ruxsat so‘rash', cut_error: 'Bichimdagi xato', shortage: 'Kamomad (yetishmaydi)', conflict: 'Xodim bilan kelishmovchilik', equipment: 'Uskuna yoki mato', other: 'Boshqa' };
const MJ_ST = { open: ['Rahbarda', 'blue'], answered: ['Javob berildi', 'ok'], approved: ['Ruxsat berildi', 'ok'], declined: ['Ruxsat berilmadi', 'bad'], cancelled: ['Bekor qilingan', ''] };
async function mjScreen() {
  top('Murojaat');
  const list = await api('mj_my');
  return `<button class="back" data-act="back">‹ Orqaga</button>
  <h1 class="page">Murojaat</h1>
  <p class="lead">Rahbarga to‘g‘ridan-to‘g‘ri yozing: ruxsat so‘rash, bichimdagi xato, kamomad, kelishmovchilik. Murojaatingizni faqat rahbar ko‘radi.</p>
  <div class="grid2"><button class="big primary" data-act="mjNew" data-k="leave"><span class="ic">🙋</span><span>Ruxsat so‘rash<small>Kela olmaydigan kunlar</small></span></button>
  <button class="big" data-act="mjNew" data-k="cut_error"><span class="ic">📨</span><span>Muammo yozish<small>Xato, kamomad va boshqa</small></span></button></div>
  <h2>Murojaatlarim</h2>
  ${list.length ? list.map((a) => `<div class="card"><div class="row"><div class="grow"><div class="title">${MJ_K[a.kind]}${a.ref ? ' · ' + esc(a.ref) : ''}</div>
    <div class="sub">${dt(a.created_at)}${a.from_day ? ` · <b>${dmy(a.from_day)}${a.to_day !== a.from_day ? ' — ' + dmy(a.to_day) : ''}</b> (${a.days} kun)` : ''}</div></div>${tag(MJ_ST[a.status])}</div>
    ${a.text ? `<div class="sub" style="margin-top:6px">«${esc(a.text)}»</div>` : ''}${a.photo_id ? `<div style="margin-top:6px">${photoTag(a.photo_id)}</div>` : ''}${voiceTag(a.voice_id)}
    ${a.answer ? `<div class="banner ${a.status === 'declined' ? 'bad' : 'ok'}" style="margin-top:8px">Rahbar: «${esc(a.answer)}»</div>` : ''}
    ${a.status === 'open' ? `<div class="actions"><button class="link" data-act="mjCancel" data-id="${a.id}">Bekor qilish</button></div>` : ''}</div>`).join('') : '<div class="empty">Hali murojaat yo‘q.</div>'}`;
}

registerScreens({ w_mj: mjScreen, w_home: home, w_batch: batchScreen, w_money: moneyScreen, w_tk: tkScreen, w_att: attScreen, w_moves: movesScreen, w_insp: inspScreen });

// ---------- Tugmalar ----------
const done = async (msg) => { closeSheet(); toast(msg); await refresh(); };
on({
  go: (el) => show(el.dataset.s, { id: el.dataset.id }),
  att: (el) => doAtt(el.dataset.k, el),
  attForce: (el) => doAtt(el.dataset.k, el, true),
  locSettings: () => openLocationSettings(),
  attExc: async (el) => { await act('att_exception', { kind: el.dataset.k, reason: el.dataset.r, note: val('note') }, el); await done('So‘rov rahbarga yuborildi'); },
  cut: (el) => cutSheet(el.dataset.id),
  addSize: () => $('#sizes').insertAdjacentHTML('beforeend', sizeRow()),
  rmSize: (el) => { if ($$('#sizes .szrow').length > 1) el.closest('.szrow').remove(); },
  tkPhoto: async () => {
    const p = await pickPhoto(val('tkname', document) || '', 'olganlar');
    if (p) { cache.tkPhoto = p.id; $('#tkPh').innerHTML = photoTag(p.id); }
  },
  tkAddNew: async (el) => {
    const name = val('tkname', document);
    if (!name || name.length < 2) { toast('Nima olganingizni yozing', true); return; }
    const r = await act('tk_add', { name, photo_id: cache.tkPhoto || undefined }, el);
    if (!r) return;
    toast('Ro‘yxatga qo‘shildi');
    await refresh();
    const i = $('#tkname'); if (i) i.focus();
  },
  avans: () => openSheet(`<h3>Avans so‘rash</h3><p class="lead">So‘rov rahbarga boradi. Rahbar bersa, ilovada «Pulni oldim» ni bosasiz. Avans oylik hisobda ayiriladi.</p>
    <div class="field"><div class="lbl">Summa, so‘m</div><input class="txt" name="avamount" type="number" inputmode="numeric" min="1000" step="1000" placeholder="500000" autofocus></div>
    <div class="field"><div class="lbl">Izoh <span>ixtiyoriy</span></div><input class="txt" name="avnote" maxlength="200" placeholder="masalan: uy uchun kerak"></div>
    <div class="foot"><button class="btn dark" data-act="avSave">Yuborish</button></div>`),
  avSave: async (el) => {
    if (!(num('avamount') >= 1000)) return sheetErr('Summani yozing (kamida 1 000 so‘m).');
    await act('av_request', { amount: num('avamount'), note: val('avnote') }, el);
    await done('Rahbarga yuborildi');
  },
  avCancel: async (el) => { await act('av_cancel', { id: Number(el.dataset.id) }, el); await done('Bekor qilindi'); },
  rkOk: async (el) => {
    const r = await act('rk_answer', { id: Number(el.dataset.id), agree: true }, el);
    if (r && r.stale) { toast('Hisob yuborilgandan keyin o‘zgargan. Rahbar yangisini yuboradi.', true); return refresh(); }
    if (r) await done('Tasdiqlandi. Rahbar qolgan pulni beradi.');
  },
  rkNo: (el) => openSheet(`<h3>Tafovut bor</h3><p class="lead">Nima noto‘g‘ri ekanini yozing. Rahbar ko‘rib, hisobni tuzatib qayta yuboradi.</p>
    <div class="field"><textarea class="txt" name="rknote" maxlength="300" placeholder="masalan: 2 ta zamok olganman, 3 ta emas" autofocus></textarea></div>
    <div class="foot"><button class="btn dark" data-act="rkNoSave" data-id="${el.dataset.id}">Yuborish</button></div>`),
  rkNoSave: async (el) => {
    if (!val('rknote')) return sheetErr('Nima noto‘g‘ri ekanini yozing.');
    await act('rk_answer', { id: Number(el.dataset.id), agree: false, note: val('rknote') }, el);
    await done('Rahbarga yuborildi');
  },
  cutPhoto: async () => {
    const p = await pickPhoto(val('model') || '', 'bichim');
    if (p) { cache.cutPhoto = p.id; $('#cutPh').innerHTML = photoTag(p.id); toast('Rasm biriktirildi'); }
  },
  cutSave: async (el) => {
    const lines = $$('#sizes .szrow').map((r) => ({ size: r.querySelector('[name=size]').value.trim(), ready: Number(r.querySelector('[name=ready]').value) || 0, partial: Number(r.querySelector('[name=partial]').value) || 0 }))
      .filter((l) => l.size || l.ready || l.partial);
    if (!lines.length || lines.some((l) => !l.size)) return sheetErr('Har qatorga razmer yozing.');
    if (!lines.some((l) => l.ready + l.partial > 0)) return sheetErr('Kamida bitta son kiriting.');
    const bsel = pressed('batch');
    let r;
    const photo_id = cache.cutPhoto || undefined;
    if (bsel && bsel !== 'new') r = await act('cut_add', { batch_id: Number(bsel), lines, photo_id }, el);
    else {
      const body = { type_id: Number(pressed('type')), model: val('model'), material: val('material'), color: val('color'), lines, photo_id };
      if (!body.type_id) return sheetErr('Mahsulot turini tanlang.');
      if (!body.model || !body.material || !body.color) return sheetErr('Model, material va rangni yozing — partiyalar adashmasligi uchun.');
      r = await act('batch_create', body, el);
    }
    if (r) { cache.meta = null; await done(`${r.code}: ${fmt(r.ready)} tayyor${r.partial ? `, ${fmt(r.partial)} chala` : ''} saqlandi`); }
  },
  partial: (el) => openSheet(`<h3>Chala bichim tugatildi</h3><p class="lead">Tugatilgan dona tayyor bichimga o‘tadi (qayta sanalmaydi).</p>
    <div class="field">${qty('n', Number(el.dataset.max), el.dataset.max, 1)}</div><div class="foot"><button class="btn dark" data-act="partialSave" data-id="${el.dataset.id}">Saqlash</button></div>`),
  partialSave: async (el) => { await act('partial_done', { line_id: Number(el.dataset.id), qty: num('n') }, el); await done('Tayyor bichimga o‘tkazildi'); },
  give: () => giveSheet(),
  mjNew: async (el) => {
    cache.voiceId = null; cache.mjPhoto = null; cache.vSec = 'murojaat'; cache.vWhat = 'Murojaat';
    const leave = el.dataset.k === 'leave';
    const meta = leave ? { refs: [] } : await api('mj_meta');
    const t0 = today();
    openSheet(`<h3>${leave ? 'Ruxsat so‘rash' : 'Rahbarga murojaat'}</h3>
      ${leave ? `<div class="row2"><div class="field"><div class="lbl">Qaysi kundan</div><input class="txt" type="date" name="from" min="${t0}" value="${t0}"></div>
        <div class="field"><div class="lbl">Qaysi kungacha</div><input class="txt" type="date" name="to" min="${t0}" value="${t0}"></div></div>
        <p class="hint">Bir kun bo‘lsa, ikkalasiga bir xil sana qo‘ying.</p>`
      : `<div class="field"><div class="lbl">Mavzu</div>${chips('kind', Object.entries(MJ_K).filter(([k]) => k !== 'leave'), 'cut_error')}</div>
        ${meta.refs.length ? `<div class="field"><div class="lbl">Qaysi ishga tegishli <span>ixtiyoriy</span></div>${chips('ref', meta.refs, '')}</div>` : ''}`}
      <div class="field"><div class="lbl">${leave ? 'Sababi' : 'Nima bo‘ldi'}</div><textarea class="txt" name="text" maxlength="1000" placeholder="${leave ? 'masalan: to‘yga boraman' : 'masalan: 10 tadan 1 tasida yeng yo‘q'}"></textarea>
        ${canRecord() ? '<div id="vBox" style="margin-top:8px"><button class="btn ghost" data-act="vRec" id="vRecBtn">🎙 Ovoz bilan aytish</button></div>' : '<p class="hint">Ovoz bilan aytish uchun maydonga bosib, klaviaturadagi 🎤 tugmasidan foydalaning.</p>'}</div>
      ${leave ? '' : '<div class="field"><div class="phbtn"><span id="mjPh"></span><button class="btn ghost" data-act="mjPhoto" style="flex:1">📷 Rasm (ixtiyoriy)</button></div></div>'}
      <div class="foot"><button class="btn dark" data-act="mjSave" data-k="${leave ? 'leave' : ''}">Rahbarga yuborish</button></div>`);
  },
  mjPhoto: async () => { const p = await pickPhoto('Murojaat', 'murojaat'); if (p) { cache.mjPhoto = p.id; $('#mjPh').innerHTML = photoTag(p.id); } },
  mjSave: async (el) => {
    const leave = el.dataset.k === 'leave';
    if (isRecording()) await stopVoice();
    if (!val('text') && !cache.voiceId) return sheetErr('Yozing yoki ovoz bilan ayting.');
    const b = { kind: leave ? 'leave' : pressed('kind'), text: val('text'), voice_id: cache.voiceId || undefined };
    if (leave) {
      if (!val('from') || val('from') < today()) return sheetErr('Sanani tanlang.');
      if (val('to') < val('from')) return sheetErr('Tugash sanasi boshlanishidan oldin bo‘lmasin.');
      Object.assign(b, { from_day: val('from'), to_day: val('to') || val('from') });
    } else Object.assign(b, { ref: pressed('ref') || undefined, photo_id: cache.mjPhoto || undefined });
    if (await act('mj_create', b, el)) await done('Rahbarga yuborildi. Javob kelsa, Telegram’da xabar olasiz.');
  },
  mjCancel: async (el) => { if (await act('mj_cancel', { id: Number(el.dataset.id) }, el)) await done('Bekor qilindi'); },
  vRec: async () => {
    if (isRecording()) return stopVoice();
    const r = await recordStart();
    if (r.error) {
      $('#vBox').innerHTML = '<p class="hint">Telefon mikrofonga ruxsat bermadi. Izoh maydoniga bosib, klaviaturadagi 🎤 tugmasi bilan gapiring, telefon yozuvga aylantiradi.</p>';
      return;
    }
    const b = $('#vRecBtn'); b.classList.add('rec'); b.textContent = '⏹ To‘xtatish (yozilmoqda…)';
  },
  vDel: () => { cache.voiceId = null; $('#vBox').innerHTML = '<button class="btn ghost" data-act="vRec" id="vRecBtn">🎙 Ovozli izoh yozish</button>'; },
  giveSave: async (el) => {
    const to = Number(pressed('to'));
    if (!to) return sheetErr('Tikuvchini tanlang.');
    const items = $$('#sheetBody [data-line]').map((d) => ({ line_id: Number(d.dataset.line), qty: Number(d.querySelector('input').value) || 0 })).filter((i) => i.qty > 0);
    if (!items.length) return sheetErr('Sonini kiriting.');
    if (isRecording()) await stopVoice();
    const r = await act('transfer_create', { to_id: to, items, note: val('note'), via: el.dataset.via, voice_id: cache.voiceId || undefined }, el);
    if (r) await done(`${r.code}: ${fmt(r.total)} dona berildi. Tikuvchi qabul qilishi kutilmoqda.`);
  },
  trCancel: (el) => openSheet(`<h3>Topshiriqni bekor qilish</h3><p class="lead">Band qilingan miqdor tarqatilmagan qoldiqqa qaytadi. Asl yozuv tarixda qoladi.</p>
    <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Sababi" autofocus></textarea></div>
    <div class="foot"><button class="btn bad" data-act="trCancelSave" data-id="${el.dataset.id}">Bekor qilish</button></div>`),
  trCancelSave: async (el) => { if (!val('reason')) return sheetErr('Sababini yozing.'); await act('transfer_cancel', { id: Number(el.dataset.id), reason: val('reason') }, el); await done('Bekor qilindi'); },
  voice: async () => { cache.meta = cache.meta || (await api('prod_meta')); voiceSheet(); },
  mic: (el) => micToggle(el),
  vParse: async () => {
    const text = $('#vtext').value.trim();
    if (!text) return sheetErr('Gapni yozing yoki ayting.');
    const v = await api('voice_parse', { text });
    cache.voice = v;
    $('#vres').innerHTML = voiceResult(v);
  },
  vSave: async (el) => {
    const v = cache.voice;
    const to = v.sewer ? v.sewer.id : Number(pressed('vto'));
    const line = Number(pressed('vline'));
    const n = num('vqty');
    if (!to) return sheetErr('Kimga berilishini tanlang.');
    if (!line) return sheetErr('Partiya qatorini tanlang.');
    if (!(n > 0)) return sheetErr('Sonini kiriting.');
    const r = await act('transfer_create', { to_id: to, items: [{ line_id: line, qty: n }], via: 'voice', note: v.text }, el);
    if (r) await done(`${r.code}: ${fmt(r.total)} dona berildi. Tikuvchi qabul qilishi kutilmoqda.`);
  },
  trAccept: async (el) => { await act('transfer_accept', { id: Number(el.dataset.id) }, el); toast('Qabul qilindi'); await refresh(); },
  trDispute: (el) => {
    const t = cache.sew.incoming.find((x) => x.id === Number(el.dataset.id));
    openSheet(`<h3>Tafovut bor</h3><p class="lead">Sanagan soningizni yozing. Asl yozuv o‘zgarmaydi — bichuvchi va rahbar ko‘rib hal qiladi.</p>
      ${t.items.map((i) => `<div class="card" style="padding:12px"><b>${prodLabel(i)}</b><div class="mono">${esc(i.code)} · ${esc(i.size)} · yozilgan ${i.qty}</div><div style="margin-top:8px" data-item="${i.id}">${qty('c' + i.id, i.qty, '', 0)}</div></div>`).join('')}
      <div class="field"><textarea class="txt" name="note" maxlength="300" placeholder="Sababi: masalan, 10 emas 9 ta keldi"></textarea></div>
      <div class="foot"><button class="btn dark" data-act="trDisputeSave" data-id="${t.id}">Aniqlashtirish so‘rovini yuborish</button></div>`);
  },
  trDisputeSave: async (el) => {
    if (!val('note')) return sheetErr('Sababini yozing.');
    const counted = $$('#sheetBody [data-item]').map((d) => ({ item_id: Number(d.dataset.item), counted: Number(d.querySelector('input').value) || 0 }));
    await act('transfer_dispute', { id: Number(el.dataset.id), note: val('note'), counted }, el);
    await done('So‘rov yuborildi');
  },
  submit: (el) => submitSheet(el.dataset.id),
  submitSave: async (el) => {
    const from = pressed('from') || val('from1') || 'sewing';
    const n = num('n');
    if (!(n > 0)) return sheetErr('Sonini kiriting.');
    const r = await act('submit', { line_id: Number(el.dataset.id), qty: n, from }, el);
    if (r) await done(r.left ? `${fmt(n)} dona tekshiruvga ketdi. Qo‘lingizda ${fmt(r.left)} qoldi.` : `${fmt(n)} dona tekshiruvga ketdi. Hammasi tugadi.`);
  },
  mPer: (el) => { moneyP = periodFromBtn(el, moneyP); return refresh(); },
  aPer: (el) => { attP = periodFromBtn(el, attP); return refresh(); },
  payOk: async (el) => { await act('pay_confirm', { id: Number(el.dataset.id) }, el); toast('Tasdiqlandi. Rahmat!'); await refresh(); },
  payNo: (el) => openSheet(`<h3>Tafovut bor</h3><p class="lead">Aslida qancha olganingizni va sababini yozing. Rahbar ko‘radi.</p>
    <div class="field"><div class="lbl">Olgan summam (so‘m)</div><input class="txt" name="amount" type="number" inputmode="numeric" min="0" placeholder="${esc(el.dataset.amount)}"></div>
    <div class="field"><textarea class="txt" name="note" maxlength="300" placeholder="Izoh"></textarea></div>
    <div class="foot"><button class="btn dark" data-act="payNoSave" data-id="${el.dataset.id}">Yuborish</button></div>`),
  payNoSave: async (el) => { if (!val('note')) return sheetErr('Izoh yozing.'); await act('pay_dispute', { id: Number(el.dataset.id), note: val('note'), amount: val('amount') === '' ? null : num('amount') }, el); await done('Rahbarga yuborildi'); },
  revAns: async (el) => { await act('pay_reverse_answer', { id: Number(el.dataset.id), agree: el.dataset.a === '1' }, el); toast('Javob yuborildi'); await refresh(); },
  adjAns: async (el) => {
    if (el.dataset.a === '1') { await act('adj_answer', { id: Number(el.dataset.id), agree: true }, el); toast('Tasdiqlandi'); return refresh(); }
    openSheet(`<h3>E’tiroz</h3><div class="field"><textarea class="txt" name="note" maxlength="300" placeholder="Sababi" autofocus></textarea></div><div class="foot"><button class="btn dark" data-act="adjNoSave" data-id="${el.dataset.id}">Yuborish</button></div>`);
  },
  adjNoSave: async (el) => { if (!val('note')) return sheetErr('Sababini yozing.'); await act('adj_answer', { id: Number(el.dataset.id), agree: false, note: val('note') }, el); await done('Yuborildi'); },
  declNone: async (el) => { await act('declare_none', { period: today().slice(0, 7) }, el); toast('Qayd etildi: bu oy olmagansiz'); await refresh(); },
  tkAdd: () => openSheet(`<h3>Korxonadan olganim</h3>
    <div class="field"><div class="lbl">Turi</div>${chips('kind', [['product', 'Tayyor mahsulot'], ['material', 'Material'], ['service', 'Tikish xizmati']], '')}</div>
    <div class="field"><div class="lbl">Nomi</div><input class="txt" name="name" maxlength="80" placeholder="masalan: o‘zim uchun 2 ta ko‘ylak tiktirdim"></div>
    <div class="row2"><div class="field"><div class="lbl">Miqdor</div><input class="txt" name="qty" type="number" inputmode="decimal" min="0" step="any" value="1"></div>
      <div class="field"><div class="lbl">Birlik</div>${chips('unit', [['dona', 'dona'], ['metr', 'metr'], ['kg', 'kg']], 'dona')}</div></div>
    <div class="field"><div class="lbl">Sana</div><input class="txt" name="day" type="date" value="${today()}" max="${today()}"></div>
    <div class="field"><div class="lbl">Narxi</div>${chips('price', [['boss', 'Rahbar belgilaydi'], ['know', 'Narxini bilaman']], 'boss')}
      <input class="txt" name="proposed" type="number" inputmode="numeric" min="1" placeholder="so‘m (taklif)" style="margin-top:8px" hidden></div>
    <div class="field"><textarea class="txt" name="note" maxlength="300" placeholder="Izoh (ixtiyoriy)"></textarea></div>
    <div class="foot"><button class="btn dark" data-act="tkSave">Yuborish</button><p class="hint">Rahbar tekshirib yakuniy summani belgilaydi, keyin siz tasdiqlaysiz. Siz tasdiqlamaguncha oylikdan hech narsa ayirilmaydi.</p></div>`)
    || $('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.group === 'price') $('[name=proposed]').hidden = e.target.dataset.value !== 'know'; }),
  tkSave: async (el) => {
    const kind = pressed('kind');
    if (!kind) return sheetErr('Turini tanlang.');
    if (!val('name')) return sheetErr('Nomini yozing.');
    const know = pressed('price') === 'know';
    if (know && !(num('proposed') > 0)) return sheetErr('Narxni yozing yoki «Rahbar belgilaydi»ni tanlang.');
    await act('tk_create', { kind, name: val('name'), qty: Number(val('qty')), unit: pressed('unit'), day: val('day'), note: val('note'), proposed: know ? num('proposed') : null }, el);
    await done('Rahbarga yuborildi');
  },
  tkOk: async (el) => {
    const c = $('#cons' + el.dataset.id);
    if (el.dataset.m === 'payroll' && !(c && c.checked)) return toast('Oylikdan ushlashga roziligingizni belgilang', true);
    await act('tk_confirm', { id: Number(el.dataset.id), consent: !!(c && c.checked) }, el); toast('Tasdiqlandi'); await refresh();
  },
  tkNo: (el) => openSheet(`<h3>E’tiroz</h3><div class="field"><textarea class="txt" name="note" maxlength="300" placeholder="Masalan: narxi boshqa kelishilgan edi" autofocus></textarea></div>
    <div class="foot"><button class="btn dark" data-act="tkNoSave" data-id="${el.dataset.id}">Yuborish</button></div>`),
  tkNoSave: async (el) => { if (!val('note')) return sheetErr('Sababini yozing.'); await act('tk_dispute', { id: Number(el.dataset.id), note: val('note') }, el); await done('Yuborildi'); },
  tkCancel: async (el) => { await act('tk_cancel', { id: Number(el.dataset.id) }, el); toast('Bekor qilindi'); await refresh(); },
  inspOpen: (el) => {
    const s = cache.insp.find((x) => x.id === Number(el.dataset.id));
    openSheet(`<h3>Tekshirish: ${esc(s.name)}</h3><p class="lead">${prodLabel(s)} · ${esc(s.code)} · ${esc(s.size)} · ${fmt(s.open_qty)} dona</p>
      <div class="field"><div class="lbl">Qabul qilindi</div>${qty('acc', s.open_qty, s.open_qty)}</div>
      <div class="field"><div class="lbl">Qayta ishlashga</div>${qty('rw', 0, s.open_qty)}</div>
      <div class="field"><div class="lbl">Brak (hisobdan chiqarish)</div>${qty('wo', 0, s.open_qty)}</div>
      <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Qaytarish/brak sababi"></textarea></div>
      <div class="foot"><button class="btn dark" data-act="inspSave" data-id="${s.id}" data-max="${s.open_qty}">Saqlash</button></div>`);
  },
  inspSave: async (el) => {
    const a = num('acc'), rw = num('rw'), wo = num('wo');
    if (a + rw + wo < 1) return sheetErr('Sonini kiriting.');
    if (a + rw + wo > Number(el.dataset.max)) return sheetErr(`Jami ${el.dataset.max} donadan oshmasin.`);
    if ((rw || wo) && !val('reason')) return sheetErr('Qaytarish/brak sababini yozing.');
    await act('inspect', { submission_id: Number(el.dataset.id), accepted: a, rework: rw, writeoff: wo, reason: val('reason') }, el);
    await done('Saqlandi');
  },
});
export { L, tg, ApiError, errText };
