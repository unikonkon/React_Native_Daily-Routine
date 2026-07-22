// Time Table CSV (ฟอร์แมต "Time Table จอย") — pure functions ไม่มี I/O
// โครงไฟล์: แถว 1 "MONTH m/yyyy" + ป้าย WEEK, แถว "Date" = ชื่อวัน, แถว "Time" = เลขวันที่ของเดือน (คอลัมน์ละวัน),
// แถวถัดไป = ช่องเวลา (06:00 → เลยเที่ยงคืน) เซลล์ = ชื่อกิจกรรม — เซลล์ merge ในต้นฉบับมาเป็นค่าเฉพาะช่องแรก
// จึงตีความ: กิจกรรมยาวถึงช่องเวลาถัดไป และรวมช่องติดกันที่ชื่อเดียวกันเป็นก้อนเดียว

import { DAY_END, type CatId } from '@/constants/theme';
import { MONTH_TH, beYear, fmtMin, fromISO, toISO, todayISO } from '@/lib/dates';
import type { Activity, DayItem, OccMap } from '@/lib/types';

export interface TimeTableImport {
  /** เช่น "เม.ย. 2568" */
  monthLabel: string;
  from: string;
  to: string;
  list: Omit<Activity, 'id'>[];
}

/** CSV → แถวของเซลล์ (รองรับ quote, "" และขึ้นบรรทัดใหม่ในเซลล์) */
function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * ป้ายเวลาหลากแบบ → นาที (ก่อน 06:00 = เช้ามืดวันถัดไป +1440)
 * "08:30" · "9:30:00 AM" · "6-7:00:00 AM" (ช่วง) · "02.30. AM" · "Midnight" · คืน null เมื่อไม่ใช่เวลา
 */
function parseTimeLabel(s: string): { start: number; end: number | null } | null {
  const txt = s.trim().toLowerCase();
  if (!txt) return null;
  if (txt === 'midnight') return { start: 1440, end: null };
  if (txt === 'noon') return { start: 720, end: null };
  const pm = txt.includes('pm');
  const am = txt.includes('am');
  const norm = (h: number, min: number) => {
    let hh = h;
    if (pm && hh < 12) hh += 12;
    if (am && hh === 12) hh = 0;
    let v = hh * 60 + min;
    if (v < 360) v += 1440;
    return v;
  };
  const range = txt.match(/^(\d{1,2})\s*-\s*(\d{1,2})/);
  if (range) return { start: norm(+range[1], 0), end: norm(+range[2], 0) };
  const hm = txt.match(/^(\d{1,2})[:.](\d{2})/) ?? txt.match(/^(\d{1,2})\b/);
  if (!hm) return null;
  return { start: norm(+hm[1], hm[2] ? +hm[2] : 0), end: null };
}

/** เดาหมวดจากชื่อกิจกรรม (ลำดับสำคัญ: กิจวัตร → ออกกำลัง → เคส → งาน → เรียนรู้) */
function guessCat(title: string): CatId {
  const s = title.toLowerCase();
  if (/(wake|bed|อาบน้ำ|บำรุง|eat|shake|dress|นอน|ตื่น)/.test(s)) return 'routine';
  if (/(fitness|arobic|aerobic|weight|dance|วิ่ง|ออกกำลัง)/.test(s)) return 'ex';
  if (/(เคส|case|bm|member|เพิ่มเพื่อน|bridge|beyond|community|ติดตาม|วีค)/.test(s)) return 'case';
  if (/(work|เวิก|center|qc|admin|ตอบแชท|ตอบเเชท|แชท|มศว|survey)/.test(s)) return 'work';
  if (/(อ่านหนังสือ|ฟังลิ้งก์|ฟังลิงก์|book|how to|เรียน)/.test(s)) return 'learn';
  return 'me';
}

/**
 * parse บล็อกเดือนเดียว (rows = ตั้งแต่แถว MONTH ถึงก่อนแถว MONTH ถัดไป) เป็นรายการกิจกรรมครั้งเดียว (repeat none)
 * คืน null เมื่อโครงไม่ครบ (ให้ตัว multi ข้ามบล็อกเสีย ไม่ล้มทั้งไฟล์)
 */
