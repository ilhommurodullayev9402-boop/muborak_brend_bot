#!/usr/bin/env bash
# Toza baza bilan serverni ko'taradi, sinovlarni o'tkazadi, serverni qayta ishga tushirib 14-sinovni tekshiradi.
set -u
cd "$(dirname "$0")/.."
stop() { pkill -f "[w]rangler" >/dev/null 2>&1; pkill -f "[w]orkerd" >/dev/null 2>&1; for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8787/ || return 0; sleep 1; done; }
start() { (npx wrangler dev --port 8787 --local > /tmp/wrangler-test.log 2>&1 &); for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8787/ && return; sleep 1; done; echo "server ko'tarilmadi"; exit 1; }
stop; rm -rf .wrangler/state; start
node test/acceptance.mjs main; A=$?
stop; start
node test/acceptance.mjs restart; B=$?
stop
exit $((A + B))
