# MUBORAK BREND — Telegram Mini App (to‘liq tizim)

Bu papkada **server + doimiy baza + Mini App** bor. Hammasi bitta joyda ishlaydi: Cloudflare Workers (bepul), ma’lumotlar SQLite bazada (Durable Object) saqlanadi va server qayta ishga tushsa ham yo‘qolmaydi.

## 1. O‘rnatish (bir marta, ~15 daqiqa)

Sizdan kerak: **Cloudflare bepul hisobi**, **bot tokeni** (BotFather’da bor), **dadangizning Telegram ID raqami**.

1. **Telegram ID**: dadangiz Telegram’da `@userinfobot` ga `/start` yozadi. U `Id: 123456789` kabi raqam beradi. Shu raqamni yozib oling.
2. **GitHub**: `muborak_brend_bot` repongizni oching → **Add file → Upload files** → ZIP ichidagi **hamma narsani** (papkalari bilan: `src`, `public`, `test`, `wrangler.jsonc`, `package.json`, `package-lock.json`, `README-UZ.md`, `.gitignore`) sudrab tashlang → **Commit changes**. (Eski `index.html` qolsa ham zarar qilmaydi.)
3. **Cloudflare**: https://dash.cloudflare.com → ro‘yxatdan o‘ting (bepul) → **Workers & Pages** → **Create** → **Import a repository** → GitHub’ni ulang → `muborak_brend_bot` ni tanlang → hech narsani o‘zgartirmay **Deploy** ni bosing. 1–2 daqiqada tayyor bo‘ladi.
4. Shu Worker ichida **Settings → Variables and Secrets → Add**:
   - `BOT_TOKEN` — turi **Secret**, qiymati: botning tokeni. (Tokenni hech qachon chatga yozmang.)
   - `OWNER_TG_ID` — turi **Text**, qiymati: dadangizning ID raqami (1-qadam).
   - **Deploy** / **Save** ni bosing.
5. Worker sahifasidagi manzilni nusxalang (masalan `https://muborak-brend.SIZNING-NOM.workers.dev`).
6. **BotFather** → `/mybots` → @muborak_brend_bot → **Bot Settings → Menu Button** → yangi manzilni yuboring → nomi `Ochish`.
7. Dadangiz botda **Ochish → Раҳбар** ni bosadi, ma’lumotini bir marta kiritadi. Keyin **Созламалар** → «Ҳозирги жойимни корхона деб белгилаш» (korxona ichida turib) → **Сақлаш**. **Пул → Тарифлар** da dona narxlarini kiritadi.
8. Xodimlar botda **Ochish → Bichuvchi/Tikuvchi** → anketa → dadangiz **Ходимлар** da tasdiqlaydi.

Keyingi yangilanishlar: GitHub’ga yangi fayllarni yuklasangiz, Cloudflare o‘zi qayta joylaydi. Baza o‘chmaydi; sxema o‘zgarishlari raqamli migratsiya bilan qo‘shiladi va oldidan tiklash nuqtasi yoziladi.

## 2. Qanday ishlaydi (qisqa)

