// Export .xls แบบมีสี/จัดรูปแบบ — สร้าง HTML table แล้วบันทึกนามสกุล .xls
// Excel / Numbers / Google Sheets เปิดได้ตรง ๆ พร้อมสีพื้นตามหมวด ตัวหนา ขนาดฟอนต์ (ไม่ใช้ไลบรารีเพิ่ม)
// เซลล์ต่อเนื่องของกิจกรรมยาวใช้สีพื้นเดียวกันแต่ไม่พิมพ์ชื่อซ้ำ — มองเป็นบล็อกเดียวแบบเซลล์ merge

import { ACCENT, CAT_BY_ID, DANGER, DAY_END, GREEN } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, beYear, fmtMin, fromISO, toISO, wdMon } from '@/lib/dates';
import type { DayItem } from '@/lib/types';

type Read = (date: string) => DayItem[];

/** ผสมสี hex เข้าหาขาว (target=255) หรือดำ (target=0) ตามสัดส่วน 0–1 — ใช้ร่วมกับ lib/sheets ด้วย */
export function mix(hex: string, target: number, ratio: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v + (target - v) * ratio);
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BORDER = 'border:1px solid #E3DACB;';

/**
 * ตาราง grid กลาง: แถว = ช่องเวลา 30 นาที (06:00–30:00), คอลัมน์ = วันตาม dates
 * สีพื้นเซลล์ตามหมวดของกิจกรรม · ✓ เขียว = เสร็จ · ✗ แดงขีดฆ่า = ข้าม · หัวตารางตัวหนา · เสาร์–อาทิตย์พื้นครีม
 */
function gridTable(title: string, dates: string[], heads: string[], read: Read): string {
  const perDay = dates.map((d) => read(d).filter((it) => it.ostatus !== 'rescheduled'));
  const weekend = dates.map((d) => wdMon(d) >= 5);

  let html = `<table style="border-collapse:collapse;font-family:'Anuphan','Tahoma',sans-serif;">`;

  // แถวชื่อตาราง + หัวคอลัมน์วัน
  html += `<tr><td colspan="${dates.length + 1}" style="${BORDER}background:${ACCENT};color:#FFFFFF;font-weight:bold;font-size:14pt;padding:6px;">${esc(title)}</td></tr>`;
  html += `<tr><td style="${BORDER}background:#6B6255;color:#FFFFFF;font-weight:bold;font-size:9pt;padding:4px;">เวลา</td>`;
  heads.forEach((h, i) => {
    html += `<td style="${BORDER}background:${weekend[i] ? '#8A6D55' : '#6B6255'};color:#FFFFFF;font-weight:bold;font-size:9pt;padding:4px;text-align:center;">${h}</td>`;
  });
  html += '</tr>';

  for (let t = 360; t < DAY_END; t += 30) {
    html += `<tr><td style="${BORDER}background:#F4EFE6;color:#6B6255;font-weight:bold;font-size:8pt;padding:2px 6px;white-space:nowrap;">${fmtMin(t)}</td>`;
    perDay.forEach((items, i) => {
      const startsHere = items.filter((it) => it.startMin >= t && it.startMin < t + 30);
      const covering = items.filter((it) => it.startMin < t && it.endMin > t);
      const anchor = covering[0] ?? startsHere[0];

      let style = `${BORDER}font-size:8pt;padding:2px 4px;vertical-align:top;`;
      if (anchor) style += `background:${mix(CAT_BY_ID[anchor.cat].color, 255, 0.78)};`;
      else if (weekend[i]) style += 'background:#FAF6EE;';

      const parts = startsHere.map((it) => {
        if (it.ostatus === 'done') return `<span style="color:${GREEN};font-weight:bold;">✓ ${esc(it.title)}</span>`;
        if (it.ostatus === 'skipped') return `<span style="color:${DANGER};text-decoration:line-through;">✗ ${esc(it.title)}</span>`;
        return `<span style="color:${mix(CAT_BY_ID[it.cat].color, 0, 0.45)};font-weight:bold;">${esc(it.title)}</span>`;
      });
      html += `<td style="${style}">${parts.join('<br/>')}</td>`;
    });
    html += '</tr>';
  }

  // legend หมวด
  html += `<tr><td colspan="${dates.length + 1}" style="padding:6px 0 0 0;font-size:8pt;">`;
  html += Object.values(CAT_BY_ID)
    .map((c) => `<span style="background:${mix(c.color, 255, 0.78)};color:${mix(c.color, 0, 0.45)};font-weight:bold;padding:2px 8px;">${esc(c.short)}</span>`)
    .join(' ');
  html += ` <span style="color:${GREEN};font-weight:bold;">✓ เสร็จ</span> <span style="color:${DANGER};">✗ ข้าม</span></td></tr>`;

  html += '</table>';
  return html;
}

/** ห่อ table หนึ่งหรือหลายตัวเป็นเอกสาร .xls (HTML) เดียว — คั่นแต่ละตารางด้วยช่องว่าง */
function htmlDoc(tables: string[]): string {
  return `﻿<html><head><meta charset="UTF-8"></head><body>${tables.join('<br/><br/>')}</body></html>`;
}

/** table ของ Time Table ทั้งเดือนของ anchor (ยังไม่ห่อ doc) */
function monthTable(read: Read, anchor: string): string {
  const a = fromISO(anchor);
  const y = a.getFullYear();
  const m = a.getMonth();
  const nDays = new Date(y, m + 1, 0).getDate();
  const dates = Array.from({ length: nDays }, (_, i) => toISO(new Date(y, m, i + 1)));
  const heads = dates.map((d, i) => `${i + 1}<br/>${WD_TH[wdMon(d)]}`);
  return gridTable(`Time Table ${MONTH_TH_FULL[m]} ${beYear(y)}`, dates, heads, read);
}

/** Time Table ทั้งเดือนของ anchor แบบมีสี — คู่กับ buildTimeTableCsv */
export function buildTimeTableXls(read: Read, anchor: string): string {
  return buildTimeTableXlsMulti(read, [anchor]);
}

/** Time Table หลายเดือนในไฟล์ .xls เดียว แบบมีสี — คู่กับ buildTimeTableCsvMulti */
export function buildTimeTableXlsMulti(read: Read, anchors: string[]): string {
  return htmlDoc(anchors.map((anchor) => monthTable(read, anchor)));
}
