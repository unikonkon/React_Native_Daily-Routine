// ส่งขึ้น Google Sheets ทางเดียว (แอป → ชีต) ผ่าน Google Apps Script Web App
// ผู้ใช้วางโค้ดจาก google-apps-script.gs ลงชีตของตัวเอง แล้วนำ URL (…/exec) มาบันทึกในหน้า settings/data
// payload: { sheets: [{ name, rows }] } — สคริปต์ฝั่งชีตจะสร้าง/ล้างแท็บตามชื่อแล้วเขียนแถวทับ

import { CAT_BY_ID, DAY_END, type CatId } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, WD_TH_FULL, beYear, fmtMin, fromISO, toISO, wdMon } from '@/lib/dates';
import { EXPORT_PALETTES, type ExportPalette } from '@/lib/export-theme';
import { reportTabs, type ReportData } from '@/lib/report';
import type { DayItem, OccStatus } from '@/lib/types';
import { buildTimeTableRows } from '@/lib/timetable';

/** ขอบเขตเดือนที่จะส่ง — 'pick' = ติ๊กเลือกเองจากเดือนที่มีข้อมูล (หน้าจอแปลงเป็น anchors ก่อนเรียก) */
export type SheetsScope = 'month' | 'pick' | 'all';

/**
 * ระดับการจัดรูปแบบในชีต (คู่ขนานกับรูปแบบไฟล์ตอนส่งออก)
 * 'rich'  = เต็มรูปแบบ: กิจกรรมยาวถมสีต่อเนื่องโดยไม่พิมพ์ชื่อซ้ำ (มองเป็นบล็อกเดียวแบบเซลล์ merge) — เหมือน .xlsx/.xls
 * 'color' = มีสี: พิมพ์ชื่อทุกช่องที่กิจกรรมคลุม (กริดเดียวกับ CSV — คัดลอกกลับเข้าแอปได้) + ระบายสีตามหมวด
 * 'plain' = ค่าล้วน: ไม่มีสีเลย — ใช้กับ Apps Script รุ่นเก่าที่ยังไม่รองรับ setBackgrounds
 */
export type SheetsStyle = 'rich' | 'color' | 'plain';

export interface SheetsBuild {
  style: SheetsStyle;
  /** โทนสีของชีต (ชุดเดียวกับไฟล์ส่งออก) — ไม่มีผลเมื่อ style = 'plain' */
  pal?: ExportPalette;
  /** ส่งตาราง Time Table รายเดือน + แท็บรายการกิจกรรม (false = เฉพาะแท็บรายงาน) */
  grid?: boolean;
  /** รายงานสรุป — ใส่เป็นแท็บแยกไว้หน้าสุด (null/undefined = ไม่ส่ง) */
  report?: ReportData | null;
}

/** โค้ด Apps Script ให้ผู้ใช้คัดลอกไปวางในชีต (หน้า settings/sheets-setup) — ตรงกับไฟล์ google-apps-script.gs */
export const APPS_SCRIPT_CODE = `function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, ping: 'ตารางชีวิตจอย receiver พร้อมใช้งาน' }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!data || !Array.isArray(data.sheets)) throw new Error('bad payload');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    data.sheets.forEach(function (s) {
      if (!s || !s.name || !Array.isArray(s.rows)) return;
      var sh = ss.getSheetByName(s.name) || ss.insertSheet(s.name);
      sh.clear();
      if (s.rows.length > 0) {
        var range = sh.getRange(1, 1, s.rows.length, s.rows[0].length);
        range.setValues(s.rows);
        if (Array.isArray(s.bg)) range.setBackgrounds(s.bg);
        if (Array.isArray(s.fg)) range.setFontColors(s.fg);
        if (Array.isArray(s.bold)) range.setFontWeights(s.bold);
        if (Array.isArray(s.line)) range.setFontLines(s.line);
      }
    });

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, sheets: data.sheets.length, at: new Date().toISOString() }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(
      ContentService.MimeType.JSON,
    );
  }
}`;

