#!/usr/bin/env bash
# Jonli kod (GitHub main) bilan to'ldirilgan baza → zaxira JSON → nusxada yangi migratsiya → solishtirish.
# Ikkinchi qism: o'sha baza holatida yangi server ishga tushadi (haqiqiy workerd muhitida migratsiya) va pul xulosasi solishtiriladi.
set -u
cd "$(dirname "$0")/.."
NEW=$(pwd); OLDREV=${OLDREV:-ce0f4d5}; W=${TMPDIR:-/tmp}/muborak-eski
stop() { pkill -f "[w]rangler" >/dev/null 2>&1; pkill -f "[w]orkerd" >/dev/null 2>&1; for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8787/ || return 0; sleep 1; done; }
up() { for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8787/ && return; sleep 1; done; echo "server ko'tarilmadi"; exit 1; }
rm -rf "$W"; git worktree prune; git worktree add -f "$W" "$OLDREV" >/dev/null 2>&1 || { echo "worktree xato"; exit 1; }
cp .dev.vars "$W/"; ln -s "$NEW/node_modules" "$W/node_modules"
stop
(cd "$W" && npx wrangler dev --port 8787 --local --persist-to "$W/state" > /tmp/mig-old.log 2>&1 &); up
(cd "$W" && node test/acceptance.mjs main > /tmp/mig-old-test.log 2>&1); echo "eski kod sinovi: $(tail -1 /tmp/mig-old-test.log)"
node test/zaxira-ol.mjs "$W/zaxira-v5.json" "$W/pul-oldin.json" || exit 1
stop
node tools/zaxira.mjs "$W/zaxira-v5.json" --old "$W/src" --out "$W/hisobot.md" --db "$W/nusxa.sqlite"; R=$?
# Haqiqiy muhitda: yangi kod o'sha bazani ochadi (migratsiya o'zi ishlaydi)
(npx wrangler dev --port 8787 --local --persist-to "$W/state" > /tmp/mig-new.log 2>&1 &); up
node test/zaxira-ol.mjs "$W/zaxira-v6.json" "$W/pul-keyin.json" || exit 1
stop
if cmp -s "$W/pul-oldin.json" "$W/pul-keyin.json"; then echo "✅ workerd: pul xulosasi (ish haqi, to‘langan, qoldiq) o‘zgarmadi"; else echo "❌ workerd: pul xulosasi farq qildi"; R=1; fi
node -e "const j=require('$W/zaxira-v6.json');console.log('workerd: sxema', j.tables.meta.find(r=>r.k==='schema_version').v, '· bichim yozuvlari', j.tables.cuts.length, '· tiklash nuqtasi', j.tables.meta.filter(r=>r.k.startsWith('bookmark')).map(r=>r.k).join(',')||'yo‘q (lokal)')"
exit $R