function parseMonthBlock(rows: string[][]): TimeTableImport | null {
  // หัวไฟล์ MONTH m/yyyy (รับทั้ง ค.ศ. และ พ.ศ.)
  let month = 0;
  let year = 0;
  for (const r of rows.slice(0, 3)) {
    const m = (r[0] ?? '').match(/MONTH\s*(\d{1,2})\s*\/\s*(\d{2,4})/i);
    if (m) {
      month = +m[1];
      year = +m[2];
      break;
    }
  }
  if (!month || month > 12) return null;
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;

  const timeRowIdx = rows.findIndex((r) => (r[0] ?? '').trim().toLowerCase() === 'time');
  if (timeRowIdx < 0) return null;

  // คอลัมน์ → วันที่ (เลขวันลดลง = ข้ามเข้าเดือนถัดไป)
  const dayRow = rows[timeRowIdx];
  const colDate: (string | null)[] = [];
  let cm = month;
  let cy = year;
  let prev = 0;
  for (let c = 1; c < dayRow.length; c++) {
    const n = parseInt((dayRow[c] ?? '').trim(), 10);
    if (!n || n < 1 || n > 31) {
      colDate[c] = null;
      continue;
    }
    if (n < prev) {
      cm++;
      if (cm > 12) {
        cm = 1;
        cy++;
      }
    }
    prev = n;
    colDate[c] = toISO(new Date(cy, cm - 1, n));
  }
  const dates = colDate.filter((d): d is string => d != null);
  if (!dates.length) return null;

  // แถวเวลา: เก็บเฉพาะแถวที่ป้ายเวลาอ่านออก (แถวท้ายไฟล์ที่เป็นโน้ต/คำอธิบายจะถูกข้ามเอง)
  const timed: { start: number; end: number | null; cells: string[] }[] = [];
  for (const r of rows.slice(timeRowIdx + 1)) {
    const p = parseTimeLabel(r[0] ?? '');
    if (p && p.start < DAY_END) timed.push({ ...p, cells: r });
  }
  if (!timed.length) return null;

  // ช่องเวลาจบที่ช่องถัดไป (ยกเว้นป้ายแบบช่วง "6-7" ที่ระบุจบเอง)
  const starts = [...new Set(timed.map((x) => x.start))].sort((a, b) => a - b);
  const endOf = (start: number, explicit: number | null) => {
    if (explicit != null && explicit > start) return Math.min(explicit, DAY_END);
    const next = starts.find((v) => v > start);
    return Math.min(next ?? start + 30, DAY_END);
  };

  const byDate = new Map<string, { title: string; start: number; end: number }[]>();
  for (const row of timed) {
    const end = endOf(row.start, row.end);
    for (let c = 1; c < row.cells.length; c++) {
      const date = colDate[c];
      const title = (row.cells[c] ?? '').replace(/\s+/g, ' ').trim();
      if (!date || !title) continue;
      let arr = byDate.get(date);
      if (!arr) {
        arr = [];
        byDate.set(date, arr);
      }
      arr.push({ title, start: row.start, end });
    }
  }

  const list: Omit<Activity, 'id'>[] = [];
  for (const [date, items] of byDate) {
    items.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
    // รวมช่องติดกันชื่อเดียวกัน (ร่องรอยเซลล์ merge ของต้นฉบับ)
    const merged: typeof items = [];
    for (const it of items) {
      const tail = merged[merged.length - 1];
      if (tail && tail.title === it.title && it.start <= tail.end) tail.end = Math.max(tail.end, it.end);
      else merged.push({ ...it });
    }
    for (const it of merged) {
      list.push({
        title: it.title,
        cat: guessCat(it.title),
        sub: null,
        loc: null,
        channel: null,
        priority: null,
        startMin: it.start,
        endMin: it.end,
        repeat: 'none',
        daysMask: 0,
        startDate: date,
        endDate: null,
        notify: false, // นำเข้าเป็นชุดใหญ่ — ไม่ตั้งเตือนอัตโนมัติกันแย่งงบ 50 รายการ
        notifyBefore: 30,
        detachedFrom: null,
        status: 'active',
        contactIds: [],
      });
    }
  }
  if (!list.length) return null;

  return {
    monthLabel: `${MONTH_TH[month - 1]} ${beYear(year)}`,
    from: dates.reduce((a, b) => (a < b ? a : b)),
    to: dates.reduce((a, b) => (a > b ? a : b)),
    list,
  };
}

