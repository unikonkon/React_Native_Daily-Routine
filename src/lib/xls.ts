// Export .xls แบบมีสี/จัดรูปแบบ — สร้าง HTML table แล้วบันทึกนามสกุล .xls
// Excel / Numbers / Google Sheets เปิดได้ตรง ๆ พร้อมสีพื้นตามหมวด ตัวหนา ขนาดฟอนต์ (ไม่ใช้ไลบรารีเพิ่ม)
// เซลล์ต่อเนื่องของกิจกรรมยาวใช้สีพื้นเดียวกันแต่ไม่พิมพ์ชื่อซ้ำ — มองเป็นบล็อกเดียวแบบเซลล์ merge

import { CAT_BY_ID, DAY_END } from '@/constants/theme';
import { MONTH_TH_FULL, WD_TH, beYear, fmtMin, fromISO, toISO, wdMon } from '@/lib/dates';
import { EXPORT_PALETTES, type ExportPalette } from '@/lib/export-theme';
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

/**
 * ตาราง grid กลาง: แถว = ช่องเวลา 30 นาที (06:00–30:00), คอลัมน์ = วันตาม dates
 * สีพื้นเซลล์ตามหมวด (หรือสีที่จำจากไฟล์) · ✓ = เสร็จ · ✗ ขีดฆ่า = ข้าม — ทุกสีมาจากโทนที่เลือก
 */
function gridTable(title: string, dates: string[], heads: string[], read: Read, pal: ExportPalette): string {
  const perDay = dates.map((d) => read(d).filter((it) => it.ostatus !== 'rescheduled'));
  const weekend = dates.map((d) => wdMon(d) >= 5);
  const border = `border:1px solid ${pal.border};`;

  let html = `<table style="border-collapse:collapse;font-family:'Anuphan','Tahoma',sans-serif;">`;

  // แถวชื่อตาราง + หัวคอลัมน์วัน
  html += `<tr><td colspan="${dates.length + 1}" style="${border}background:${pal.title};color:${pal.titleInk};font-weight:bold;font-size:14pt;padding:6px;">${esc(title)}</td></tr>`;
  html += `<tr><td style="${border}background:${pal.head};color:${pal.headInk};font-weight:bold;font-size:9pt;padding:4px;">เวลา</td>`;
  heads.forEach((h, i) => {
    html += `<td style="${border}background:${weekend[i] ? pal.headWeekend : pal.head};color:${pal.headInk};font-weight:bold;font-size:9pt;padding:4px;text-align:center;">${h}</td>`;
  });
  html += '</tr>';

  for (let t = 360; t < DAY_END; t += 30) {
    const timeBg = t % 60 === 0 ? pal.timeCol : pal.timeColAlt ?? pal.timeCol;
    html += `<tr><td style="${border}background:${timeBg};color:${pal.sub};font-weight:bold;font-size:8pt;padding:2px 6px;white-space:nowrap;">${fmtMin(t)}</td>`;
    perDay.forEach((items, i) => {
      const startsHere = items.filter((it) => it.startMin >= t && it.startMin < t + 30);
      const covering = items.filter((it) => it.startMin < t && it.endMin > t);
      const anchor = covering[0] ?? startsHere[0];

      let style = `${border}font-size:8pt;padding:2px 4px;vertical-align:top;`;
      const bg = anchor
        ? anchor.color
          ? pal.userFill(anchor.color)
          : pal.catTint(CAT_BY_ID[anchor.cat].color)
        : weekend[i]
          ? pal.weekendCell
          : pal.cellBg;
      if (bg) style += `background:${bg};`;

      const parts = startsHere.map((it) => {
        if (it.ostatus === 'done') return `<span style="color:${pal.ok};font-weight:bold;">✓ ${esc(it.title)}</span>`;
        if (it.ostatus === 'skipped') return `<span style="color:${pal.bad};text-decoration:line-through;">✗ ${esc(it.title)}</span>`;
        const ink = it.color ? pal.userInk : pal.catInk(CAT_BY_ID[it.cat].color);
        return `<span style="color:${ink};font-weight:bold;">${esc(it.title)}</span>`;
      });
      html += `<td style="${style}">${parts.join('<br/>')}</td>`;
    });
    html += '</tr>';
  }

  // legend หมวด
  html += `<tr><td colspan="${dates.length + 1}" style="padding:6px 0 0 0;font-size:8pt;">`;
  html += Object.values(CAT_BY_ID)
    .map((c) => `<span style="background:${pal.catTint(c.color)};color:${pal.catInk(c.color)};font-weight:bold;padding:2px 8px;">${esc(c.short)}</span>`)
    .join(' ');
  html += ` <span style="color:${pal.ok};font-weight:bold;">✓ เสร็จ</span> <span style="color:${pal.bad};">✗ ข้าม</span></td></tr>`;

  html += '</table>';
  return html;
}

/** ห่อ table หนึ่งหรือหลายตัวเป็นเอกสาร .xls (HTML) เดียว — คั่นแต่ละตารางด้วยช่องว่าง */
function htmlDoc(tables: string[], pal: ExportPalette): string {
  const body = pal.cellBg ? ` style="background:${pal.cellBg};"` : '';
  return `﻿<html><head><meta charset="UTF-8"></head><body${body}>${tables.join('<br/><br/>')}</body></html>`;
}

/** table ของ Time Table ทั้งเดือนของ anchor (ยังไม่ห่อ doc) */
function monthTable(read: Read, anchor: string, pal: ExportPalette): string {
  const a = fromISO(anchor);
  const y = a.getFullYear();
  const m = a.getMonth();
  const nDays = new Date(y, m + 1, 0).getDate();
  const dates = Array.from({ length: nDays }, (_, i) => toISO(new Date(y, m, i + 1)));
  const heads = dates.map((d, i) => `${i + 1}<br/>${WD_TH[wdMon(d)]}`);
  return gridTable(`Time Table ${MONTH_TH_FULL[m]} ${beYear(y)}`, dates, heads, read, pal);
}

/** Time Table หลายเดือนในไฟล์ .xls เดียว แบบมีสี — คู่กับ buildTimeTableCsvMulti · report = บล็อกรายงานสรุปที่นำหน้าตาราง */
export function buildTimeTableXlsMulti(
  read: Read,
  anchors: string[],
  report?: string,
  pal: ExportPalette = EXPORT_PALETTES.current,
): string {
  const tables = anchors.map((anchor) => monthTable(read, anchor, pal));
  return htmlDoc(report ? [report, ...tables] : tables, pal);
}
