// Oddiy ZIP yasovchi. Siqish va CRC32 ni Workers'ning o'z (native) gzip siquvchisi bajaradi:
// gzip natijasining ichida tayyor deflate ma'lumoti va CRC32 bor — JavaScript'da hisoblash shart emas (CPU tejaladi).
const enc = new TextEncoder();

async function gzip(bytes) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(out);
}

function gzParts(gz) {
  // RFC 1952: 10 bayt sarlavha (+ ixtiyoriy maydonlar), oxirida CRC32 va asl hajm
  const flg = gz[3];
  let p = 10;
  if (flg & 4) p += 2 + (gz[p] | (gz[p + 1] << 8));
  if (flg & 8) { while (gz[p++]); }
  if (flg & 16) { while (gz[p++]); }
  if (flg & 2) p += 2;
  const n = gz.length;
  const crc = (gz[n - 8] | (gz[n - 7] << 8) | (gz[n - 6] << 16) | (gz[n - 5] << 24)) >>> 0;
  return { deflated: gz.subarray(p, n - 8), crc };
}

// Siqilmaydigan fayllar (jpg, ovoz) uchun CRC32 JavaScript'da hisoblanadi — gzip'dan ancha tez
let CRC_T = null;
function crc32(b) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(ms) {
  const d = new Date(ms + 5 * 3600000); // Toshkent vaqti
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

export class ZipWriter {
  constructor(nowMs) { this.chunks = []; this.central = []; this.offset = 0; this.count = 0; this.t = dosTime(nowMs); this.names = new Set(); }
  get size() { return this.offset + this.central.reduce((a, c) => a + c.length, 0) + 22; }
  uniqueName(name) {
    if (!this.names.has(name)) { this.names.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const base = dot > name.lastIndexOf('/') ? name.slice(0, dot) : name, ext = dot > name.lastIndexOf('/') ? name.slice(dot) : '';
    for (let i = 2; ; i++) { const n = `${base}_${i}${ext}`; if (!this.names.has(n)) { this.names.add(n); return n; } }
  }
  // store=true: siqmasdan saqlash (jpg, ovoz allaqachon siqilgan)
  async add(name, data, store = false) {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    const nameB = enc.encode(this.uniqueName(name));
    let deflated = null, crc;
    if (store) crc = crc32(bytes);
    else ({ deflated, crc } = gzParts(await gzip(bytes)));
    const useDeflate = !!deflated && deflated.length < bytes.length * 0.95;
    const body = useDeflate ? deflated : bytes;
    const method = useDeflate ? 8 : 0;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); // UTF-8 nomlar
    h.setUint16(8, method, true); h.setUint16(10, this.t.time, true); h.setUint16(12, this.t.date, true);
    h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, bytes.length, true);
    h.setUint16(26, nameB.length, true); h.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, method, true); c.setUint16(12, this.t.time, true); c.setUint16(14, this.t.date, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, bytes.length, true);
    c.setUint16(28, nameB.length, true); c.setUint32(42, this.offset, true);
    const cen = new Uint8Array(46 + nameB.length); cen.set(new Uint8Array(c.buffer), 0); cen.set(nameB, 46);
    this.chunks.push(new Uint8Array(h.buffer), nameB, body);
    this.central.push(cen);
    this.offset += 30 + nameB.length + body.length;
    this.count++;
  }
  finish() {
    const cenSize = this.central.reduce((a, c) => a + c.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, this.count, true); e.setUint16(10, this.count, true);
    e.setUint32(12, cenSize, true); e.setUint32(16, this.offset, true);
    return new Blob([...this.chunks, ...this.central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
}
