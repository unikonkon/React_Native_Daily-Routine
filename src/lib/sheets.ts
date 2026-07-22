// ส่งขึ้น Google Sheets ทางเดียว (แอป → ชีต) ผ่าน Google Apps Script Web App
// ผู้ใช้วางโค้ดจาก google-apps-script.gs ลงชีตของตัวเอง แล้วนำ URL (…/exec) มาบันทึกในหน้า settings/data
// payload: { sheets: [{ name, rows }] } — สคริปต์ฝั่งชีตจะสร้าง/ล้างแท็บตามชื่อแล้วเขียนแถวทับ

import { ACCENT, CAT_BY_ID, DANGER, DAY_END, GREEN, type CatId } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, WD_TH_FULL, beYear, fmtMin, fromISO, toISO, todayISO, wdMon } from '@/lib/dates';
import type { Activity, DayItem, OccMap, OccStatus } from '@/lib/types';
import { buildTimeTableRows, listDataMonths } from '@/lib/timetable';
import { mix } from '@/lib/xls';

export type SheetsRange = 'month' | 'all';

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
export interface SheetTab {
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

/** เดือนทั้งหมดที่ต้องส่ง: 'month' = เดือนปัจจุบัน, 'all' = ตั้งแต่เดือนแรกถึงเดือนสุดท้ายที่มีข้อมูล */
function monthAnchors(acts: Activity[], occ: OccMap, range: SheetsRange): string[] {
  return range === 'month' ? [todayISO()] : listDataMonths(acts, occ);
}

/**
 * แท็บ grid รายเดือนแบบมีสี (แถวชื่อเดือน + หัววัน + ช่อง 30 นาที) — สไตล์เดียวกับ export .xls:
 * พื้นสีอ่อนตามหมวด (ช่องต่อเนื่องถมสีโดยไม่พิมพ์ชื่อซ้ำ) · ✓ เขียว = เสร็จ · ✗ แดงขีดฆ่า = ข้าม
 */
function styledGridTab(read: (date: string) => DayItem[], anchor: string): SheetTab {
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
  bg.push(Array(nCols).fill(ACCENT));
  fg.push(Array(nCols).fill('#FFFFFF'));
  bold.push(Array(nCols).fill('bold'));
  line.push(Array(nCols).fill('none'));

  rows.push(['เวลา', ...dates.map((d, i) => `${i + 1} ${WD_TH[wdMon(d)]}`)]);
  bg.push(['#6B6255', ...weekendCol.map((w) => (w ? '#8A6D55' : '#6B6255'))]);
  fg.push(Array(nCols).fill('#FFFFFF'));
  bold.push(Array(nCols).fill('bold'));
  line.push(Array(nCols).fill('none'));

  for (let t = 360; t < DAY_END; t += 30) {
    const vr: string[] = [fmtMin(t)];
    const br: (string | null)[] = ['#F4EFE6'];
    const fr: (string | null)[] = ['#6B6255'];
    const wr: ('bold' | 'normal')[] = ['bold'];
    const lr: ('line-through' | 'none')[] = ['none'];
    perDay.forEach((items, i) => {
      const startsHere = items.filter((it) => it.startMin >= t && it.startMin < t + 30);
      const covering = items.filter((it) => it.startMin < t && it.endMin > t);
      const anchorIt = covering[0] ?? startsHere[0];
      const first = startsHere[0];
      vr.push(
        startsHere
          .map((it) => (it.ostatus === 'done' ? `✓ ${it.title}` : it.ostatus === 'skipped' ? `✗ ${it.title}` : it.title))
          .join(' | '),
      );
      br.push(anchorIt ? mix(CAT_BY_ID[anchorIt.cat].color, 255, 0.78) : weekendCol[i] ? '#FAF6EE' : null);
      fr.push(
        first
          ? first.ostatus === 'done'
            ? GREEN
            : first.ostatus === 'skipped'
              ? DANGER
              : mix(CAT_BY_ID[first.cat].color, 0, 0.45)
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
 * สร้างแท็บทั้งหมด: grid Time Table ต่อเดือน (เฉพาะเดือนที่มีข้อมูล) + แท็บ "รายการกิจกรรม" แบบแถว
 * styled = ใส่สี/ตัวหนา (ต้องใช้ Apps Script รุ่นที่รองรับ — รุ่นเก่าจะลงแค่ค่า) · คืน [] เมื่อไม่มีข้อมูล
 */
export function buildSheetTabs(
  read: (date: string) => DayItem[],
  acts: Activity[],
  occ: OccMap,
  range: SheetsRange,
  styled = false,
): SheetTab[] {
  const tabs: SheetTab[] = [];
  const listRows: string[][] = [['วันที่', 'วัน', 'เริ่ม', 'สิ้นสุด', 'กิจกรรม', 'หมวด', 'สถานะ', 'สถานที่']];
  const listMeta: { cat: CatId; status: OccStatus }[] = []; // ขนานกับ listRows (ข้ามหัวตาราง) — ไว้ระบายสี

  for (const anchor of monthAnchors(acts, occ, range)) {
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
      tabs.push(styled ? styledGridTab(read, anchor) : { name: `Time Table ${anchor.slice(0, 7)}`, rows: buildTimeTableRows(read, anchor) });
    }
  }

  if (listRows.length === 1) return []; // ไม่มีข้อมูลเลย

  const listTab: SheetTab = { name: 'รายการกิจกรรม', rows: listRows };
  if (styled) {
    const w = listRows[0].length;
    const plain = () => Array<string | null>(w).fill(null);
    listTab.bg = [Array(w).fill('#6B6255'), ...listMeta.map((mt) => {
      const r = plain();
      r[5] = mix(CAT_BY_ID[mt.cat].color, 255, 0.78); // คอลัมน์หมวด
      return r;
    })];
    listTab.fg = [Array(w).fill('#FFFFFF'), ...listMeta.map((mt) => {
      const r = plain();
      r[5] = mix(CAT_BY_ID[mt.cat].color, 0, 0.45);
      if (mt.status === 'done') r[6] = GREEN; // คอลัมน์สถานะ
      else if (mt.status === 'skipped' || mt.status === 'cancelled') r[6] = DANGER;
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

  // ทำทุกแถว (รวม style arrays) ให้กว้างเท่ากัน — setValues/setBackgrounds ฝั่ง Apps Script ต้องการสี่เหลี่ยม
  for (const tab of tabs) {
    const w = Math.max(...tab.rows.map((r) => r.length));
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
