// Lokal serverdan «Захира нусха» (export_all) ni olib faylga yozadi va pul xulosasini saqlaydi (migratsiya sinovi uchun).
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { signInitData } from '../src/auth.js';
const [out, sumOut] = process.argv.slice(2);
let doc = null;
const mock = http.createServer((req, res) => {
  const ch = [];
  req.on('data', (c) => ch.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(ch), d = buf.toString('latin1');
    if (req.url.endsWith('/sendDocument') && /filename="muborak-zaxira/.test(d)) {
      const b = '--' + req.headers['content-type'].match(/boundary=(.+)$/)[1];
      const fi = d.indexOf('filename="muborak-zaxira'); const hs = d.indexOf('\r\n\r\n', fi) + 4; const end = d.indexOf('\r\n' + b, hs);
      doc = buf.subarray(hs, end).toString('utf8');
    }
    res.end('{"ok":true,"result":{"message_id":1}}');
  });
}).listen(8799);
const init = await signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE1000', user: JSON.stringify({ id: 1000, first_name: 'T' }) }, '123456:TEST_TOKEN_FOR_LOCAL_ONLY');
const call = async (a, b = {}) => (await (await fetch('http://127.0.0.1:8787/api/' + a, { method: 'POST', headers: { 'content-type': 'application/json', 'x-init-data': init }, body: JSON.stringify(b) })).json());
const r = await call('export_all');
await new Promise((ok) => setTimeout(ok, 300));
if (!r.ok || !doc) { console.error('zaxira olinmadi', r); process.exit(1); }
writeFileSync(out, doc);
if (sumOut) writeFileSync(sumOut, JSON.stringify((await call('money_summary')).result.map((u) => [u.id, u.earned, u.paid, u.balance, u.payable])));
console.log('zaxira:', out, doc.length, 'bayt');
mock.close();