- **Rollar**: Раҳбар (kirill), Bichuvchi, Tikuvchi (lotin). Rolni server belgilaydi: har so‘rovda Telegram imzosi (initData) va eskirganligi tekshiriladi, keyin rol, faollik tekshiriladi. Birinchi bosgan odam rahbar bo‘lmaydi — faqat `OWNER_TG_ID`. Yangi rahbarni faqat rahbar qo‘shadi.
- **Davomat**: «Ishga keldim / Ishdan ketdim» — joylashuv faqat bosilganda olinadi (koordinata saqlanmaydi), Telegram BiometricManager orqali Face ID/barmoq izi. Ishlamasa — avtomatik yozilmaydi, rahbarga istisno so‘rovi. Vaqt serverdan (Asia/Tashkent).
- **Hisob**: har dona bir holatda: chala bichim → tarqatilmagan → qabul kutilmoqda → tikuvchida → tekshiruvda → qabul qilingan (yoki qayta ishlash / hisobdan chiqarilgan). Ortiqcha berish, ortiqcha topshirish, ikki marta qabul qilish server darajasida taqiqlangan.
- **Ishbay haq**: tikuvchi — rahbar tekshirib qabul qilgan donadan; bichuvchi — tikuvchi sanab qabul qilgan bichimdan. Tariflar alohida (bichish/tikish), sana bo‘yicha. Tarif yo‘q bo‘lsa summa taxmin qilinmaydi.
- **Pul**: «Пул бердим» → xodimda «Pulni oldim / Tafovut bor». «Korxonadan olganlarim» — narxni rahbar belgilaydi, xodim tasdiqlaydi; oylikdan ushlash faqat xodim roziligi bilan.
- **Uydan ishlaydiganlar**: rahbar xodim kartasida «Уйдан ишлайди» ni yoqadi — davomat so‘ralmaydi, ish va pul odatdagidek.
- **Rasm va ovozli izoh**: «Bichdim»da mahsulot rasmi, «Tikuvchiga berish»da yozma va ovozli izoh. Tikuvchiga Telegram’da rasm + tavsif + ovoz boradi.
- **Olganlarim / Avans / Oylik hisob**: xodim olganini shu zahoti yozadi (rasm ixtiyoriy), rahbar narx qo‘yadi. Avans: xodim so‘raydi → rahbar «Берилди» → xodim «Pulni oldim». Oy oxirida rahbar «Ҳисобни ходимга юбориш» → xodim «Tasdiqlayman» yoki «Tafovut bor» → «Пул бердим».
- **Buyurtma (zakaz)**: bichuvchi mijoz, telefon, o‘lchamlar (o‘z shabloni), tavsif/ovoz/rasm, aniq tayyor bo‘lish sanasi, narx va oldindan to‘lovni kiritadi. Bo‘limlar: Bichilmagan · Tikishda · Tuzatishda · Tayyor · Topshirilgan · Olib ketilmagan. Muddatdan 2 kun oldin, shu kuni va o‘tganda eslatma (har kuni 08:00). Kiyib ko‘rish: «Ma’qul» / «Tuzatish kerak» (kim tuzatadi + yangi sana) / «Olmadi» (rahbar qaror qiladi). Ish haqi alohida zakaz tarifi bilan (Тарифлар → «Буюртма (заказ) кўйлак»), oylikda oddiy ishdan alohida qatorda. Mijoz puli kim olgani bilan yoziladi; bichuvchidagi pul rahbarga topshiriladi yoki oylik hisobda ushlanadi. Tikuvchi mijoz telefoni va narxini ko‘rmaydi.
- **Murojaat**: xodim rahbarga yozadi yoki ovoz bilan aytadi — «Ruxsat so‘rash» (kunlar bilan) yoki muammo (bichim xatosi, kamomad, kelishmovchilik, uskuna). Faqat rahbar ko‘radi. Ruxsat berilgan kunlar davomatda «ruxsatli».
- **Rasm/ovoz ombori**: fayllar yopiq Telegram kanalida, bazada faqat havola. Har fayl ostida belgi: #bichim, #izoh, #olganlar, #buyurtma, #murojaat + kim + sana. Kanaldan xabar o‘chirmang.
- **Zaxira**: Созламалар → «Захира нусха» — butun baza JSON fayl qilib rahbarning Telegram chatiga yuboriladi. Cloudflare’da qo‘shimcha 30 kunlik tiklash imkoniyati bor.

## 3. Nima sinaldi

Kompyuterda, Cloudflare’ning haqiqiy server muhitida (`wrangler dev`, workerd + SQLite):
- `npm test` — **18 bo‘lim qabul sinovi** (14 ta asosiy + uydan ishlash, rasm/ovoz/olganlar/avans/oylik hisob, buyurtma, murojaat) (+ hisob tenglamasi, ovoz ajratuvchisi, tug‘ilgan kun eslatmasi). Hammasi o‘tdi. Har so‘rov haqiqiy imzolangan initData bilan; parallel so‘rovlar, qayta bosish, server qayta ishga tushishi ham tekshirildi.
- `npm run test:ui` — telefon o‘lchamidagi brauzerda: ro‘yxat → tasdiq → kelish → bichdim → berish → qabul → topshirish → tekshiruv → «Пул бердим» → «Pulni oldim». O‘tdi.

## 4. Nima hali sinalmagan / cheklovlar

