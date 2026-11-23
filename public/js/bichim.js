// «Bichdim» yozuvlari: yangi bichim (fason, yordamchi ulushi), «Изменить» tuzatish, tarix, rahbar uchun hisobdan chiqarish.
// Bichuvchi ekranlari lotin, rahbar ekranlari kirill yozuvida — matnlar shu yerda ikkala yozuvda.
import {
  api, act, esc, fmt, refresh, on, state, openSheet, closeSheet, sheetErr, toast, $, $$, val, pressed, chips, dmy, dt, photoTag, pickPhoto, ApiError, errText,
} from './core.js';

const T = {
  lat: {
    cut: 'Bichdim', fason: 'Fason', pickFason: 'Fasonni tanlang.', noFason: 'Rahbar hali fason qo‘shmagan. Rahbarga ayting: Pul → Tariflar → «+ Fason».',
    material: 'Material', color: 'Rang', sizes: 'Razmerlar', perSize: 'har razmer alohida qator', size: 'Razmer', ready: 'Tayyor', partial: 'Chala',
    addSize: '+ Razmer qo‘shish', partialHint: 'Chala bichim alohida hisoblanadi va tugatilmaguncha tikuvchiga berilmaydi.',
    photo: 'Mahsulot rasmi', optional: 'ixtiyoriy', takePhoto: '📷 Rasm olish', save: 'Saqlash',
    helperAdd: '+ Yordamchi qo‘shish', helperRm: 'Yordamchini olib tashlash', helper: 'Yordamchi', helperQty: 'Yordamchi ulushi (dona)',
    helperHint: (p) => `Ulush tayyor bichimdan oshmaydi. Bichish ${p ? fmt(p) + ' so‘m/dona' : 'tarifi rahbarda'}; yordamchiga «Bichishga yordam» bo‘lib yoziladi.`,
    noHelpers: 'Tasdiqlangan tikuvchi yo‘q.',
    tot: (r, p, h) => `Jami tayyor: ${fmt(r)}${p ? ` · chala: ${fmt(p)}` : ''}${h ? ` · sizga ${fmt(r - h)} · yordamchiga ${fmt(h)}` : ''}`,
    needSize: 'Har qatorga razmer yozing.', needQty: 'Kamida bitta son kiriting.', needMat: 'Material va rangni yozing — partiyalar adashmasligi uchun.',
    pickHelper: 'Yordamchini tanlang yoki olib tashlang.', helperMax: (m) => `Yordamchi ulushi ${fmt(m)} donadan oshmasin.`,
    saved: (r) => `${r.code}: ${fmt(r.ready)} tayyor${r.partial ? `, ${fmt(r.partial)} chala` : ''} saqlandi`,
    edit: 'Изменить', editTitle: 'Bichimni tuzatish', reason: 'Sabab', reasonPh: 'Masalan: 48 razmer xato yozilgan, aslida 18', needReason: 'Sababini yozing (majburiy).',
    editHint: 'Xato sonni 0 ga tushirish mumkin. Tikuvchiga berilgan donadan pastga tushib bo‘lmaydi.',
    minNote: (f, m) => `erkin ${fmt(f)}${m ? `, kamida ${fmt(m)}` : ''}`, editSaved: 'Tuzatish saqlandi. Qoldiq va ish haqi yangilandi.',
    conflict: 'Bu tuzatishni saqlab bo‘lmaydi: donalar allaqachon tikuvchiga berilgan.',
    conflictRow: (c) => `${c.size} razmer: ${c.kind === 'ready' ? 'tayyor' : 'chala'} ${fmt(c.from)} → ${fmt(c.to)} so‘raldi, lekin ${fmt(c.min)} donasi berilgan. Eng kami ${fmt(c.min)}.`,
    conflictHint: 'Avval topshirishni bekor qiling (qabul qilinmagan bo‘lsa) yoki rahbarga murojaat qiling.',
    mine: 'Bichimlarim', none: 'Hali bichim yo‘q. «Bichdim» bilan boshlang.', fixed: 'tuzatilgan', voided: 'hisobdan chiqarilgan',
    history: 'Tuzatish tarixi', noHistory: 'Tuzatish bo‘lmagan.', who: 'Kim', when: 'Qachon', was: 'Oldin', now: 'Keyin',
    pay: 'Ish haqi', work: { bichish: 'Bichish', bichish_yordam: 'Bichishga yordam', tikish: 'Tikish' }, qty: 'Dona', rate: 'Tarif', sum: 'Summa',
    sizesT: 'Razmerlar', free: 'Erkin', given: 'Berilgan', transfers: 'Bog‘liq topshirishlar', helperLine: (n, q) => `Yordamchi: ${n} · ${fmt(q)} dona`,
    sewRate: (s) => `Tikish tarifi: ${fmt(s.price)}${s.extra ? ` + qo‘shimcha ${fmt(s.extra)}${s.extra_note ? ' (' + s.extra_note + ')' : ''} = ${fmt(s.price + s.extra)}` : ''} so‘m/dona`,
    voidRec: 'Hisobdan chiqarilgan', legacy: 'Eski tartib: bichish haqi tikuvchi qabul qilganda yoziladi', back: '‹ Orqaga', noRate: 'tarif yo‘q', voidBy: 'Rahbar hisobdan chiqardi',
    editKind: { edit: 'Tuzatish', void: 'Hisobdan chiqarildi' }, open: 'Ochish ›',
    trs: { pending: 'qabul kutilmoqda', accepted: 'qabul qilingan', disputed: 'tafovut', cancelled: 'bekor qilingan', resolved: 'hal qilingan', voided: 'hisobdan chiqarilgan' },
  },
  cyr: {
    cut: 'Бичим', fason: 'Фасон', pickFason: 'Фасонни танланг.', noFason: 'Фасон йўқ. «+ Фасон» билан қўшинг.',
    material: 'Материал', color: 'Ранг', sizes: 'Размерлар', perSize: 'ҳар размер алоҳида қатор', size: 'Размер', ready: 'Тайёр', partial: 'Чала',
    addSize: '+ Размер қўшиш', partialHint: 'Чала бичим алоҳида ҳисобланади.', photo: 'Расм', optional: 'ихтиёрий', takePhoto: '📷 Расм', save: 'Сақлаш',
    helperAdd: '+ Ёрдамчи қўшиш', helperRm: 'Ёрдамчини олиб ташлаш', helper: 'Ёрдамчи', helperQty: 'Ёрдамчи улуши (дона)',
    helperHint: (p) => `Улуш тайёр бичимдан ошмайди. Ёрдамчи тарифи ${p ? fmt(p) + ' сўм/дона' : 'белгиланмаган'}.`, noHelpers: 'Тасдиқланган тикувчи йўқ.',
    tot: (r, p, h) => `Жами тайёр: ${fmt(r)}${p ? ` · чала: ${fmt(p)}` : ''}${h ? ` · бичувчига ${fmt(r - h)} · ёрдамчига ${fmt(h)}` : ''}`,
    needSize: 'Ҳар қаторга размер ёзинг.', needQty: 'Камида битта сон киритинг.', needMat: 'Материал ва рангни ёзинг.',
    pickHelper: 'Ёрдамчини танланг ёки олиб ташланг.', helperMax: (m) => `Ёрдамчи улуши ${fmt(m)} донадан ошмасин.`, saved: (r) => `${r.code} сақланди`,
    edit: 'Изменить', editTitle: 'Бичимни тузатиш', reason: 'Сабаб', reasonPh: 'Масалан: хато ёзилган', needReason: 'Сабабини ёзинг (мажбурий).',
    editHint: 'Хато сонни 0 га тушириш мумкин. Тикувчига берилган донадан пастга тушиб бўлмайди.',
    minNote: (f, m) => `эркин ${fmt(f)}${m ? `, камида ${fmt(m)}` : ''}`, editSaved: 'Тузатиш сақланди. Қолдиқ ва иш ҳақи янгиланди.',
    conflict: 'Бу тузатишни сақлаб бўлмайди: доналар аллақачон тикувчига берилган.',
    conflictRow: (c) => `${c.size} размер: ${c.kind === 'ready' ? 'тайёр' : 'чала'} ${fmt(c.from)} → ${fmt(c.to)} сўралди, лекин ${fmt(c.min)} донаси берилган. Энг ками ${fmt(c.min)}.`,
    conflictHint: 'Аввал топширишни бекор қилинг ёки ёзувни бутунлай ҳисобдан чиқаринг (таъсири олдин кўрсатилади).',
    mine: 'Бичимлар', none: 'Ёзув йўқ.', fixed: 'тузатилган', voided: 'ҳисобдан чиқарилган',
    history: 'Тузатиш тарихи', noHistory: 'Тузатиш бўлмаган.', who: 'Ким', when: 'Қачон', was: 'Олдин', now: 'Кейин',
    pay: 'Иш ҳақи', work: { bichish: 'Бичиш', bichish_yordam: 'Бичишга ёрдам', tikish: 'Тикиш' }, qty: 'Дона', rate: 'Тариф', sum: 'Сумма',
    sizesT: 'Размерлар', free: 'Эркин', given: 'Берилган', transfers: 'Боғлиқ топширишлар', helperLine: (n, q) => `Ёрдамчи: ${n} · ${fmt(q)} дона`,
    sewRate: (s) => `Тикиш тарифи: ${fmt(s.price)}${s.extra ? ` + қўшимча ${fmt(s.extra)}${s.extra_note ? ' (' + s.extra_note + ')' : ''} = ${fmt(s.price + s.extra)}` : ''} сўм/дона`,
    voidRec: 'Ҳисобдан чиқарилган', legacy: 'Эски тартиб: бичиш ҳақи тикувчи қабул қилганда ёзилади', back: '‹ Орқага', noRate: 'тариф йўқ', voidBy: 'Ҳисобдан чиқарилди',
    editKind: { edit: 'Тузатиш', void: 'Ҳисобдан чиқарилди' }, open: 'Очиш ›',
    trs: { pending: 'қабул кутилмоқда', accepted: 'қабул қилинган', disputed: 'тафовут', cancelled: 'бекор қилинган', resolved: 'ҳал қилинган', voided: 'ҳисобдан чиқарилган' },
  },
};
const t = () => T[state.lang] || T.lat;
const so = (n) => (n == null ? '—' : fmt(n));

