// Alohida buyurtmalar (zakaz) ekranlari. Bichuvchi va tikuvchi — lotin, rahbar — kirill (bitta kod, ikki yozuv).
import {
  api, act, esc, fmt, show, refresh, registerScreens, on, state, openSheet, closeSheet, sheetErr, toast, $, $$,
  val, num, pressed, chips, dmy, dt, today, addDays, pickPhoto, photoTag, canRecord, recordStart, recordStop, isRecording, voiceTag,
} from './core.js';

const T = (l, c) => (state.lang === 'cyr' ? c : l);
let topFn = () => {};
let role = 'bichuvchi';
let voiceId = null;
let photoId = null;
let lastTab = null;
let cur = null; // ochiq buyurtma tafsiloti

export function initOrders(top, r) { topFn = top; role = r; }

const ST = {
  new: ['Bichilmagan', 'Бичилмаган', 'warn'], cut: ['Bichildi', 'Бичилди', 'blue'], given: ['Tikuvchi qabulida', 'Тикувчи қабулида', 'blue'],
  sewing: ['Tikilmoqda (topshirilmagan)', 'Тикилмоқда (топширилмаган)', 'blue'], sewn: ['Tikildi, qabul qiling', 'Тикилди, қабул қилиш керак', 'warn'], fixing: ['Tuzatishda', 'Тузатишда', 'bad'],
  ready: ['Tayyor, mijoz kutilmoqda', 'Тайёр, мижоз кутилмоқда', 'ok'], delivered: ['Mijozga topshirildi', 'Мижозга топширилди', 'ok'],
  abandoned: ['Mijoz olib ketmadi', 'Мижоз олиб кетмади', 'bad'], closed: ['Yopilgan', 'Ёпилган', ''], cancelled: ['Bekor qilingan', 'Бекор қилинган', ''],
};
const TABS = [['cut', 'Bichilmagan', 'Бичилмаган'], ['sew', 'Tikishda', 'Тикишда'], ['fix', 'Tuzatishda', 'Тузатишда'], ['ready', 'Tayyor', 'Тайёр'],
  ['done', 'Topshirilgan', 'Топширилган'], ['left', 'Olib ketilmagan', 'Олиб кетилмаган']];
const EV = {
  created: ['Buyurtma ochildi', 'Буюртма очилди'], cut: ['Bichildi', 'Бичилди'], given: ['Tikuvchiga berildi', 'Тикувчига берилди'], accepted: ['Tikuvchi qabul qildi', 'Тикувчи қабул қилди'],
  returned: ['Tikuvchi qaytardi', 'Тикувчи қайтарди'], sewn: ['Tikib topshirildi', 'Тикиб топширилди'], ready: ['Qabul qilindi, tayyor', 'Қабул қилинди, тайёр'],
  fit_fix: ['Kiyib ko‘rildi: tuzatish kerak', 'Кийиб кўрилди: тузатиш керак'], fixed: ['Tuzatildi', 'Тузатилди'], delivered: ['Mijozga topshirildi', 'Мижозга топширилди'],
  left: ['Mijoz olib ketmadi', 'Мижоз олиб кетмади'], left_wait: ['Rahbar: kutamiz', 'Раҳбар: кутамиз'], closed: ['Yopildi', 'Ёпилди'], cancelled: ['Bekor qilindi', 'Бекор қилинди'],
  due: ['Muddat o‘zgardi', 'Муддат ўзгарди'], price: ['Narx', 'Нарх'], pay: ['Mijoz pul berdi', 'Мижоз пул берди'], pay_cancel: ['To‘lov bekor qilindi', 'Тўлов бекор қилинди'],
};
const tagOf = (s) => { const x = ST[s] || [s, s, '']; return `<span class="tag ${x[2]}">${esc(T(x[0], x[1]))}</span>`; };
const so = () => T('so‘m', 'сўм');
const back = () => `<button class="back" data-act="back">‹ ${T('Orqaga', 'Орқага')}</button>`;
const isSewer = () => role === 'tikuvchi';

function dueLabel(o) {
  if (['delivered', 'closed', 'cancelled', 'abandoned'].includes(o.status)) return dmy(o.done_day || o.due_day);
  const d = o.days_left;
  if (o.status === 'ready') return `${T('Muddat', 'Муддат')} ${dmy(o.due_day)}`;
  if (d < 0) return `<b style="color:var(--bad)">${T(`Muddati ${-d} kun o‘tdi`, `Муддати ${-d} кун ўтди`)}</b>`;
  if (d === 0) return `<b style="color:var(--bad)">${T('Muddati bugun', 'Муддати бугун')}</b>`;
  if (d <= 2) return `<b style="color:var(--warn)">${T(`${d} kun qoldi`, `${d} кун қолди`)} · ${dmy(o.due_day)}</b>`;
  return `${dmy(o.due_day)} · ${T(`${d} kun qoldi`, `${d} кун қолди`)}`;
}

function card(o) {
  const money = !isSewer() && o.price != null ? `<div class="sub">${T('Narx', 'Нарх')} ${fmt(o.price)}${o.price_ok ? '' : ' ' + T('(tasdiqlanmagan)', '(тасдиқланмаган)')} · ${T('to‘langan', 'тўланган')} ${fmt(o.paid)}${o.debt ? ` · <b style="color:var(--bad)">${T('qarz', 'қарз')} ${fmt(o.debt)}</b>` : ''}</div>`
    : !isSewer() && o.price == null ? `<div class="sub" style="color:var(--warn)">${T('Narx qo‘yilmagan', 'Нарх қўйилмаган')}</div>` : '';
  return `<button class="card tap" data-act="ordOpen" data-id="${o.id}" ${o.overdue ? 'style="border:2px solid var(--bad)"' : ''}>
    <div class="row">${photoTag(o.photo_id)}<div class="grow"><div class="title">${esc(o.product)} · ${esc(o.customer)}</div>
      <div class="mono">${esc(o.code)}${role === 'rahbar' ? ' · ' + esc(o.cutter) : ''}${o.sewer && !isSewer() ? ' → ' + esc(o.sewer) : ''}</div>
      <div class="sub">${dueLabel(o)}</div>${money}</div>
    <div style="text-align:right">${tagOf(o.status)}${o.fixes ? `<div class="sub">${T('tuzatish', 'тузатиш')}: ${o.fixes}</div>` : ''}</div></div></button>`;
}

