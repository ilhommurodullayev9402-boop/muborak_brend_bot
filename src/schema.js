// Ma'lumotlar bazasi sxemasi. Har bir migratsiya faqat bir marta, tartib bilan ishlaydi.
// Mavjud jadvallarni o'chirmaydi; keyingi o'zgarishlar yangi raqamli migratsiya sifatida qo'shiladi.
export const MIGRATIONS = [
  // 1 — boshlang'ich sxema
  `
  CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE users(
    id INTEGER PRIMARY KEY, tg_id INTEGER UNIQUE NOT NULL,
    first_name TEXT, last_name TEXT, birth_date TEXT,
    role TEXT NOT NULL CHECK(role IN('rahbar','bichuvchi','tikuvchi')),
    status TEXT NOT NULL CHECK(status IN('pending','active','rejected','inactive')),
    can_inspect INTEGER NOT NULL DEFAULT 0, profile_done INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, decided_by INTEGER, decided_at TEXT, note TEXT, bio_hash TEXT);
  CREATE TABLE audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor_id INTEGER, action TEXT NOT NULL,
    entity TEXT, entity_id TEXT, before TEXT, after TEXT, reason TEXT);
  CREATE TABLE idem(key TEXT PRIMARY KEY, user_id INTEGER, action TEXT, result TEXT, at TEXT);
  CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE attendance(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, day TEXT NOT NULL,
    in_at TEXT, in_how TEXT, in_dist INTEGER, out_at TEXT, out_how TEXT, out_dist INTEGER,
    UNIQUE(user_id, day));
  CREATE TABLE att_exc(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, day TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN('in','out')), at TEXT NOT NULL, reason TEXT NOT NULL, note TEXT,
    status TEXT NOT NULL DEFAULT 'pending', decided_by INTEGER, decided_at TEXT, decide_note TEXT);
  CREATE UNIQUE INDEX att_exc_one ON att_exc(user_id, day, kind) WHERE status='pending';
  CREATE TABLE catalog(id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('type','model','material','color')),
    name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_by INTEGER, created_at TEXT);
  CREATE UNIQUE INDEX catalog_u ON catalog(kind, lower(name));
  CREATE TABLE batches(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, day TEXT NOT NULL,
    cutter_id INTEGER, type_id INTEGER NOT NULL, model TEXT NOT NULL, material TEXT NOT NULL, color TEXT NOT NULL,
    note TEXT, opening INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL);
  CREATE TABLE lines(id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL, size TEXT NOT NULL, UNIQUE(batch_id, size));
  CREATE TABLE bal(line_id INTEGER NOT NULL, state TEXT NOT NULL, holder INTEGER NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL CHECK(qty >= 0), PRIMARY KEY(line_id, state, holder));
  CREATE TABLE moves(id INTEGER PRIMARY KEY, at TEXT NOT NULL, day TEXT NOT NULL, line_id INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK(qty > 0), from_state TEXT, from_holder INTEGER, to_state TEXT, to_holder INTEGER,
    kind TEXT NOT NULL, ref TEXT, actor_id INTEGER, note TEXT);
  CREATE INDEX moves_day ON moves(day);
  CREATE TABLE transfers(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
    status TEXT NOT NULL, via TEXT, note TEXT, created_at TEXT NOT NULL, day TEXT NOT NULL,
    decided_at TEXT, decided_by INTEGER, dispute_note TEXT, resolve_note TEXT);
  CREATE TABLE transfer_items(id INTEGER PRIMARY KEY, transfer_id INTEGER NOT NULL, line_id INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK(qty > 0), counted INTEGER, accepted INTEGER);
  CREATE TABLE submissions(id INTEGER PRIMARY KEY, sewer_id INTEGER NOT NULL, line_id INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK(qty > 0), open_qty INTEGER NOT NULL CHECK(open_qty >= 0), from_state TEXT NOT NULL,
    at TEXT NOT NULL, day TEXT NOT NULL);
  CREATE TABLE inspections(id INTEGER PRIMARY KEY, submission_id INTEGER NOT NULL, accepted INTEGER NOT NULL,
    rework INTEGER NOT NULL, writeoff INTEGER NOT NULL, reason TEXT, inspector_id INTEGER NOT NULL, at TEXT NOT NULL, day TEXT NOT NULL);
  CREATE TABLE rates(id INTEGER PRIMARY KEY, work TEXT NOT NULL CHECK(work IN('bichish','tikish')), type_id INTEGER NOT NULL,
    model TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL CHECK(price >= 0), valid_from TEXT NOT NULL,
    note TEXT, created_by INTEGER, created_at TEXT NOT NULL);
  CREATE TABLE earnings(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, work TEXT NOT NULL, src TEXT UNIQUE NOT NULL,
    line_id INTEGER NOT NULL, qty INTEGER NOT NULL, day TEXT NOT NULL, rate_id INTEGER, price INTEGER, amount INTEGER, created_at TEXT NOT NULL);
  CREATE TABLE takeaways(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, day TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN('product','material','service')), name TEXT NOT NULL, qty REAL NOT NULL, unit TEXT,
    note TEXT, proposed INTEGER, amount INTEGER, status TEXT NOT NULL, pay_method TEXT, consent_at TEXT,
    stock_ref TEXT, dispute_note TEXT, created_at TEXT NOT NULL, updated_at TEXT);
  CREATE TABLE declarations(user_id INTEGER NOT NULL, period TEXT NOT NULL, answer TEXT NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY(user_id, period));
  CREATE TABLE settlements(id INTEGER PRIMARY KEY, takeaway_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    how TEXT NOT NULL CHECK(how IN('payroll','cash')), amount INTEGER NOT NULL CHECK(amount > 0), day TEXT NOT NULL,
    at TEXT NOT NULL, by_id INTEGER NOT NULL, note TEXT);
  CREATE TABLE payments(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0), day TEXT NOT NULL, period_from TEXT, period_to TEXT,
    method TEXT NOT NULL DEFAULT 'naqd', kind TEXT NOT NULL DEFAULT 'oylik', status TEXT NOT NULL,
    created_by INTEGER NOT NULL, created_at TEXT NOT NULL, confirmed_at TEXT, dispute_note TEXT, dispute_amount INTEGER,
    cancel_reason TEXT, reverse_reason TEXT);
  CREATE TABLE adjustments(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
    kind TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL, day TEXT NOT NULL,
    created_by INTEGER NOT NULL, created_at TEXT NOT NULL, decided_at TEXT, dispute_note TEXT);
  CREATE TABLE closures(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, period_from TEXT NOT NULL, period_to TEXT NOT NULL,
    at TEXT NOT NULL, by_id INTEGER NOT NULL, UNIQUE(user_id, period_from, period_to));
  CREATE TABLE reminders(user_id INTEGER NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(user_id, key));
  INSERT OR IGNORE INTO catalog(kind,name,created_at) VALUES
    ('type','Xalat',datetime('now')),('type','Ko‘ylak',datetime('now')),
    ('type','Uzun ko‘ylak',datetime('now')),('type','Bolalar ko‘ylagi',datetime('now'));
  INSERT OR IGNORE INTO settings(k,v) VALUES
    ('radius','150'),('max_acc','100'),('work_start','08:00'),('work_end','18:00'),
    ('break_start','13:00'),('break_min','60'),('grace_min','10'),('full_min','480'),('require_bio','1');
  `,
  // 2 — uydan ishlaydigan xodimlar (davomat talab qilinmaydi)
  `
  ALTER TABLE users ADD COLUMN remote INTEGER NOT NULL DEFAULT 0;
  `,
  // 3 — rasmlar va ovozli izohlar (Telegram'da saqlanadi, bazada faqat havola), avans so'rovlari, oylik hisob
  `
  CREATE TABLE photos(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, file_id TEXT NOT NULL, uniq TEXT,
    w INTEGER, h INTEGER, created_at TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'photo', mime TEXT);
  ALTER TABLE transfers ADD COLUMN voice_id INTEGER;
  ALTER TABLE batches ADD COLUMN photo_id INTEGER;
  ALTER TABLE takeaways ADD COLUMN photo_id INTEGER;
  CREATE TABLE avans_req(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
    note TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT, decided_by INTEGER, payment_id INTEGER, answer_note TEXT);
  CREATE UNIQUE INDEX avans_one_open ON avans_req(user_id) WHERE status='pending';
  CREATE TABLE reckonings(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, period TEXT NOT NULL, from_day TEXT NOT NULL, to_day TEXT NOT NULL,
    data TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL, created_by INTEGER, created_at TEXT NOT NULL,
    answered_at TEXT, dispute_note TEXT);
  CREATE INDEX rk_user ON reckonings(user_id, status);
  `,
  // 4 — alohida buyurtmalar (zakaz): mijoz, o'lchamlar, muddat, kiyib ko'rish natijasi, mijoz to'lovlari, bichuvchidagi naqd pul
  `
  ALTER TABLE earnings ADD COLUMN order_id INTEGER;
  CREATE TABLE orders(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, cutter_id INTEGER NOT NULL,
    customer TEXT NOT NULL, phone TEXT, product TEXT NOT NULL, measures TEXT, note TEXT, photo_id INTEGER, voice_id INTEGER,
    price INTEGER, price_ok INTEGER NOT NULL DEFAULT 0, cut_pay INTEGER, sew_pay INTEGER,
    due_day TEXT NOT NULL, status TEXT NOT NULL, sewer_id INTEGER, fix_by TEXT, fixes INTEGER NOT NULL DEFAULT 0,
    day TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT, done_day TEXT);
  CREATE INDEX orders_st ON orders(status, due_day);
  CREATE TABLE order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, at TEXT NOT NULL, actor_id INTEGER,
    kind TEXT NOT NULL, note TEXT, voice_id INTEGER, data TEXT);
  CREATE INDEX order_events_o ON order_events(order_id);
  CREATE TABLE order_pays(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
    day TEXT NOT NULL, at TEXT NOT NULL, receiver_id INTEGER NOT NULL, note TEXT, cancelled_at TEXT, cancel_reason TEXT);
  CREATE INDEX order_pays_o ON order_pays(order_id);
  CREATE TABLE cash_handovers(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
    how TEXT NOT NULL CHECK(how IN('cash','payroll')), status TEXT NOT NULL, day TEXT NOT NULL, note TEXT,
    created_at TEXT NOT NULL, decided_at TEXT, decided_by INTEGER, answer_note TEXT);
  CREATE TABLE measure_tpl(user_id INTEGER PRIMARY KEY, fields TEXT NOT NULL);
  `,
  // 5 — murojaatlar: ruxsat so'rash (kunlar bilan), bichim xatosi, kamomad, kelishmovchilik va h.k. Faqat rahbar ko'radi.
  `
  CREATE TABLE appeals(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT, voice_id INTEGER, photo_id INTEGER,
    ref TEXT, from_day TEXT, to_day TEXT, status TEXT NOT NULL, answer TEXT, answered_by INTEGER, answered_at TEXT,
    created_at TEXT NOT NULL, day TEXT NOT NULL);
  CREATE INDEX appeals_st ON appeals(status, id);
  CREATE INDEX appeals_u ON appeals(user_id, id);
  `,
  // 6 — fasonlar va tariflar, har bir «Bichdim» alohida yozuv (tuzatish tarixi bilan), bichishga yordamchi ulushi.
  // Mavjud yozuvlar o'chirilmaydi: eski bichimlar harakatlar (moves) asosida alohida yozuv sifatida tiklanadi.
  `
  CREATE TABLE fasons(id INTEGER PRIMARY KEY, name TEXT NOT NULL, type_id INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER, created_at TEXT NOT NULL);
  CREATE UNIQUE INDEX fasons_u ON fasons(type_id, lower(name));
  CREATE TABLE fason_rates(id INTEGER PRIMARY KEY, fason_id INTEGER NOT NULL, sew_price INTEGER NOT NULL CHECK(sew_price >= 0),
    extra_price INTEGER NOT NULL DEFAULT 0 CHECK(extra_price >= 0), extra_note TEXT, valid_from TEXT NOT NULL, note TEXT,
    created_by INTEGER, created_at TEXT NOT NULL);
  CREATE INDEX fason_rates_f ON fason_rates(fason_id, valid_from);
  CREATE TABLE flat_rates(id INTEGER PRIMARY KEY, work TEXT NOT NULL CHECK(work IN('bichish','bichish_yordam')),
    price INTEGER NOT NULL CHECK(price >= 0), valid_from TEXT NOT NULL, note TEXT, created_by INTEGER, created_at TEXT NOT NULL);
  ALTER TABLE batches ADD COLUMN fason_id INTEGER;
  ALTER TABLE batches ADD COLUMN pay_on_cut INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE cuts(id INTEGER PRIMARY KEY, batch_id INTEGER NOT NULL, cutter_id INTEGER, day TEXT NOT NULL, at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','void')), legacy INTEGER NOT NULL DEFAULT 0,
    helper_id INTEGER, helper_qty INTEGER NOT NULL DEFAULT 0 CHECK(helper_qty >= 0), cut_price INTEGER, helper_price INTEGER,
    created_by INTEGER, edited_at TEXT, void_at TEXT, void_by INTEGER, void_reason TEXT);
  CREATE INDEX cuts_b ON cuts(batch_id);
  CREATE INDEX cuts_c ON cuts(cutter_id, id);
  CREATE TABLE cut_lines(id INTEGER PRIMARY KEY, cut_id INTEGER NOT NULL, line_id INTEGER NOT NULL,
    ready INTEGER NOT NULL DEFAULT 0 CHECK(ready >= 0), partial INTEGER NOT NULL DEFAULT 0 CHECK(partial >= 0), UNIQUE(cut_id, line_id));
  CREATE TABLE cut_edits(id INTEGER PRIMARY KEY, cut_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN('edit','void')),
    at TEXT NOT NULL, day TEXT NOT NULL, actor_id INTEGER NOT NULL, reason TEXT NOT NULL, before TEXT NOT NULL, after TEXT NOT NULL);
  CREATE INDEX cut_edits_c ON cut_edits(cut_id);
  ALTER TABLE earnings ADD COLUMN cut_id INTEGER;
  ALTER TABLE earnings ADD COLUMN extra INTEGER;
  ALTER TABLE earnings ADD COLUMN note TEXT;
  -- Eski bichimlar: bir partiyadagi har bir bichish amali (bir vaqtda yozilgan harakatlar) alohida yozuv bo'ladi
  INSERT INTO cuts(batch_id,cutter_id,day,at,status,legacy,created_by)
    SELECT l.batch_id, b.cutter_id, MIN(m.day), m.at, 'active', 1, MIN(m.actor_id)
    FROM moves m JOIN lines l ON l.id=m.line_id JOIN batches b ON b.id=l.batch_id
    WHERE m.kind IN('cut_ready','cut_partial') AND b.opening=0 GROUP BY l.batch_id, m.at ORDER BY MIN(m.id);
  INSERT INTO cut_lines(cut_id,line_id,ready,partial)
    SELECT c.id, m.line_id, SUM(CASE WHEN m.kind='cut_ready' THEN m.qty ELSE 0 END), SUM(CASE WHEN m.kind='cut_partial' THEN m.qty ELSE 0 END)
    FROM cuts c JOIN lines l ON l.batch_id=c.batch_id JOIN moves m ON m.line_id=l.id AND m.at=c.at AND m.kind IN('cut_ready','cut_partial')
    GROUP BY c.id, m.line_id;
  -- Fasonlar: mavjud partiyalardagi (tur + model) juftliklaridan; partiyalar o'z fasoniga bog'lanadi
  INSERT OR IGNORE INTO fasons(name,type_id,active,created_at)
    SELECT model, type_id, 1, datetime('now') FROM batches GROUP BY type_id, lower(model) ORDER BY MIN(id);
  UPDATE batches SET fason_id=(SELECT f.id FROM fasons f WHERE f.type_id=batches.type_id AND lower(f.name)=lower(batches.model));
  -- Joriy tikish tarifi (bo'lsa) fasonga ko'chiriladi; eski hisoblar o'zgarmaydi
  INSERT INTO fason_rates(fason_id,sew_price,extra_price,valid_from,note,created_at)
    SELECT f.id, r.price, 0, date('now','+5 hours'), 'Eski tarifdan ko‘chirildi', datetime('now') FROM fasons f
    JOIN rates r ON r.id=(SELECT r2.id FROM rates r2 WHERE r2.work='tikish' AND r2.type_id=f.type_id
      AND (r2.model='' OR lower(r2.model)=lower(f.name)) AND r2.valid_from<=date('now','+5 hours')
      ORDER BY (r2.model<>'') DESC, r2.valid_from DESC, r2.id DESC LIMIT 1);
  -- Bichish tarifi barcha fasonlar uchun bitta: 8 000 so'm/dona. Yordamchi tarifi ham boshlanishiga shunday (rahbar o'zgartiradi).
  INSERT INTO flat_rates(work,price,valid_from,note,created_at) VALUES
    ('bichish',8000,date('now','+5 hours'),'Boshlang‘ich tarif',datetime('now')),
    ('bichish_yordam',8000,date('now','+5 hours'),'Boshlang‘ich tarif',datetime('now'));
  `,
];

export function migrate(exec, one) {
  exec('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)');
  const row = one("SELECT v FROM meta WHERE k='schema_version'");
  let v = row ? Number(row.v) : 0;
  const ran = [];
  for (let i = v; i < MIGRATIONS.length; i++) {
    exec(MIGRATIONS[i]);
    v = i + 1;
    exec("INSERT INTO meta(k,v) VALUES('schema_version',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(v));
    ran.push(v);
  }
  return ran;
}