// ---------- Ro'yxat kartasi ----------
export function cutCard(c, opts = {}) {
  const x = t();
  const st = c.status === 'void' ? `<span class="tag bad">${x.voided}</span>` : c.edits_n ? `<span class="tag warn">${x.fixed}</span>` : '';
  return `<div class="card cutc${c.status === 'void' ? ' void' : ''}">
    <div class="row">${photoTag(c.photo_id)}<div class="grow"><div class="title">${esc(c.type_name || '')} «${esc(c.fason_name)}» ${st}</div>
      <div class="mono">${esc(c.code)} · ${dmy(c.day)} ${c.time}${opts.cutter && c.cutter ? ' · ' + esc(c.cutter) : ''} · ${esc(c.material)} · ${esc(c.color)}</div>
      <div class="sub">${c.lines.map((l) => `${esc(l.size)}: <b>${fmt(l.ready)}</b>${l.partial ? `+${fmt(l.partial)}` : ''}`).join(' · ')}</div>
      ${c.helper ? `<div class="sub">🤝 ${esc(x.helperLine(c.helper, c.helper_qty))}</div>` : ''}</div>
      <div class="bignum num">${fmt(c.ready)}<small>${esc(x.ready.toLowerCase())}</small></div></div>
    <div class="actions row2">${c.can_edit ? `<button class="btn ghost" data-act="cutEdit" data-id="${c.id}">✏️ ${x.edit}</button>` : '<span></span>'}
      <button class="btn ghost" data-act="go" data-s="${opts.screen || 'w_cut'}" data-id="${c.id}">${x.open}</button></div></div>`;
}

