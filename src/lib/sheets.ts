// ส่งขึ้น Google Sheets ทางเดียว (แอป → ชีต) ผ่าน Google Apps Script Web App
// ผู้ใช้วางโค้ดจาก google-apps-script.gs ลงชีตของตัวเอง แล้วนำ URL (…/exec) มาบันทึกในหน้า settings/data
// payload: { sheets: [{ name, rows }] } — สคริปต์ฝั่งชีตจะสร้าง/ล้างแท็บตามชื่อแล้วเขียนแถวทับ

import { CAT_BY_ID } from '@/constants/theme';
import { WD_TH_FULL, fmtMin, fromISO, toISO, todayISO, wdMon } from '@/lib/dates';
import type { Activity, DayItem, OccMap, OccStatus } from '@/lib/types';
import { buildTimeTableRows } from '@/lib/timetable';

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
      sh.clearContents();
      if (s.rows.length > 0) {
        sh.getRange(1, 1, s.rows.length, s.rows[0].length).setValues(s.rows);
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

export interface SheetTab {
  name: string;
  rows: string[][];
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
  if (range === 'month') return [todayISO()];
  let min = todayISO();
  let max = todayISO();
  const widen = (d: string) => {
    if (d < min) min = d;
    if (d > max) max = d;
  };
  for (const a of acts) {
    widen(a.startDate);
    if (a.endDate) widen(a.endDate);
  }
  Object.keys(occ).forEach(widen);

  const a = fromISO(min);
  const b = fromISO(max);
  const out: string[] = [];
  for (let y = a.getFullYear(), m = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth()); ) {
    out.push(toISO(new Date(y, m, 1)));
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

/**
 * สร้างแท็บทั้งหมด: grid Time Table ต่อเดือน (เฉพาะเดือนที่มีข้อมูล) + แท็บ "รายการกิจกรรม" แบบแถว
 * คืน [] เมื่อไม่มีข้อมูลให้ส่งเลย
 */
export function buildSheetTabs(
  read: (date: string) => DayItem[],
  acts: Activity[],
  occ: OccMap,
  range: SheetsRange,
): SheetTab[] {
  const tabs: SheetTab[] = [];
  const listRows: string[][] = [['วันที่', 'วัน', 'เริ่ม', 'สิ้นสุด', 'กิจกรรม', 'หมวด', 'สถานะ', 'สถานที่']];

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
      }
    }
    if (hasData) tabs.push({ name: `Time Table ${anchor.slice(0, 7)}`, rows: buildTimeTableRows(read, anchor) });
  }

  if (listRows.length === 1) return []; // ไม่มีข้อมูลเลย
  tabs.push({ name: 'รายการกิจกรรม', rows: listRows });

  // ทำแถวให้เป็นสี่เหลี่ยม (setValues ฝั่ง Apps Script ต้องการทุกแถวกว้างเท่ากัน)
  for (const tab of tabs) {
    const w = Math.max(...tab.rows.map((r) => r.length));
    tab.rows = tab.rows.map((r) => (r.length === w ? r : [...r, ...Array<string>(w - r.length).fill('')]));
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
