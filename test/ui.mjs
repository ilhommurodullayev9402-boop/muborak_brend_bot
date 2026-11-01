// Ekranlarni haqiqiy brauzerda (telefon o'lchamida) bosib sinash. Telegram obyekti sinov uchun soxtalashtiriladi,
// lekin initData haqiqiy imzo bilan yaratiladi va server uni odatdagidek tekshiradi.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import { signInitData } from '../src/auth.js';

const BASE = 'http://127.0.0.1:8787/';
const TOKEN = '123456:TEST_TOKEN_FOR_LOCAL_ONLY';
const SHOTS = process.env.SHOTS || '/tmp/mb-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const GEO = { latitude: 41.31105, longitude: 69.27970, accuracy: 15 };
const log = [];
let fails = 0;
const ok = (c, what) => { log.push((c ? '  ✓ ' : '  ✗ ') + what); if (!c) fails++; };

const browser = await chromium.launch();
async function user(tgId, name) {
  const init = await signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: tgId, first_name: name }) }, TOKEN);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: GEO, permissions: ['geolocation'], locale: 'uz-UZ' });
  const stub = `window.Telegram={WebApp:(function(){var tok=null;return{initData:${JSON.stringify(init)},colorScheme:'light',ready(){},expand(){},onEvent(){},
    isVersionAtLeast:function(v){return parseFloat(v)<8},
    BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{notificationOccurred(){}},
    BiometricManager:{isBiometricAvailable:true,isAccessGranted:true,get isBiometricTokenSaved(){return !!tok},init:function(cb){cb()},requestAccess:function(o,cb){cb(true)},
      updateBiometricToken:function(t,cb){tok=t;cb(true)},authenticate:function(o,cb){cb(true,tok)}}}})()};`;
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(BASE);
  page.errs = errs;
  return page;
}
const click = async (p, text, opts = {}) => {
  const inSheet = await p.locator('#sheet').isVisible();
  const scope = inSheet ? p.locator('#sheet') : p.locator('body');
  await scope.getByRole('button', { name: text, exact: !!opts.exact }).first().click();
  await p.waitForTimeout(opts.wait ?? 450);
};
const TABS = { 'Бош': 'r_home', 'Ходимлар': 'r_staff', 'Ишлаб чиқариш': 'r_prod', 'Пул': 'r_money', 'Созламалар': 'r_set' };
const tab = async (p, name) => { await p.locator(`#nav button[data-s=${TABS[name]}]`).click(); await p.waitForTimeout(800); };
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const body = (p) => p.locator('body').innerText();
const fillReg = async (p, fn, ln, d, m, y) => {
  await p.fill('[name=first_name]', fn); await p.fill('[name=last_name]', ln); await p.fill('[name=bd]', String(d));
  await p.selectOption('[name=bm]', String(m)); await p.fill('[name=by]', String(y));
};
// Rahbar ekranida lotin harflari bormi (ruxsat etilgan istisnolardan tashqari)
const latinLeak = (t) => t.replace(/MUBORAK BREND|MB|Telegram ID|Telegram|Face ID|@userinfobot|JSON|PUL-\d+|P-\d+|T-\d+|«Pulni oldim»|Pulni oldim|[A-Z]-\d+/g, '')
  .split(/\s+/).filter((w) => /[a-z]{3,}/i.test(w));
const cyrLeak = (t) => t.replace(/Раҳбар/g, '').split(/\s+/).filter((w) => /[Ѐ-ӿ]{2,}/.test(w));