// ---------- Ro'yxat ----------
async function listScreen(p = {}) {
  topFn(isSewer() ? 'Buyurtma ko‘ylaklar' : T('Buyurtmalar', 'Буюртмалар'));
  if (isSewer()) {
    const r = await api('ord_list', {});
    return `${back()}<h1 class="page">Buyurtma ko‘ylaklar</h1>
    <p class="lead">Bichuvchi bergan alohida (zakaz) ishlar, oddiy ishdan alohida hisoblanadi. Tikib «Topshirdim» bosmaguningizcha ish «topshirilmagan» bo‘lib turadi va haqi yozilmaydi.</p>
    ${r.rows.length ? r.rows.map(card).join('') : '<div class="empty">Hozircha alohida buyurtma yo‘q.</div>'}`;
  }
  const tab = p.tab || lastTab || 'cut';
  lastTab = tab;
  const [r, extra] = await Promise.all([api('ord_list', { tab }), role === 'rahbar' ? api('ord_summary') : api('cash_my')]);
  const tabs = `<div class="chips" style="margin:12px 0">${TABS.filter(([k]) => k !== 'left' || r.counts.left).map(([k, l, c]) =>
    `<button class="chip" data-act="ordTab" data-t="${k}" aria-pressed="${k === tab}">${T(l, c)}${r.counts[k] ? ` <small>${r.counts[k]}</small>` : ''}</button>`).join('')}</div>`;
  const top = role === 'rahbar' ? summaryCard(extra) : cashCard(extra);
  return `${back()}<h1 class="page">${T('Buyurtmalar', 'Буюртмалар')}</h1>
  ${role === 'bichuvchi' ? '<p class="lead">Mijozdan olingan alohida buyurtmalar. Muddati yaqini doim tepada turadi.</p>' : ''}
  <button class="btn dark" data-act="ordNew">+ ${T('Yangi buyurtma', 'Янги буюртма')}</button>
  ${top}${tabs}
  ${r.rows.length ? r.rows.map(card).join('') : `<div class="empty">${T('Bu bo‘limda buyurtma yo‘q.', 'Бу бўлимда буюртма йўқ.')}</div>`}`;
}

function cashCard(c) {
  if (!c.held && !c.pending && !c.list.length) return '';
  const pend = c.list.filter((h) => h.status === 'pending');
  const last = c.list.filter((h) => h.status !== 'pending').slice(0, 3);
  const HS = { confirmed: ['Rahbar oldi', 'ok'], rejected: ['Rahbar olmadi', 'bad'], cancelled: ['Bekor qilingan', ''] };
  return `<div class="card" style="margin-top:12px"><div class="row"><div class="grow"><div class="sub">Qo‘limdagi mijoz puli</div><div class="bignum num">${fmt(c.held)} <small>so‘m</small></div></div>
    ${c.held - c.pending > 0 ? '<button class="btn sm" data-act="cashGive">Rahbarga topshirdim</button>' : ''}</div>
    ${pend.map((h) => `<div class="banner warn" style="margin-top:8px">${fmt(h.amount)} so‘m topshirdingiz, rahbar tasdig‘i kutilmoqda. <button class="link" data-act="cashCancel" data-id="${h.id}">Bekor qilish</button></div>`).join('')}
    ${last.map((h) => `<div class="sub" style="margin-top:6px">${h.how === 'payroll' ? 'Oylik hisobda ushlandi' : 'Topshirildi'}: ${fmt(h.amount)} so‘m · ${dmy(h.day)} ${h.how === 'cash' ? `<span class="tag ${HS[h.status][1]}">${HS[h.status][0]}</span>` : ''}${h.answer_note ? ' · ' + esc(h.answer_note) : ''}</div>`).join('')}
    <p class="hint">Rahbarga topshirilmagan qismi oy oxiridagi oylik hisobda ushlanadi.</p></div>`;
}

function summaryCard(s) {
  return `<div class="stats" style="margin-top:12px">
    <div class="stat" style="--c:var(--c-sewing)"><b class="num">${s.open}</b><span>Жараёнда</span></div>
    <div class="stat" style="--c:var(--bad)"><b class="num">${s.overdue}</b><span>Муддати ўтган</span></div>
    <div class="stat" style="--c:var(--ok)"><b class="num">${s.delivered_month}</b><span>Шу ой топширилди</span></div>
  </div>
  ${s.handovers.length ? `<h2>Бичувчи пул топширди · ${s.handovers.length}</h2>${s.handovers.map((h) => `<div class="card"><div class="title">${esc(h.name)} · ${fmt(h.amount)} сўм</div><div class="sub">${dmy(h.day)}${h.note ? ' · ' + esc(h.note) : ''}</div>
    <div class="actions"><button class="btn ok" data-act="cashOk" data-id="${h.id}">Олдим</button><button class="btn ghost" data-act="cashNo" data-id="${h.id}">Олмадим</button></div></div>`).join('')}` : ''}
  <div class="card" style="margin-top:12px"><div class="bal">
    <span>Мижозлар қарзи</span><span class="v">${fmt(s.debt_sum)} сўм</span>
    ${s.cutters.map((c) => `<span>${esc(c.name)} қўлидаги мижоз пули</span><span class="v">${fmt(c.held)}</span>`).join('')}
    <span>Нархи тасдиқланмаган</span><span class="v">${s.price_wait}</span>
    <span>Заказ тарифи: бичиш / тикиш</span><span class="v">${s.rates.bichish == null ? '—' : fmt(s.rates.bichish)} / ${s.rates.tikish == null ? '—' : fmt(s.rates.tikish)}</span>
  </div>
  <div class="actions"><button class="btn ghost sm" data-act="ordRates">Заказ тарифини ўзгартириш</button>${s.debts.length ? '<button class="btn ghost sm" data-act="ordDebts">Қарздор мижозлар</button>' : ''}</div></div>`;
}

