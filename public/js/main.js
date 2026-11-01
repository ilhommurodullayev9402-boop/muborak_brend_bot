// Kirish: rol tanlash, bir martalik ro'yxatdan o'tish, kutish, begona rol xabari.
import { tg, initData, api, act, esc, setMain, setTop, brandTop, show, registerScreens, on, state, setLang, errText, $, ApiError } from './core.js';

if (tg) {
  try { tg.ready(); tg.expand(); } catch {}
  const setTheme = () => document.documentElement.setAttribute('data-theme', tg.colorScheme === 'dark' ? 'dark' : 'light');
  setTheme();
  try { tg.onEvent('themeChanged', setTheme); } catch {}
}

const ROLE = {
  rahbar: { cyr: 'Раҳбар', lat: 'Rahbar', ic: '★' },
  bichuvchi: { cyr: 'Бичувчи', lat: 'Bichuvchi', ic: '✂︎' },
  tikuvchi: { cyr: 'Тикувчи', lat: 'Tikuvchi', ic: '🧵' },
};
export const roleName = (r, lang) => (ROLE[r] ? ROLE[r][lang] : r);
const MONTHS = { lat: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  cyr: ['январ', 'феврал', 'март', 'апрел', 'май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'] };

function roleSelect() {
  setLang('lat');
  setTop('');
  document.getElementById('nav').hidden = true;
  return `<div class="hero"><div class="mark">MB</div><h1>MUBORAK BREND</h1><p>Tikuvchilik korxonasi hisobi</p></div>
  <button class="rolebtn lead" data-act="role" data-r="rahbar"><span class="ic">${ROLE.rahbar.ic}</span>Раҳбар</button>
  <button class="rolebtn" data-act="role" data-r="bichuvchi"><span class="ic">${ROLE.bichuvchi.ic}</span>Bichuvchi</button>
  <button class="rolebtn" data-act="role" data-r="tikuvchi"><span class="ic">${ROLE.tikuvchi.ic}</span>Tikuvchi</button>`;
}

function registerScreen({ role, auto, rejected, note }) {
  const L = role === 'rahbar' ? 'cyr' : 'lat';
  setLang(L);
  brandTop(L === 'cyr' ? 'Рўйхатдан ўтиш' : 'Ro‘yxatdan o‘tish');
  const T = L === 'cyr'
    ? { h: 'Раҳбар сифатида рўйхатдан ўтиш', lead: 'Маълумотларингизни бир марта киритинг. Сиз эга томонидан раҳбар этиб белгилангансиз — тасдиқ кутиш шарт эмас.',
        fn: 'Исм', ln: 'Фамилия', bd: 'Туғилган сана', d: 'Кун', m: 'Ой', y: 'Йил', btn: 'Сақлаш ва кириш', back: '‹ Орқага' }
    : { h: `${roleName(role, 'lat')} sifatida ro‘yxatdan o‘tish`, lead: auto ? 'Ma’lumotlaringizni bir marta kiriting.' : 'Ma’lumotlaringizni bir marta kiriting. Rahbar tasdiqlagach, ish boshlashingiz mumkin.',
        fn: 'Ism', ln: 'Familiya', bd: 'Tug‘ilgan sana', d: 'Kun', m: 'Oy', y: 'Yil', btn: auto ? 'Saqlash va kirish' : 'Rahbarga so‘rov yuborish', back: '‹ Orqaga' };
  const y = new Date().getFullYear();
  return `<button class="back" data-act="home">${T.back}</button>
  <h1 class="page">${T.h}</h1><p class="lead">${T.lead}</p>
  ${rejected ? `<div class="banner warn">Oldingi so‘rovingiz rad etilgan${note ? ': ' + esc(note) : ''}. Ma’lumotni tekshirib, qayta yuborishingiz mumkin.</div>` : ''}
  <form id="reg" onsubmit="return false">
    <div class="field"><div class="lbl">${T.fn}</div><input class="txt" name="first_name" autocomplete="given-name" maxlength="40" required></div>
    <div class="field"><div class="lbl">${T.ln}</div><input class="txt" name="last_name" autocomplete="family-name" maxlength="40" required></div>
    <div class="field"><div class="lbl">${T.bd}</div>
      <div class="dob">
        <input class="txt" name="bd" type="number" inputmode="numeric" min="1" max="31" placeholder="${T.d}">
        <select class="txt" name="bm"><option value="">${T.m}</option>${MONTHS[L].map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
        <input class="txt" name="by" type="number" inputmode="numeric" min="1930" max="${y - 14}" placeholder="${T.y}">
      </div></div>
    <div class="err" id="regErr" hidden></div>
    <button class="btn dark" style="margin-top:8px" data-act="regSend" data-role="${role}">${T.btn}</button>
  </form>`;
}

function waitScreen({ role }) {
  setLang('lat');
  brandTop('So‘rov yuborildi');
  return `<div class="hero"><div class="mark">⏳</div><h1 style="font-size:19px;letter-spacing:0">So‘rovingiz rahbar tasdig‘ini kutmoqda</h1>
  <p>${esc(roleName(role, 'lat'))} sifatida. Tasdiqlangach, botdan xabar keladi va shu tugma orqali darrov kirasiz.</p></div>
  <button class="btn ghost" data-act="role" data-r="${role}">Holatni tekshirish</button>
  <button class="back" style="display:block;margin:14px auto" data-act="home">‹ Bosh oynaga</button>`;
}

