// Time Table ↔ .xlsx — เลียนโครงไฟล์ "Time Table จอย.xlsx" ให้ครบทั้งโครง สี ฟอนต์ และเซลล์ merge
//
// โครงหนึ่งเดือน (หนึ่งชีต):
//   คอลัมน์ A = ป้ายเวลา · คอลัมน์วันเรียงต่อกัน คั่นด้วยคอลัมน์ดำแคบทุกต้นสัปดาห์ (จันทร์)
//   แถว 1 "MONTH m/yyyy" + แถบ WEEK n (พื้นส้ม, merge ทั้งแถบ) · แถว 2 "Date" + ชื่อวันอังกฤษ · แถว 3 "Time" + เลขวันที่
//   แถว 4 เป็นต้นไป = ช่องเวลาละ 30 นาที 06:00 → 06:00 ของวันถัดไป (33 แถว)
//   กิจกรรมที่ยาวหลายช่องถูก merge แนวตั้งเป็นบล็อกเดียว — ตัวอ่านฝั่งนำเข้าคลี่ merge กลับเป็นช่วงเวลาได้ตรง ๆ
//
// สีพื้น: ใช้ Activity.color ที่จำมาจากไฟล์ต้นฉบับก่อน ถ้าไม่มีจึงใช้สีอ่อนตามหมวด — ทุกสีผ่านโทนที่เลือก (lib/export-theme)

import { CAT_BY_ID, CATS, DAY_END, DAY_START } from '@/constants/theme';
import { fromISO, toISO, wdMon } from '@/lib/dates';
import { EXPORT_PALETTES, EXPORT_TONES, type ExportPalette } from '@/lib/export-theme';
import { parseTimeTableCells, type TimeTableImport } from '@/lib/timetable';
import type { DayItem } from '@/lib/types';
import { buildXlsx, colName, parseXlsx, type XStyle, type XWriteCell, type XWriteSheet } from '@/lib/xlsx';

type Read = (date: string) => DayItem[];

// ขนาด/ระยะ — ตรงกับ "Time Table จอย.xlsx" (สีมาจากพาเลตต์ ไม่ผูกกับตรงนี้)
const W_TIME = 14.13;
const W_DAY = 12.63;
const W_SEP = 1.38;
const H_ROW = 15.75;
const H_TIME_HEAD = 19.5;
const EN_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HEAD_STYLE = (pal: ExportPalette): XStyle => ({ bold: true, size: 10, color: pal.ink, align: 'center', valign: 'center' });

/** โครงคอลัมน์ของเดือน: เวลา + วัน + ตัวคั่นทุกวันจันทร์ */
type Col = { kind: 'time' } | { kind: 'sep' } | { kind: 'day'; date: string; n: number };

function monthCols(y: number, m: number): Col[] {
  const nDays = new Date(y, m + 1, 0).getDate();
  const cols: Col[] = [{ kind: 'time' }];
  for (let i = 0; i < nDays; i++) {
    const date = toISO(new Date(y, m, i + 1));
    if (i > 0 && wdMon(date) === 0) cols.push({ kind: 'sep' });
    cols.push({ kind: 'day', date, n: i + 1 });
  }
  return cols;
}

/** สีพื้น/สีอักษรของเซลล์กิจกรรม — สีที่จำจากไฟล์มาก่อน ไม่มีจึงใช้สีตามหมวด · ทั้งคู่ปรับตามโทนที่เลือก */
function itemColors(it: DayItem, pal: ExportPalette): { fill: string; color: string } {
  const fill = it.color ? pal.userFill(it.color) : pal.catTint(CAT_BY_ID[it.cat].color);
  const color =
    it.ostatus === 'done' ? pal.ok : it.ostatus === 'skipped' ? pal.bad : it.color ? pal.userInk : pal.catInk(CAT_BY_ID[it.cat].color);
  return { fill, color };
}

/** ชื่อกิจกรรมพร้อมเครื่องหมายสถานะ (ตัวอ่านฝั่งนำเข้าตัดเครื่องหมายทิ้งเอง) */
function itemText(it: DayItem): string {
  return it.ostatus === 'done' ? `✓ ${it.title}` : it.ostatus === 'skipped' ? `✗ ${it.title}` : it.title;
}