// 1) Dadam — rahbar (kirill)
const boss = await user(1000, 'Dad');
ok((await body(boss)).includes('Раҳбар') && (await body(boss)).includes('Bichuvchi'), 'Birinchi oyna: «Раҳбар», «Bichuvchi», «Tikuvchi»');
await shot(boss, '01-rol-tanlash');
await click(boss, 'Раҳбар');
ok((await body(boss)).includes('Раҳбар сифатида рўйхатдан ўтиш'), 'Rahbar ro‘yxati kirillda');
await shot(boss, '02-rahbar-royxat');
await fillReg(boss, 'Муборак', 'Ака', 3, 11, 1965);
await click(boss, 'Сақлаш ва кириш', { wait: 900 });
ok((await body(boss)).includes('Бугун'), 'Dadam tasdiq kutmasdan rahbar bosh ekraniga kirdi');
await tab(boss, 'Созламалар');
await boss.fill('#sLat', '41.3111'); await boss.fill('#sLng', '69.2797');
await click(boss, 'Сақлаш', { exact: true, wait: 700 });
ok((await body(boss)).includes('Белгиланган'), 'Korxona joylashuvi saqlandi');
await shot(boss, '03-rahbar-sozlamalar');

// 2) Tikuvchi va bichuvchi ro'yxatdan o'tadi
const rux = await user(2001, 'Rux');
await click(rux, 'Tikuvchi');
ok((await body(rux)).includes('Tikuvchi sifatida ro‘yxatdan o‘tish') && (await body(rux)).includes('Rahbar tasdiqlagach'), 'Tikuvchi anketasi: sarlavha va izoh');
await shot(rux, '04-tikuvchi-royxat');
await fillReg(rux, 'Ruxshona', 'Karimova', 4, 11, 1998);
await click(rux, 'Rahbarga so‘rov yuborish', { wait: 800 });
ok((await body(rux)).includes('So‘rovingiz rahbar tasdig‘ini kutmoqda'), 'Kutish oynasi');
await shot(rux, '05-kutish');
const sar = await user(3001, 'Sar');
await click(sar, 'Bichuvchi');
await fillReg(sar, 'Sardor', 'Toshev', 15, 6, 1990);
await click(sar, 'Rahbarga so‘rov yuborish', { wait: 800 });

// Rahbar tasdiqlaydi
await tab(boss, 'Ходимлар');
ok((await body(boss)).includes('Ruxshona Karimova') && (await body(boss)).includes('Сўралган роль'), 'Rahbar «Ходимлар»da so‘rovni ko‘rdi');
await shot(boss, '06-rahbar-xodimlar');
for (let i = 0; i < 2; i++) { await click(boss, 'Тасдиқлаш', { exact: true }); await click(boss, 'Тасдиқлаш', { exact: true, wait: 900 }); }
ok(!(await body(boss)).includes('Сўралган роль'), 'Ikkala so‘rov tasdiqlandi');
// Tarif
await tab(boss, 'Пул');
await click(boss, 'Тарифлар');
await click(boss, '+ Тариф қўшиш');
await click(boss, 'Ko‘ylak', { exact: true, wait: 100 });
await boss.fill('[name=price]', '10000');
await click(boss, 'Сақлаш', { exact: true, wait: 800 });
ok((await body(boss)).includes('10 000 сўм'), 'Tikish tarifi qo‘shildi');

