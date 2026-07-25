// อ่าน/เขียน .xlsx (SpreadsheetML) เท่าที่ Time Table ต้องใช้ — ไม่พึ่งไลบรารีภายนอก
// อ่าน: sharedStrings + inlineStr, สีพื้น (solid fill), เซลล์เวลาแบบตัวเลข (numFmt), และ "คลี่" เซลล์ merge ให้เต็มกริด
// เขียน: inlineStr ทั้งหมด (ไม่ต้องมี sharedStrings), styles สร้างจาก registry ตามชุด font/fill/border/alignment ที่ใช้จริง

import { utf8Decode, utf8Encode, zipBuild, zipRead } from '@/lib/zip';

// ---------- โมเดลฝั่งอ่าน ----------

export interface XCell {
  /** ข้อความในเซลล์ (ตัวเลข/เวลาแปลงเป็นข้อความแล้ว) */
  text: string;
  /** สีพื้นแบบ '#RRGGBB' — null เมื่อไม่มีสี/เป็นสีขาว/อ้างธีม */
  fill: string | null;
}

export interface XSheet {
  name: string;
  /** กริดหนาแน่น เริ่มที่แถว/คอลัมน์ 0 — ช่องที่ไม่มีเซลล์เป็น { text: '', fill: null } */
  rows: XCell[][];
}

const EMPTY: XCell = { text: '', fill: null };

// ---------- ตัวช่วย XML ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unxml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10));
    return ENTITIES[e] ?? m;
  });
}

export function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? unxml(m[1]) : null;
}

/** 'AB' → 27 (1-based) */
export function colNum(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}

/** 1 → 'A', 27 → 'AA' */
export function colName(n: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + ((v - 1) % 26)) + s;
  return s;
}

/** 'B12' → { c: 2, r: 12 } (1-based) */
function refParse(ref: string): { c: number; r: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  return m ? { c: colNum(m[1]), r: +m[2] } : { c: 0, r: 0 };
}

// ---------- อ่าน .xlsx ----------

/** true เมื่อ format code เป็นเวลา (ชั่วโมง:นาที) ไม่ใช่วันที่ */
function isTimeFmt(code: string): boolean {
  const c = code.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/am\/pm|a\/p/g, '');
  return c.includes('h') && !c.includes('y') && !c.includes('d');
}

const BUILTIN_TIME = new Set([18, 19, 20, 21, 45, 46, 47]);

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** เศษส่วนของวัน (serial ของ Excel) → 'HH:MM' */
function serialToTime(v: number): string {
  const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const si = /<si\s*\/>|<si[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = si.exec(xml))) {
    const body = m[1] ?? '';
    let text = '';
    const t = /<t[^>]*\/>|<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = t.exec(body))) text += unxml(tm[1] ?? '');
    out.push(text);
  }
  return out;
}

interface StyleInfo {
  /** cellXfs[i] → สีพื้น '#RRGGBB' | null */
  xfFill: (string | null)[];
  /** cellXfs[i] → เป็นรูปแบบเวลาหรือไม่ */
  xfTime: boolean[];
}

function parseStyles(xml: string): StyleInfo {
  // numFmt กำหนดเอง (id ≥ 164)
  const timeFmtIds = new Set<number>(BUILTIN_TIME);
  const nf = /<numFmt[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = nf.exec(xml))) {
    const id = +(attr(m[0], 'numFmtId') ?? '-1');
    const code = attr(m[0], 'formatCode') ?? '';
    if (id >= 0 && isTimeFmt(code)) timeFmtIds.add(id);
  }

  // fills — index ตามลำดับที่ประกาศ
  const fills: (string | null)[] = [];
  const fillsBlock = xml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/);
  if (fillsBlock) {
    const one = /<fill\s*\/>|<fill[^>]*>([\s\S]*?)<\/fill>/g;
    while ((m = one.exec(fillsBlock[1]))) {
      const body = m[1] ?? '';
      const solid = /patternType="solid"/.test(body);
      const fg = body.match(/<fgColor[^>]*\/>/);
      const rgb = fg ? attr(fg[0], 'rgb') : null;
      // ธีม/indexed อ่านค่าจริงไม่ได้ → ถือว่าไม่มีสี เช่นเดียวกับสีขาว
      fills.push(solid && rgb && rgb.length >= 6 ? `#${rgb.slice(-6).toUpperCase()}` : null);
    }
  }

  const xfFill: (string | null)[] = [];
  const xfTime: boolean[] = [];
  const xfsBlock = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (xfsBlock) {
    const one = /<xf[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g;
    while ((m = one.exec(xfsBlock[1]))) {
      const head = m[0].slice(0, m[0].indexOf('>') + 1);
      const fillId = +(attr(head, 'fillId') ?? '0');
      const fmtId = +(attr(head, 'numFmtId') ?? '0');
      const c = fills[fillId] ?? null;
      xfFill.push(c === '#FFFFFF' ? null : c);
      xfTime.push(timeFmtIds.has(fmtId));
    }
  }
  return { xfFill, xfTime };
}

