// Раҳбар экранлари (ўзбек кирилл ёзувида).
import {
  api, act, esc, fmt, show, refresh, registerScreens, on, onNav, state, setLang, brandTop, openSheet, closeSheet, sheetErr, toast, $, $$,
  qty, val, num, pressed, chips, tape, STATE_NAMES, STATE_COLORS, ava, periodPicker, periodFromBtn, periodRange, dmy, hm, dt, mins, today, getLocation, photoTag, voiceTag,
} from './core.js';
import { initOrders } from './buyurtma.js';

const L = 'cyr';
let ME = null;
const cache = {};
const RN = { rahbar: 'Раҳбар', bichuvchi: 'Бичувчи', tikuvchi: 'Тикувчи' };
const KIND = { cut_ready: 'Тайёр бичим', cut_partial: 'Чала бичим', partial_done: 'Чала тугатилди', opening: 'Бошланғич қолдиқ', transfer_reserve: 'Берилди (қабул кутилмоқда)',
  transfer_accept: 'Санаб қабул қилинди', transfer_release: 'Бекор / қайтди', submit: 'Тайёр деб топширилди', accept: 'Текшириб қабул қилинди', rework: 'Қайта ишлашга қайтди', writeoff: 'Ҳисобдан чиқарилди' };
const PAY_ST = { pending: ['Ходим тасдиғи кутилмоқда', 'warn'], confirmed: ['Икки томон тасдиқлаган', 'ok'], disputed: ['Тафовут ёзилган', 'bad'], cancelled: ['Бекор қилинган', ''], reverse_pending: ['Бекор қилиш сўралган', 'warn'], reversed: ['Бекор қилинган', ''] };
const TK_ST = { priced: ['Нарх қўйилди, ойлик ҳисобда', 'blue'], submitted: ['Юборилган', 'blue'], review: ['Раҳбар текширувида', 'blue'], employee: ['Ходим тасдиғида', 'warn'], agreed: ['Икки томон тасдиқлаган', 'ok'], disputed: ['Баҳсли', 'bad'], cancelled: ['Бекор қилинган', ''] };
const TK_KIND = { product: 'Тайёр маҳсулот', material: 'Материал', service: 'Тикиш хизмати' };
const METHOD = { prepaid: 'Олдиндан/алоҳида тўланган', debt: 'Ҳали қарз', payroll: 'Ойлик билан ҳисоблашиш' };
const TR_ST = { pending: ['Қабул кутилмоқда', 'blue'], accepted: ['Қабул қилинди', 'ok'], disputed: ['Тафовут', 'bad'], cancelled: ['Бекор қилинган', ''], resolved: ['Ҳал қилинди', 'ok'] };
const ATT_R = { geo_not_set: 'Жойлашув созланмаган', loc_off: 'Жойлашув ўчиқ', loc_timeout: 'Телефон жойлашувни аниқлай олмади', low_accuracy: 'Аниқлик паст', outside: 'Ҳудуддан ташқарида', bio_none: 'Телефонда биометрика йўқ',
  bio_denied: 'Биометрикага рухсат берилмади', bio_failed: 'Биометрика ўтмади', bio_token: 'Бошқа телефон', no_in: 'Келиш йўқ', other: 'Бошқа сабаб' };
const BLOCK = { missing_rate: 'Баъзи ишлар учун тариф белгиланмаган', payment_open: 'Тасдиқланмаган ёки баҳсли тўлов бор', adjustment_open: 'Тасдиқланмаган тузатиш бор',
  takeaway_open: 'Олинганлар бўйича очиқ ёзув бор', payable_left: 'Ходимга бериладиган пул қолган' };
const tag = ([t, c]) => `<span class="tag ${c}">${esc(t)}</span>`;
const prodLabel = (x) => `${esc(x.type_name || '')} «${esc(x.model)}» · ${esc(x.material)} · ${esc(x.color)}`;
const gl = (g) => (g.zakaz ? 'Буюртма (заказ)' : `${esc(g.type_name)} «${esc(g.model)}»`);
// «200 та оддий, 4 та буюртма» — оддий ва заказ иши алоҳида
const cntLine = (gs) => { const W2 = { bichish: 'Бичди', tikish: 'Тикди' }; const out = [];
  for (const w of ['tikish', 'bichish']) { const a = gs.filter((g) => g.work === w && !g.zakaz).reduce((x, g) => x + g.qty, 0), z = gs.filter((g) => g.work === w && g.zakaz).reduce((x, g) => x + g.qty, 0);
    if (a || z) out.push(`${W2[w]}: <b>${fmt(a)}</b> та оддий${z ? `, <b>${fmt(z)}</b> та буюртма` : ''}`); }
  return out.length ? `<div class="banner" style="margin-bottom:10px">${out.join(' · ')}</div>` : ''; };
const nm = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim();

const TABS = [['r_home', '⌂', 'Бош'], ['r_staff', '👥', 'Ходимлар'], ['r_prod', '✂︎', 'Ишлаб чиқариш'], ['r_money', '💵', 'Пул'], ['r_set', '⚙', 'Созламалар']];
function drawNav(cur) {
  const nav = document.getElementById('nav');
  nav.hidden = false;
  const tab = state.stack[0] ? state.stack[0].name : cur;
  nav.innerHTML = TABS.map(([s, i, t]) => `<button data-act="tab" data-s="${s}" ${tab === s ? 'aria-current="page"' : ''}><i>${i}</i>${t}${cache.dots && cache.dots[s] ? '<span class="dot"></span>' : ''}</button>`).join('');
}

export async function start() {
  setLang(L);
  ME = await api('me');
  initOrders((sub) => top(sub), 'rahbar');
  onNav(drawNav);
  await show('r_home', {}, { root: true });
}
const top = (sub) => brandTop(sub || 'Раҳбар', nm(ME));
const backBtn = '<button class="back" data-act="back">‹ Орқага</button>';

// ---------- Бош ----------
async function home() {
  top('Раҳбар');
  const h = await api('r_home');
  const t = h.todo;
  cache.dots = { r_staff: t.requests + t.att_exc + t.mj > 0, r_prod: t.disputes + t.inspect + t.ord_overdue + t.ord_price + t.ord_left + t.cash > 0, r_money: t.takeaways + t.payments + t.missing_rate + t.avans + t.rk > 0 };
  const todo = [
    [t.requests, 'Янги сўровлар', 'r_staff'], [t.att_exc, 'Давомат истиснолари', 'r_staff'], [t.inspect, 'Текширув кутмоқда', 'r_insp'],
    [t.disputes, 'Топшириш тафовутлари', 'r_disputes'], [t.takeaways, 'Олинганлар нархи', 'r_tk'], [t.payments, 'Тўлов эътирозлари', 'r_money'], [t.avans, 'Аванс сўровлари', 'r_money'], [t.rk, 'Ойлик ҳисоб эътирозлари', 'r_money'], [t.missing_rate, 'Тарифсиз ишлар', 'r_rates'],
    [t.mj, 'Мурожаатлар', 'r_mj'], [t.ord_overdue, 'Муддати ўтган буюртмалар', 'o_list'], [t.ord_price, 'Буюртма нархини тасдиқлаш', 'o_list'], [t.ord_left, 'Олиб кетилмаган буюртма', 'o_list'], [t.cash, 'Бичувчи пул топширди', 'o_list'],
  ].filter((x) => x[0] > 0);
  const a = h.att, b = h.bal, d = h.today;
  return `<h1 class="page">Бугун, ${dmy(h.day)}</h1>
  ${!h.geo_set ? '<button class="banner warn tap" data-act="tab" data-s="r_set" style="width:100%">📍 Корхона жойлашуви созланмаган — ходимлар давомати автоматик тасдиқланмайди. Созлаш ›</button>' : ''}
  ${todo.length ? `<h2>Сизнинг ишингиз</h2><div class="grid2">${todo.map(([n, txt, s]) => `<button class="big" data-act="go" data-s="${s}"><span class="ic">${n}</span><span>${txt}</span></button>`).join('')}</div>` : '<div class="banner ok" style="margin-top:12px">Кутиб турган иш йўқ.</div>'}
  <h2>Давомат <button data-act="go" data-s="r_att">Батафсил ›</button></h2>
  <div class="stats">
    <div class="stat" style="--c:var(--ok)"><b class="num">${a.came}/${a.staff}</b><span>Келди</span></div>
    <div class="stat" style="--c:var(--warn)"><b class="num">${a.late}</b><span>Кечикди</span></div>
    <div class="stat" style="--c:var(--chalk)"><b class="num">${a.left}</b><span>Кетди</span></div>
  </div>
  ${a.yesterday_no_out ? `<div class="banner warn" style="margin-top:8px">Кеча ${a.yesterday_no_out} кишининг кетиши қайд этилмаган.</div>` : ''}
  ${a.remote ? `<div class="sub" style="margin-top:8px">🏠 Уйдан ишлайдиганлар: ${a.remote} киши (давоматда ҳисобланмайди)</div>` : ''}
  ${a.absent.length && a.staff ? `<div class="sub" style="margin-top:8px">Ҳали келмаган: ${a.absent.map(esc).join(', ')}</div>` : ''}
  ${a.leave && a.leave.length ? `<div class="sub" style="margin-top:8px">✅ Бугун рухсатда: ${a.leave.map(esc).join(', ')}</div>` : ''}
  <h2>Бугунги иш</h2>
  <div class="card"><div class="bal">
    <span>Бичилди (тайёр бичим)</span><span class="v">${fmt(d.ready)}</span>
    <span>Чала бичим (алоҳида)</span><span class="v">${fmt(d.partial)}</span>
    <span>Тикувчиларга берилди</span><span class="v">${fmt(d.given)}</span>
    <span>Тайёр деб юборилди</span><span class="v">${fmt(d.submitted)}</span>
    <span>Текшириб қабул қилинди</span><span class="v">${fmt(d.accepted)}</span>
  </div></div>
  <h2>Ҳозирги қолдиқ <button data-act="go" data-s="r_where">Кимда ›</button></h2>
  <div class="card">${tape(b, L) || '<div class="sub">Ҳали маълумот йўқ.</div>'}${b.partial ? `<div class="sub" style="margin-top:8px">Чала бичим: <b>${fmt(b.partial)}</b> (тарқатилмайди)</div>` : ''}</div>
  <h2>Пул, шу ой <button data-act="tab" data-s="r_money">Батафсил ›</button></h2>
  <div class="stats">
    <div class="stat" style="--c:var(--ok)"><b class="num">${fmt(h.money.earned_month)}</b><span>Ҳисобланган ҳақ</span></div>
    <div class="stat" style="--c:var(--chalk)"><b class="num">${fmt(h.money.paid_month)}</b><span>Тасдиқланган тўлов</span></div>
    <div class="stat" style="--c:var(--warn)"><b class="num">${fmt(h.money.pending)}</b><span>Тасдиқ кутилмоқда</span></div>
  </div>`;
}