// ---------- Tafsilot ----------
async function detailScreen(p) {
  const o = await api('ord_detail', { id: p.id });
  cur = o;
  topFn(o.code);
  const ms = Object.entries(o.measures);
  const cutter = !isSewer();
  const btn = (act, l, c, cls = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${o.id}">${T(l, c)}</button>`;
  const acts = [];
  if (cutter) {
    if (o.status === 'new') acts.push(btn('ordCut', 'Bichdim', 'Бичилди', 'dark'));
    if (['new', 'cut'].includes(o.status)) acts.push(btn('ordGive', 'Tikuvchiga berish', 'Тикувчига бериш', o.status === 'cut' ? 'dark' : 'ghost'));
    if (o.status === 'sewn') acts.push(btn('ordReceive', 'Qabul qildim, tayyor', 'Қабул қилинди, тайёр', 'ok'));
    if (o.status === 'fixing' && o.fix_by === 'cutter') acts.push(btn('ordFixed', 'Tuzatdim, tayyor', 'Тузатилди, тайёр', 'ok'));
    if (o.status === 'ready') acts.push(btn('ordFit', 'Mijoz keldi: kiyib ko‘rdi', 'Мижоз келди: кийиб кўрди', 'dark'));
    if (o.status === 'abandoned' && role === 'rahbar') acts.push(btn('ordWait', 'Kutamiz (yangi sana)', 'Кутамиз (янги сана)', 'ghost'), btn('ordClose', 'Yopish', 'Ёпиш', 'ghost'));
  } else {
    if (o.status === 'given') acts.push(btn('ordAccept', 'Qabul qildim', '', 'ok'), btn('ordReturn', 'Qaytarish', '', 'ghost'));
    if (o.status === 'sewing') acts.push(btn('ordSewn', 'Tikib bo‘ldim, topshirdim', '', 'dark'));
    if (o.status === 'fixing' && o.fix_by === 'sewer') acts.push(btn('ordSewn', 'Tuzatib bo‘ldim, topshirdim', '', 'dark'));
  }
  const fixEv = [...o.events].reverse().find((e) => e.kind === 'fit_fix');
  const open = !['delivered', 'closed', 'cancelled'].includes(o.status);
  const links = [];
  if (cutter && open) {
    links.push(`<button class="link" data-act="ordPay" data-id="${o.id}">${T('Mijoz pul berdi', 'Мижоз пул берди')}</button>`);
    if (o.status !== 'abandoned') links.push(`<button class="link" data-act="ordDue" data-id="${o.id}">${T('Muddatni o‘zgartirish', 'Муддатни ўзгартириш')}</button>`);
    links.push(`<button class="link" data-act="ordPrice" data-id="${o.id}">${role === 'rahbar' ? 'Нарх ва иш ҳақи' : 'Narxni o‘zgartirish'}</button>`);
    links.push(`<button class="link" data-act="ordEdit" data-id="${o.id}">${T('O‘lcham va ma’lumotni tahrirlash', 'Ўлчам ва маълумотни таҳрирлаш')}</button>`);
    if (['new', 'cut'].includes(o.status)) links.push(`<button class="link" data-act="ordCancel" data-id="${o.id}">${T('Bekor qilish', 'Бекор қилиш')}</button>`);
  } else if (cutter && o.status === 'delivered' && o.debt) {
    links.push(`<button class="link" data-act="ordPay" data-id="${o.id}">${T('Mijoz qarzini berdi', 'Мижоз қарзини берди')}</button>`);
  }
  return `${back()}
  <div class="row" style="margin-top:8px"><div class="grow"><h1 class="page" style="margin:0">${esc(o.product)}</h1><div class="mono">${esc(o.code)} · ${dmy(o.day)}${role === 'rahbar' ? ' · ' + esc(o.cutter) : ''}</div></div>${tagOf(o.status)}</div>
  ${o.photo_id ? `<div style="margin-top:10px">${photoTag(o.photo_id, 'ph lg')}</div>` : ''}
  <div class="card" style="margin-top:12px"><div class="bal">
    <span>${T('Mijoz', 'Мижоз')}</span><span class="v">${esc(o.customer)}</span>
    ${o.phone ? `<span>${T('Telefon', 'Телефон')}</span><span class="v"><a href="tel:${esc(o.phone.replace(/[^0-9+]/g, ''))}">${esc(o.phone)}</a></span>` : ''}
    <span>${T('Tayyor bo‘lish sanasi', 'Тайёр бўлиш санаси')}</span><span class="v">${dmy(o.due_day)}</span>
    ${o.sewer ? `<span>${T('Tikuvchi', 'Тикувчи')}</span><span class="v">${esc(o.sewer)}</span>` : ''}
  </div><div class="sub" style="margin-top:6px">${dueLabel(o)}</div></div>
  ${o.status === 'fixing' && fixEv ? `<div class="banner bad" style="margin-top:10px">🛠 ${T('Tuzatish kerak', 'Тузатиш керак')} (${o.fix_by === 'sewer' ? T('tikuvchida', 'тикувчида') : T('bichuvchida', 'бичувчида')})${fixEv.note ? ': ' + esc(fixEv.note) : ''}</div>${voiceTag(fixEv.voice_id)}` : ''}
  ${acts.length ? `<div class="actions" style="flex-wrap:wrap">${acts.join('')}</div>` : ''}
  <h2>${T('O‘lchamlar', 'Ўлчамлар')}</h2>
  ${ms.length ? `<table class="t">${ms.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table>` : `<div class="sub">${T('O‘lcham kiritilmagan.', 'Ўлчам киритилмаган.')}</div>`}
  ${o.note ? `<div class="banner" style="margin-top:10px">📝 ${esc(o.note)}</div>` : ''}${voiceTag(o.voice_id)}
  ${cutter ? `<h2>${T('Mijoz hisobi', 'Мижоз ҳисоби')}</h2><div class="card"><div class="bal">
    <span>${T('Narx', 'Нарх')}${o.price_ok ? '' : ' ' + T('(rahbar tasdiqlamagan)', '(тасдиқланмаган)')}</span><span class="v">${o.price == null ? '—' : fmt(o.price) + ' ' + so()}</span>
    <span>${T('Mijoz berdi', 'Мижоз берди')}</span><span class="v">${fmt(o.paid)} ${so()}</span>
    <span class="hr"></span><span class="tot">${T('Qarz', 'Қарз')}</span><span class="v tot" ${o.debt ? 'style="color:var(--bad)"' : ''}>${o.debt == null ? '—' : fmt(o.debt) + ' ' + so()}</span>
    ${role === 'rahbar' && (o.cut_pay != null || o.sew_pay != null) ? `<span>Шу заказ учун иш ҳақи</span><span class="v">${o.cut_pay == null ? '—' : fmt(o.cut_pay)} / ${o.sew_pay == null ? '—' : fmt(o.sew_pay)}</span>` : ''}
  </div>
  ${o.pays.length ? `<div class="list" style="margin-top:10px">${o.pays.map((x) => `<div class="li"><div class="grow"><b ${x.cancelled ? 'style="text-decoration:line-through"' : ''}>${fmt(x.amount)} ${so()}</b>
    <div class="sub">${dt(x.at)} · ${T('oldi', 'олди')}: ${esc(x.receiver)}${x.note ? ' · ' + esc(x.note) : ''}${x.cancelled ? ' · ' + T('bekor', 'бекор') + ': ' + esc(x.cancel_reason) : ''}</div></div>
    ${role === 'rahbar' && !x.cancelled ? `<button class="link" data-act="ordPayX" data-id="${x.id}">Бекор</button>` : ''}</div>`).join('')}</div>` : ''}</div>` : ''}
  ${links.length ? `<div class="stack" style="margin-top:12px;gap:6px">${links.join('')}</div>` : ''}
  <h2>${T('Tarix', 'Тарих')}</h2>
  <div class="list">${o.events.map((e) => `<div class="li"><div class="grow"><b>${esc(T(...(EV[e.kind] || [e.kind, e.kind])))}</b>${evExtra(e)}
    <div class="sub">${dt(e.at)} · ${esc(e.who)}</div>${e.note ? `<div class="sub">«${esc(e.note)}»</div>` : ''}${voiceTag(e.voice_id)}</div></div>`).join('')}</div>`;
}
function evExtra(e) {
  const d = e.data || {};
  if (e.kind === 'pay' || e.kind === 'pay_cancel') return `: ${fmt(d.amount)} ${so()}`;
  if (e.kind === 'due') return `: ${dmy(d.from)} → ${dmy(d.to)}`;
  if (e.kind === 'price') return `: ${fmt(d.to)} ${so()}${d.ok ? ' ✓' : ''}`;
  if (e.kind === 'fit_fix') return ` (${d.by === 'sewer' ? T('tikuvchida', 'тикувчида') : T('bichuvchida', 'бичувчида')}, ${T('yangi sana', 'янги сана')} ${dmy(d.due)})`;
  if (e.kind === 'left_wait') return `: ${dmy(d.due)}`;
  return '';
}

// ---------- Sana tanlash ----------
const dateField = (name, label, cur) => `<div class="field"><div class="lbl">${label}</div>
  <input class="txt" type="date" name="${name}" min="${today()}" value="${esc(cur || '')}">
  <div class="chips" style="margin-top:8px">${[3, 7, 10, 14].map((n) => `<button type="button" class="chip" data-act="ordQuick" data-n="${n}" data-f="${name}">+${n} ${T('kun', 'кун')}</button>`).join('')}</div></div>`;

const voiceBox = () => (canRecord() ? `<div id="ovBox" style="margin-top:8px"><button class="btn ghost" data-act="oRec" id="oRecBtn">🎙 ${T('Ovozli izoh yozish', 'Овозли изоҳ ёзиш')}</button></div>`
  : `<p class="hint">${T('Ovoz bilan aytish uchun izoh maydoniga bosib, klaviaturadagi 🎤 tugmasidan foydalaning.', 'Овоз билан айтиш учун изоҳ майдонига босиб, клавиатурадаги 🎤 тугмасидан фойдаланинг.')}</p>`);
async function stopRec() {
  const b = $('#oRecBtn'); if (b) { b.disabled = true; b.textContent = T('Saqlanmoqda…', 'Сақланмоқда…'); }
  const v = await recordStop((cur && cur.customer) || val('customer') || '', 'buyurtma');
  if (!v) { if (b) { b.disabled = false; b.classList.remove('rec'); b.textContent = '🎙 ' + T('Ovozli izoh yozish', 'Овозли изоҳ ёзиш'); } return; }
  voiceId = v.id;
  $('#ovBox').innerHTML = `${voiceTag(v.id)}<button class="link" data-act="oDel">${T('Ovozni o‘chirish', 'Овозни ўчириш')}</button>`;
}
const measureRow = (k = '', v = '', fixed = true) => `<div class="row2 mrow" style="margin-top:6px">${fixed ? `<div class="lbl" style="align-self:center;margin:0" data-k="${esc(k)}">${esc(k)}</div>`
  : `<input class="txt" data-mk placeholder="${T('nomi', 'номи')}" maxlength="40" value="${esc(k)}">`}<input class="txt" data-mv inputmode="decimal" maxlength="40" placeholder="${T('sm', 'см')}" value="${esc(v)}"></div>`;
function readMeasures() {
  const m = {};
  for (const r of $$('#sheetBody .mrow')) {
    const kEl = r.querySelector('[data-k]'), kIn = r.querySelector('[data-mk]');
    const k = (kEl ? kEl.dataset.k : kIn.value).trim(), v = r.querySelector('[data-mv]').value.trim();
    if (k && v) m[k] = v;
  }
  return m;
}

async function newSheet() {
  voiceId = null; photoId = null;
  const tpl = (await api('ord_tpl')).fields;
  openSheet(`<h3>${T('Yangi buyurtma', 'Янги буюртма')}</h3>
    <div class="row2"><div class="field"><div class="lbl">${T('Mijoz ismi', 'Мижоз исми')}</div><input class="txt" name="customer" maxlength="80" autofocus></div>
    <div class="field"><div class="lbl">${T('Telefon', 'Телефон')} <span>${T('ixtiyoriy', 'ихтиёрий')}</span></div><input class="txt" name="phone" type="tel" maxlength="30" placeholder="+998"></div></div>
    <div class="field"><div class="lbl">${T('Nima tikiladi', 'Нима тикилади')}</div><input class="txt" name="product" maxlength="80" placeholder="${T('masalan: to‘y ko‘ylagi', 'масалан: тўй кўйлаги')}"></div>
    <div class="field"><div class="lbl"><span>${T('O‘lchamlar', 'Ўлчамлар')}</span><button class="link" data-act="ordTpl">${T('Shablonni o‘zgartirish', 'Шаблонни ўзгартириш')}</button></div>
      <div id="mrows">${tpl.map((k) => measureRow(k)).join('')}</div>
      <button class="link" data-act="ordMAdd">+ ${T('Boshqa o‘lcham', 'Бошқа ўлчам')}</button></div>
    <div class="field"><div class="lbl">${T('Qo‘shimcha tavsif', 'Қўшимча тавсиф')} <span>${T('ixtiyoriy', 'ихтиёрий')}</span></div><textarea class="txt" name="note" maxlength="500" placeholder="${T('Fason, mato, yoqa, yeng…', 'Фасон, мато, ёқа, енг…')}"></textarea>${voiceBox()}</div>
    <div class="field"><div class="lbl">${T('Rasm', 'Расм')} <span>${T('ixtiyoriy', 'ихтиёрий')}</span></div><div class="phbtn"><span id="oPh"></span><button class="btn ghost" data-act="ordPhoto" style="flex:1">📷 ${T('Rasm olish', 'Расм олиш')}</button></div></div>
    ${dateField('due', T('Tayyor bo‘lish sanasi', 'Тайёр бўлиш санаси'), addDays(today(), 7))}
    <div class="row2"><div class="field"><div class="lbl">${T('Narx', 'Нарх')}, ${so()}</div><input class="txt" name="price" type="number" inputmode="numeric" min="0" step="1000"></div>
    <div class="field"><div class="lbl">${T('Oldindan oldim', 'Олдиндан олдим')}, ${so()}</div><input class="txt" name="prepay" type="number" inputmode="numeric" min="0" step="1000" placeholder="0"></div></div>
    ${role === 'bichuvchi' ? '<p class="hint">Narxni rahbar tasdiqlaydi. Oldindan olgan pulingiz «qo‘limdagi mijoz puli» bo‘lib turadi.</p>' : ''}
    <div class="foot"><button class="btn dark" data-act="ordSave">${T('Saqlash', 'Сақлаш')}</button></div>`);
}

function tplSheet(fields) {
  openSheet(`<h3>${T('O‘lcham shabloni', 'Ўлчам шаблони')}</h3><p class="lead">${T('Har qatorga bitta o‘lcham nomi. Yangi buyurtma ochganda shu ro‘yxat chiqadi.', 'Ҳар қаторга битта ўлчам номи. Янги буюртма очганда шу рўйхат чиқади.')}</p>
    <div class="field"><textarea class="txt" name="tpl" rows="9">${esc(fields.join('\n'))}</textarea></div>
    <div class="foot"><button class="btn dark" data-act="ordTplSave">${T('Saqlash', 'Сақлаш')}</button></div>`);
}

function fitSheet(o) {
  voiceId = null;
  openSheet(`<h3>${T('Kiyib ko‘rish natijasi', 'Кийиб кўриш натижаси')}</h3>
    <div class="field">${chips('fit', [['ok', T('Ma’qul, olib ketdi', 'Маъқул, олиб кетди')], ['fix', T('Tuzatish kerak', 'Тузатиш керак')], ['left', T('Olmadi', 'Олмади')]], 'ok')}</div>
    <div data-show="ok left fix"><div class="field"><div class="lbl">${T('Hozir bergan puli', 'Ҳозир берган пули')}, ${so()} <span>${o.debt != null ? T('qarzi', 'қарзи') + ' ' + fmt(o.debt) : ''}</span></div>
      <input class="txt" name="pay" type="number" inputmode="numeric" min="0" value="${o.debt || ''}"></div></div>
    <div data-show="fix" hidden>
      <div class="field"><div class="lbl">${T('Kim tuzatadi', 'Ким тузатади')}</div>${chips('by', [['cutter', T('Bichishda (o‘zim)', 'Бичувчи')], ...(o.sewer_id ? [['sewer', T('Tikuvchida', 'Тикувчи') + ': ' + o.sewer]] : [])], 'cutter')}</div>
      ${dateField('fdue', T('Yangi sana', 'Янги сана'), addDays(today(), 3))}</div>
    <div data-show="fix left" hidden><div class="field"><div class="lbl">${T('Nima kamchilik / sabab', 'Камчилик / сабаб')}</div><textarea class="txt" name="note" maxlength="500" placeholder="${T('masalan: beli tor, yengi uzun', 'масалан: бели тор, енги узун')}"></textarea>${voiceBox()}</div>
      <p class="hint" data-show="fix" hidden>${T('Tuzatish uchun qo‘shimcha haq yozilmaydi. Kim tuzatgani tarixda qoladi.', 'Тузатиш учун қўшимча ҳақ ёзилмайди. Ким тузатгани тарихда қолади.')}</p></div>
    <div class="foot"><button class="btn dark" data-act="ordFitSave" data-id="${o.id}">${T('Saqlash', 'Сақлаш')}</button></div>`);
  const sync = () => { const v = pressed('fit'); $$('#sheetBody [data-show]').forEach((d) => { d.hidden = !d.dataset.show.split(' ').includes(v); }); };
  $('#sheetBody').addEventListener('change', sync);
  sync();
}

const after = async (msg) => { closeSheet(); toast(msg); await refresh(); };
const oid = (el) => Number(el.dataset.id);

registerScreens({ o_list: listScreen, o_detail: detailScreen });

on({
  ordTab: (el) => { lastTab = el.dataset.t; return show('o_list', { tab: el.dataset.t }, { replace: true }); },
  ordOpen: (el) => show('o_detail', { id: oid(el) }),
  ordNew: () => newSheet(),
  ordMAdd: () => $('#mrows').insertAdjacentHTML('beforeend', measureRow('', '', false)),
  ordQuick: (el) => { const i = $(`#sheetBody [name="${el.dataset.f}"]`); if (i) i.value = addDays(today(), Number(el.dataset.n)); },
  ordTpl: async () => {
    const keep = { customer: val('customer'), phone: val('phone'), product: val('product') };
    const f = (await api('ord_tpl')).fields;
    tplSheet(f);
    cur = { ...(cur || {}), _keep: keep };
  },
  ordTplSave: async (el) => {
    const fields = val('tpl').split('\n').map((x) => x.trim()).filter(Boolean);
    if (!fields.length) return sheetErr(T('Kamida bitta o‘lcham yozing.', 'Камида битта ўлчам ёзинг.'));
    if (!(await act('ord_tpl_set', { fields }, el))) return;
    toast(T('Shablon saqlandi', 'Шаблон сақланди'));
    await newSheet();
    const k = cur && cur._keep;
    if (k) for (const [n, v] of Object.entries(k)) { const i = $(`#sheetBody [name="${n}"]`); if (i) i.value = v; }
  },
  ordPhoto: async () => {
    const p = await pickPhoto(val('customer') || (cur && cur.customer) || '', 'buyurtma');
    if (p) { photoId = p.id; $('#oPh').innerHTML = photoTag(p.id); }
  },
  oRec: async () => {
    if (isRecording()) return stopRec();
    const r = await recordStart();
    if (r.error) { $('#ovBox').innerHTML = `<p class="hint">${T('Telefon mikrofonga ruxsat bermadi. Izoh maydonida klaviaturadagi 🎤 tugmasidan foydalaning.', 'Телефон микрофонга рухсат бермади. Изоҳ майдонида клавиатурадаги 🎤 тугмасидан фойдаланинг.')}</p>`; return; }
    const b = $('#oRecBtn'); b.classList.add('rec'); b.textContent = '⏹ ' + T('To‘xtatish (yozilmoqda…)', 'Тўхтатиш (ёзилмоқда…)');
  },
  oDel: () => { voiceId = null; $('#ovBox').innerHTML = `<button class="btn ghost" data-act="oRec" id="oRecBtn">🎙 ${T('Ovozli izoh yozish', 'Овозли изоҳ ёзиш')}</button>`; },
  ordSave: async (el) => {
    if (!val('customer')) return sheetErr(T('Mijoz ismini yozing.', 'Мижоз исмини ёзинг.'));
    if (!val('product')) return sheetErr(T('Nima tikilishini yozing.', 'Нима тикилишини ёзинг.'));
    if (!val('due') || val('due') < today()) return sheetErr(T('Tayyor bo‘lish sanasini tanlang.', 'Тайёр бўлиш санасини танланг.'));
    if (val('prepay') && val('price') && num('prepay') > num('price')) return sheetErr(T('Oldindan olingan pul narxdan ko‘p.', 'Олдиндан олинган пул нархдан кўп.'));
    if (isRecording()) await stopRec();
    const r = await act('ord_create', { customer: val('customer'), phone: val('phone'), product: val('product'), measures: readMeasures(), note: val('note'),
      due_day: val('due'), price: val('price'), prepay: val('prepay'), photo_id: photoId || undefined, voice_id: voiceId || undefined }, el);
    if (!r) return;
    closeSheet(); toast(`${r.code} ${T('saqlandi', 'сақланди')}`);
    await show('o_detail', { id: r.id });
  },
  ordCut: async (el) => { if (await act('ord_cut', { id: oid(el) }, el)) await after(T('Bichildi deb belgilandi', 'Бичилди')); },
  ordGive: async (el) => {
    voiceId = null;
    const o = cur;
    if (!o.sewers || !o.sewers.length) return openSheet(`<h3>${T('Tikuvchiga berish', 'Тикувчига бериш')}</h3><div class="empty">${T('Tasdiqlangan tikuvchi yo‘q.', 'Тасдиқланган тикувчи йўқ.')}</div>`);
    openSheet(`<h3>${T('Tikuvchiga berish', 'Тикувчига бериш')}</h3><p class="lead">${esc(o.code)} · ${esc(o.product)} · ${T('muddat', 'муддат')} ${dmy(o.due_day)}</p>
      <div class="field"><div class="lbl">${T('Kimga', 'Кимга')}</div>${chips('to', o.sewers.map((s) => [s.id, s.name]), '')}</div>
      <div class="field"><div class="lbl">${T('Qanday tikish kerak', 'Қандай тикиш керак')} <span>${T('ixtiyoriy', 'ихтиёрий')}</span></div><textarea class="txt" name="note" maxlength="300"></textarea>${voiceBox()}</div>
      <p class="hint">${T('Tikuvchiga rasm, o‘lchamlar va izoh boradi. Mijoz telefoni va narxi ko‘rinmaydi.', 'Тикувчига расм, ўлчамлар ва изоҳ боради. Мижоз телефони ва нархи кўринмайди.')}</p>
      <div class="foot"><button class="btn dark" data-act="ordGiveSave" data-id="${o.id}">${T('Berish', 'Бериш')}</button></div>`);
  },
  ordGiveSave: async (el) => {
    const to = Number(pressed('to'));
    if (!to) return sheetErr(T('Tikuvchini tanlang.', 'Тикувчини танланг.'));
    if (isRecording()) await stopRec();
    if (await act('ord_give', { id: oid(el), sewer_id: to, note: val('note'), voice_id: voiceId || undefined }, el)) await after(T('Berildi. Tikuvchi qabul qilishi kutilmoqda.', 'Берилди. Тикувчи қабули кутилмоқда.'));
  },
  ordAccept: async (el) => { if (await act('ord_accept', { id: oid(el) }, el)) await after('Qabul qilindi'); },
  ordReturn: (el) => openSheet(`<h3>Qaytarish</h3><p class="lead">Nima uchun qabul qila olmaysiz? Bichuvchi ko‘radi.</p><div class="field"><textarea class="txt" name="note" maxlength="300" autofocus></textarea></div>
    <div class="foot"><button class="btn dark" data-act="ordReturnSave" data-id="${oid(el)}">Yuborish</button></div>`),
  ordReturnSave: async (el) => { if (!val('note')) return sheetErr('Sababini yozing.'); if (await act('ord_return', { id: oid(el), note: val('note') }, el)) await after('Qaytarildi'); },
  ordSewn: async (el) => { if (await act('ord_sewn', { id: oid(el) }, el)) await after('Topshirildi. Bichuvchi qabul qiladi.'); },
  ordReceive: async (el) => { if (await act('ord_receive', { id: oid(el) }, el)) await after(T('Tayyor. Mijoz kelishini kutamiz.', 'Тайёр. Мижоз келишини кутамиз.')); },
  ordFixed: async (el) => { if (await act('ord_fixed', { id: oid(el) }, el)) await after(T('Tayyor', 'Тайёр')); },
  ordFit: () => fitSheet(cur),
  ordFitSave: async (el) => {
    const result = pressed('fit');
    const body = { id: oid(el), result, pay: val('pay') };
    if (result === 'fix') {
      if (isRecording()) await stopRec();
      if (!val('note') && !voiceId) return sheetErr(T('Kamchilikni yozing yoki ovoz bilan ayting.', 'Камчиликни ёзинг ёки овоз билан айтинг.'));
      if (!val('fdue') || val('fdue') < today()) return sheetErr(T('Yangi sanani tanlang.', 'Янги санани танланг.'));
      Object.assign(body, { fix_by: pressed('by'), note: val('note'), voice_id: voiceId || undefined, due_day: val('fdue') });
    }
    if (result === 'left') body.note = val('note');
    const r = await act('ord_fit', body, el);
    if (!r) return;
    await after(result === 'ok' ? (r.debt ? T(`Topshirildi. Mijoz qarzi: ${fmt(r.debt)} so‘m`, `Топширилди. Мижоз қарзи: ${fmt(r.debt)} сўм`) : T('Topshirildi', 'Топширилди'))
      : result === 'fix' ? T('Tuzatishga yuborildi', 'Тузатишга юборилди') : T('Rahbarga xabar berildi', 'Раҳбарга хабар берилди'));
  },
  ordPay: (el) => openSheet(`<h3>${T('Mijoz pul berdi', 'Мижоз пул берди')}</h3>${cur.debt != null ? `<p class="lead">${T('Qarzi', 'Қарзи')}: ${fmt(cur.debt)} ${so()}</p>` : ''}
    <div class="field"><div class="lbl">${T('Summa', 'Сумма')}, ${so()}</div><input class="txt" name="amount" type="number" inputmode="numeric" min="1" value="${cur.debt || ''}" autofocus></div>
    <div class="field"><input class="txt" name="note" maxlength="200" placeholder="${T('Izoh (ixtiyoriy)', 'Изоҳ (ихтиёрий)')}"></div>
    <p class="hint">${T('Pulni siz oldingiz deb yoziladi.', 'Пулни сиз олдингиз деб ёзилади.')}</p>
    <div class="foot"><button class="btn dark" data-act="ordPaySave" data-id="${oid(el)}">${T('Saqlash', 'Сақлаш')}</button></div>`),
  ordPaySave: async (el) => { if (!(num('amount') > 0)) return sheetErr(T('Summani yozing.', 'Суммани ёзинг.')); if (await act('ord_pay', { id: oid(el), amount: num('amount'), note: val('note') }, el)) await after(T('Yozildi', 'Ёзилди')); },
  ordPayX: (el) => openSheet(`<h3>Тўловни бекор қилиш</h3><p class="lead">Фақат хато ёзилган бўлса. Ёзув тарихда қолади.</p><div class="field"><input class="txt" name="reason" maxlength="300" placeholder="Сабаб" autofocus></div>
    <div class="foot"><button class="btn dark" data-act="ordPayXSave" data-id="${oid(el)}">Бекор қилиш</button></div>`),
  ordPayXSave: async (el) => { if (!val('reason')) return sheetErr('Сабабини ёзинг.'); if (await act('ord_pay_cancel', { pay_id: oid(el), reason: val('reason') }, el)) await after('Бекор қилинди'); },
  ordDue: (el) => openSheet(`<h3>${T('Muddatni o‘zgartirish', 'Муддатни ўзгартириш')}</h3>${dateField('due', T('Yangi sana', 'Янги сана'), cur.due_day >= today() ? cur.due_day : today())}
    <div class="field"><input class="txt" name="note" maxlength="300" placeholder="${T('Sabab (ixtiyoriy): mijoz so‘radi', 'Сабаб (ихтиёрий)')}"></div>
    <div class="foot"><button class="btn dark" data-act="ordDueSave" data-id="${oid(el)}">${T('Saqlash', 'Сақлаш')}</button></div>`),
  ordDueSave: async (el) => { if (!val('due') || val('due') < today()) return sheetErr(T('Sanani tanlang.', 'Санани танланг.')); if (await act('ord_due', { id: oid(el), due_day: val('due'), note: val('note') }, el)) await after(T('Muddat o‘zgardi', 'Муддат ўзгарди')); },
  ordPrice: (el) => openSheet(`<h3>${role === 'rahbar' ? 'Нарх ва иш ҳақи' : 'Narx'}</h3>
    <div class="field"><div class="lbl">${T('Mijoz uchun narx', 'Мижоз учун нарх')}, ${so()}</div><input class="txt" name="price" type="number" inputmode="numeric" min="0" value="${cur.price ?? ''}" autofocus></div>
    ${role === 'rahbar' ? `<p class="hint">Шу заказ мураккаб бўлса, иш ҳақини алоҳида қўйинг. Бўш қолса, умумий заказ тарифи олинади.</p>
    <div class="row2"><div class="field"><div class="lbl">Бичиш ҳақи</div><input class="txt" name="cut_pay" type="number" inputmode="numeric" min="0" value="${cur.cut_pay ?? ''}"></div>
    <div class="field"><div class="lbl">Тикиш ҳақи</div><input class="txt" name="sew_pay" type="number" inputmode="numeric" min="0" value="${cur.sew_pay ?? ''}"></div></div>` : '<p class="hint">Rahbar ko‘rib tasdiqlaydi.</p>'}
    <div class="foot"><button class="btn dark" data-act="ordPriceSave" data-id="${oid(el)}">${role === 'rahbar' ? 'Тасдиқлаш' : 'Saqlash'}</button></div>`),
  ordPriceSave: async (el) => {
    if (val('price') === '') return sheetErr(T('Narxni yozing.', 'Нархни ёзинг.'));
    const b = { id: oid(el), price: num('price') };
    if (role === 'rahbar') { b.cut_pay = val('cut_pay'); b.sew_pay = val('sew_pay'); }
    if (await act('ord_price', b, el)) await after(T('Saqlandi', 'Сақланди'));
  },
  ordEdit: (el) => {
    photoId = null;
    const ms = Object.entries(cur.measures);
    openSheet(`<h3>${T('Tahrirlash', 'Таҳрирлаш')}</h3>
      <div class="row2"><div class="field"><div class="lbl">${T('Mijoz ismi', 'Мижоз исми')}</div><input class="txt" name="customer" maxlength="80" value="${esc(cur.customer)}"></div>
      <div class="field"><div class="lbl">${T('Telefon', 'Телефон')}</div><input class="txt" name="phone" type="tel" maxlength="30" value="${esc(cur.phone || '')}"></div></div>
      <div class="field"><div class="lbl">${T('Nima tikiladi', 'Нима тикилади')}</div><input class="txt" name="product" maxlength="80" value="${esc(cur.product)}"></div>
      <div class="field"><div class="lbl">${T('O‘lchamlar', 'Ўлчамлар')}</div><div id="mrows">${ms.map(([k, v]) => measureRow(k, v, false)).join('')}${ms.length ? '' : measureRow('', '', false)}</div>
        <button class="link" data-act="ordMAdd">+ ${T('O‘lcham qo‘shish', 'Ўлчам қўшиш')}</button></div>
      <div class="field"><div class="lbl">${T('Tavsif', 'Тавсиф')}</div><textarea class="txt" name="note" maxlength="500">${esc(cur.note || '')}</textarea></div>
      <div class="field"><div class="phbtn"><span id="oPh"></span><button class="btn ghost" data-act="ordPhoto" style="flex:1">📷 ${cur.photo_id ? T('Rasmni almashtirish', 'Расмни алмаштириш') : T('Rasm qo‘shish', 'Расм қўшиш')}</button></div></div>
      <div class="foot"><button class="btn dark" data-act="ordEditSave" data-id="${oid(el)}">${T('Saqlash', 'Сақлаш')}</button></div>`);
  },
  ordEditSave: async (el) => {
    if (!val('customer') || !val('product')) return sheetErr(T('Mijoz ismi va nima tikilishini yozing.', 'Мижоз исми ва нима тикилишини ёзинг.'));
    if (await act('ord_update', { id: oid(el), customer: val('customer'), phone: val('phone'), product: val('product'), measures: readMeasures(), note: val('note'), photo_id: photoId || undefined }, el)) await after(T('Saqlandi', 'Сақланди'));
  },
  ordCancel: (el) => openSheet(`<h3>${T('Buyurtmani bekor qilish', 'Буюртмани бекор қилиш')}</h3><div class="field"><input class="txt" name="reason" maxlength="300" placeholder="${T('Sabab: mijoz voz kechdi', 'Сабаб')}" autofocus></div>
    <div class="foot"><button class="btn dark" data-act="ordCancelSave" data-id="${oid(el)}">${T('Bekor qilish', 'Бекор қилиш')}</button></div>`),
  ordCancelSave: async (el) => { if (!val('reason')) return sheetErr(T('Sababini yozing.', 'Сабабини ёзинг.')); if (await act('ord_cancel', { id: oid(el), reason: val('reason') }, el)) await after(T('Bekor qilindi', 'Бекор қилинди')); },
  ordWait: (el) => openSheet(`<h3>Мижозни кутамиз</h3>${dateField('due', 'Қачонгача кутамиз', addDays(today(), 7))}
    <div class="field"><input class="txt" name="note" maxlength="300" placeholder="Изоҳ (ихтиёрий)"></div>
    <div class="foot"><button class="btn dark" data-act="ordWaitSave" data-id="${oid(el)}">Сақлаш</button></div>`),
  ordWaitSave: async (el) => { if (!val('due')) return sheetErr('Санани танланг.'); if (await act('ord_left_decide', { id: oid(el), decision: 'wait', due_day: val('due'), note: val('note') }, el)) await after('Сақланди'); },
  ordClose: (el) => openSheet(`<h3>Буюртмани ёпиш</h3><p class="lead">Мижоз олиб кетмади. Кийим нима бўлди? Олдиндан тўлов ёзувда сақланади.</p>
    <div class="field"><input class="txt" name="note" maxlength="300" placeholder="Масалан: сотувга чиқарилди" autofocus></div>
    <div class="foot"><button class="btn dark" data-act="ordCloseSave" data-id="${oid(el)}">Ёпиш</button></div>`),
  ordCloseSave: async (el) => { if (!val('note')) return sheetErr('Изоҳ ёзинг.'); if (await act('ord_left_decide', { id: oid(el), decision: 'close', note: val('note') }, el)) await after('Ёпилди'); },
  ordRates: async () => {
    const s = await api('ord_summary');
    openSheet(`<h3>Заказ тарифи</h3><p class="lead">Алоҳида буюртма учун бир дона иш ҳақи. Аввал ёзилган ҳақлар ўзгармайди.</p>
      <div class="row2"><div class="field"><div class="lbl">Бичиш, сўм</div><input class="txt" name="rb" type="number" inputmode="numeric" min="0" value="${s.rates.bichish ?? ''}"></div>
      <div class="field"><div class="lbl">Тикиш, сўм</div><input class="txt" name="rt" type="number" inputmode="numeric" min="0" value="${s.rates.tikish ?? ''}"></div></div>
      <div class="foot"><button class="btn dark" data-act="ordRatesSave">Сақлаш</button></div>`);
  },
  ordRatesSave: async (el) => {
    if (val('rb') === '' || val('rt') === '') return sheetErr('Иккала тарифни ёзинг.');
    if (!(await act('ord_rates_set', { bichish: num('rb'), tikish: num('rt') }, el))) return;
    await act('rates_fill', {});
    await after('Сақланди');
  },
  ordDebts: async () => {
    const s = await api('ord_summary');
    openSheet(`<h3>Қарздор мижозлар</h3><div class="list">${s.debts.map((d) => `<button class="li" data-act="ordDebtOpen" data-id="${d.id}"><div class="grow"><b>${esc(d.customer)}</b><div class="sub">${esc(d.code)}${d.phone ? ' · ' + esc(d.phone) : ''}</div></div><div class="r">${fmt(d.debt)}</div></button>`).join('')}</div>`);
  },
  ordDebtOpen: (el) => { closeSheet(); return show('o_detail', { id: oid(el) }); },
  cashGive: () => openSheet(`<h3>Rahbarga topshirdim</h3><p class="lead">Mijozlardan olgan pulingizdan qancha topshirdingiz? Rahbar «Oldim» deb tasdiqlaydi.</p>
    <div class="field"><input class="txt" name="amount" type="number" inputmode="numeric" min="1" autofocus></div>
    <div class="field"><input class="txt" name="note" maxlength="200" placeholder="Izoh (ixtiyoriy)"></div>
    <div class="foot"><button class="btn dark" data-act="cashGiveSave">Yuborish</button></div>`),
  cashGiveSave: async (el) => { if (!(num('amount') > 0)) return sheetErr('Summani yozing.'); if (await act('cash_give', { amount: num('amount'), note: val('note') }, el)) await after('Rahbarga yuborildi'); },
  cashCancel: async (el) => { if (await act('cash_cancel', { id: oid(el) }, el)) await after('Bekor qilindi'); },
  cashOk: async (el) => { if (await act('cash_decide', { id: oid(el), ok: true }, el)) await after('Тасдиқланди'); },
  cashNo: (el) => openSheet(`<h3>Пулни олмадим</h3><div class="field"><input class="txt" name="note" maxlength="200" placeholder="Изоҳ" autofocus></div>
    <div class="foot"><button class="btn dark" data-act="cashNoSave" data-id="${oid(el)}">Юбориш</button></div>`),
  cashNoSave: async (el) => { if (!val('note')) return sheetErr('Изоҳ ёзинг.'); if (await act('cash_decide', { id: oid(el), ok: false, note: val('note') }, el)) await after('Юборилди'); },
});