function parseSheet(xml: string, shared: string[], st: StyleInfo): XCell[][] {
  const grid: XCell[][] = [];
  const put = (r: number, c: number, cell: XCell) => {
    const row = (grid[r - 1] ??= []);
    row[c - 1] = cell;
  };

  const rowRe = /<row([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  let autoRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const r = +(attr(`<row${rm[1]}>`, 'r') ?? '0') || ++autoRow;
    autoRow = r;
    const body = rm[2] ?? '';
    let autoCol = 0;
    const cellRe = /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(body))) {
      const head = `<c${cm[1]}>`;
      const ref = attr(head, 'r');
      const c = ref ? refParse(ref).c : ++autoCol;
      autoCol = c;
      const sIdx = +(attr(head, 's') ?? '-1');
      const fill = sIdx >= 0 ? (st.xfFill[sIdx] ?? null) : null;
      const inner = cm[2] ?? '';
      const type = attr(head, 't') ?? 'n';

      let text = '';
      if (type === 'inlineStr') {
        const t = /<t[^>]*\/>|<t[^>]*>([\s\S]*?)<\/t>/g;
        let tm: RegExpExecArray | null;
        while ((tm = t.exec(inner))) text += unxml(tm[1] ?? '');
      } else {
        const v = inner.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        const raw = v ? unxml(v[1]) : '';
        if (type === 's') text = shared[+raw] ?? '';
        else if (type === 'str' || type === 'e') text = raw;
        else if (type === 'b') text = raw === '1' ? 'TRUE' : 'FALSE';
        else if (raw !== '') {
          const num = Number(raw);
          text = Number.isFinite(num) ? (sIdx >= 0 && st.xfTime[sIdx] ? serialToTime(num) : String(num)) : raw;
        }
      }
      if (text || fill) put(r, c, { text, fill });
    }
  }

  // คลี่ merge: เซลล์บนซ้ายถือค่าจริง — สำเนาไปทุกช่องในกรอบ (ความยาวกิจกรรมอยู่ในรูป merge แนวตั้ง)
  const mg = /<mergeCell[^>]*\/>/g;
  let mm: RegExpExecArray | null;
  while ((mm = mg.exec(xml))) {
    const ref = attr(mm[0], 'ref') ?? '';
    const [a, b] = ref.split(':');
    if (!a || !b) continue;
    const p1 = refParse(a);
    const p2 = refParse(b);
    const src = grid[p1.r - 1]?.[p1.c - 1];
    if (!src) continue;
    for (let r = p1.r; r <= p2.r; r++) {
      for (let c = p1.c; c <= p2.c; c++) {
        if (r === p1.r && c === p1.c) continue;
        put(r, c, { text: src.text, fill: src.fill });
      }
    }
  }

  // ทำให้หนาแน่น (ไม่มีช่องว่างเป็น undefined)
  const width = grid.reduce((w, row) => Math.max(w, row?.length ?? 0), 0);
  const out: XCell[][] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const dense: XCell[] = new Array(width);
    for (let c = 0; c < width; c++) dense[c] = row[c] ?? EMPTY;
    out.push(dense);
  }
  return out;
}