/** แท็บหนึ่งในชีต — style arrays (โหมดมีสี) ขนาดต้องเท่ากับ rows; สคริปต์รุ่นเก่าที่ไม่รู้จักจะข้ามเอง */
interface SheetTab {
  name: string;
  rows: string[][];
  bg?: (string | null)[][];
  fg?: (string | null)[][];
  bold?: ('bold' | 'normal')[][];
  line?: ('line-through' | 'none')[][];
}

const STATUS_TH: Record<OccStatus, string> = {
  planned: 'วางแผน',
  done: 'เสร็จ',
  skipped: 'ข้าม',
  cancelled: 'ยกเลิก',
  rescheduled: 'เลื่อนนัด',
};

/**
 * แท็บ grid รายเดือนแบบมีสี (แถวชื่อเดือน + หัววัน + ช่อง 30 นาที) — สีทุกจุดมาจากโทนที่เลือก
 * พื้นสีอ่อนตามหมวด (หรือสีที่จำมาจากไฟล์ต้นฉบับ) · ✓ = เสร็จ · ✗ ขีดฆ่า = ข้าม
 * rich = ช่องต่อเนื่องถมสีโดยไม่พิมพ์ชื่อซ้ำ (มองเป็นบล็อกเดียว) · ไม่ rich = พิมพ์ชื่อทุกช่องที่คลุม (คัดลอกกลับเข้าแอปได้)
 */
function styledGridTab(read: (date: string) => DayItem[], anchor: string, pal: ExportPalette, rich: boolean): SheetTab {
  const d0 = fromISO(anchor);
  const y = d0.getFullYear();
  const m = d0.getMonth();
  const nDays = new Date(y, m + 1, 0).getDate();
  const dates = Array.from({ length: nDays }, (_, i) => toISO(new Date(y, m, i + 1)));
  const perDay = dates.map((d) => read(d).filter((it) => it.ostatus !== 'rescheduled'));
  const weekendCol = dates.map((d) => wdMon(d) >= 5);
  const nCols = nDays + 1;

  const rows: string[][] = [];
  const bg: (string | null)[][] = [];
  const fg: (string | null)[][] = [];
  const bold: ('bold' | 'normal')[][] = [];
  const line: ('line-through' | 'none')[][] = [];

  // แถวชื่อเดือน + แถวหัววัน
  rows.push([`Time Table ${MONTH_TH_FULL[m]} ${beYear(y)}`, ...Array<string>(nCols - 1).fill('')]);
  bg.push(Array(nCols).fill(pal.title));
  fg.push(Array(nCols).fill(pal.titleInk));
  bold.push(Array(nCols).fill('bold'));
  line.push(Array(nCols).fill('none'));

  const dayHead = pal.dayHead ?? pal.head;
  rows.push(['เวลา', ...dates.map((d, i) => `${i + 1} ${WD_TH[wdMon(d)]}`)]);
  bg.push([pal.head, ...weekendCol.map((w) => (w ? (pal.dayHeadWeekend ?? pal.headWeekend) : dayHead))]);
  fg.push([pal.headInk, ...Array<string>(nCols - 1).fill(pal.dayHead ? pal.dayHeadInk : pal.headInk)]);
  bold.push(Array(nCols).fill('bold'));
  line.push(Array(nCols).fill('none'));

  for (let t = 360; t < DAY_END; t += 30) {
    const vr: string[] = [fmtMin(t)];
    const br: (string | null)[] = [t % 60 === 0 ? pal.timeCol : (pal.timeColAlt ?? pal.timeCol)];
    const fr: (string | null)[] = [pal.sub];
    const wr: ('bold' | 'normal')[] = ['bold'];
    const lr: ('line-through' | 'none')[] = ['none'];
    perDay.forEach((items, i) => {
      const startsHere = items.filter((it) => it.startMin >= t && it.startMin < t + 30);
      const covering = items.filter((it) => it.startMin < t && it.endMin > t);
      const anchorIt = covering[0] ?? startsHere[0];
      // rich: พิมพ์เฉพาะช่องที่กิจกรรมเริ่ม · color: พิมพ์ทุกช่องที่กิจกรรมคลุม (เหมือน buildTimeTableRows)
      const shown = rich ? startsHere : [...covering, ...startsHere].sort((a, b) => a.startMin - b.startMin);
      const first = shown[0];
      vr.push(
        shown
          .map((it) => (it.ostatus === 'done' ? `✓ ${it.title}` : it.ostatus === 'skipped' ? `✗ ${it.title}` : it.title))
          .join(' | '),
      );
      br.push(
        anchorIt
          ? anchorIt.color
            ? pal.userFill(anchorIt.color)
            : pal.catTint(CAT_BY_ID[anchorIt.cat].color)
          : weekendCol[i]
            ? pal.weekendCell
            : pal.cellBg,
      );
      fr.push(
        first
          ? first.ostatus === 'done'
            ? pal.ok
            : first.ostatus === 'skipped'
              ? pal.bad
              : first.color
                ? pal.userInk
                : pal.catInk(CAT_BY_ID[first.cat].color)
          : null,
      );
      wr.push(first && first.ostatus !== 'skipped' ? 'bold' : 'normal');
      lr.push(first?.ostatus === 'skipped' ? 'line-through' : 'none');
    });
    rows.push(vr);
    bg.push(br);
    fg.push(fr);
    bold.push(wr);
    line.push(lr);
  }
  return { name: `Time Table ${anchor.slice(0, 7)}`, rows, bg, fg, bold, line };
}