// ---------- Ходимлар ----------
async function staff() {
  top('Ходимлар');
  const [s, ex] = await Promise.all([api('staff_list'), api('att_exc_list')]);
  cache.staff = s.users;
  const pend = s.users.filter((u) => u.status === 'pending');
  const mjBtn = '<button class="big" data-act="go" data-s="r_mj" style="width:100%;margin-top:12px"><span class="ic">📨</span><span>Мурожаатлар<small>Рухсат сўровлари, муаммолар</small></span></button>';
  const act_ = s.users.filter((u) => u.status === 'active');
  const inact = s.users.filter((u) => u.status === 'inactive');
  const exP = ex.filter((e) => e.status === 'pending');
  return `<h1 class="page">Ходимлар</h1>${mjBtn}
  <h2>Сўровлар</h2>
  ${pend.length ? pend.map((u) => `<div class="card"><div class="row">${ava(nm(u), u.id)}<div class="grow"><div class="title">${esc(nm(u))}</div>
      <div class="sub">Сўралган роль: <b>${RN[u.role]}</b> · туғилган: ${dmy(u.birth_date)} · ${dt(u.created_at)}</div></div></div>
      <div class="actions row2"><button class="btn ok" data-act="approve" data-id="${u.id}" data-role="${u.role}">Тасдиқлаш</button><button class="btn ghost" data-act="reject" data-id="${u.id}">Рад этиш</button></div></div>`).join('')
    : '<div class="empty">Янги сўров йўқ.</div>'}
  ${exP.length ? `<h2>Давомат истиснолари</h2>${exP.map((e) => `<div class="card"><div class="title">${esc(nm(e))} — ${e.kind === 'in' ? 'келди' : 'кетди'} ${e.time}</div>
      <div class="sub">${dmy(e.day)} · Сабаб: ${ATT_R[e.reason] || esc(e.reason)}${e.note ? ' · «' + esc(e.note) + '»' : ''}</div>
      <div class="actions row2"><button class="btn ok" data-act="excOk" data-id="${e.id}">Тасдиқлаш</button><button class="btn ghost" data-act="excNo" data-id="${e.id}">Рад этиш</button></div></div>`).join('')}` : ''}
  ${s.birthdays.length ? `<h2>Туғилган кунлар (30 кун)</h2><div class="list">${s.birthdays.map((b) => `<div class="li"><div class="grow"><b>${esc(b.name)}</b><div class="sub">${dmy(b.day)} · ${b.age} ёш</div></div>${b.inDays === 0 ? tag(['Бугун', 'ok']) : `<span class="tag">${b.inDays} кундан кейин</span>`}</div>`).join('')}</div>` : ''}
  <h2>Фаол ходимлар <button data-act="addBoss">+ Раҳбар қўшиш</button></h2>
  <div class="list">${act_.map((u) => `<button class="li" data-act="staffOpen" data-id="${u.id}">${ava(nm(u), u.id, 36)}<div class="grow"><b>${esc(nm(u))}</b><div class="sub">${RN[u.role]}${u.remote ? ' · 🏠 уйдан ишлайди' : ''}${u.can_inspect ? ' · текшириш ваколати' : ''}${!u.profile_done ? ' · маълумот киритмаган' : ''}</div></div><span class="chev">›</span></button>`).join('')}</div>
  ${inact.length ? `<h2>Фаолсиз (ишдан кетган)</h2><div class="list">${inact.map((u) => `<button class="li" data-act="staffOpen" data-id="${u.id}"><div class="grow">${esc(nm(u))}<div class="sub">${RN[u.role]} · тарих сақланган</div></div><span class="chev">›</span></button>`).join('')}</div>` : ''}`;
}

// ---------- Ишлаб чиқариш ----------
async function prod() {
  top('Ишлаб чиқариш');
  const h = await api('r_home');
  return `<h1 class="page">Ишлаб чиқариш</h1>
  <div class="grid2">
    <button class="big primary" data-act="go" data-s="r_insp"><span class="ic">✔︎</span><span>Текширув<small>${h.todo.inspect} та топшириқ</small></span></button>
    <button class="big" data-act="go" data-s="r_disputes"><span class="ic">⚠︎</span><span>Тафовутлар<small>${h.todo.disputes} та</small></span></button>
    <button class="big" data-act="go" data-s="o_list"><span class="ic">📐</span><span>Буюртмалар<small>Алоҳида заказлар${h.todo.ord_overdue ? ' · ' + h.todo.ord_overdue + ' та кечикди' : ''}</small></span></button>
    <button class="big" data-act="go" data-s="r_batches"><span class="ic">▤</span><span>Партиялар</span></button>
    <button class="big" data-act="go" data-s="r_where"><span class="ic">⌖</span><span>Қолдиқ кимда</span></button>
    <button class="big" data-act="go" data-s="r_report"><span class="ic">📊</span><span>Ҳисобот<small>Кун, 10 кун, ой</small></span></button>
    <button class="big" data-act="opening"><span class="ic">⇥</span><span>Бошланғич қолдиқ<small>Тизимдан олдинги</small></span></button>
  </div>
  <h2>Ҳозирги қолдиқ</h2><div class="card">${tape(h.bal, L) || '<div class="sub">Маълумот йўқ.</div>'}${h.bal.partial ? `<div class="sub" style="margin-top:8px">Чала бичим: <b>${fmt(h.bal.partial)}</b></div>` : ''}</div>`;
}

async function insp() {
  top('Текширув');
  const list = await api('insp_list');
  cache.insp = list;
  return `${backBtn}<h1 class="page">Текширув</h1><p class="lead">Тикувчи «тайёр» деган маҳсулотни санаб, қабул қилинг ёки сабаби билан қайтаринг. Ҳақ фақат қабул қилинганидан ҳисобланади.</p>
  ${list.length ? list.map((s) => `<div class="card"><div class="row">${photoTag(s.photo_id) || ava(s.name, s.sewer_id, 36)}<div class="grow"><div class="title">${esc(s.name)} · ${fmt(s.open_qty)} дона</div>
    <div class="sub">${prodLabel(s)} · ${esc(s.code)} · ${esc(s.size)} · ${dmy(s.day)} ${s.time}${s.from_state === 'rework' ? ' · қайта ишланган' : ''}</div></div></div>
    <div class="actions"><button class="btn dark" data-act="inspOpen" data-id="${s.id}">Текшириш</button></div></div>`).join('') : '<div class="empty">Текширув кутаётган маҳсулот йўқ.</div>'}`;
}

async function disputes() {
  top('Тафовутлар');
  const list = await api('transfers_list', { status: 'disputed' });
  cache.disp = list;
  return `${backBtn}<h1 class="page">Топшириш тафовутлари</h1><p class="lead">Асл ёзув ўзгармайди. Сиз қарор қиласиз: саналган қисми тикувчига, қолгани қайтади ёки сабаб билан ҳисобдан чиқади.</p>
  ${list.length ? list.map((t) => `<div class="card"><div class="title">${esc(t.code)}: ${esc(t.from_name)} → ${esc(t.to_name)}</div><div class="sub">${dmy(t.day)} ${t.time} · тикувчи: «${esc(t.dispute_note)}»</div>
    <table class="t" style="margin-top:8px"><tr><th>Маҳсулот</th><th>Ёзилган</th><th>Саналган</th></tr>${t.items.map((i) => `<tr><td>${esc(i.code)} ${esc(i.size)} · ${esc(i.color)}</td><td>${i.qty}</td><td>${i.counted ?? '—'}</td></tr>`).join('')}</table>
    <div class="actions"><button class="btn dark" data-act="resolve" data-id="${t.id}">Қарор қилиш</button></div></div>`).join('') : '<div class="empty">Тафовут йўқ.</div>'}`;
}

async function batches() {
  top('Партиялар');
  const list = await api('batches_all');
  return `${backBtn}<h1 class="page">Партиялар</h1>
  ${list.length ? `<div class="list">${list.map((b) => `<button class="li" data-act="go" data-s="r_batch" data-id="${b.id}"><div class="grow"><b>${esc(b.code)}</b> · ${prodLabel(b)}<div class="sub">${dmy(b.day)} · ${b.opening ? 'бошланғич қолдиқ' : esc(b.cutter || '')}</div></div><span class="chev">›</span></button>`).join('')}</div>` : '<div class="empty">Партия йўқ.</div>'}`;
}

async function batch({ id }) {
  top('Партия');
  const b = await api('batch_detail', { batch_id: id });
  const S = STATE_NAMES[L];
  return `${backBtn}<h1 class="page">${prodLabel(b)}</h1><div class="mono">${esc(b.code)} · ${dmy(b.day)} · ${b.opening ? 'бошланғич қолдиқ' : esc(b.cutter || '')}</div>
  ${photoTag(b.photo_id, 'ph lg')}
  ${tape(b.totals, L)}
  <h2>Размерлар</h2>
  <div class="card scrollx"><table class="t"><tr><th>Размер</th><th>Тайёр жами</th><th>Эркин</th><th>Чала</th><th>Тикувчиларда</th><th>Текширувда</th><th>Қабул</th></tr>
  ${b.lines.map((l) => { const s = l.states; return `<tr><td><b>${esc(l.size)}</b></td><td>${fmt(l.ready_total)}</td><td>${fmt(s.free || 0)}</td><td>${fmt(s.partial || 0)}</td><td>${fmt((s.reserved || 0) + (s.sewing || 0) + (s.rework || 0))}</td><td>${fmt(s.review || 0)}</td><td>${fmt(s.accepted || 0)}</td></tr>`; }).join('')}</table></div>
  <h2>Кимда</h2>
  ${b.lines.some((l) => l.holders.length) ? `<div class="list">${b.lines.flatMap((l) => l.holders.map((h) => `<div class="li"><div class="grow"><b>${esc(h.name)}</b><div class="sub">размер ${esc(l.size)} · ${S[h.state]}</div></div><div class="r">${fmt(h.qty)}</div></div>`)).join('')}</div>` : '<div class="empty">Ҳеч кимда эмас.</div>'}
  <h2>Ҳаракатлар</h2>
  <div class="list">${b.moves.map((m) => `<div class="li"><div class="grow">${KIND[m.kind] || m.kind}${m.tf ? ' → ' + esc(m.tf) : m.ff ? ' · ' + esc(m.ff) : ''}<div class="sub">${dt(m.at)} · ${esc(m.size)} · ${esc((m.af || '') + ' ' + (m.al || ''))}${m.note ? ' · ' + esc(m.note) : ''}</div></div><div class="r">${fmt(m.qty)}</div></div>`).join('')}</div>`;
}

async function where() {
  top('Қолдиқ кимда');
  const rows = await api('where_report', {});
  cache.where = rows;
  const S = STATE_NAMES[L];
  const groups = {};
  rows.forEach((r, i) => (groups[r.state] ||= []).push({ ...r, i }));
  const order = ['free', 'partial', 'reserved', 'sewing', 'rework', 'review'];
  return `${backBtn}<h1 class="page">Қолдиқ кимда</h1><p class="lead">Ҳар бир дона ҳозир қайси ҳолатда, кимда, қайси партия ва размерда. Ёзувни босиб, ҳужжатли ҳисобдан чиқариш мумкин.</p>
  ${rows.length ? order.filter((k) => groups[k]).map((k) => `<h2><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${STATE_COLORS[k]}"></i> ${S[k]}</span><span>${fmt(groups[k].reduce((a, r) => a + r.qty, 0))}</span></h2>
    <div class="list">${groups[k].map((r) => `<button class="li" data-act="${['free', 'sewing', 'rework'].includes(k) ? 'woOpen' : 'noop'}" data-i="${r.i}"><div class="grow">${r.name ? `<b>${esc(r.name)}</b><div class="sub">${esc(r.label)}</div>` : esc(r.label)}</div><div class="r">${fmt(r.qty)}</div></button>`).join('')}</div>`).join('')
    : '<div class="empty">Очиқ қолдиқ йўқ.</div>'}`;
}