/** อ่านไฟล์ .xlsx เป็นรายการชีต — โยน Error เมื่อไฟล์ไม่ใช่ xlsx */
export function parseXlsx(bytes: Uint8Array): XSheet[] {
  const zip = zipRead(bytes);
  const text = (name: string): string | null => {
    const b = zip.get(name);
    return b ? utf8Decode(b) : null;
  };

  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('ไม่พบ xl/workbook.xml — ไฟล์นี้ไม่ใช่ .xlsx');

  const shared = parseSharedStrings(text('xl/sharedStrings.xml') ?? '');
  const styles = parseStyles(text('xl/styles.xml') ?? '');

  // rId → path ของ worksheet
  const rels = new Map<string, string>();
  const relXml = text('xl/_rels/workbook.xml.rels') ?? '';
  const relRe = /<Relationship[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(relXml))) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }

  const out: XSheet[] = [];
  const sheetRe = /<sheet[^>]*\/>/g;
  let i = 0;
  while ((m = sheetRe.exec(wb))) {
    i++;
    const name = attr(m[0], 'name') ?? `Sheet${i}`;
    const rid = attr(m[0], 'r:id') ?? attr(m[0], 'id');
    const path = `xl/${(rid && rels.get(rid)) || `worksheets/sheet${i}.xml`}`;
    const xml = text(path);
    if (xml) out.push({ name, rows: parseSheet(xml, shared, styles) });
  }
  if (!out.length) throw new Error('ไม่พบชีตในไฟล์');
  return out;
}

// ---------- โมเดลฝั่งเขียน ----------

export interface XStyle {
  fill?: string; // '#RRGGBB'
  color?: string; // สีตัวอักษร '#RRGGBB'
  size?: number; // pt
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  wrap?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  border?: boolean;
  /** เขียนเป็นค่าเวลา (numFmt hh:mm) — ค่า v ต้องเป็นเศษส่วนของวัน */
  time?: boolean;
}

export interface XWriteCell {
  v?: string | number;
  s?: XStyle;
}

export interface XWriteSheet {
  name: string;
  rows: (XWriteCell | null)[][];
  /** ความกว้างคอลัมน์ (index 0 = คอลัมน์ A) — ค่า undefined = ใช้ค่าปริยาย */
  colWidths?: (number | undefined)[];
  /** ความสูงแถว (index 0 = แถว 1) */
  rowHeights?: (number | undefined)[];
  /** ช่วง merge เช่น 'B6:B22' */
  merges?: string[];
  /** ตรึงแถว/คอลัมน์ — { cols: 1, rows: 3 } = ตรึงคอลัมน์ A และแถว 1–3 */
  freeze?: { cols: number; rows: number };
  /** ฟอนต์ปริยายของทั้งชีต */
  font?: string;
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** ทะเบียนสไตล์ — คีย์ซ้ำใช้ index เดิม ทำให้ styles.xml เล็กและ Excel ไม่บ่น */
class StyleBook {
  private fonts = new Map<string, number>();
  private fills = new Map<string, number>();
  private xfs = new Map<string, number>();
  fontXml: string[] = [];
  fillXml: string[] = [];
  xfXml: string[] = [];

  constructor(private defaultFont: string) {
    // ตำแหน่ง 0/1 ของ fills ถูกสงวนตามสเปก (none + gray125)
    this.fillXml.push('<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>');
    this.font({});
    this.xf({});
  }

  private font(s: XStyle): number {
    const key = `${s.bold ? 'b' : ''}|${s.italic ? 'i' : ''}|${s.strike ? 's' : ''}|${s.size ?? ''}|${s.color ?? ''}`;
    const hit = this.fonts.get(key);
    if (hit !== undefined) return hit;
    const idx = this.fontXml.length;
    this.fontXml.push(
      '<font>' +
        (s.bold ? '<b/>' : '') +
        (s.italic ? '<i/>' : '') +
        (s.strike ? '<strike/>' : '') +
        `<sz val="${s.size ?? 10}"/>` +
        `<color rgb="FF${(s.color ?? '#000000').slice(1).toUpperCase()}"/>` +
        `<name val="${xmlEsc(this.defaultFont)}"/>` +
        '</font>',
    );
    this.fonts.set(key, idx);
    return idx;
  }

  private fill(color: string | undefined): number {
    if (!color) return 0;
    const rgb = `FF${color.slice(1).toUpperCase()}`;
    const hit = this.fills.get(rgb);
    if (hit !== undefined) return hit;
    const idx = this.fillXml.length;
    this.fillXml.push(`<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor rgb="${rgb}"/></patternFill></fill>`);
    this.fills.set(rgb, idx);
    return idx;
  }