// 3) Bichuvchi: kelish, bichdim, berish
await sar.reload(); await sar.waitForTimeout(600);
await click(sar, 'Bichuvchi', { wait: 900 });
ok((await body(sar)).includes('Bichdim') && (await body(sar)).includes('Ishga keldim'), 'Tasdiqlangan bichuvchi anketasiz o‘z bo‘limiga kirdi');
await click(sar, 'Ishga keldim', { wait: 1500 });
ok(/Keldingiz/.test(await body(sar)), 'Ishga keldim: joylashuv + biometrika (Telegram BiometricManager) → qayd etildi');
await click(sar, 'Bichdim');
await click(sar, 'Ko‘ylak', { exact: true, wait: 100 });
await sar.fill('[name=model]', 'Lola'); await sar.fill('[name=material]', 'Paxta'); await sar.fill('[name=color]', 'Qizil');
const rows = sar.locator('#sizes .szrow');
await rows.nth(0).locator('[name=size]').fill('48'); await rows.nth(0).locator('[name=ready]').fill('8');
await click(sar, '+ Razmer qo‘shish', { wait: 100 });
await rows.nth(1).locator('[name=size]').fill('50'); await rows.nth(1).locator('[name=ready]').fill('12'); await rows.nth(1).locator('[name=partial]').fill('3');
await shot(sar, '07-bichdim');
await click(sar, 'Saqlash', { exact: true, wait: 1000 });
ok((await body(sar)).includes('P-0001') && /20\s*erkin/.test(await body(sar)), 'Partiya P-0001: 48—8, 50—12 = 20 erkin, chala alohida');
await shot(sar, '08-bichuvchi-bosh');
await click(sar, 'Tikuvchiga berish');
await click(sar, 'Ruxshona Karimova', { exact: true, wait: 100 });
await sar.locator('[data-line] input').first().fill('8');
await click(sar, 'Berish', { exact: true, wait: 1000 });
ok((await body(sar)).includes('Qabul kutilmoqda'), 'Tikuvchiga 8 dona berildi — «Qabul kutilmoqda»');
// Ovoz (matn bilan)
await click(sar, 'Gapirib berish');
ok((await body(sar)).includes('ovozni matnga aylantirish mavjud emas') || (await sar.locator('.mic').count()) > 0, 'Ovoz: mavjud bo‘lmasa, ochiq aytiladi (soxta mikrofon yo‘q)');
await sar.fill('#vtext', 'Ruxshonaga 2 ta qizil paxta ko‘ylak berdim');
await click(sar, 'Ajratish', { wait: 800 });
ok((await body(sar)).includes('Ruxshona Karimova') && (await body(sar)).includes('aytildi'), 'Ovozli gap ajratildi va tasdiq uchun ko‘rsatildi');
await shot(sar, '09-ovoz');
await click(sar, 'Tasdiqlash va berish', { wait: 1000 });

// 4) Tikuvchi: qabul, topshirish
await rux.reload(); await rux.waitForTimeout(600);
await click(rux, 'Tikuvchi', { wait: 1000 });
await rux.waitForSelector('text=Kelgan ishlar');
ok(/kelgan ishlar/i.test(await body(rux)) && (await body(rux)).includes('Sanadim, qabul qildim'), 'Tikuvchida kelgan ishlar');
await shot(rux, '10-tikuvchi-kelgan');
await click(rux, 'Sanadim, qabul qildim', { wait: 900 });
await click(rux, 'Sanadim, qabul qildim', { wait: 900 });
await click(rux, 'Tayyorladim / Topshirdim');
await rux.fill('[name=n]', '20');
await click(rux, 'Topshirdim', { exact: true, wait: 700 });
ok((await body(rux)).includes('Sizda 8 dona bor. Miqdorni tekshiring.'), 'Ortiqcha son (20 > 8): «Sizda 8 dona bor. Miqdorni tekshiring.»');
await rux.fill('[name=n]', '8');
await click(rux, 'Topshirdim', { exact: true, wait: 1000 });
ok(/Tekshiruvni kutmoqda\s*8/.test(await body(rux)) && /Qo‘limda \(tikilmoqda\)\s*2/.test(await body(rux)), '8 tekshiruvda; boshqa razmerdagi 2 dona qo‘lda alohida');
await shot(rux, '11-tikuvchi-mendagi');

// 5) Rahbar tekshiradi, pul beradi
await tab(boss, 'Бош');
ok((await body(boss)).includes('Текширув кутмоқда'), 'Rahbar bosh ekranida «Текширув кутмоқда»');
await shot(boss, '12-rahbar-bosh');
await click(boss, 'Текширув кутмоқда');
await click(boss, 'Текшириш', { exact: true });
await click(boss, 'Сақлаш', { exact: true, wait: 1000 });
await tab(boss, 'Пул');
await shot(boss, '13-rahbar-pul');
await click(boss, 'Ruxshona Karimova', { wait: 1000 });
ok((await body(boss)).includes('80 000'), 'Varaqa: 8 × 10 000 = 80 000');
await click(boss, 'Пул бердим', { exact: true });
await boss.fill('[name=amount]', '50000');
await shot(boss, '14-pul-berdim');
await click(boss, 'Пул бердим', { exact: true, wait: 1000 });
ok((await body(boss)).includes('Ходим тасдиғи кутилмоқда'), 'Holat: «Ходим тасдиғи кутилмоқда»');
await shot(boss, '15-varaqa');