/** หนึ่งเดือน → หนึ่งชีต */
function monthSheet(read: Read, anchor: string, pal: ExportPalette): XWriteSheet {
  const SEP_CELL: XWriteCell = { s: { fill: pal.sep } };
  const a = fromISO(anchor);
  const y = a.getFullYear();
  const m = a.getMonth();
  const cols = monthCols(y, m);
  const nCols = cols.length;

  const slots: number[] = [];
  for (let t = DAY_START; t < DAY_END; t += 30) slots.push(t);
  const FIRST_SLOT_ROW = 4; // แถว 1–3 เป็นหัวตาราง

  const rows: (XWriteCell | null)[][] = [];
  const merges: string[] = [];
  const rowHeights: (number | undefined)[] = [];
  const at = (r: number): (XWriteCell | null)[] => (rows[r] ??= new Array<XWriteCell | null>(nCols).fill(null));

  // ---------- แถว 1: MONTH + แถบ WEEK ----------
  const r1 = at(0);
  r1[0] = { v: `MONTH ${m + 1}/${y}`, s: { bold: true, size: 11, color: pal.ink, align: 'center', valign: 'center' } };
  let week = 0;
  for (let c = 1; c < nCols; c++) {
    const col = cols[c];
    if (col.kind === 'sep') {
      r1[c] = SEP_CELL;
      continue;
    }
    // ต้นแถบ (คอลัมน์แรกหลังตัวคั่น หรือคอลัมน์วันแรกสุด)
    const isBandStart = c === 1 || cols[c - 1].kind === 'sep';
    if (!isBandStart) continue;
    let end = c;
    while (end + 1 < nCols && cols[end + 1].kind === 'day') end++;
    // แถบแรกที่ไม่ได้เริ่มวันจันทร์เป็นเศษต้นเดือน — ไม่นับเป็น WEEK (เหมือนไฟล์ต้นฉบับ)
    const label = col.kind === 'day' && wdMon(col.date) === 0 ? `WEEK ${++week}` : '';
    r1[c] = { v: label, s: { fill: pal.band, color: pal.bandInk, bold: true, size: 10, align: 'center', valign: 'center' } };
    for (let x = c + 1; x <= end; x++) r1[x] = { s: { fill: pal.band } };
    if (end > c) merges.push(`${colName(c + 1)}1:${colName(end + 1)}1`);
  }
  rowHeights[0] = H_ROW;

  // ---------- แถว 2: ชื่อวัน · แถว 3: เลขวันที่ ----------
  const r2 = at(1);
  const r3 = at(2);
  const headStyle = HEAD_STYLE(pal);
  r2[0] = { v: 'Date', s: headStyle };
  r3[0] = { v: 'Time', s: headStyle };
  cols.forEach((col, c) => {
    if (col.kind === 'sep') {
      r2[c] = SEP_CELL;
      r3[c] = SEP_CELL;
    } else if (col.kind === 'day') {
      // หัววันเสาร์–อาทิตย์เข้มกว่าวันธรรมดา · โทน "ปัจจุบัน" ไม่ถมสี (พื้นขาวเหมือนไฟล์ต้นฉบับ)
      const wk = wdMon(col.date) >= 5;
      const fill = (wk ? pal.dayHeadWeekend : pal.dayHead) ?? undefined;
      const hs: XStyle = { size: 10, bold: !!fill, fill, color: fill ? pal.dayHeadInk : pal.ink, align: 'center', valign: 'center' };
      r2[c] = { v: EN_DAY[fromISO(col.date).getDay()], s: hs };
      r3[c] = { v: col.n, s: hs };
    }
  });
  rowHeights[1] = H_ROW;
  rowHeights[2] = H_TIME_HEAD;

  // ---------- แถวเวลา ----------
  slots.forEach((t, i) => {
    const r = at(FIRST_SLOT_ROW - 1 + i);
    const hourly = t % 60 === 0;
    const timeFill = hourly ? pal.timeCol : pal.timeColAlt ?? undefined;
    const ts: XStyle = { size: 10, color: pal.sub, align: 'center', valign: 'center', fill: timeFill };
    r[0] = t === 1440 ? { v: 'Midnight', s: ts } : { v: (t % 1440) / 1440, s: { ...ts, time: true } };
    // ถมพื้นช่องว่างทั้งตารางตามโทน (วันหยุดเข้มกว่านิด) — กิจกรรมจะทับทีหลัง
    cols.forEach((col, c) => {
      if (col.kind === 'sep') r[c] = SEP_CELL;
      else if (col.kind === 'day') {
        const bg = wdMon(col.date) >= 5 ? pal.weekendCell : pal.cellBg;
        if (bg) r[c] = { s: { fill: bg } };
      }
    });
    rowHeights[FIRST_SLOT_ROW - 1 + i] = H_ROW;
  });

  // ---------- กิจกรรม: รวมช่องติดกันที่ "ชุดกิจกรรมเหมือนกัน" เป็นบล็อก merge เดียว ----------
  cols.forEach((col, c) => {
    if (col.kind !== 'day') return;
    const items = read(col.date).filter((it) => it.ostatus !== 'rescheduled');
    const perSlot = slots.map((t) =>
      items.filter((it) => it.startMin < t + 30 && it.endMin > t).sort((x, z) => x.startMin - z.startMin || x.id - z.id),
    );
    const keyOf = (list: DayItem[]) => list.map((it) => it.id).join(',');

    for (let i = 0; i < slots.length; ) {
      const here = perSlot[i];
      if (!here.length) {
        i++;
        continue;
      }
      const key = keyOf(here);
      let j = i;
      while (j + 1 < slots.length && keyOf(perSlot[j + 1]) === key) j++;

      const { fill, color } = itemColors(here[0], pal);
      const style: XStyle = {
        fill,
        color,
        size: 9,
        bold: here[0].ostatus !== 'skipped',
        strike: here[0].ostatus === 'skipped',
        wrap: true,
        align: 'center',
        valign: 'center',
        border: true,
      };
      at(FIRST_SLOT_ROW - 1 + i)[c] = { v: here.map(itemText).join(' | '), s: style };
      for (let x = i + 1; x <= j; x++) at(FIRST_SLOT_ROW - 1 + x)[c] = { s: style };
      if (j > i) merges.push(`${colName(c + 1)}${FIRST_SLOT_ROW + i}:${colName(c + 1)}${FIRST_SLOT_ROW + j}`);
      i = j + 1;
    }
  });

  // ---------- คำอธิบายสี (ใต้ตาราง เว้นหนึ่งแถว) ----------
  const legend = at(FIRST_SLOT_ROW - 1 + slots.length + 1);
  legend[0] = { v: 'สีตามหมวด', s: { bold: true, size: 10, color: pal.ink, valign: 'center' } };
  CATS.forEach((cat, k) => {
    legend[k + 1] = {
      v: cat.short,
      s: { fill: pal.catTint(cat.color), color: pal.catInk(cat.color), bold: true, size: 9, align: 'center', valign: 'center', border: true },
    };
  });
  const legend2 = at(FIRST_SLOT_ROW - 1 + slots.length + 2);
  legend2[0] = { v: 'สถานะ', s: { bold: true, size: 10, color: pal.ink, valign: 'center' } };
  legend2[1] = { v: '✓ เสร็จแล้ว', s: { color: pal.ok, bold: true, size: 9, valign: 'center' } };
  legend2[2] = { v: '✗ ข้าม', s: { color: pal.bad, strike: true, size: 9, valign: 'center' } };

  // เติมแถวว่างที่อาจถูกข้าม (at() สร้างตามต้องการ) ให้ครบก่อนส่งต่อ
  for (let r = 0; r < rows.length; r++) at(r);

  return {
    name: `Time Table ${String(m + 1).padStart(2, '0')}-${y}`,
    rows,
    colWidths: cols.map((col) => (col.kind === 'time' ? W_TIME : col.kind === 'sep' ? W_SEP : W_DAY)),
    rowHeights,
    merges,
    freeze: { cols: 1, rows: 3 },
  };
}