  /** คืน index ของ cellXfs สำหรับสไตล์นี้ */
  xf(s: XStyle): number {
    const key = JSON.stringify([s.fill, s.color, s.size, s.bold, s.italic, s.strike, s.wrap, s.align, s.valign, s.border, s.time]);
    const hit = this.xfs.get(key);
    if (hit !== undefined) return hit;
    const fontId = this.font(s);
    const fillId = this.fill(s.fill);
    const borderId = s.border ? 1 : 0;
    const numFmtId = s.time ? 164 : 0;
    const align =
      s.align || s.valign || s.wrap
        ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.valign ? ` vertical="${s.valign}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>`
        : '';
    const idx = this.xfXml.length;
    this.xfXml.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
        ` applyFont="1" applyFill="1" applyBorder="1"${align ? ' applyAlignment="1"' : ''}${s.time ? ' applyNumberFormat="1"' : ''}>` +
        align +
        '</xf>',
    );
    this.xfs.set(key, idx);
    return idx;
  }

  toXml(): string {
    return (
      HEAD +
      `<styleSheet xmlns="${NS}">` +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="hh:mm"/></numFmts>' +
      `<fonts count="${this.fontXml.length}">${this.fontXml.join('')}</fonts>` +
      `<fills count="${this.fillXml.length}">${this.fillXml.join('')}</fills>` +
      '<borders count="2"><border/>' +
      '<border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right>' +
      '<top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfXml.length}">${this.xfXml.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

function sheetXml(sheet: XWriteSheet, sb: StyleBook): string {
  const width = sheet.rows.reduce((w, r) => Math.max(w, r.length), 0);

  let cols = '';
  if (sheet.colWidths?.length) {
    const parts: string[] = [];
    sheet.colWidths.forEach((w, i) => {
      if (w) parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`);
    });
    if (parts.length) cols = `<cols>${parts.join('')}</cols>`;
  }

  let data = '';
  sheet.rows.forEach((row, r) => {
    const cells: string[] = [];
    row.forEach((cell, c) => {
      if (!cell || (cell.v === undefined && !cell.s)) return;
      const ref = `${colName(c + 1)}${r + 1}`;
      const s = cell.s ? sb.xf(cell.s) : 0;
      if (cell.v === undefined || cell.v === '') cells.push(`<c r="${ref}" s="${s}"/>`);
      else if (typeof cell.v === 'number') cells.push(`<c r="${ref}" s="${s}"><v>${cell.v}</v></c>`);
      else cells.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell.v)}</t></is></c>`);
    });
    const h = sheet.rowHeights?.[r];
    data += `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells.join('')}</row>`;
  });

  const fz = sheet.freeze;
  const views = fz
    ? `<sheetViews><sheetView workbookViewId="0"><pane${fz.cols ? ` xSplit="${fz.cols}"` : ''}${fz.rows ? ` ySplit="${fz.rows}"` : ''}` +
      ` topLeftCell="${colName(fz.cols + 1)}${fz.rows + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    : '';
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  return (
    HEAD +
    `<worksheet xmlns="${NS}">` +
    `<dimension ref="A1:${colName(Math.max(1, width))}${Math.max(1, sheet.rows.length)}"/>` +
    views +
    '<sheetFormatPr defaultRowHeight="15.75"/>' +
    cols +
    `<sheetData>${data}</sheetData>` +
    merges +
    '</worksheet>'
  );
}

/** สร้างไฟล์ .xlsx (ไบต์) จากชีตหลายแผ่น */
export function buildXlsx(sheets: XWriteSheet[], defaultFont = 'Kanit'): Uint8Array {
  const sb = new StyleBook(defaultFont);
  const bodies = sheets.map((s) => sheetXml(s, sb)); // ต้องเรนเดอร์ก่อน styles — ระหว่างนี้ registry ถูกเติม

  const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');

  const files: { name: string; text: string }[] = [
    {
      name: '[Content_Types].xml',
      text:
        HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      text:
        HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      text:
        HEAD +
        `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        '<sheets>' +
        sheets.map((s, i) => `<sheet name="${xmlEsc(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text:
        HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        rels +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    ...bodies.map((text, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text })),
    { name: 'xl/styles.xml', text: sb.toXml() },
  ];

  return zipBuild(files.map((f) => ({ name: f.name, data: utf8Encode(f.text) })));
}

/** ชื่อชีตของ Excel: ห้าม : \ / ? * [ ] และยาวไม่เกิน 31 ตัว */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'Sheet';
}
