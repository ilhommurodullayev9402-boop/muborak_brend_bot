#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
pkill -f "[w]rangler" >/dev/null 2>&1; pkill -f "[w]orkerd" >/dev/null 2>&1; sleep 2
rm -rf .wrangler/state
(npx wrangler dev --port 8787 --local > /tmp/wrangler-ui.log 2>&1 &)
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8787/ && break; sleep 1; done
NODE_PATH=$(npm root -g) node test/ui.mjs; R=$?
pkill -f "[w]rangler" >/dev/null 2>&1; pkill -f "[w]orkerd" >/dev/null 2>&1
exit $R