let repP = null, repU = '';
async function report() {
  top('Ҳисобот');
  repP = repP || { key: 'month', ...periodRange('month') };
  const [r, s] = await Promise.all([api('prod_report', { from: repP.from, to: repP.to, user_id: repU || undefined }), cache.staff ? { users: cache.staff } : api('staff_list')]);
  cache.staff = s.users;
  const f = r.flows, S = STATE_NAMES[L];
  const emps = s.users.filter((u) => ['bichuvchi', 'tikuvchi'].includes(u.role) && u.status !== 'pending' && u.status !== 'rejected');
  return `${backBtn}<h1 class="page">Ишлаб чиқариш ҳисоботи</h1>
  ${periodPicker(L, repP, 'rPer')}
  <div class="field"><div class="lbl">Ходим</div><select class="txt" id="repU" data-act-change="repU"><option value="">Барча ходимлар</option>${emps.map((u) => `<option value="${u.id}" ${String(repU) === String(u.id) ? 'selected' : ''}>${esc(nm(u))} (${RN[u.role]})</option>`).join('')}</select></div>
  <h2>Давр ичидаги оқим</h2>
  <div class="card"><div class="bal">
    <span>Бичилган тайёр бичим</span><span class="v">${fmt((f.cut_ready || 0) + (f.partial_done || 0))}</span>
    <span>Чала бичим (алоҳида)</span><span class="v">${fmt(f.cut_partial || 0)}</span>
    <span>Тикувчиларга берилди</span><span class="v">${fmt(f.transfer_reserve || 0)}</span>
    <span>Тикувчи санаб қабул қилди</span><span class="v">${fmt(f.transfer_accept || 0)}</span>
    <span>Тайёр деб юборилди</span><span class="v">${fmt(f.submit || 0)}</span>
    <span>Текшириб қабул қилинди</span><span class="v">${fmt(f.accept || 0)}</span>
    <span>Қайта ишлашга қайтди</span><span class="v">${fmt(f.rework || 0)}</span>
    <span>Ҳисобдан чиқарилди</span><span class="v">${fmt(f.writeoff || 0)}</span>
  </div></div>
  <h2>Давр охирига қолдиқ</h2>
  <div class="card"><div class="bal">${['free', 'reserved', 'sewing', 'rework', 'review', 'accepted', 'writeoff', 'partial'].map((k) => `<span>${S[k]}</span><span class="v">${fmt(r.end[k])}</span>`).join('')}</div>
  ${r.eq ? `<div class="banner ${r.eq.ok ? 'ok' : 'bad'}" style="margin-top:10px">${r.eq.ok ? '✓' : '✗'} Бошланғич ${fmt(r.eq.start)} + янги тайёр бичим ${fmt(r.eq.newReady)} = барча ҳолатлардаги қолдиқ ${fmt(r.eq.end)}</div>` : ''}</div>
  <h2>Ходимлар бўйича</h2>
  <div class="card scrollx"><table class="t"><tr><th>Ходим</th><th>Бичди</th><th>Олди</th><th>Тайёр деди</th><th>Қабул</th><th>Ҳақ</th></tr>
    ${r.byUser.map((u) => `<tr><td>${esc(u.name)}</td><td>${u.role === 'bichuvchi' ? fmt(u.cut) : '—'}</td><td>${u.role === 'tikuvchi' ? fmt(u.received) : '—'}</td><td>${u.role === 'tikuvchi' ? fmt(u.submitted) : '—'}</td><td>${u.role === 'tikuvchi' ? fmt(u.accepted) : '—'}</td><td>${fmt(u.earned)}</td></tr>`).join('')}</table></div>
  <h2>Партия / модел бўйича</h2>
  <div class="card scrollx"><table class="t"><tr><th>Партия</th><th>Бичилди</th><th>Чала</th><th>Берилди</th><th>Тайёр</th><th>Қабул</th></tr>
    ${r.byBatch.map((b) => `<tr><td>${esc(b.code)} ${esc(b.model)} · ${esc(b.color)}</td><td>${fmt(b.ready)}</td><td>${fmt(b.partial)}</td><td>${fmt(b.given)}</td><td>${fmt(b.submitted)}</td><td>${fmt(b.accepted)}</td></tr>`).join('')}</table></div>`;
}

let attP = null;
async function attRep() {
  top('Давомат');
  attP = attP || { key: 'day', ...periodRange('day') };
  const r = await api('att_report', { from: attP.from, to: attP.to });
  const st = (d) => d.status === 'no_out' ? tag(['Кетиш қайд этилмаган', 'bad']) : d.status === 'working' ? tag(['Ишда', 'blue']) : d.full ? tag(['Тўлиқ кун', 'ok']) : d.status === 'short' ? tag(['Қисқа кун', 'warn']) : '';
  return `${backBtn}<h1 class="page">Давомат</h1>
  ${periodPicker(L, attP, 'aPer')}
  <p class="hint">Иш бошланиши ${esc(r.settings.work_start)}, тугаши ${esc(r.settings.work_end)}; тўлиқ кун — соф ${mins(r.settings.full_min)}. Келиш-кетиш оралиғи ва соф ишланган вақт алоҳида.</p>
  ${r.users.map((u) => `<div class="card"><div class="row">${ava(u.name, u.id, 34)}<div class="grow"><div class="title">${esc(u.name)}</div>
    <div class="sub">Келди ${u.came}${u.leave ? ` · рухсатли ${u.leave} кун` : ''} · кечикди ${u.late} · кетиши йўқ ${u.no_out} · тўлиқ кун ${u.full} · соф ${mins(u.net)}</div></div></div>
    ${u.days.length ? `<div class="list" style="margin-top:8px;box-shadow:none;background:var(--soft)">${u.days.map((d) => `<div class="li"><div class="grow">${dmy(d.day)} · ${d.in || '—'} → ${d.out || '—'}<div class="sub">оралиқ ${mins(d.gross)} · соф ${mins(d.net)}${d.late ? ` · ${d.late} дақ кечикди` : ''}${(d.in_how || '').startsWith('exc') || (d.out_how || '').startsWith('exc') ? ' · истисно орқали' : ''}</div></div>${st(d)}</div>`).join('')}</div>` : '<div class="sub" style="margin-top:6px">Бу даврда келмаган.</div>'}</div>`).join('')}`;
}

// ---------- Пул ----------
async function money() {
  top('Пул');
  const [list, avs] = await Promise.all([api('money_summary'), api('av_list', {})]);
  const pend = avs.filter((a) => a.status === 'pending');
  const RK = { sent: ['ҳисоб юборилган', 'blue'], confirmed: ['ҳисоб тасдиқланган', 'ok'], disputed: ['ҳисобга эътироз', 'bad'], stale: ['ҳисобни қайта юборинг', 'warn'] };
  return `<h1 class="page">Пул ва ҳисоб-китоб</h1>
  ${pend.length ? `<h2>Аванс сўровлари · ${pend.length}</h2>${pend.map((a) => `<div class="card"><div class="row">${ava(a.name, a.user_id, 36)}<div class="grow"><div class="title">${esc(a.name)} · ${fmt(a.amount)} сўм</div>
      <div class="sub">${dt(a.created_at)}${a.note ? ' · «' + esc(a.note) + '»' : ''}</div></div></div>
      <div class="actions row2"><button class="btn ok" data-act="avGive" data-id="${a.id}" data-amount="${a.amount}" data-name="${esc(a.name)}">Берилди</button><button class="btn ghost" data-act="avNo" data-id="${a.id}">Рад этиш</button></div></div>`).join('')}` : ''}
  <div class="grid2"><button class="big" data-act="go" data-s="r_tk"><span class="ic">🧾</span><span>Олинганлар<small>Нарх қўйиш</small></span></button>
  <button class="big" data-act="go" data-s="r_rates"><span class="ic">₸</span><span>Тарифлар<small>Дона нархи</small></span></button></div>
  <h2>Ходимлар</h2>
  ${list.length ? `<div class="list">${list.map((u) => `<button class="li" data-act="go" data-s="r_payslip" data-id="${u.id}">${ava(u.name, u.id, 36)}<div class="grow"><b>${esc(u.name)}</b> <span class="sub">${RN[u.role]}${u.status === 'inactive' ? ' · фаолсиз' : ''}</span>
    <div class="sub">Бериладиган <b>${fmt(u.payable)}</b>${u.pending ? ` · кутилмоқда ${fmt(u.pending)}` : ''}${u.debt + u.overpaid ? ` · қарз ${fmt(u.debt + u.overpaid)}` : ''}${u.rk && RK[u.rk.status] ? ` · ${u.rk.period}: ${RK[u.rk.status][0]}` : ''}</div></div>
    ${u.avans ? `<span class="tag warn">аванс ${fmt(u.avans)}</span>` : ''}${u.open ? `<span class="tag warn">${u.open} очиқ</span>` : ''}${u.missing ? '<span class="tag bad">тариф йўқ</span>' : ''}<span class="chev">›</span></button>`).join('')}</div>` : '<div class="empty">Ходим йўқ.</div>'}
  <p class="hint">Бу корхонанинг ички ишбай ҳисоби. Расмий иш ҳақи ва солиқ ҳисобини алмаштирмайди. «Пул бердим» тугмаси банкдан пул ўтказмайди — фақат нақд берилганини қайд этади.</p>`;
}

// Ойлик ҳисоб жадвали (раҳбар кўриниши)
function rkTable(d) {
  const sg = (n) => (n < 0 ? '−' : '') + fmt(Math.abs(n));
  return `<div class="bal">
    ${d.opening ? `<span>Олдинги даврдан ${d.opening > 0 ? 'қолдиқ' : 'қарз'}</span><span class="v">${sg(d.opening)}</span>` : ''}
    <span>Қилган иши</span><span class="v">+${fmt(d.earned)}</span>
    ${d.adj ? `<span>Тузатишлар</span><span class="v">${d.adj > 0 ? '+' : ''}${sg(d.adj)}</span>` : ''}
    <span>Олган аванслари</span><span class="v">−${fmt(d.avansSum)}</span>
    ${d.givenSum ? `<span>Берилган пул</span><span class="v">−${fmt(d.givenSum)}</span>` : ''}
    ${d.prevDed ? `<span>Аввал ушланган</span><span class="v">−${fmt(d.prevDed)}</span>` : ''}
    <span>Корхонадан олганлари</span><span class="v">−${fmt(d.itemsSum)}</span>
    ${d.cashHeld ? `<span>Қўлидаги мижоз пули (топширилмаган)</span><span class="v">−${fmt(d.cashHeld)}</span>` : ''}
    <span class="hr"></span><span class="tot">${d.total >= 0 ? 'Қўлига берилади' : 'Қарзи (кейинги ойга)'}</span><span class="v tot">${fmt(Math.abs(d.total))} сўм</span>
  </div>
  ${d.items.length ? `<details style="margin-top:10px"><summary>Олганлари · ${d.items.length} та</summary><div class="list" style="margin-top:8px">${d.items.map((k) => `<div class="li">${photoTag(k.photo_id)}<div class="grow">${esc(k.name)}<div class="sub">${dmy(k.day)}</div></div><div class="r">${fmt(k.amount)}</div></div>`).join('')}</div></details>` : ''}
  ${d.avans.length ? `<details style="margin-top:6px"><summary>Аванслар · ${d.avans.length} та</summary><div class="list" style="margin-top:8px">${d.avans.map((p) => `<div class="li"><div class="grow">${dmy(p.day)}<div class="sub">${esc(p.code)}</div></div><div class="r">${fmt(p.amount)}</div></div>`).join('')}</div></details>` : ''}`;
}
const RK_BL = { cash_open: 'бичувчи топширган пул тасдиқланмаган (Буюртмалар бўлими)', missing_rate: 'баъзи ишларга тариф қўйилмаган', unpriced: 'олинганларнинг баъзисига нарх қўйилмаган', payment_open: 'тасдиқланмаган тўлов бор',
  adjustment_open: 'тасдиқланмаган тузатиш бор', takeaway_open: 'баҳсли олинган нарса бор' };