// ---------- Batafsil: haq, razmerlar, tarix ----------
export function cutDetail(c, opts = {}) {
  const x = t();
  const diff = (b, a) => {
    const sizes = [...new Set([...b.lines.map((l) => l.size), ...a.lines.map((l) => l.size)])];
    const rows = sizes.map((s) => {
      const o = b.lines.find((l) => l.size === s) || { ready: 0, partial: 0 }, n = a.lines.find((l) => l.size === s) || { ready: 0, partial: 0 };
      if (o.ready === n.ready && o.partial === n.partial) return '';
      return `<tr><td><b>${esc(s)}</b></td><td>${fmt(o.ready)}${o.partial ? '+' + fmt(o.partial) : ''}</td><td>${a.void ? '0' : fmt(n.ready) + (n.partial ? '+' + fmt(n.partial) : '')}</td></tr>`;
    }).join('');
    const h = b.helper_id !== a.helper_id || b.helper_qty !== a.helper_qty
      ? `<tr><td>${x.helper}</td><td>${esc(b.helper_name || '—')} ${b.helper_qty ? fmt(b.helper_qty) : ''}</td><td>${esc(a.helper_name || '—')} ${a.helper_qty ? fmt(a.helper_qty) : ''}</td></tr>` : '';
    return rows || h || a.void ? `<table class="t"><tr><th>${x.size}</th><th>${x.was}</th><th>${x.now}</th></tr>${rows}${h}${a.void && !rows ? `<tr><td colspan="3">${x.voidBy}</td></tr>` : ''}</table>` : '';
  };
  const hist = (c.edits || []).length ? c.edits.map((e) => `<div class="card hist ${e.kind}">
      <div class="row"><div class="grow"><b>${x.editKind[e.kind]}</b> · ${dmy(e.day)} ${e.time} · ${esc(e.actor)}</div></div>
      <div class="sub" style="margin:4px 0 8px">${x.reason}: «${esc(e.reason)}»</div>
      ${diff(e.before, e.after)}
      <div class="sub">${x.was}: ${fmt(e.before.ready)} → ${x.now}: ${fmt(e.after.void ? 0 : e.after.ready)}</div></div>`).join('') : `<div class="empty">${x.noHistory}</div>`;
  const payRows = c.pay.filter((p) => p.qty || p.amount).map((p) => `<tr><td>${esc(p.name)}<div class="sub">${x.work[p.work] || p.work}${p.work === 'bichish_yordam' && c.cutter ? ' · ' + esc(c.cutter) : ''}</div></td>
      <td>${fmt(p.qty)}</td><td>${p.price == null ? `<span class="tag warn">${x.noRate}</span>` : fmt(p.price)}</td><td><b>${so(p.amount)}</b></td></tr>`).join('');
  return `<button class="back" data-act="back">${x.back}</button>
  <h1 class="page">${esc(c.type_name || '')} «${esc(c.fason_name)}»</h1>
  <div class="mono">${esc(c.code)} · ${dmy(c.day)} ${c.time} · ${esc(c.cutter || '')} · ${esc(c.material)} · ${esc(c.color)}</div>
  ${c.status === 'void' ? `<div class="banner bad" style="margin-top:10px">${x.voidRec}: ${dt(c.void_at)} · «${esc(c.void_reason)}»</div>` : ''}
  ${photoTag(c.photo_id, 'ph lg')}
  <div class="stats" style="margin-top:12px">
    <div class="stat" style="--c:var(--c-free)"><b class="num">${fmt(c.ready)}</b><span>${x.ready}</span></div>
    ${c.partial ? `<div class="stat" style="--c:var(--c-partial)"><b class="num">${fmt(c.partial)}</b><span>${x.partial}</span></div>` : ''}
    ${c.helper ? `<div class="stat" style="--c:var(--gold)"><b class="num">${fmt(c.helper_qty)}</b><span>${esc(c.helper)}</span></div>` : ''}
  </div>
  ${c.can_edit ? `<button class="btn dark" style="margin-top:12px" data-act="cutEdit" data-id="${c.id}">✏️ ${x.edit}</button>` : ''}
  <h2>${x.sizesT}</h2>
  <div class="card scrollx"><table class="t"><tr><th>${x.size}</th><th>${x.ready}</th><th>${x.partial}</th><th>${x.free}</th></tr>
    ${c.lines.map((l) => `<tr><td><b>${esc(l.size)}</b></td><td>${fmt(l.ready)}</td><td>${fmt(l.partial)}</td><td>${fmt(l.free)}</td></tr>`).join('')}</table></div>
  <h2>${x.pay}</h2>
  <div class="card">${c.pay_on_cut ? (payRows ? `<table class="t"><tr><th></th><th>${x.qty}</th><th>${x.rate}</th><th>${x.sum}</th></tr>${payRows}</table>` : '<div class="sub">—</div>') : `<div class="sub">${x.legacy}</div>`}
    ${c.sew ? `<div class="sub" style="margin-top:8px">${esc(x.sewRate(c.sew))}</div>` : ''}</div>
  ${c.transfers && c.transfers.length ? `<h2>${x.transfers}</h2><div class="list">${c.transfers.map((tr) => `<div class="li"><div class="grow"><b>${esc(tr.code)}</b> → ${esc(tr.to)}<div class="sub">${dmy(tr.day)} · ${esc(tr.size)} · ${esc(x.trs[tr.status] || tr.status)}</div></div><div class="r">${fmt(tr.qty)}</div></div>`).join('')}</div>` : ''}
  <h2>${x.history}</h2>${hist}
  ${opts.extra || ''}`;
}