// 6) Tikuvchi pulni tasdiqlaydi
await rux.reload(); await rux.waitForTimeout(600);
await click(rux, 'Tikuvchi', { wait: 1000 });
ok((await body(rux)).includes('Sizdan tasdiq kutilmoqda'), 'Tikuvchiga tasdiq so‘rovi chiqdi');
await click(rux, 'Mening hisobim', { wait: 900 });
await shot(rux, '16-mening-hisobim');
await click(rux, 'Pulni oldim', { wait: 900 });
ok(/30 000/.test(await body(rux)) && (await body(rux)).includes('Tasdiqlangan'), 'Pulni oldim → tasdiqlandi, beriladigan qoldiq 30 000');
await click(rux, '‹ Orqaga', { wait: 700 });
await click(rux, 'Korxonadan olganlarim', { wait: 800 });
ok((await body(rux)).includes('Shu oyda korxonadan mahsulot, material yoki xizmat olganmisiz?'), 'Olganlar savoli');
await shot(rux, '17-olganlarim');

// 7) Begona rol
const rux2 = await user(2001, 'Rux');
await click(rux2, 'Раҳбар', { wait: 900 });
ok((await body(rux2)).includes('Bu bo‘lim faqat rahbar uchun') && (await body(rux2)).includes('Sizning bo‘limingiz — Tikuvchi') && (await body(rux2)).includes('O‘z bo‘limimga o‘tish'), 'Begona rol: muloyim xabar va qaytish tugmasi');
await shot(rux2, '18-begona-rol');

// Til tekshiruvi: rahbar ekranlarida lotin so'z yo'q, xodim ekranlarida kirill yo'q
let leaks = [];
for (const tab_ of ['Бош', 'Ходимлар', 'Ишлаб чиқариш', 'Пул', 'Созламалар']) {
  await tab(boss, tab_);
  leaks = leaks.concat(latinLeak(await boss.locator('#main').innerText()).map((w) => tab_ + ': ' + w));
}
ok(leaks.filter((w) => !/Ruxshona|Karimova|Sardor|Toshev|Lola|Paxta|Qizil|Ko‘ylak|Xalat|Uzun|Bolalar|ko‘ylak|ko‘ylagi/.test(w)).length === 0, 'Rahbar ekranlari kirillda (xodim ismlari va katalog nomlari — kiritilgan ma’lumot) ' + leaks.slice(0, 5).join(' | '));
const wtext = (await sar.locator('#main').innerText()) + (await rux.locator('#main').innerText());
ok(cyrLeak(wtext).length === 0, 'Xodim ekranlari lotinda ' + cyrLeak(wtext).slice(0, 5).join(' | '));
const all = fs.readdirSync('public/js').map((f) => fs.readFileSync('public/js/' + f, 'utf8')).join('\n') + fs.readFileSync('public/index.html', 'utf8') + fs.readdirSync('src/core').map((f) => fs.readFileSync('src/core/' + f, 'utf8')).join('\n');
ok(!/\bsex\w*|\bсех\w*/i.test(all.replace(/sexagesimal/g, '')), '«sex» atamasi ilova matnlarida yo‘q');
const errs = [boss, rux, sar, rux2].flatMap((p) => p.errs);
ok(errs.length === 0, 'Brauzer konsolida JS xatosi yo‘q ' + errs.slice(0, 3).join(' | '));

await browser.close();
console.log(log.join('\n'));
console.log(fails ? `\nUI: ${fails} ta xato` : '\nUI: hammasi o‘tdi');
process.exit(fails ? 1 : 0);