let psP = null;
let rkPer = null;
async function payslipScr({ id }) {
  top('Ҳисоб варақаси');
  psP = psP || { key: 'month', ...periodRange('month') };
  rkPer = rkPer || today().slice(0, 7);
  const [ps, tks, rv] = await Promise.all([api('payslip', { user_id: Number(id), from: psP.from, to: psP.to }), api('tk_list', { user_id: Number(id) }), api('rk_view', { user_id: Number(id), period: rkPer })]);
  const thisM = today().slice(0, 7);
  const prevM = (() => { const [y, m] = thisM.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
  const rk = rv.rk, live = rv.live;
  const RKS = { sent: ['Ходим тасдиғи кутилмоқда', 'warn'], confirmed: ['Ходим тасдиқлади', 'ok'], disputed: ['Ходим эътироз билдирди', 'bad'], stale: ['Маълумот ўзгарди — қайта юборинг', 'warn'], replaced: ['Янгиси юборилган', ''] };
  const canSend = !live.blockers.length && (!rk || ['disputed', 'stale', 'replaced'].includes(rk.status) || (rk.status === 'sent' && rk.stale));
  const rkHtml = `<div class="card">
    <div class="row"><div class="grow"><div class="title">Ойлик ҳисоб</div></div>${chips('rkper', [[prevM, prevM], [thisM, thisM]], rkPer)}</div>
    ${rk && rk.status === 'confirmed' && !rk.stale ? `<div class="banner ok" style="margin-top:8px">Ходим ${dt(rk.answered_at)} да тасдиқлади.</div>${rkTable(rk.data)}` : rkTable(live)}
    ${rk && rk.status !== 'confirmed' ? `<div style="margin-top:8px">${tag(RKS[rk.status] || [rk.status, ''])}${rk.dispute_note ? ` <span class="sub">«${esc(rk.dispute_note)}»</span>` : ''}${rk.stale ? ' <span class="sub">юборилгандан кейин ўзгарган</span>' : ''}</div>` : ''}
    ${live.blockers.length ? `<div class="banner warn" style="margin-top:8px">Юбориш учун: ${live.blockers.map((b) => RK_BL[b]).join('; ')}.${live.unpriced.length ? ' <button class="link" data-act="go" data-s="r_tk">Нарх қўйиш ›</button>' : ''}</div>` : ''}
    ${canSend ? `<button class="btn dark" style="margin-top:10px" data-act="rkSend" data-id="${id}" data-p="${live.period}">Ҳисобни ходимга юбориш</button>` : ''}
    ${rk && rk.status === 'confirmed' && ps.now.payable > 0 ? `<button class="btn ok" style="margin-top:10px" data-act="payOpen">Пул бердим · ${fmt(ps.now.payable)} сўм</button>` : ''}
  </div>`;
  cache.ps = ps;
  cache.tks = tks;
  const W = { bichish: 'Бичиш', tikish: 'Тикиш' };
  const n = ps.now;
  const payLi = (p) => `<div class="li"><div class="grow"><b>${fmt(p.amount)} сўм</b> · ${p.kind === 'avans' ? 'аванс' : 'ойлик'}<div class="sub">${esc(p.code)} · ${dmy(p.day)}${p.dispute_note ? ` · ходим: «${esc(p.dispute_note)}»${p.dispute_amount != null ? ' (олдим ' + fmt(p.dispute_amount) + ')' : ''}` : ''}${p.cancel_reason ? ' · ' + esc(p.cancel_reason) : ''}</div></div>
    <div style="text-align:right">${tag(PAY_ST[p.status] || [p.status, ''])}${['pending', 'disputed'].includes(p.status) ? `<br><button class="link" data-act="payCancel" data-id="${p.id}">Бекор қилиш</button>` : p.status === 'confirmed' ? `<br><button class="link" data-act="payReverse" data-id="${p.id}">Тузатиш</button>` : ''}</div></div>`;
  return `${backBtn}<h1 class="page">${esc(ps.user.name)}</h1><div class="sub">${RN[ps.user.role]}</div>
  <div class="stats" style="margin-top:12px">
    <div class="stat" style="--c:var(--ok)"><b class="num">${fmt(n.payable)}</b><span>Бериладиган пул</span></div>
    <div class="stat" style="--c:var(--warn)"><b class="num">${fmt(n.pending)}</b><span>Ходим тасдиғи кутилмоқда</span></div>
    <div class="stat" style="--c:var(--bad)"><b class="num">${fmt(n.debt + n.overpaid)}</b><span>Алоҳида қарз</span></div>
  </div>
  <h2>Ойлик ҳисоб</h2>
  ${rkHtml}
  <div class="grid2" style="margin-top:10px"><button class="btn ghost" data-act="payOpen">Пул бердим</button><button class="btn ghost" data-act="adjOpen">Тузатиш киритиш</button></div>
  <h2>Ҳисоб варақаси</h2>
  ${periodPicker(L, psP, 'psPer')}
  <div class="card" style="margin-top:10px">
    ${ps.groups.length ? `${cntLine(ps.groups)}<table class="t"><tr><th>Иш</th><th>Дона</th><th>Тариф</th><th>Сумма</th></tr>${ps.groups.map((g) => `<tr><td>${W[g.work]}: ${gl(g)}</td><td>${fmt(g.qty)}</td><td>${g.price == null ? '<span class="tag bad">йўқ</span>' : fmt(g.price)}</td><td>${g.amount == null ? '—' : fmt(g.amount)}</td></tr>`).join('')}</table>` : '<div class="sub">Бу даврда қабул қилинган иш йўқ.</div>'}
    ${ps.missingQty ? `<div class="banner warn" style="margin-top:8px">${fmt(ps.missingQty)} дона учун тариф йўқ — сумма тахмин қилинмайди. <button class="link" data-act="go" data-s="r_rates">Тариф белгилаш ›</button></div>` : ''}
    <div class="bal" style="margin-top:12px">
      <span>Давр бошидаги қолдиқ</span><span class="v">${fmt(ps.opening)}</span>
      <span>Ҳисобланган ишбай ҳақ</span><span class="v">+${fmt(ps.earned)}</span>
      ${ps.adjConfirmed ? `<span>Тасдиқланган тузатишлар</span><span class="v">${ps.adjConfirmed > 0 ? '+' : '−'}${fmt(Math.abs(ps.adjConfirmed))}</span>` : ''}
      <span>Тасдиқланган тўловлар/аванслар</span><span class="v">−${fmt(ps.paidConfirmed)}</span>
      <span>Ушлаб қолинган (олинганлар, мижоз пули)</span><span class="v">−${fmt(ps.ded)}</span>
      <span class="hr"></span><span class="tot">Давр охири қолдиқ</span><span class="v tot">${fmt(ps.closing)} сўм</span>
    </div>
    ${ps.closed ? '<div class="banner ok" style="margin-top:10px">Бу давр ёпилган.</div>'
      : ps.blockers.length ? `<div class="banner warn" style="margin-top:10px">Ойликни ёпиш учун: ${ps.blockers.map((b) => BLOCK[b]).join('; ')}.</div>`
      : `<button class="btn ok" style="margin-top:10px" data-act="closeP">Ойликни ёпиш</button>`}
  </div>
  <h2>Тўловлар</h2>
  ${ps.payments.length ? `<div class="list">${ps.payments.map(payLi).join('')}</div>` : '<div class="empty">Бу даврда тўлов йўқ.</div>'}
  ${ps.adjustments.length ? `<h2>Тузатишлар</h2><div class="list">${ps.adjustments.map((a) => `<div class="li"><div class="grow">${a.amount > 0 ? '+' : '−'}${fmt(Math.abs(a.amount))} сўм<div class="sub">${esc(a.reason)}${a.dispute_note ? ' · эътироз: ' + esc(a.dispute_note) : ''}</div></div>${tag(PAY_ST[a.status] || [a.status, ''])}${['pending', 'disputed'].includes(a.status) ? `<button class="link" data-act="adjCancel" data-id="${a.id}">Бекор</button>` : ''}</div>`).join('')}</div>` : ''}
  <h2>Корхонадан олганлари</h2>
  ${ps.declaration === 'none' ? '<div class="sub">Ходим бу ой учун «Олмаганман» деб жавоб берган.</div>' : ''}
  ${tks.length ? `<div class="list">${tks.map((k) => `<div class="li"><div class="grow"><b>${esc(k.name)}</b> · ${k.qty} ${esc(k.unit || '')}<div class="sub">${dmy(k.day)} · ${TK_KIND[k.kind]}${k.amount != null ? ' · ' + fmt(k.amount) + ' сўм' : ''}${k.pay_method ? ' · ' + METHOD[k.pay_method] : ''}${k.remaining ? ' · қолган ' + fmt(k.remaining) : ''}${k.consent_at ? ' · рози: ' + dt(k.consent_at) : ''}</div></div>
    <div style="text-align:right">${tag(TK_ST[k.status])}${k.status === 'agreed' && k.remaining > 0 ? `<br><button class="link" data-act="settle" data-id="${k.id}" data-m="${k.pay_method}" data-rem="${k.remaining}">Ҳисоблашиш</button>` : ''}${['submitted', 'review', 'disputed', 'employee'].includes(k.status) ? `<br><button class="link" data-act="tkSet" data-id="${k.id}">Нарх белгилаш</button>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">Ёзув йўқ.</div>'}`;
}

async function tkScr() {
  top('Олинганлар');
  const list = await api('tk_list', {});
  cache.tks = list;
  const need = list.filter((k) => ['submitted', 'review', 'disputed', 'employee'].includes(k.status));
  const priced = list.filter((k) => k.status === 'priced');
  const byUser = {};
  for (const k of need) (byUser[k.uname] ||= []).push(k);
  const row = (k) => `<div class="li" style="align-items:flex-start">${photoTag(k.photo_id)}<div class="grow"><b>${esc(k.name)}</b><div class="sub">${dmy(k.day)}${k.dispute_note ? ' · эътироз: «' + esc(k.dispute_note) + '»' : ''}</div>
      <div class="row" style="gap:8px;margin-top:8px"><input class="txt" name="p${k.id}" type="number" inputmode="numeric" min="0" placeholder="нархи, сўм" value="${k.amount ?? ''}" style="flex:1">
      <button class="btn dark sm" data-act="tkPrice" data-id="${k.id}">Сақлаш</button></div>
      <div class="sub" style="margin-top:6px"><button class="link" data-act="tkPrepaid" data-id="${k.id}">Пули алоҳида тўланган</button> · <button class="link" data-act="tkCancel" data-id="${k.id}">Бекор қилиш</button></div></div></div>`;
  return `${backBtn}<h1 class="page">Корхонадан олинганлар</h1>
  <p class="lead">Ходимлар олган нарсасини шу заҳоти ёзади. Сиз ҳар бирига нарх қўясиз. Ой охирида улар ойлик ҳисобда ходимга кўринади ва у тасдиқлагач ойликдан ушланади.</p>
  ${need.length ? Object.entries(byUser).map(([n, ks]) => `<h2>${esc(n)} · ${ks.length} та</h2><div class="list">${ks.map(row).join('')}</div>`).join('') : '<div class="banner ok">Нарх кутаётган ёзув йўқ.</div>'}
  ${priced.length ? `<h2>Нарх қўйилган, ойлик ҳисобни кутмоқда</h2><div class="list">${priced.map((k) => `<div class="li">${photoTag(k.photo_id)}<div class="grow"><b>${esc(k.uname)}</b>: ${esc(k.name)}<div class="sub">${dmy(k.day)}</div></div>
    <div style="text-align:right"><b>${fmt(k.amount)}</b><br><button class="link" data-act="tkRe" data-id="${k.id}">Ўзгартириш</button></div></div>`).join('')}</div>` : ''}`;
}

async function rates() {
  top('Тарифлар');
  const [r, meta] = await Promise.all([api('rates_list'), cache.meta || api('prod_meta')]);
  cache.meta = meta;
  const W = { bichish: 'Бичиш', tikish: 'Тикиш' };
  return `${backBtn}<h1 class="page">Дона тарифлари</h1><p class="lead">Бичиш ва тикиш тарифлари алоҳида. Эски тариф ўзгармайди: янги нарх янги санадан амал қилади.</p>
  ${r.missing && r.missing.n ? `<div class="banner warn">${fmt(r.missing.q)} дона иш учун тариф йўқ эди. Тариф қўшгач, «Тарифсиз ишларга қўллаш»ни босинг.</div><button class="btn ghost" style="margin-top:8px" data-act="ratesFill">Тарифсиз ишларга қўллаш</button>` : ''}
  <button class="btn dark" style="margin-top:12px" data-act="rateAdd">+ Тариф қўшиш</button>
  <h2>Буюртма (заказ) кўйлак</h2>
  <div class="card"><p class="sub" style="margin-top:0">Мижоз алоҳида буюртма берган кийим учун бир дона ҳақ. Ойлик варақада оддий ишдан алоҳида қаторда чиқади.</p><div class="bal">
    <span>Бичиш</span><span class="v">${r.zakaz.bichish == null ? '<span class="tag bad">қўйилмаган</span>' : fmt(r.zakaz.bichish) + ' сўм'}</span>
    <span>Тикиш</span><span class="v">${r.zakaz.tikish == null ? '<span class="tag bad">қўйилмаган</span>' : fmt(r.zakaz.tikish) + ' сўм'}</span>
  </div><div class="actions"><button class="btn ghost sm" data-act="ordRates">Заказ тарифини ўзгартириш</button></div></div>
  ${['tikish', 'bichish'].map((w) => `<h2>${W[w]}</h2>${r.rates.filter((x) => x.work === w).length ? `<div class="list">${r.rates.filter((x) => x.work === w).map((x) => `<div class="li"><div class="grow"><b>${esc(x.type_name)}${x.model ? ' «' + esc(x.model) + '»' : ' (барча моделлар)'}</b><div class="sub">${dmy(x.valid_from)} дан${x.note ? ' · ' + esc(x.note) : ''}</div></div><div class="r">${fmt(x.price)} сўм</div></div>`).join('')}</div>` : '<div class="empty">Тариф йўқ.</div>'}`).join('')}`;
}

// ---------- Созламалар ----------
async function settings() {
  top('Созламалар');
  const [s, cat] = await Promise.all([api('settings_get'), api('catalog_list')]);
  return `<h1 class="page">Созламалар</h1>
  <h2>Корхона жойлашуви</h2>
  <div class="card">
    ${s.geo_set ? `<div class="sub">Белгиланган: ${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}</div>` : '<div class="banner warn">Ҳали белгиланмаган.</div>'}
    <button class="btn ghost" style="margin-top:10px" data-act="geoHere">📍 Ҳозирги жойимни корхона деб белгилаш</button>
    <div class="row2" style="margin-top:10px"><input class="txt" id="sLat" inputmode="decimal" placeholder="Кенглик" value="${esc(s.lat || '')}"><input class="txt" id="sLng" inputmode="decimal" placeholder="Узунлик" value="${esc(s.lng || '')}"></div>
    <div class="row2" style="margin-top:10px"><div><div class="lbl">Рухсат радиуси, м</div><input class="txt" id="sRad" type="number" value="${esc(s.radius)}"></div><div><div class="lbl">Энг паст аниқлик, м</div><input class="txt" id="sAcc" type="number" value="${esc(s.max_acc)}"></div></div>
    <div class="field"><div class="lbl">Face ID / бармоқ изи талаб қилинсин</div>${chips('bio', [['1', 'Ҳа'], ['0', 'Йўқ']], s.require_bio)}</div>
    <p class="hint">Жойлашув фақат ходим тугмани босганда текширилади ва координаталар сақланмайди. Биометрика — телефоннинг ўз текшируви; юз ёки бармоқ изи базага йиғилмайди. Бу текширувлар жой ва шахсни мутлақ кафолатламайди.</p>
  </div>
  <h2>Иш вақти</h2>
  <div class="card">
    <div class="row2"><div><div class="lbl">Бошланиши</div><input class="txt" id="sWs" type="time" value="${esc(s.work_start)}"></div><div><div class="lbl">Тугаши</div><input class="txt" id="sWe" type="time" value="${esc(s.work_end)}"></div></div>
    <div class="row2" style="margin-top:10px"><div><div class="lbl">Танаффус бошланиши</div><input class="txt" id="sBs" type="time" value="${esc(s.break_start)}"></div><div><div class="lbl">Танаффус, дақиқа</div><input class="txt" id="sBm" type="number" value="${esc(s.break_min)}"></div></div>
    <div class="row2" style="margin-top:10px"><div><div class="lbl">Кечикиш чегараси, дақ</div><input class="txt" id="sGr" type="number" value="${esc(s.grace_min)}"></div><div><div class="lbl">Тўлиқ кун (соф), дақ</div><input class="txt" id="sFm" type="number" value="${esc(s.full_min)}"></div></div>
    <p class="hint">Тизим автоматик мукофот ёки жарима ёзмайди — фақат кўрсаткичларни кўрсатади.</p>
  </div>
  <button class="btn dark" style="margin-top:12px" data-act="setSave">Сақлаш</button>
  <h2>Маҳсулот турлари <button data-act="typeAdd">+ Қўшиш</button></h2>
  <div class="chips">${cat.type.map((t) => `<span class="chip">${esc(t.name)}</span>`).join('')}</div>
  <h2>Хавфсизлик</h2>
  <div class="stack"><button class="big" data-act="go" data-s="r_audit"><span class="ic">📜</span><span>Аудит журнали<small>Ким, қачон, нимани ўзгартирди</small></span></button>
  <button class="big" data-act="export"><span class="ic">💾</span><span>Захира нусха<small>Бутун база ботга файл қилиб юборилади</small></span></button></div>`;
}

// Аудит ёзувларини одам тушунадиган матнга ўгириш. Янги амал қўшилса, шу рўйхатга бир қатор қўшилади.
const AUD = {
  owner_registered: ['👑', 'Раҳбар рўйхатдан ўтди'], request_created: ['📝', 'Янги ходим сўрови'], request_resent: ['📝', 'Сўров қайта юборилди'],
  profile_filled: ['📝', 'Маълумотлар тўлдирилди'], request_approved: ['✅', 'Ходим тасдиқланди'], request_rejected: ['⛔', 'Сўров рад этилди'],
  user_deactivated: ['🚪', 'Ходим фаолсизлантирилди'], user_reactivated: ['🔁', 'Ходим қайта фаоллаштирилди'], inspect_right: ['🔎', 'Текшириш ваколати ўзгарди'], remote_changed: ['🏠', 'Иш жойи ўзгартирилди'],
  rahbar_added: ['👑', 'Янги раҳбар қўшилди'], settings_changed: ['⚙️', 'Созламалар ўзгартирилди'], catalog_added: ['➕', 'Каталогга қўшилди'],
  rate_added: ['💲', 'Тариф белгиланди'], earning_rate_filled: ['💲', 'Иш ҳақига тариф қўйилди'], export: ['💾', 'Захира нусха олинди'],
  bio_enrolled: ['🔐', 'Биометрика уланди'], bio_reenrolled: ['🔐', 'Биометрика қайта уланди'],
  att_exception_requested: ['🕒', 'Давомат истисноси сўралди'], att_exception_approved: ['🕒', 'Давомат истисноси тасдиқланди'], att_exception_rejected: ['🕒', 'Давомат истисноси рад этилди'],
  batch_created: ['📦', 'Янги партия очилди'], cut_added: ['✂︎', 'Бичим қўшилди'], opening_added: ['📦', 'Бошланғич қолдиқ киритилди'],
  transfer_created: ['➡️', 'Иш берилди'], transfer_cancelled: ['↩️', 'Иш бериш бекор қилинди'], transfer_accepted: ['✅', 'Иш қабул қилинди'],
  transfer_disputed: ['⚠️', 'Иш беришда тафовут'], transfer_resolved: ['✔️', 'Тафовут ҳал қилинди'],
  submitted: ['📤', 'Тикилган иш топширилди'], inspected: ['🔎', 'Иш текширилди'], writeoff: ['🗑', 'Ҳисобдан чиқарилди'],
  takeaway_created: ['🛍', 'Корхонадан олинган нарса ёзилди'], takeaway_priced: ['💲', 'Олинган нарсага нарх қўйилди'], takeaway_agreed: ['✅', 'Ходим олинган нарсани тасдиқлади'],
  takeaway_disputed: ['⚠️', 'Ходим олинган нарсага эътироз қилди'], takeaway_cancelled: ['↩️', 'Олинган нарса бекор қилинди'], takeaway_settled: ['💵', 'Олинган нарса учун ҳисоблашилди'],
  payment_created: ['💵', 'Пул берилди'], payment_confirmed: ['✅', 'Ходим пулни олганини тасдиқлади'], payment_disputed: ['⚠️', 'Ходим тўловда тафовут ёзди'],
  payment_cancelled: ['↩️', 'Тўлов бекор қилинди'], payment_reverse_requested: ['↩️', 'Тўловни бекор қилиш сўралди'], payment_reversed: ['↩️', 'Тўлов бекор қилинди (ходим рози)'],
  payment_reverse_refused: ['⚠️', 'Ходим тўловни бекор қилишга рози эмас'],
  adjustment_created: ['🧾', 'Тузатиш киритилди'], adjustment_confirmed: ['✅', 'Ходим тузатишни тасдиқлади'], adjustment_disputed: ['⚠️', 'Ходим тузатишга эътироз қилди'],
  adjustment_cancelled: ['↩️', 'Тузатиш бекор қилинди'], period_closed: ['🔒', 'Давр ёпилди'],
  appeal_created: ['📨', 'Мурожаат'], appeal_cancelled: ['↩️', 'Мурожаат бекор қилинди'], appeal_answered: ['💬', 'Мурожаатга жавоб'],
  appeal_approved: ['✅', 'Рухсат берилди'], appeal_declined: ['⛔', 'Рухсат рад этилди'],
  order_created: ['📐', 'Янги буюртма'], order_updated: ['✏️', 'Буюртма таҳрирланди'], order_due: ['📅', 'Буюртма муддати ўзгарди'], order_priced: ['🏷', 'Буюртма нархи'],
  order_cut: ['✂︎', 'Буюртма бичилди'], order_given: ['➜', 'Буюртма тикувчига берилди'], order_sewing: ['🧵', 'Тикувчи буюртмани қабул қилди'], order_sewn: ['🧵', 'Буюртма тикиб топширилди'],
  order_ready: ['✅', 'Буюртма тайёр'], order_fixing: ['🛠', 'Буюртма тузатишга қайтди'], order_delivered: ['🎁', 'Буюртма мижозга топширилди'], order_abandoned: ['⚠︎', 'Мижоз буюртмани олмади'],
  order_closed: ['🔒', 'Буюртма ёпилди'], order_cancelled: ['⛔', 'Буюртма бекор қилинди'], order_paid: ['💵', 'Мижоз пул берди'], order_pay_cancelled: ['↩️', 'Мижоз тўлови бекор қилинди'],
  order_rates_set: ['🏷', 'Заказ тарифи ўзгарди'], cash_handover: ['💼', 'Бичувчи мижоз пулини топширди'], cash_handover_cancelled: ['↩️', 'Пул топшириш бекор қилинди'],
  cash_handover_confirmed: ['✅', 'Раҳбар пулни олди'], cash_handover_rejected: ['⛔', 'Раҳбар пулни олмаганини ёзди'],
  avans_requested: ['💸', 'Аванс сўралди'], avans_cancelled: ['↩️', 'Аванс сўрови бекор қилинди'], avans_given: ['💵', 'Аванс берилди'], avans_declined: ['⛔', 'Аванс рад этилди'],
  reckoning_sent: ['🧮', 'Ойлик ҳисоб юборилди'], reckoning_confirmed: ['✅', 'Ходим ойлик ҳисобни тасдиқлади'], reckoning_disputed: ['⚠️', 'Ходим ойлик ҳисобга эътироз қилди'],
};
const SET_N = { radius: 'Ҳудуд радиуси (м)', max_acc: 'Жойлашув аниқлиги (м)', work_start: 'Иш бошланиши', work_end: 'Иш тугаши', break_start: 'Тушлик',
  break_min: 'Тушлик (дақ.)', grace_min: 'Кечикишга рухсат (дақ.)', full_min: 'Тўлиқ кун (дақ.)', require_bio: 'Биометрика талаб қилинади' };
const ST_N = { pending: 'кутилмоқда', active: 'фаол', inactive: 'фаол эмас', rejected: 'рад этилган', approved: 'тасдиқланган', confirmed: 'тасдиқланган',
  disputed: 'баҳсли', cancelled: 'бекор', accepted: 'қабул қилинган', resolved: 'ҳал қилинган', agreed: 'келишилган' };
const so = (n) => `${fmt(n)} сўм`;
function audDetails(a) {
  let af = {}, bf = {};
  try { af = JSON.parse(a.after || 'null') || {}; } catch {}
  try { bf = JSON.parse(a.before || 'null') || {}; } catch {}
  const v = (x) => (Array.isArray(x) ? x[1] : x);
  const out = [];
  switch (a.action) {
    case 'settings_changed':
      if ('lat' in af || 'lng' in af) out.push('Корхона жойи белгиланди');
      for (const [k, x] of Object.entries(af)) {
        if (k === 'lat' || k === 'lng') continue;
        const val2 = v(x);
        out.push(`${SET_N[k] || k}: ${k === 'require_bio' ? (val2 === '1' ? 'ҳа' : 'йўқ') : esc(val2)}`);
      }
      break;
    case 'owner_registered': case 'request_created': case 'request_approved': case 'rahbar_added':
      if (af.role) out.push(`Лавозим: ${RN[af.role] || esc(af.role)}`); break;
    case 'inspect_right': out.push(af.can_inspect ? 'Ваколат берилди' : 'Ваколат олинди'); break;
    case 'remote_changed': out.push(af.remote ? 'Уйдан ишлайди' : 'Корхонада ишлайди'); break;
    case 'catalog_added': if (af.name) out.push(esc(af.name)); break;
    case 'rate_added': out.push(`${af.work === 'bichish' ? 'Бичиш' : 'Тикиш'}${af.model ? ' «' + esc(af.model) + '»' : ''}: ${so(af.price)} / дона${af.valid_from ? ', ' + dmy(af.valid_from) + ' дан' : ''}`); break;
    case 'earning_rate_filled': if (af.amount != null) out.push(so(af.amount)); break;
    case 'batch_created': if (af.code) out.push(`Партия ${esc(af.code)}`); break;
    case 'transfer_created': if (af.items) out.push(`${fmt(af.items.reduce((t, i) => t + Number(i[1] || 0), 0))} дона`); if (af.code) out.push(esc(af.code)); break;
    case 'submitted': if (af.qty) out.push(`${fmt(af.qty)} дона`); break;
    case 'inspected': { const p2 = [af.accepted && `қабул ${fmt(af.accepted)}`, af.rework && `қайта ишлашга ${fmt(af.rework)}`, af.writeoff && `ҳисобдан чиқди ${fmt(af.writeoff)}`].filter(Boolean); if (p2.length) out.push(p2.join(', ') + ' дона'); break; }
    case 'writeoff': if (af.qty) out.push(`${fmt(af.qty)} дона`); break;
    case 'takeaway_priced': case 'takeaway_agreed': if (af.amount != null) out.push(`${so(af.amount)}${af.pay_method ? ' · ' + (METHOD[af.pay_method] || '') : ''}`); break;
    case 'takeaway_settled': if (af.amount != null) out.push(so(af.amount)); break;
    case 'payment_created': out.push(`${so(af.amount)}${af.kind === 'avans' ? ' (аванс)' : ''}`); break;
    case 'payment_disputed': if (af.got != null) out.push(`Ходим айтишича олгани: ${so(af.got)}`); break;
    case 'adjustment_created': if (af.amount != null) out.push(so(af.amount)); break;
    case 'avans_requested': if (af.amount) out.push(so(af.amount)); break;
    case 'appeal_created': case 'appeal_approved': case 'appeal_declined': out.push([MJ_K[af.kind] || '', af.ref ? esc(af.ref) : '', af.from ? `${dmy(af.from)}${af.to !== af.from ? ' – ' + dmy(af.to) : ''}` : ''].filter(Boolean).join(' · ')); break;
    case 'order_created': out.push([esc(af.code || ''), esc(af.customer || ''), esc(af.product || ''), af.due ? 'муддат ' + dmy(af.due) : ''].filter(Boolean).join(' · ')); break;
    case 'order_paid': case 'order_pay_cancelled': case 'cash_handover': case 'cash_handover_confirmed': if (af.amount || bf.amount) out.push(so(af.amount || bf.amount)); break;
    case 'order_priced': if (af.price != null) out.push(so(af.price)); break;
    case 'order_due': if (af.due_day) out.push(`${dmy(bf.due_day)} → ${dmy(af.due_day)}`); break;
    case 'order_rates_set': out.push(`бичиш ${af.bichish != null ? so(af.bichish) : '—'} · тикиш ${af.tikish != null ? so(af.tikish) : '—'}`); break;
    case 'avans_given': if (af.amount) out.push(`${so(af.amount)}${af.payment ? ' · ' + esc(af.payment) : ''}`); break;
    case 'reckoning_sent': case 'reckoning_confirmed': out.push(`${esc(af.period || '')} · ${af.total >= 0 ? 'қўлига ' + so(af.total) : 'қарз ' + so(-af.total)}`); break;
    case 'reckoning_disputed': if (af.period) out.push(esc(af.period)); break;
    case 'takeaway_created': out.push([esc(af.name || ''), af.qty ? fmt(af.qty) + ' дона' : '', af.photo ? 'расм билан' : ''].filter(Boolean).join(' · ')); break;
    case 'period_closed': if (af.from) out.push(`${dmy(af.from)} – ${dmy(af.to)}`); break;
    case 'export': if (af.tables) out.push(`${af.tables} та жадвал`); break;
    default:
      if (!AUD[a.action] && (bf.status || af.status)) out.push(`${ST_N[bf.status] || ''} → ${ST_N[af.status] || ''}`);
  }
  return out.filter(Boolean).join(' · ');
}

async function audit() {
  top('Аудит');
  const rows = await api('audit_list', { limit: 200 });
  const who = (a) => nm(a) || 'Тизим';
  const subj = (a) => { const s = `${a.s_first || ''} ${a.s_last || ''}`.trim(); return s && s !== nm(a) ? s : ''; };
  return `${backBtn}<h1 class="page">Аудит журнали</h1>
  <p class="hint">Ким, қачон, нима қилгани. Бу ёзувларни ўчириб ёки ўзгартириб бўлмайди.</p>
  ${rows.length ? `<div class="list">${rows.map((a) => {
    const [ic, title] = AUD[a.action] || ['•', a.action];
    const d = audDetails(a), s = subj(a);
    return `<div class="li"><div class="ava" style="background:transparent;font-size:20px">${ic}</div><div class="grow"><b>${esc(title)}</b>${s ? ` · ${esc(s)}` : ''}
      ${d ? `<div>${d}</div>` : ''}
      <div class="sub">${dt(a.at)} · ${esc(who(a))}${a.reason ? ' · Сабаб: «' + esc(a.reason) + '»' : ''}</div></div></div>`;
  }).join('')}</div>` : '<p class="hint">Ҳали ёзув йўқ.</p>'}`;
}

const MJ_K = { leave: 'Рухсат сўраш', cut_error: 'Бичимдаги хато', shortage: 'Камомад', conflict: 'Ходим билан келишмовчилик', equipment: 'Ускуна ёки мато', other: 'Бошқа' };
const MJ_ST = { open: ['Жавоб кутмоқда', 'warn'], answered: ['Жавоб берилди', 'ok'], approved: ['Рухсат берилди', 'ok'], declined: ['Рад этилди', 'bad'], cancelled: ['Ходим бекор қилди', ''] };
async function mjScr() {
  top('Мурожаатлар');
  const r = await api('mj_list', {});
  const card = (a, open) => `<div class="card"><div class="row">${ava(a.name, a.user_id, 36)}<div class="grow"><div class="title">${esc(a.name)} · ${MJ_K[a.kind]}${a.ref ? ' · ' + esc(a.ref) : ''}</div>
    <div class="sub">${RN[a.role] || ''} · ${dt(a.created_at)}${a.from_day ? ` · <b>${dmy(a.from_day)}${a.to_day !== a.from_day ? ' — ' + dmy(a.to_day) : ''}</b> (${a.days} кун)` : ''}</div></div>${open ? '' : tag(MJ_ST[a.status])}</div>
    ${a.text ? `<div style="margin-top:8px">«${esc(a.text)}»</div>` : ''}${a.photo_id ? `<div style="margin-top:8px">${photoTag(a.photo_id, 'ph lg')}</div>` : ''}${voiceTag(a.voice_id)}
    ${a.answer ? `<div class="sub" style="margin-top:6px">Жавоб (${esc(a.answered_by || '')}): «${esc(a.answer)}»</div>` : ''}
    ${open ? (a.kind === 'leave' ? `<div class="actions"><button class="btn ok" data-act="mjAns" data-id="${a.id}" data-d="approve">Рухсат бериш</button><button class="btn ghost" data-act="mjAns" data-id="${a.id}" data-d="decline">Рад этиш</button></div>`
      : `<div class="actions"><button class="btn dark" data-act="mjAns" data-id="${a.id}" data-d="">Жавоб ёзиш</button></div>`) : ''}</div>`;
  return `${backBtn}<h1 class="page">Мурожаатлар</h1>
  <p class="lead">Ходимлар сизга ёзган рухсат сўровлари ва муаммолар. Буни фақат раҳбар кўради.</p>
  ${r.leaveToday.length ? `<div class="banner ok">Бугун рухсатда: ${r.leaveToday.map(esc).join(', ')}</div>` : ''}
  <h2>Жавоб кутаётган · ${r.open.length}</h2>
  ${r.open.length ? r.open.map((a) => card(a, true)).join('') : '<div class="empty">Янги мурожаат йўқ.</div>'}
  ${r.done.length ? `<h2>Тарих</h2>${r.done.map((a) => card(a, false)).join('')}` : ''}`;
}

registerScreens({ r_mj: mjScr, r_home: home, r_staff: staff, r_prod: prod, r_money: money, r_set: settings, r_insp: insp, r_disputes: disputes, r_batches: batches, r_batch: batch,
  r_where: where, r_report: report, r_att: attRep, r_payslip: payslipScr, r_tk: tkScr, r_rates: rates, r_audit: audit });

// ---------- Тугмалар ----------
const done = async (msg) => { closeSheet(); toast(msg); await refresh(); };
const reasonSheet = (title, lead, actName, id, btn, cls = 'dark') => openSheet(`<h3>${title}</h3>${lead ? `<p class="lead">${lead}</p>` : ''}
  <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Сабаби" autofocus></textarea></div>
  <div class="foot"><button class="btn ${cls}" data-act="${actName}" data-id="${id}">${btn}</button></div>`);
const needReason = () => { if (!val('reason')) { sheetErr('Сабабини ёзинг.'); return false; } return true; };

on({
  mjAns: (el) => {
    const d = el.dataset.d;
    openSheet(`<h3>${d === 'approve' ? 'Рухсат бериш' : d === 'decline' ? 'Рад этиш' : 'Жавоб'}</h3>
      <div class="field"><textarea class="txt" name="answer" maxlength="500" placeholder="${d ? 'Изоҳ (ихтиёрий)' : 'Жавобингиз: нима чора кўрилади'}" autofocus></textarea></div>
      <div class="foot"><button class="btn dark" data-act="mjAnsSave" data-id="${el.dataset.id}" data-d="${d}">Юбориш</button></div>`);
  },
  mjAnsSave: async (el) => {
    const d = el.dataset.d;
    if (!d && !val('answer')) return sheetErr('Жавоб ёзинг.');
    if (await act('mj_answer', { id: Number(el.dataset.id), decision: d || undefined, answer: val('answer') }, el)) await done('Ходимга юборилди');
  },
  tab: (el) => show(el.dataset.s, {}, { root: true }),
  go: (el) => show(el.dataset.s, { id: el.dataset.id }),
  noop: () => {},
  approve: async (el) => {
    openSheet(`<h3>Сўровни тасдиқлаш</h3><div class="field"><div class="lbl">Роли</div>${chips('role', [['bichuvchi', 'Бичувчи'], ['tikuvchi', 'Тикувчи']], el.dataset.role)}</div>
      <div class="foot"><button class="btn ok" data-act="approveSave" data-id="${el.dataset.id}">Тасдиқлаш</button></div>`);
  },
  approveSave: async (el) => { await act('staff_decide', { user_id: Number(el.dataset.id), approve: true, role: pressed('role') }, el); await done('Тасдиқланди. Ходимга хабар кетди.'); },
  reject: (el) => openSheet(`<h3>Рад этиш</h3><div class="field"><textarea class="txt" name="reason" maxlength="200" placeholder="Сабаби (ходим кўради)"></textarea></div>
    <div class="foot"><button class="btn bad" data-act="rejectSave" data-id="${el.dataset.id}">Рад этиш</button></div>`),
  rejectSave: async (el) => { await act('staff_decide', { user_id: Number(el.dataset.id), approve: false, note: val('reason') }, el); await done('Рад этилди'); },
  excOk: async (el) => { await act('att_exc_decide', { id: Number(el.dataset.id), approve: true }, el); toast('Тасдиқланди'); await refresh(); },
  excNo: (el) => reasonSheet('Истиснони рад этиш', '', 'excNoSave', el.dataset.id, 'Рад этиш', 'bad'),
  excNoSave: async (el) => { if (!needReason()) return; await act('att_exc_decide', { id: Number(el.dataset.id), approve: false, note: val('reason') }, el); await done('Рад этилди'); },
  staffOpen: (el) => {
    const u = cache.staff.find((x) => x.id === Number(el.dataset.id));
    const active = u.status === 'active';
    openSheet(`<h3>${esc(nm(u))}</h3><p class="lead">${RN[u.role]} · туғилган ${dmy(u.birth_date)} · Telegram ID ${u.tg_id}</p>
      <div class="stack">
        ${u.role !== 'rahbar' ? `<button class="btn ghost" data-act="go2" data-s="r_payslip" data-id="${u.id}">Ҳисоб варақаси</button>` : ''}
        ${active && u.role !== 'rahbar' ? `<button class="btn ghost" data-act="remoteToggle" data-id="${u.id}" data-on="${u.remote ? 0 : 1}">${u.remote ? '🏭 Корхонада ишлайди деб белгилаш' : '🏠 Уйдан ишлайди деб белгилаш'}</button>` : ''}
        ${active && u.role !== 'rahbar' ? `<button class="btn ghost" data-act="inspToggle" data-id="${u.id}" data-on="${u.can_inspect ? 0 : 1}">${u.can_inspect ? 'Текшириш ваколатини олиш' : 'Текшириш ваколатини бериш'}</button>` : ''}
        ${active ? `<button class="btn bad" data-act="deact" data-id="${u.id}">Фаолсизлантириш (ишдан кетди)</button>` : u.status === 'inactive' ? `<button class="btn ok" data-act="react" data-id="${u.id}">Қайта фаоллаштириш</button>` : ''}
      </div><p class="hint">Фаолсизлантирилганда кириш ёпилади, иш ва пул тарихи сақланади.</p>`);
  },
  go2: (el) => { closeSheet(); return show(el.dataset.s, { id: el.dataset.id }); },
  remoteToggle: async (el) => { await act('staff_remote', { user_id: Number(el.dataset.id), on: el.dataset.on === '1' }, el); await done('Сақланди'); },
  inspToggle: async (el) => { await act('staff_inspect', { user_id: Number(el.dataset.id), on: el.dataset.on === '1' }, el); await done('Сақланди'); },
  deact: (el) => reasonSheet('Фаолсизлантириш', 'Кириш ёпилади. Олдинги иш ва пул тарихи сақланади.', 'deactSave', el.dataset.id, 'Фаолсизлантириш', 'bad'),
  deactSave: async (el) => { if (!needReason()) return; await act('staff_status', { user_id: Number(el.dataset.id), active: false, reason: val('reason') }, el); await done('Фаолсизлантирилди'); },
  react: (el) => reasonSheet('Қайта фаоллаштириш', 'Бу амал аудитда сабаби билан сақланади.', 'reactSave', el.dataset.id, 'Фаоллаштириш', 'ok'),
  reactSave: async (el) => { if (!needReason()) return; await act('staff_status', { user_id: Number(el.dataset.id), active: true, reason: val('reason') }, el); await done('Фаоллаштирилди'); },
  addBoss: () => openSheet(`<h3>Янги раҳбар қўшиш</h3><p class="lead">Одамнинг Telegram ID рақамини киритинг (у @userinfobot орқали билиши мумкин). Кейин у «Раҳбар» тугмасини босиб, маълумотини бир марта киритади.</p>
    <div class="field"><div class="lbl">Telegram ID</div><input class="txt" name="tg" inputmode="numeric"></div>
    <div class="row2"><div class="field"><div class="lbl">Исм</div><input class="txt" name="fn"></div><div class="field"><div class="lbl">Фамилия</div><input class="txt" name="ln"></div></div>
    <div class="foot"><button class="btn dark" data-act="addBossSave">Қўшиш</button></div>`),
  addBossSave: async (el) => { if (!(num('tg') > 0)) return sheetErr('Telegram ID ни киритинг.'); await act('staff_add_rahbar', { tg_id: num('tg'), first_name: val('fn') || 'Раҳбар', last_name: val('ln') || '-' }, el); await done('Раҳбар қўшилди'); },
  inspOpen: (el) => {
    const s = cache.insp.find((x) => x.id === Number(el.dataset.id));
    openSheet(`<h3>Текшириш: ${esc(s.name)}</h3><p class="lead">${prodLabel(s)} · ${esc(s.code)} · ${esc(s.size)} · ${fmt(s.open_qty)} дона</p>
      <div class="field"><div class="lbl">Қабул қилинди</div>${qty('acc', s.open_qty, s.open_qty)}</div>
      <div class="field"><div class="lbl">Қайта ишлашга қайтарилди</div>${qty('rw', 0, s.open_qty)}</div>
      <div class="field"><div class="lbl">Брак (ҳисобдан чиқариш)</div>${qty('wo', 0, s.open_qty)}</div>
      <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Қайтариш/брак сабаби"></textarea></div>
      <p class="hint">Санамаган қисмини кейин текширасиз — у текширувда қолади. Ходим автоматик айбдор деб кўрсатилмайди.</p>
      <div class="foot"><button class="btn dark" data-act="inspSave" data-id="${s.id}" data-max="${s.open_qty}">Сақлаш</button></div>`);
  },
  inspSave: async (el) => {
    const a = num('acc'), rw = num('rw'), wo = num('wo');
    if (a + rw + wo < 1) return sheetErr('Сонини киритинг.');
    if (a + rw + wo > Number(el.dataset.max)) return sheetErr(`Жами ${el.dataset.max} донадан ошмасин.`);
    if ((rw || wo) && !val('reason')) return sheetErr('Қайтариш/брак сабабини ёзинг.');
    await act('inspect', { submission_id: Number(el.dataset.id), accepted: a, rework: rw, writeoff: wo, reason: val('reason') }, el);
    await done('Сақланди');
  },
  resolve: (el) => {
    const t = cache.disp.find((x) => x.id === Number(el.dataset.id));
    openSheet(`<h3>${esc(t.code)}: қарор</h3><p class="lead">Тикувчига ўтадиган сонни белгиланг.</p>
      ${t.items.map((i) => `<div class="card" style="padding:12px"><b>${esc(i.code)} · ${esc(i.size)} · ${esc(i.color)}</b><div class="sub">ёзилган ${i.qty}, саналган ${i.counted ?? '—'}</div><div style="margin-top:8px" data-item="${i.id}">${qty('a' + i.id, i.counted ?? i.qty, i.qty)}</div></div>`).join('')}
      <div class="field"><div class="lbl">Қолган дона</div>${chips('rest', [['free', 'Тарқатилмаганга қайтсин'], ['writeoff', 'Ҳисобдан чиқарилсин']], 'free')}</div>
      <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Изоҳ (мажбурий)"></textarea></div>
      <div class="foot"><button class="btn dark" data-act="resolveSave" data-id="${t.id}">Сақлаш</button></div>`);
  },
  resolveSave: async (el) => {
    if (!needReason()) return;
    const items = $$('#sheetBody [data-item]').map((d) => ({ item_id: Number(d.dataset.item), accept: Number(d.querySelector('input').value) || 0 }));
    await act('transfer_resolve', { id: Number(el.dataset.id), items, rest: pressed('rest'), note: val('reason') }, el);
    await done('Ҳал қилинди');
  },
  woOpen: (el) => {
    const r = cache.where[Number(el.dataset.i)];
    openSheet(`<h3>Ҳисобдан чиқариш</h3><p class="lead">${esc(r.label)}${r.name ? ' · ' + esc(r.name) : ''} · ${STATE_NAMES[L][r.state]} ${fmt(r.qty)} дона</p>
      <div class="field">${qty('n', 1, r.qty, 1)}</div><div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Сабаби: йўқолган, бузилган..."></textarea></div>
      <div class="foot"><button class="btn bad" data-act="woSave" data-i="${el.dataset.i}">Ҳисобдан чиқариш</button></div>`);
  },
  woSave: async (el) => {
    if (!needReason()) return;
    const r = cache.where[Number(el.dataset.i)];
    await act('writeoff', { line_id: r.line_id, state: r.state, holder: r.holder, qty: num('n'), reason: val('reason') }, el);
    await done('Ҳисобдан чиқарилди');
  },
  opening: async () => {
    const meta = cache.meta || (cache.meta = await api('prod_meta'));
    openSheet(`<h3>Бошланғич қолдиқ</h3><p class="lead">Тизимга ўтишдан олдинги ҳақиқий қолдиқни бир марта киритинг. Сабаб ва аудит билан сақланади.</p>
      <div class="field"><div class="lbl">Қаерда</div>${chips('st', [['free', 'Тарқатилмаган бичим'], ['sewing', 'Тикувчида']], 'free')}</div>
      <div class="field" id="opH" hidden><div class="lbl">Тикувчи</div>${chips('holder', meta.sewers.map((s) => [s.id, s.name]), '')}</div>
      <div class="field"><div class="lbl">Маҳсулот тури</div>${chips('type', meta.types.map((t) => [t.id, t.name]), '')}</div>
      <div class="field"><input class="txt" name="model" placeholder="Модел"></div><div class="row2"><input class="txt" name="material" placeholder="Материал"><input class="txt" name="color" placeholder="Ранг"></div>
      <div class="row2" style="margin-top:10px"><input class="txt" name="size" placeholder="Размер"><input class="txt" name="q" type="number" inputmode="numeric" placeholder="Дона"></div>
      <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Сабаби: масалан, 1-ноябр ҳолатига санаб чиқилди"></textarea></div>
      <div class="foot"><button class="btn dark" data-act="openingSave">Сақлаш</button></div>`);
    $('#sheetBody').addEventListener('change', (e) => { if (e.target.dataset.group === 'st') $('#opH').hidden = e.target.dataset.value !== 'sewing'; });
  },
  openingSave: async (el) => {
    if (!needReason()) return;
    const b = { state: pressed('st'), holder_id: Number(pressed('holder')) || undefined, type_id: Number(pressed('type')), model: val('model'), material: val('material'), color: val('color'),
      lines: [{ size: val('size'), ready: num('q') }], reason: val('reason') };
    if (!b.type_id || !b.model || !b.material || !b.color || !val('size') || !(num('q') > 0)) return sheetErr('Барча майдонларни тўлдиринг.');
    const r = await act('opening_add', b, el);
    await done(`${r.code} сақланди`);
  },
  rPer: (el) => { repP = periodFromBtn(el, repP); return refresh(); },
  aPer: (el) => { attP = periodFromBtn(el, attP); return refresh(); },
  psPer: (el) => { psP = periodFromBtn(el, psP); return refresh(); },
  tkPrice: async (el) => {
    const v = $(`[name=p${el.dataset.id}]`).value;
    if (v === '' || !(Number(v) >= 0)) return toast('Нархни ёзинг', true);
    await act('tk_price', { id: Number(el.dataset.id), amount: Number(v) }, el); toast('Нарх қўйилди'); await refresh();
  },
  tkPrepaid: async (el) => {
    const inp = $(`[name=p${el.dataset.id}]`);
    await act('tk_price', { id: Number(el.dataset.id), amount: Number(inp && inp.value) || 0, prepaid: true }, el); toast('Ойликдан ушланмайди'); await refresh();
  },
  tkRe: (el) => {
    const k = cache.tks.find((x) => x.id === Number(el.dataset.id));
    openSheet(`<h3>${esc(k.name)}</h3><div class="sub">${esc(k.uname)} · ${dmy(k.day)}</div>${photoTag(k.photo_id, 'ph lg')}
      <div class="field"><div class="lbl">Нархи, сўм</div><input class="txt" name="p${k.id}" type="number" inputmode="numeric" min="0" value="${k.amount}"></div>
      <div class="foot"><button class="btn dark" data-act="tkReSave" data-id="${k.id}">Сақлаш</button></div>`);
  },
  tkReSave: async (el) => { const v = num('p' + el.dataset.id); if (!(v >= 0)) return sheetErr('Нархни ёзинг.'); await act('tk_price', { id: Number(el.dataset.id), amount: v }, el); await done('Сақланди'); },
  avGive: (el) => openSheet(`<h3>Аванс бериш</h3><p class="lead">${el.dataset.name} га нақд пулни ҲАҚИҚАТАН бергач босинг. Ходим «Pulni oldim» ни босгач тасдиқланади ва ойлик ҳисобда айрилади.</p>
    <div class="field"><div class="lbl">Сумма, сўм</div><input class="txt" name="avamt" type="number" inputmode="numeric" value="${el.dataset.amount}"></div>
    <div class="foot"><button class="btn ok" data-act="avGiveSave" data-id="${el.dataset.id}">Берилди</button></div>`),
  avGiveSave: async (el) => { if (!(num('avamt') > 0)) return sheetErr('Суммани киритинг.'); await act('av_decide', { id: Number(el.dataset.id), give: true, amount: num('avamt') }, el); await done('Қайд этилди. Ходим «Pulni oldim» ни босади.'); },
  avNo: (el) => openSheet(`<h3>Аванс сўровини рад этиш</h3><div class="field"><input class="txt" name="avno" maxlength="200" placeholder="Изоҳ (ихтиёрий)"></div>
    <div class="foot"><button class="btn bad" data-act="avNoSave" data-id="${el.dataset.id}">Рад этиш</button></div>`),
  avNoSave: async (el) => { await act('av_decide', { id: Number(el.dataset.id), give: false, note: val('avno') }, el); await done('Рад этилди'); },
  rkSend: async (el) => {
    const r = await act('rk_send', { user_id: Number(el.dataset.id), period: el.dataset.p }, el);
    if (r) { toast('Ходимга юборилди'); await refresh(); }
  },
  payOpen: () => {
    const ps = cache.ps;
    openSheet(`<h3>Пул бердим</h3><p class="lead">${esc(ps.user.name)} га нақд пулни ҲАҚИҚАТАН бергач босинг. Ходим «Pulni oldim» ни босгач, тўлов тасдиқланади. Бу тугма банкдан пул ўтказмайди.</p>
      <div class="field"><div class="lbl"><span>Сумма, сўм</span><span>бериладиган: ${fmt(ps.now.payable)}</span></div><input class="txt" name="amount" type="number" inputmode="numeric" value="${ps.now.payable || ''}"></div>
      <div class="field"><div class="lbl">Тури</div>${chips('kind', [['oylik', 'Ойлик / ҳисоб'], ['avans', 'Аванс']], 'oylik')}</div>
      <div class="field"><div class="lbl">Берилган сана</div><input class="txt" name="day" type="date" value="${today()}" max="${today()}"></div>
      <div class="sub">Давр: ${dmy(ps.from)} — ${dmy(ps.to)} · усул: нақд</div>
      <div class="foot"><button class="btn dark" data-act="paySave" data-id="${ps.user.id}">Пул бердим</button></div>`);
  },
  paySave: async (el) => {
    const ps = cache.ps;
    if (!(num('amount') > 0)) return sheetErr('Суммани киритинг.');
    await act('pay_create', { user_id: Number(el.dataset.id), amount: num('amount'), kind: pressed('kind'), day: val('day'), from: ps.from, to: ps.to }, el);
    await done('Қайд этилди. Ҳолат: «Ходим тасдиғи кутилмоқда».');
  },
  payCancel: (el) => reasonSheet('Тўловни бекор қилиш', 'Ёзув ўчмайди, сабаби билан «бекор қилинган» бўлиб қолади.', 'payCancelSave', el.dataset.id, 'Бекор қилиш', 'bad'),
  payCancelSave: async (el) => { if (!needReason()) return; await act('pay_cancel', { id: Number(el.dataset.id), reason: val('reason') }, el); await done('Бекор қилинди'); },
  payReverse: (el) => reasonSheet('Тасдиқланган тўловни тузатиш', 'Ходим розилик берса, тўлов бекор қилинади. Бермаса, ўзгармайди.', 'payReverseSave', el.dataset.id, 'Ходимдан сўраш'),
  payReverseSave: async (el) => { if (!needReason()) return; await act('pay_reverse', { id: Number(el.dataset.id), reason: val('reason') }, el); await done('Ходимга юборилди'); },
  adjOpen: () => openSheet(`<h3>Тузатиш ёки бошланғич қолдиқ</h3><p class="lead">Фақат ҳақиқий маълумот билан. Ходим тасдиқлагачгина ҳисобга киради.</p>
    <div class="field"><div class="lbl">Тури</div>${chips('kind', [['opening', 'Бошланғич аванс/қарз'], ['correction', 'Тузатиш']], 'correction')}</div>
    <div class="field"><div class="lbl">Йўналиш</div>${chips('sign', [['1', 'Ходимга қўшиш (+)'], ['-1', 'Ходимдан айириш (−)']], '1')}</div>
    <div class="field"><div class="lbl">Сумма, сўм</div><input class="txt" name="amount" type="number" inputmode="numeric"></div>
    <div class="field"><textarea class="txt" name="reason" maxlength="300" placeholder="Сабаби (мажбурий)"></textarea></div>
    <div class="foot"><button class="btn dark" data-act="adjSave">Ходимга юбориш</button></div>`),
  adjSave: async (el) => {
    if (!(num('amount') > 0)) return sheetErr('Суммани киритинг.');
    if (!needReason()) return;
    await act('adj_create', { user_id: cache.ps.user.id, amount: num('amount') * Number(pressed('sign') || 1), kind: pressed('kind'), reason: val('reason') }, el);
    await done('Ходим тасдиғига юборилди');
  },
  adjCancel: (el) => reasonSheet('Тузатишни бекор қилиш', '', 'adjCancelSave', el.dataset.id, 'Бекор қилиш', 'bad'),
  adjCancelSave: async (el) => { if (!needReason()) return; await act('adj_cancel', { id: Number(el.dataset.id), reason: val('reason') }, el); await done('Бекор қилинди'); },
  closeP: async (el) => { await act('period_close', { user_id: cache.ps.user.id, from: cache.ps.from, to: cache.ps.to }, el); toast('Ойлик ёпилди'); await refresh(); },
  tkSet: async (el) => {
    const k = cache.tks.find((x) => x.id === Number(el.dataset.id));
    act('tk_review', { id: k.id }).catch(() => {});
    openSheet(`<h3>${esc(k.name)}</h3><p class="lead">${TK_KIND[k.kind]} · ${k.qty} ${esc(k.unit || '')} · ${dmy(k.day)}${k.proposed ? ' · ходим таклифи ' + fmt(k.proposed) + ' сўм' : ' · ходим нархни билмайди'}${k.note ? ' · «' + esc(k.note) + '»' : ''}</p>
      <div class="field"><div class="lbl">Якуний сумма (жами), сўм</div><input class="txt" name="amount" type="number" inputmode="numeric" value="${k.amount ?? k.proposed ?? ''}"></div>
      <div class="field"><div class="lbl">Тўлов усули</div>${chips('m', Object.entries(METHOD), k.pay_method || '')}</div>
      <div class="field"><div class="lbl">Омбор/савдо чиқими (агар бўлса)</div><input class="txt" name="ref" maxlength="80" value="${esc(k.stock_ref || '')}" placeholder="масалан: чиқим №17 — қолдиқ қайта камайтирилмайди"></div>
      <p class="hint">«Ойлик билан ҳисоблашиш» фақат ходимнинг аниқ розилиги билан. Олдиндан тўланган нарса ойликдан айирилмайди.</p>
      <div class="foot"><button class="btn dark" data-act="tkSetSave" data-id="${k.id}">Ходим тасдиғига юбориш</button></div>`);
  },
  tkSetSave: async (el) => {
    if (!(num('amount') > 0)) return sheetErr('Суммани киритинг.');
    if (!pressed('m')) return sheetErr('Тўлов усулини танланг.');
    await act('tk_set', { id: Number(el.dataset.id), amount: num('amount'), pay_method: pressed('m'), stock_ref: val('ref') }, el);
    await done('Ходимга юборилди');
  },
  tkCancel: (el) => reasonSheet('Ёзувни бекор қилиш', '', 'tkCancelSave', el.dataset.id, 'Бекор қилиш', 'bad'),
  tkCancelSave: async (el) => { if (!needReason()) return; await act('tk_cancel', { id: Number(el.dataset.id), reason: val('reason') }, el); await done('Бекор қилинди'); },
  settle: (el) => {
    const rem = Number(el.dataset.rem), m = el.dataset.m;
    openSheet(`<h3>Ҳисоблашиш</h3><p class="lead">Қолган: ${fmt(rem)} сўм. ${m === 'payroll' ? 'Ходим ойликдан ушлашга рози бўлган.' : 'Ходим нақд қайтарган бўлса қайд этинг.'}</p>
      <div class="field"><div class="lbl">Қандай</div>${chips('how', m === 'payroll' ? [['payroll', 'Ойликдан ушлаш'], ['cash', 'Нақд қайтарди']] : [['cash', 'Нақд қайтарди']], m === 'payroll' ? 'payroll' : 'cash')}</div>
      <div class="field"><div class="lbl">Сумма (бўш қолса — мумкин бўлган энг кўп)</div><input class="txt" name="amount" type="number" inputmode="numeric" placeholder="${rem}"></div>
      <p class="hint">Қарз берилмаган пулдан катта бўлса, манфий тўлов эмас — қолгани алоҳида қарз бўлиб туради.</p>
      <div class="foot"><button class="btn dark" data-act="settleSave" data-id="${el.dataset.id}">Сақлаш</button></div>`);
  },
  settleSave: async (el) => {
    const r = await act('tk_settle', { id: Number(el.dataset.id), how: pressed('how'), amount: val('amount') === '' ? null : num('amount') }, el);
    await done(`${fmt(r.amount)} сўм ҳисоблашилди. Қолган: ${fmt(r.remaining)}`);
  },
  rateAdd: async () => {
    const meta = cache.meta || (cache.meta = await api('prod_meta'));
    openSheet(`<h3>Тариф қўшиш</h3>
      <div class="field"><div class="lbl">Иш тури</div>${chips('w', [['tikish', 'Тикиш'], ['bichish', 'Бичиш']], 'tikish')}</div>
      <div class="field"><div class="lbl">Маҳсулот тури</div>${chips('type', meta.types.map((t) => [t.id, t.name]), '')}</div>
      <div class="field"><div class="lbl">Модел (бўш — барча моделлар)</div><input class="txt" name="model" list="dlM"><datalist id="dlM">${meta.sugg.model.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></div>
      <div class="row2"><div class="field"><div class="lbl">Дона нархи, сўм</div><input class="txt" name="price" type="number" inputmode="numeric"></div>
      <div class="field"><div class="lbl">Амал қилиш санаси</div><input class="txt" name="from" type="date" value="${today().slice(0, 8)}01"></div></div>
      <div class="field"><input class="txt" name="note" placeholder="Изоҳ (ихтиёрий)"></div>
      <div class="foot"><button class="btn dark" data-act="rateSave">Сақлаш</button></div>`);
  },
  rateSave: async (el) => {
    if (!pressed('type')) return sheetErr('Маҳсулот турини танланг.');
    if (val('price') === '') return sheetErr('Нархни киритинг.');
    await act('rate_add', { work: pressed('w'), type_id: Number(pressed('type')), model: val('model'), price: num('price'), valid_from: val('from'), note: val('note') }, el);
    await done('Тариф сақланди');
  },
  ratesFill: async (el) => { const r = await act('rates_fill', {}, el); toast(`${r.filled} та ёзувга тариф қўлланди`); await refresh(); },
  geoHere: async () => {
    toast('Жойлашув олинмоқда…');
    const l = await getLocation();
    if (l.error) return toast('Жойлашувни олиб бўлмади. Рухсат беринг ёки қўлда киритинг.', true);
    $('#sLat').value = l.lat.toFixed(6);
    $('#sLng').value = l.lng.toFixed(6);
    toast(`Олинди (аниқлик ±${Math.round(l.acc)} м). «Сақлаш»ни босинг.`);
  },
  setSave: async (el) => {
    const v = { radius: $('#sRad').value, max_acc: $('#sAcc').value, work_start: $('#sWs').value, work_end: $('#sWe').value, break_start: $('#sBs').value,
      break_min: $('#sBm').value, grace_min: $('#sGr').value, full_min: $('#sFm').value, require_bio: pressed('bio', $('#main')) === '1' };
    if ($('#sLat').value && $('#sLng').value) { v.lat = $('#sLat').value.replace(',', '.'); v.lng = $('#sLng').value.replace(',', '.'); }
    await act('settings_set', { values: v }, el);
    toast('Сақланди');
    await refresh();
  },
  typeAdd: () => openSheet(`<h3>Янги маҳсулот тури</h3><div class="field"><input class="txt" name="name" maxlength="60" placeholder="масалан: Пижама" autofocus></div><div class="foot"><button class="btn dark" data-act="typeSave">Қўшиш</button></div>`),
  typeSave: async (el) => { if (!val('name')) return sheetErr('Номини ёзинг.'); await act('catalog_add', { kind: 'type', name: val('name') }, el); cache.meta = null; await done('Қўшилди'); },
  export: async (el) => { const r = await act('export_all', {}, el); toast(r.sent ? 'Захира нусха ботга юборилди' : 'Юбориб бўлмади. Бот созламасини текширинг.', !r.sent); },
});

document.addEventListener('change', (e) => { if (e.target.id === 'repU') { repU = e.target.value; refresh(); } });

// Ойлик ҳисоб даврини алмаштириш (ўтган ой / шу ой)
document.addEventListener('change', (e) => {
  const g = e.target && e.target.dataset && e.target.dataset.group;
  if (g === 'rkper') { rkPer = e.target.dataset.value; refresh(); }
});