// ---------- Yangi bichim ----------
function sizeRow(size = '', ready = '', partial = '', fixed = false, note = '') {
  return `<div class="szrow${fixed ? ' fixed' : ''}"><input class="txt" name="size" value="${esc(size)}" placeholder="48" maxlength="10" ${fixed ? 'readonly' : ''}>
    <input class="txt" name="ready" type="number" inputmode="numeric" min="0" value="${ready === '' ? '' : ready}" placeholder="0">
    <input class="txt" name="partial" type="number" inputmode="numeric" min="0" value="${partial === '' ? '' : partial}" placeholder="0">
    ${fixed ? '<span></span>' : '<button type="button" class="x" style="position:static;width:36px;height:36px" data-act="szRm" aria-label="×">×</button>'}
    ${note ? `<div class="sznote">${esc(note)}</div>` : ''}</div>`;
}
const readRows = () => $$('#sizes .szrow').map((r) => ({ size: r.querySelector('[name=size]').value.trim(), ready: Number(r.querySelector('[name=ready]').value) || 0, partial: Number(r.querySelector('[name=partial]').value) || 0 }));

function helperBlock(helpers, cur, q, price) {
  const x = t();
  if (!helpers.length) return `<div class="sub">${x.noHelpers}</div>`;
  return `<div id="helperBox" ${cur ? '' : 'hidden'}>
      <div class="field"><div class="lbl">${x.helper}</div>${chips('helper', helpers.map((h) => [h.id, h.name]), cur || '')}</div>
      <div class="field"><div class="lbl">${x.helperQty}</div><input class="txt" name="hq" type="number" inputmode="numeric" min="0" value="${q || ''}" placeholder="0"></div>
      <p class="hint">${esc(x.helperHint(price))}</p>
      <button class="link" data-act="helperRm">${x.helperRm}</button></div>
    <button class="btn ghost" id="helperAddBtn" data-act="helperAdd" ${cur ? 'hidden' : ''}>🤝 ${x.helperAdd}</button>`;
}
function bindTotals() {
  const upd = () => {
    const rows = readRows();
    const r = rows.reduce((a, l) => a + l.ready, 0), p = rows.reduce((a, l) => a + l.partial, 0);
    const hb = $('#helperBox');
    const h = hb && !hb.hidden && pressed('helper') ? Number(val('hq')) || 0 : 0;
    $('#cutTot').textContent = t().tot(r, p, h);
  };
  $('#sheetBody').addEventListener('input', upd);
  $('#sheetBody').addEventListener('change', upd);
  $('#sheetBody').addEventListener('click', () => setTimeout(upd, 0));
  upd();
}
function helperVal() {
  const hb = $('#helperBox');
  if (!hb || hb.hidden) return { helper_id: null, helper_qty: 0 };
  return { helper_id: Number(pressed('helper')) || null, helper_qty: Number(val('hq')) || 0 };
}