/**
 * Time Table หลายเดือนในไฟล์ .xlsx เดียว (ชีตละเดือน) — คู่กับ parseTimeTableXlsx
 * extra = ชีตรายงานสรุป (ถ้ามี) วางไว้หน้าสุดให้เปิดไฟล์แล้วเจอรายงานก่อน — ตัวอ่านฝั่งนำเข้าข้ามชีตที่ไม่ใช่ Time Table เอง
 */
export function buildTimeTableXlsx(
  read: Read,
  anchors: string[],
  extra: XWriteSheet[] = [],
  pal: ExportPalette = EXPORT_PALETTES.current,
): Uint8Array {
  return buildXlsx([...extra, ...anchors.map((anchor) => monthSheet(read, anchor, pal))], 'Kanit', pal.border);
}

/**
 * สีตามหมวดที่แอปสร้างเอง (ครบทุกโทน) — เจอตอนนำเข้าแปลว่าไฟล์นี้แอปเป็นคนส่งออก ไม่ใช่สีที่ผู้ใช้เลือก
 * จึงไม่จำไว้ ปล่อยให้ใช้สีตามหมวดต่อไป (เปลี่ยนหมวดแล้วสีตามทันที)
 */
const OWN_TINTS = new Set(EXPORT_TONES.flatMap((p) => CATS.map((c) => p.catTint(c.color).toUpperCase())));

/**
 * อ่านไฟล์ .xlsx ฟอร์แมต Time Table → รายการกิจกรรม (รวมทุกชีต/ทุกบล็อก MONTH ที่มีข้อมูล)
 * ชีตที่ไม่ใช่ฟอร์แมตนี้หรือเป็นแม่แบบเปล่าจะถูกข้าม — โยน Error เมื่อทั้งไฟล์ไม่มีอะไรอ่านได้
 */
export function parseTimeTableXlsx(bytes: Uint8Array): TimeTableImport {
  const sheets = parseXlsx(bytes);
  const parsed: TimeTableImport[] = [];
  const errors: string[] = [];
  for (const sh of sheets) {
    try {
      // สีที่แอปสร้างเองไม่ต้องจำ — ปล่อยให้ใช้สีตามหมวดต่อไป (เปลี่ยนหมวดแล้วสีตามทันที)
      const cells = sh.rows.map((r) => r.map((c) => ({ text: c.text, color: c.fill && !OWN_TINTS.has(c.fill) ? c.fill : null })));
      parsed.push(parseTimeTableCells(cells));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'อ่านชีตไม่ได้');
    }
  }
  if (!parsed.length) throw new Error(errors[0] ?? 'ไม่พบข้อมูล Time Table ในไฟล์');
  if (parsed.length === 1) return parsed[0];

  return {
    monthLabel: parsed.map((p) => p.monthLabel).join(' · '),
    from: parsed.map((p) => p.from).reduce((x, z) => (x < z ? x : z)),
    to: parsed.map((p) => p.to).reduce((x, z) => (x > z ? x : z)),
    list: parsed.flatMap((p) => p.list),
  };
}
