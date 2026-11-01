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