export async function cutNewSheet() {
  const x = t();
  const m = await api('cut_meta');
  const dl = (id, arr) => `<datalist id="${id}">${arr.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  if (!m.fasons.length) return openSheet(`<h3>${x.cut}</h3><div class="empty">${esc(x.noFason)}</div>`);
  openSheet(`<h3>✂︎ ${x.cut}</h3>
    <div class="field"><div class="lbl">${x.fason}</div>${chips('fason', m.fasons.map((f) => [f.id, f.name, f.type_name]), m.fasons.length === 1 ? m.fasons[0].id : '')}</div>
    <div class="row2"><div class="field"><div class="lbl">${x.material}</div><input class="txt" name="material" list="dlMat" maxlength="60" placeholder="Paxta">${dl('dlMat', m.sugg.material)}</div>
      <div class="field"><div class="lbl">${x.color}</div><input class="txt" name="color" list="dlCol" maxlength="40" placeholder="Qizil">${dl('dlCol', m.sugg.color)}</div></div>
    <div class="field"><div class="lbl"><span>${x.sizes}</span><span>${x.perSize}</span></div>
      <div class="szhead"><span>${x.size}</span><span>${x.ready}</span><span>${x.partial}</span><span></span></div>
      <div id="sizes">${sizeRow()}</div>
      <button class="link" data-act="szAdd">${x.addSize}</button>
      <p class="hint">${x.partialHint}</p></div>
    <div class="field">${helperBlock(m.helpers, null, 0, m.helper_price)}</div>
    <div class="field"><div class="lbl">${x.photo} <span>${x.optional}</span></div>
      <div class="phbtn"><span id="cutPh"></span><button class="btn ghost" data-act="cutPhoto2" style="flex:1">${x.takePhoto}</button></div></div>
    <div class="foot"><div class="sub" id="cutTot" style="margin-bottom:8px"></div><button class="btn dark" data-act="cutSave2">${x.save}</button></div>`);
  cutNewSheet.photo = null;
  bindTotals();
}

// ---------- «Изменить» ----------
export async function cutEditSheet(id) {
  const x = t();
  const c = await api('cut_detail', { cut_id: Number(id) });
  cutEditSheet.c = c;
  const rows = c.lines.map((l) => {
    const minR = Math.max(0, l.ready - l.free), minP = Math.max(0, l.partial - l.partial_bal);
    return sizeRow(l.size, l.ready, l.partial, true, minR || minP ? x.minNote(l.free, minR) + (minP ? ' · ' + x.partial.toLowerCase() + ' ' + x.minNote(l.partial_bal, minP) : '') : '');
  }).join('');
  openSheet(`<h3>✏️ ${x.editTitle}</h3>
    <div class="mono" style="margin-bottom:8px">${esc(c.code)} · «${esc(c.fason_name)}» · ${dmy(c.day)} ${c.time}</div>
    <div class="field"><div class="szhead"><span>${x.size}</span><span>${x.ready}</span><span>${x.partial}</span><span></span></div>
      <div id="sizes">${rows}</div><button class="link" data-act="szAdd">${x.addSize}</button>
      <p class="hint">${x.editHint}</p></div>
    ${c.pay_on_cut ? `<div class="field">${helperBlock(c.helpers || [], c.helper_id, c.helper_qty, c.helper_price)}</div>` : ''}
    <div class="field"><div class="lbl">${x.reason}</div><textarea class="txt" name="reason" maxlength="300" placeholder="${esc(x.reasonPh)}"></textarea></div>
    <div id="conflict"></div>
    <div class="foot"><div class="sub" id="cutTot" style="margin-bottom:8px"></div><button class="btn dark" data-act="cutEditSave" data-id="${c.id}">${x.save}</button></div>`);
  bindTotals();
}

function showConflict(p) {
  const x = t();
  $('#conflict').innerHTML = `<div class="banner bad" style="margin-top:8px"><b>${x.conflict}</b>
    <ul style="margin:6px 0 0 18px;padding:0">${(p.items || []).map((c) => `<li>${esc(x.conflictRow(c))}</li>`).join('')}</ul>
    ${(p.transfers || []).length ? `<div style="margin-top:6px">${p.transfers.map((tr) => `${esc(tr.code)} → ${esc(tr.to)}: ${esc(tr.size)} · ${fmt(tr.qty)}`).join('<br>')}</div>` : ''}
    <div class="sub" style="margin-top:6px">${x.conflictHint}</div></div>`;
  $('#conflict').scrollIntoView({ block: 'nearest' });
}

on({
  szAdd: () => $('#sizes').insertAdjacentHTML('beforeend', sizeRow()),
  szRm: (el) => { if ($$('#sizes .szrow').length > 1) el.closest('.szrow').remove(); },
  helperAdd: () => { $('#helperBox').hidden = false; $('#helperAddBtn').hidden = true; },
  helperRm: () => { $('#helperBox').hidden = true; $('#helperAddBtn').hidden = false; const g = $('#sheetBody [data-group=helper]'); if (g) { g.dataset.value = ''; $$('[aria-pressed]', g).forEach((b) => b.setAttribute('aria-pressed', 'false')); } $('#sheetBody [name=hq]').value = ''; },
  cutPhoto2: async () => {
    const p = await pickPhoto('', 'bichim');
    if (p) { cutNewSheet.photo = p.id; $('#cutPh').innerHTML = photoTag(p.id); }
  },
  cutSave2: async (el) => {
    const x = t();
    const fason_id = Number(pressed('fason'));
    if (!fason_id) return sheetErr(x.pickFason);
    const lines = readRows().filter((l) => l.size || l.ready || l.partial);
    if (!lines.length || lines.some((l) => !l.size)) return sheetErr(x.needSize);
    const ready = lines.reduce((a, l) => a + l.ready, 0);
    if (!lines.some((l) => l.ready + l.partial > 0)) return sheetErr(x.needQty);
    if (!val('material') || !val('color')) return sheetErr(x.needMat);
    const h = helperVal();
    if ($('#helperBox') && !$('#helperBox').hidden && (!h.helper_id || !h.helper_qty)) return sheetErr(x.pickHelper);
    if (h.helper_qty > ready) return sheetErr(x.helperMax(ready));
    const r = await act('cut_create', { fason_id, material: val('material'), color: val('color'), lines, photo_id: cutNewSheet.photo || undefined, ...h }, el);
    if (r) { closeSheet(); toast(x.saved(r)); await refresh(); }
  },
  cutEdit: (el) => cutEditSheet(el.dataset.id),
  cutEditSave: async (el) => {
    const x = t();
    const lines = readRows().filter((l) => l.size);
    if (readRows().some((l) => !l.size && (l.ready || l.partial))) return sheetErr(x.needSize);
    const reason = val('reason');
    if (reason.length < 3) return sheetErr(x.needReason);
    const body = { cut_id: Number(el.dataset.id), lines, reason };
    if (cutEditSheet.c && cutEditSheet.c.pay_on_cut) {
      const h = helperVal();
      if ($('#helperBox') && !$('#helperBox').hidden && (!h.helper_id || !h.helper_qty)) return sheetErr(x.pickHelper);
      const ready = lines.reduce((a, l) => a + l.ready, 0);
      if (h.helper_qty > ready) return sheetErr(x.helperMax(ready));
      Object.assign(body, h);
    }
    try {
      const r = await act('cut_edit', body, el);
      if (r) { closeSheet(); toast(x.editSaved); await refresh(); }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cut_conflict') return showConflict(e.params);
      throw e;
    }
  },
});
export { errText };
