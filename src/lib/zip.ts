// ZIP อ่าน/เขียนแบบพอเพียงสำหรับ .xlsx — ไม่พึ่งไลบรารีภายนอก (RN/Hermes ไม่มี zlib)
// เขียน: method 0 (store) ไฟล์ใหญ่กว่านิดแต่ทุกโปรแกรมเปิดได้ · อ่าน: รองรับ store + deflate (inflate เขียนเอง)
// UTF-8 encode/decode เขียนเองด้วย — TextEncoder/TextDecoder ไม่การันตีว่ามีบนทุกเวอร์ชันของ Hermes

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// ---------- UTF-8 ----------

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  let chunk: number[] = [];
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c < 0xe0) {
      cp = ((c & 31) << 6) | (b[i + 1] & 63);
      i += 2;
    } else if (c < 0xf0) {
      cp = ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63);
      i += 3;
    } else {
      cp = ((c & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63);
      i += 4;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else chunk.push(cp);
    // ทยอยต่อสตริงทีละก้อน — String.fromCharCode(...arr) ยาวเกินจะ stack overflow
    if (chunk.length >= 4096) {
      s += String.fromCharCode(...chunk);
      chunk = [];
    }
  }
  return s + String.fromCharCode(...chunk);
}

// ---------- CRC32 ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------- เขียน ZIP (store) ----------

/** เขียนไฟล์ ZIP จากรายการ entry — ไม่บีบอัด (method 0) และตราเวลาเป็นค่าคงที่ให้ผลลัพธ์ซ้ำได้ */
export function zipBuild(entries: ZipEntry[]): Uint8Array {
  const parts: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  let size = 0;
  for (const e of entries) {
    const name = utf8Encode(e.name);
    size += 30 + name.length + e.data.length + 46 + name.length;
    parts.push({ name, data: e.data, crc: crc32(e.data), offset: 0 });
  }
  const out = new Uint8Array(size + 22);
  const dv = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => {
    dv.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number) => {
    dv.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const raw = (b: Uint8Array) => {
    out.set(b, p);
    p += b.length;
  };

  const DOS_TIME = 0; // 00:00
  const DOS_DATE = 0x21; // 1980-01-01

  for (const f of parts) {
    f.offset = p;
    u32(0x04034b50);
    u16(20); // version needed
    u16(0x0800); // flag: ชื่อไฟล์เป็น UTF-8
    u16(0); // method: store
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0);
    raw(f.name);
    raw(f.data);
  }

  const cdStart = p;
  for (const f of parts) {
    u32(0x02014b50);
    u16(20); // version made by
    u16(20);
    u16(0x0800);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attrs
    u32(0); // external attrs
    u32(f.offset);
    raw(f.name);
  }

  const cdSize = p - cdStart;
  u32(0x06054b50);
  u16(0); // disk นี้
  u16(0); // disk ที่มี central directory
  u16(parts.length);
  u16(parts.length);
  u32(cdSize);
  u32(cdStart);
  u16(0); // comment
  return out.subarray(0, p);
}

// ---------- อ่าน ZIP ----------

/** แตกไฟล์ ZIP เป็น map ชื่อ→ไบต์ (รองรับ store และ deflate) — โยน Error เมื่อไม่ใช่ ZIP */
export function zipRead(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // หา End of Central Directory จากท้ายไฟล์ (comment ยาวสุด 64KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ไม่ใช่ไฟล์ ZIP/xlsx');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = utf8Decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // ความยาว name/extra ของ local header อาจไม่เท่า central directory — ต้องอ่านจาก local เอง
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + csize);
    out.set(name, method === 0 ? raw : inflateRaw(raw));
  }
  return out;
}

// ---------- inflate (RFC 1951) ----------

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huff {
  counts: Int32Array; // จำนวนรหัสของแต่ละความยาวบิต
  symbols: Int32Array; // สัญลักษณ์เรียงตามรหัส canonical
}

function buildHuff(lengths: Uint8Array, n: number): Huff {
  const counts = new Int32Array(16);
  for (let i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  const offs = new Int32Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  const symbols = new Int32Array(n);
  for (let i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

/** แตก deflate stream ดิบ (ไม่มีหัว zlib) — อัลกอริทึม puff มาตรฐาน */
export function inflateRaw(src: Uint8Array): Uint8Array {
  let bitBuf = 0;
  let bitCnt = 0;
  let pos = 0;
  let out = new Uint8Array(Math.max(1024, src.length * 4));
  let len = 0;

  const grow = (need: number) => {
    if (len + need <= out.length) return;
    let cap = out.length;
    while (cap < len + need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(out.subarray(0, len));
    out = next;
  };
  const bits = (n: number): number => {
    while (bitCnt < n) {
      if (pos >= src.length) throw new Error('deflate: ข้อมูลขาด');
      bitBuf |= src[pos++] << bitCnt;
      bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return v;
  };
  const decode = (h: Huff): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let l = 1; l < 16; l++) {
      code |= bits(1);
      const count = h.counts[l];
      if (code - first < count) return h.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('deflate: รหัสผิดรูป');
  };

  const fixedLit = (() => {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144);
    l.fill(9, 144, 256);
    l.fill(7, 256, 280);
    l.fill(8, 280, 288);
    return buildHuff(l, 288);
  })();
  const fixedDist = buildHuff(new Uint8Array(30).fill(5), 30);

  for (;;) {
    const last = bits(1);
    const type = bits(2);

    if (type === 0) {
      bitBuf = 0;
      bitCnt = 0;
      const n = src[pos] | (src[pos + 1] << 8);
      pos += 4; // ข้าม LEN + NLEN
      grow(n);
      out.set(src.subarray(pos, pos + n), len);
      len += n;
      pos += n;
    } else {
      let lit: Huff;
      let dist: Huff;
      if (type === 1) {
        lit = fixedLit;
        dist = fixedDist;
      } else if (type === 2) {
        const nlen = bits(5) + 257;
        const ndist = bits(5) + 1;
        const ncode = bits(4) + 4;
        const clen = new Uint8Array(19);
        for (let i = 0; i < ncode; i++) clen[CLEN_ORDER[i]] = bits(3);
        const clh = buildHuff(clen, 19);
        const lengths = new Uint8Array(nlen + ndist);
        for (let i = 0; i < nlen + ndist; ) {
          const sym = decode(clh);
          if (sym < 16) lengths[i++] = sym;
          else if (sym === 16) {
            const prev = lengths[i - 1];
            for (let r = bits(2) + 3; r > 0; r--) lengths[i++] = prev;
          } else if (sym === 17) {
            for (let r = bits(3) + 3; r > 0; r--) lengths[i++] = 0;
          } else {
            for (let r = bits(7) + 11; r > 0; r--) lengths[i++] = 0;
          }
        }
        lit = buildHuff(lengths.subarray(0, nlen), nlen);
        dist = buildHuff(lengths.subarray(nlen), ndist);
      } else throw new Error('deflate: block type สงวน');

      for (;;) {
        const sym = decode(lit);
        if (sym < 256) {
          grow(1);
          out[len++] = sym;
        } else if (sym === 256) break;
        else {
          const li = sym - 257;
          const l = LEN_BASE[li] + bits(LEN_EXTRA[li]);
          const di = decode(dist);
          const d = DIST_BASE[di] + bits(DIST_EXTRA[di]);
          grow(l);
          let from = len - d;
          for (let i = 0; i < l; i++) out[len++] = out[from++];
        }
      }
    }
    if (last) break;
  }
  return out.subarray(0, len);
}