/**
 * สร้างแท็บทั้งหมดที่จะส่งขึ้นชีต — แท็บรายงานสรุป (ถ้าเลือก) มาก่อน แล้วตามด้วย
 * grid Time Table ต่อเดือน (เฉพาะเดือนที่มีข้อมูล) + แท็บ "รายการกิจกรรม" แบบแถว
 * anchors = first-of-month ISO ของเดือนที่จะส่ง (หน้าจอเป็นคนเลือกขอบเขต) · คืน [] เมื่อไม่มีอะไรให้ส่ง
 */
export function buildSheetTabs(read: (date: string) => DayItem[], anchors: string[], o: SheetsBuild): SheetTab[] {
  const pal = o.pal ?? EXPORT_PALETTES.current;
  const styled = o.style !== 'plain';
  // 'plain' = ค่าล้วน จึงทิ้ง style arrays ของแท็บรายงานไปด้วย
  const tabs: SheetTab[] = o.report
    ? reportTabs(o.report, pal).map((r) => (styled ? r : { name: r.name, rows: r.rows }))
    : [];
  if (o.grid === false) return rectangle(tabs);

  const gridTabs: SheetTab[] = [];
  const listRows: string[][] = [['วันที่', 'วัน', 'เริ่ม', 'สิ้นสุด', 'กิจกรรม', 'หมวด', 'สถานะ', 'สถานที่']];
  const listMeta: { cat: CatId; status: OccStatus }[] = []; // ขนานกับ listRows (ข้ามหัวตาราง) — ไว้ระบายสี

  for (const anchor of anchors) {
    const d0 = fromISO(anchor);
    const y = d0.getFullYear();
    const m = d0.getMonth();
    const nDays = new Date(y, m + 1, 0).getDate();
    let hasData = false;
    for (let i = 1; i <= nDays; i++) {
      const date = toISO(new Date(y, m, i));
      for (const it of read(date)) {
        hasData = true;
        listRows.push([
          date,
          WD_TH_FULL[wdMon(date)],
          fmtMin(it.startMin),
          fmtMin(it.endMin),
          it.title,
          CAT_BY_ID[it.cat].short,
          STATUS_TH[it.ostatus],
          it.loc ?? '',
        ]);
        listMeta.push({ cat: it.cat, status: it.ostatus });
      }
    }
    if (hasData) {
      gridTabs.push(
        styled
          ? styledGridTab(read, anchor, pal, o.style === 'rich')
          : { name: `Time Table ${anchor.slice(0, 7)}`, rows: buildTimeTableRows(read, anchor) },
      );
    }
  }

  if (listRows.length === 1) return rectangle(tabs); // ไม่มีข้อมูลในช่วงที่เลือกเลย — เหลือแค่แท็บรายงาน (ถ้ามี)
  tabs.push(...gridTabs);

  const listTab: SheetTab = { name: 'รายการกิจกรรม', rows: listRows };
  if (styled) {
    const w = listRows[0].length;
    const blank = () => Array<string | null>(w).fill(null);
    listTab.bg = [Array(w).fill(pal.head), ...listMeta.map((mt) => {
      const r = blank();
      r[5] = pal.catTint(CAT_BY_ID[mt.cat].color); // คอลัมน์หมวด
      return r;
    })];
    listTab.fg = [Array(w).fill(pal.headInk), ...listMeta.map((mt) => {
      const r = blank();
      r[5] = pal.catInk(CAT_BY_ID[mt.cat].color);
      if (mt.status === 'done') r[6] = pal.ok; // คอลัมน์สถานะ
      else if (mt.status === 'skipped' || mt.status === 'cancelled') r[6] = pal.bad;
      return r;
    })];
    listTab.bold = [Array(w).fill('bold'), ...listMeta.map(() => {
      const r = Array<'bold' | 'normal'>(w).fill('normal');
      r[5] = 'bold';
      r[6] = 'bold';
      return r;
    })];
  }
  tabs.push(listTab);
  return rectangle(tabs);
}