function msgScreen(lang, title, text, buttons) {
  setLang(lang);
  brandTop('');
  return `<div class="hero"><div class="mark">MB</div><h1 style="font-size:19px;letter-spacing:0">${title}</h1><p>${text}</p></div>
  <div class="stack">${buttons}</div>`;
}

async function enter(role) {
  const r = await api('enter', { role });
  state.enter = r;
  if (r.state === 'register') return show('register', { role: r.role, auto: r.auto }, { replace: true });
  if (r.state === 'pending') return show('wait', { role: r.role }, { replace: true });
  if (r.state === 'rejected') return show('register', { role: r.role, rejected: true, note: r.note }, { replace: true });
  if (r.state === 'inactive') return show('msg', { kind: 'inactive', role: r.myRole }, { replace: true });
  if (r.state === 'not_rahbar') return show('msg', { kind: 'not_rahbar' }, { replace: true });
  if (r.state === 'wrong_role') return show('msg', { kind: 'wrong', pressed: role, mine: r.myRole }, { replace: true });
  // ok
  localStorage && (() => { try { localStorage.setItem('mb_role', r.role); } catch {} })();
  if (r.role === 'rahbar') {
    const m = await import('./rahbar.js');
    return m.start();
  }
  const m = await import('./xodim.js');
  return m.start(r.role);
}

registerScreens({
  home: roleSelect,
  register: registerScreen,
  wait: waitScreen,
  msg: ({ kind, pressed, mine, role }) => {
    if (kind === 'inactive') {
      const cyr = role === 'rahbar';
      return msgScreen(cyr ? 'cyr' : 'lat', cyr ? 'Кириш ёпилган' : 'Kirish yopilgan', cyr ? 'Ҳисобингиз фаолсизлантирилган. Раҳбарга мурожаат қилинг.' : 'Hisobingiz faolsizlantirilgan. Oldingi ish va pul tarixingiz saqlangan. Savol bo‘lsa, rahbarga murojaat qiling.',
        `<button class="btn ghost" data-act="home">${cyr ? '‹ Бош ойнага' : '‹ Bosh oynaga'}</button>`);
    }
    if (kind === 'not_rahbar') {
      return msgScreen('lat', 'Bu bo‘lim faqat rahbar uchun', 'Rahbarni faqat korxona rahbari qo‘sha oladi. O‘z bo‘limingizni tanlang.',
        `<button class="btn dark" data-act="role" data-r="bichuvchi">Bichuvchi</button><button class="btn dark" data-act="role" data-r="tikuvchi">Tikuvchi</button><button class="btn ghost" data-act="home">‹ Orqaga</button>`);
    }
    // Begona rol: xabar egasining tilida
    if (mine === 'rahbar') {
      return msgScreen('cyr', `Бу бўлим ${pressed === 'bichuvchi' ? 'бичувчилар' : 'тикувчилар'} учун`, 'Сизнинг бўлимингиз — Раҳбар.',
        `<button class="btn dark" data-act="role" data-r="rahbar">Ўз бўлимимга ўтиш</button><button class="btn ghost" data-act="home">‹ Орқага</button>`);
    }
    const what = pressed === 'rahbar' ? 'faqat rahbar' : pressed === 'bichuvchi' ? 'bichuvchilar' : 'tikuvchilar';
    return msgScreen('lat', `Bu bo‘lim ${what} uchun`, `Sizning bo‘limingiz — ${roleName(mine, 'lat')}.`,
      `<button class="btn dark" data-act="role" data-r="${mine}">O‘z bo‘limimga o‘tish</button><button class="btn ghost" data-act="home">‹ Orqaga</button>`);
  },
});

on({
  home: () => show('home', {}, { root: true }),
  role: async (el) => { el.disabled = true; try { await enter(el.dataset.r); } finally { el.disabled = false; } },
  regSend: async (el) => {
    const f = $('#reg');
    const box = $('#regErr');
    const L = el.dataset.role === 'rahbar' ? 'cyr' : 'lat';
    const g = (n) => f.querySelector(`[name="${n}"]`).value.trim();
    const body = { role: el.dataset.role, first_name: g('first_name'), last_name: g('last_name'), bd: Number(g('bd')), bm: Number(g('bm')), by: Number(g('by')) };
    const miss = !body.first_name || !body.last_name || !body.bd || !body.bm || !body.by;
    if (miss) { box.hidden = false; box.textContent = L === 'cyr' ? 'Барча майдонларни тўлдиринг.' : 'Barcha maydonlarni to‘ldiring.'; return; }
    try {
      const r = await act('register', body, el);
      if (r.state === 'pending') return show('wait', { role: r.role }, { replace: true });
      return enter(r.role);
    } catch (e) {
      box.hidden = false;
      box.textContent = e instanceof ApiError && e.code === 'bad_input' ? (L === 'cyr' ? 'Маълумотни текширинг: туғилган сана нотўғри бўлиши мумкин.' : 'Ma’lumotni tekshiring: tug‘ilgan sana noto‘g‘ri bo‘lishi mumkin.') : errText(e, L);
    }
  },
});

if (!initData) {
  setMain(`<div class="hero"><div class="mark">MB</div><h1>MUBORAK BREND</h1><p>Ilovani Telegramda <b>@muborak_brend_bot</b> ichidagi «Ochish» tugmasi orqali oching.</p></div>`);
} else {
  show('home', {}, { root: true });
}
export { enter };