- Yangi qo‘shimchalar (buyurtma, murojaat, rasm/ovoz) kompyuterda sinaldi; haqiqiy telefonda birinchi kunlarda tekshirib ko‘ring.
- **Ovozli izoh yozish** ba’zi telefonlarda Telegram ichida mikrofonga ruxsat bermasligi mumkin. Unda klaviaturadagi 🎤 bilan yoziladi.
- Telegram fayllarni bepul saqlaydi, lekin buning rasmiy kafolati yo‘q. Asosiy hisob (son, pul) Cloudflare bazasida.
- **Face ID / barmoq izi**: Telegram BiometricManager faqat yangi Telegram versiyalarida va biometrikasi bor telefonda ishlaydi. Bu telefonning o‘z tekshiruvi; shaxsni mutlaq kafolatlamaydi. Ishlamasa — istisno so‘rovi.
- **Joylashuv** telefondan keladi; maxsus dasturlar bilan soxtalashtirish mumkin. Shuning uchun rahbar istisnolarni va davomatni ko‘radi.
- **Ovozli kiritish**: telefon brauzerida ovoz tanish bo‘lsa ishlaydi; Telegram ichida ko‘pincha yo‘q — unda klaviaturadagi 🎤 diktovka bilan yoki yozib kiritiladi. Gapni ajratish AI emas, faqat mavjud katalog/partiya/xodimlardan aniq mosini topadi.
- Bitta korxona uchun mo‘ljallangan. Ombor/savdo tizimi yo‘q — «olinganlar»da ombor chiqimi raqamini matn sifatida bog‘lash mumkin.
- Bu ichki ishbay hisob; rasmiy ish haqi/soliq hisobini almashtirmaydi.

## 5. Yopiq kanalni ulash (rasm va ovozlar uchun)

1. Telegram → yangi kanal → «Private». «Restrict saving content» o‘chiq qolsin. Taklif havolasini hech kimga bermang.
2. Kanal → Administratorlar → botni qo‘shing, «Post messages» yoqilgan bo‘lsin.
3. Kanalga bitta xabar yozib, @userinfobot ga forward qiling → `-100…` raqam.
4. Cloudflare → Workers → muborak-brend-bot → Settings → Variables and Secrets → Add: Type **Text**, Name **PHOTO_CHAT_ID**, Value shu raqam → Deploy.

Kanal ulanmagan bo‘lsa ham ishlaydi: fayl yuboruvchining chatiga jim yuborilib, darhol o‘chiriladi (havola qoladi). Lekin kanal ishonchliroq.

## 6. Tizimdan oldingi ma’lumotni kiritish (dadamning daftari)

Bitta «o‘tish kuni» tanlang (masalan, oy boshi). Shu kungacha bo‘lganini quyidagicha kiriting:
- **Bichilgan, hali tarqatilmagan ko‘ylaklar**: Ишлаб чиқариш → «Бошланғич қолдиқ» → «Тарқатилмаган».
- **Tikuvchi qo‘lidagi (hali topshirmagan) ish**: o‘sha joyda «Тикувчида» + tikuvchini tanlang. Topshirganda tizim o‘zi haq yozadi.
- **Pul**: har xodim uchun bitta summa — Пул → xodim → «Тузатиш киритиш» (boshlang‘ich qoldiq). Xodim tasdiqlaydi.
- Qoida: tikuvchi qo‘lidagi, hali topshirmagan ish uchun pulni boshlang‘ich summaga **qo‘shmang** — aks holda ikki marta to‘lanadi.

## 7. Kod tuzilishi (qo‘shimchalar uchun)

- `src/schema.js` — baza sxemasi va migratsiyalar (yangi o‘zgarish = ro‘yxat oxiriga yangi element).
- `src/core/*.js` — har bo‘lim alohida: `staff`, `attendance`, `production`, `money`, `oylik` (olganlar, avans, oylik hisob), `orders` (buyurtma/zakaz), `murojaat`, `photos`, `reports`, `voice`. Yangi amal = shu fayllardan biriga yangi kalit.
- `src/worker.js` — Telegram imzosi, bildirishnomalar, ulanish. `src/auth.js` — imzo tekshiruvi.
- `public/js/xodim.js` — bichuvchi/tikuvchi ekranlari (lotin); `public/js/rahbar.js` — rahbar ekranlari (kirill); `public/js/buyurtma.js` — buyurtma ekranlari (ikkala yozuvda).
- `test/` — qabul sinovlari.