/** ทำทุกแถว (รวม style arrays) ของทุกแท็บให้กว้างเท่ากัน — setValues/setBackgrounds ฝั่ง Apps Script ต้องการสี่เหลี่ยม */
function rectangle(tabs: SheetTab[]): SheetTab[] {
  for (const tab of tabs) {
    const w = Math.max(0, ...tab.rows.map((r) => r.length));
    const pad = <T,>(a: T[][] | undefined, fill: T) =>
      a?.map((r) => (r.length === w ? r : [...r, ...Array<T>(w - r.length).fill(fill)]));
    tab.rows = pad(tab.rows, '')!;
    tab.bg = pad(tab.bg, null);
    tab.fg = pad(tab.fg, null);
    tab.bold = pad(tab.bold, 'normal' as const);
    tab.line = pad(tab.line, 'none' as const);
  }
  return tabs;
}

/** POST ขึ้น Apps Script — โยน Error พร้อมข้อความไทยบอกสาเหตุที่พบบ่อย */
export async function pushToSheets(url: string, tabs: SheetTab[]): Promise<void> {
  let res: Response;
  try {
    // text/plain เลี่ยง preflight — doPost ฝั่ง Apps Script อ่าน e.postData.contents ตรง ๆ
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ sheets: tabs }),
    });
  } catch {
    throw new Error('เชื่อมต่อไม่ได้ — เช็คอินเทอร์เน็ต');
  }

  // 401/403 หรือเด้งหน้า login = deployment ไม่ได้เปิด Who has access: Anyone
  if (res.status === 401 || res.status === 403 || res.url.includes('accounts.google.com')) {
    throw new Error('ชีตปฏิเสธสิทธิ์ — ไป Deploy ใหม่แล้วตั้ง Who has access: Anyone');
  }
  if (res.status === 404) throw new Error('ไม่พบสคริปต์ — เช็ค URL ว่าลงท้าย /exec และ deployment ยังอยู่');
  if (!res.ok) throw new Error(`เซิร์ฟเวอร์ตอบ HTTP ${res.status}`);

  const text = await res.text();
  try {
    const j = JSON.parse(text) as { ok?: boolean; error?: string };
    if (j?.ok === false) throw new Error(`สคริปต์ error: ${j.error ?? 'ไม่ทราบสาเหตุ'}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('สคริปต์ error')) throw err;
    // ตอบเป็น HTML: หน้า "ไม่พบเพจ" = URL/สิทธิ์ผิด, อื่น ๆ ปล่อยผ่าน (redirect บางแบบของ Google)
    if (/ไม่พบเพจ|Page not found|Sorry, unable to open/i.test(text)) {
      throw new Error('Google ตอบว่าไม่พบเพจ — Deploy ใหม่แบบ Web app + Anyone แล้วใช้ URL /exec ล่าสุด');
    }
  }
}

/** ตรวจ URL ของ Apps Script Web App แบบหลวม ๆ */
export function isSheetsUrl(url: string): boolean {
  return /^https:\/\/script\.google(?:usercontent)?\.com\/.+/.test(url.trim());
}