/**
 * แปลงไฟล์ Time Table CSV เป็นรายการกิจกรรม — รองรับหลายบล็อก MONTH ในไฟล์เดียว (รวมทุกเดือนเข้าด้วยกัน)
 * ขอบเขตที่นำเข้าถูกกำหนดจากไฟล์เอง — โยน Error เมื่อไม่ใช่ฟอร์แมตนี้
 */
export function parseTimeTableCsv(text: string): TimeTableImport {
  const rows = parseCsv(text);
  const heads = rows
    .map((r, i) => (/MONTH\s*\d{1,2}\s*\/\s*\d{2,4}/i.test(r[0] ?? '') ? i : -1))
    .filter((i) => i >= 0);
  if (!heads.length) throw new Error('ไม่พบหัว MONTH m/yyyy');

  const parsed = heads
    .map((start, k) => parseMonthBlock(rows.slice(start, heads[k + 1] ?? rows.length)))
    .filter((p): p is TimeTableImport => p != null);
  if (!parsed.length) throw new Error('ไม่พบกิจกรรมในไฟล์');
  if (parsed.length === 1) return parsed[0];

  const list = parsed.flatMap((p) => p.list);
  const from = parsed.map((p) => p.from).reduce((a, b) => (a < b ? a : b));
  const to = parsed.map((p) => p.to).reduce((a, b) => (a > b ? a : b));
  return {
    monthLabel: `${parsed.length} เดือน (${parsed[0].monthLabel} – ${parsed[parsed.length - 1].monthLabel})`,
    from,
    to,
    list,
  };
}

/** รายชื่อเดือนที่มีข้อมูล (first-of-month ISO) ตั้งแต่เดือนแรกถึงเดือนสุดท้ายที่มีกิจกรรม/สถานะ (รวมเดือนปัจจุบันเสมอ) */
export function listDataMonths(acts: Activity[], occ: OccMap): string[] {
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
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

/** ตาราง grid ทั้งเดือนของ anchor เป็นแถวเซลล์ (ใช้ทั้งส่งออก CSV และส่งขึ้น Google Sheets) */
export function buildTimeTableRows(read: (date: string) => DayItem[], anchor: string): string[][] {
  const a = fromISO(anchor);
  const y = a.getFullYear();
  const m = a.getMonth(); // 0-based
  const nDays = new Date(y, m + 1, 0).getDate();
  const dates = Array.from({ length: nDays }, (_, i) => toISO(new Date(y, m, i + 1)));
  const perDay = dates.map((d) => read(d).filter((it) => it.ostatus !== 'rescheduled'));

  const EN_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const rows: string[][] = [
    [`MONTH ${m + 1}/${y}`, ...dates.map((_, i) => (i % 7 === 0 ? `WEEK ${i / 7 + 1}` : ''))],
    ['Date', ...dates.map((d) => EN_DAY[fromISO(d).getDay()])],
    ['Time', ...dates.map((_, i) => `${i + 1}`)],
  ];

  // ช่องละ 30 นาที 06:00–30:00 — กิจกรรมยาวถูกเขียนซ้ำทุกช่องที่คลุม (parser ฝั่งนำเข้ารวมกลับเป็นก้อนเดียว)
  for (let t = 360; t < DAY_END; t += 30) {
    const row = [t === 1440 ? 'Midnight' : fmtMin(t)];
    for (const items of perDay) {
      const here = items.filter((it) => it.startMin < t + 30 && it.endMin > t);
      row.push(here.map((it) => it.title).join(' | '));
    }
    rows.push(row);
  }
  return rows;
}

/** สร้าง Time Table CSV ทั้งเดือนของ anchor (ฟอร์แมตเดียวกับไฟล์นำเข้า — round-trip ได้) */
export function buildTimeTableCsv(read: (date: string) => DayItem[], anchor: string): string {
  return buildTimeTableCsvMulti(read, [anchor]);
}

/** Time Table CSV หลายเดือนในไฟล์เดียว — ต่อบล็อก MONTH ของแต่ละ anchor คั่นด้วยบรรทัดว่าง (parser อ่านกลับได้) */
export function buildTimeTableCsvMulti(read: (date: string) => DayItem[], anchors: string[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const blocks = anchors.map((anchor) => buildTimeTableRows(read, anchor).map((r) => r.map(esc).join(',')).join('\n'));
  return '﻿' + blocks.join('\n\n'); // BOM ให้ Excel เปิดภาษาไทยถูก
}
