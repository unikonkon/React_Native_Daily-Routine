// รายงานสรุปจากที่บันทึกไว้ — โมเดลกลาง + ตัวเรนเดอร์ 3 แบบ (.xlsx / CSV / .xls)
// เนื้อหาตรงกับหน้าสถิติ (app/settings/stats.tsx): ภาพรวม · แนวโน้ม · ชั่วโมงตามหมวด · นัดเคส (ระดับ/ตามเคส/รายชื่อคน) · รายการนัด
// ตัวเลขทุกตัวคำนวณจาก engine.rangeStats ตัวเดียวกับหน้าจอ — เลขในไฟล์กับในแอปจึงตรงกันเสมอ

import { ACCENT, CATS, DANGER, GREEN, PRI, PRI_BY_ID, type PriorityId } from '@/constants/theme';
import { MONTH_TH, WD_TH_FULL, addDays, beYear, fmtRange, fromISO, hoursText, thaiDate, toISO, wdMon } from '@/lib/dates';
import { rangeStats, type RangeStats } from '@/lib/engine';
import type { Activity, Contact, DayItem, OccMap, OccStatus } from '@/lib/types';
import { mix } from '@/lib/xls';
import { xmlEsc, type XStyle, type XWriteCell, type XWriteSheet } from '@/lib/xlsx';

const STATUS_TH: Record<OccStatus, string> = {
  planned: 'ยังไม่ทำ',
  done: 'เสร็จแล้ว',
  skipped: 'ข้าม',
  cancelled: 'ยกเลิก',
  rescheduled: 'เลื่อนนัด',
};

/** ลำดับความสำคัญ (P1 = 0 สำคัญสุด) — ระดับว่างไปท้ายสุด */
const PRI_RANK = Object.fromEntries(PRI.map((p, i) => [p.id, i])) as Record<PriorityId, number>;
const priRank = (p: PriorityId | null) => (p ? PRI_RANK[p] : PRI.length);

/** ชื่อ normalize สำหรับรวมรายการซ้ำ (เหมือนหน้าสถิติ) */
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export interface ReportBucket {
  label: string;
  done: number;
  scheduled: number;
  rate: number;
  hours: number;
}

export interface ReportPerson {
  name: string;
  pri: PriorityId;
  total: number;
  done: number;
  hours: number;
  last: string | null;
  /** จำนวนรายชื่อที่ชื่อซ้ำกันแล้วถูกรวมเป็นคนเดียว */
  merged: number;
  contactText: string;
  note: string;
}

export interface ReportCase {
  title: string;
  pri: PriorityId | null;
  total: number;
  done: number;
  hours: number;
  online: number;
  inperson: number;
  names: string;
  first: string;
  last: string;
}

export interface ReportData {
  /** ป้ายช่วง เช่น "ก.ค. 2569" หรือ "ก.ค. 2569 – ก.ย. 2569" */
  label: string;
  from: string;
  to: string;
  /** วันสุดท้ายที่นำมาคิดจริง (ไม่เกินวันนี้) */
  madeOn: string;
  stats: RangeStats;
  bucketTitle: string;
  buckets: ReportBucket[];
  cats: { name: string; color: string; hours: number; pct: number }[];
  pris: { id: PriorityId; label: string; color: string; count: number }[];
  cases: ReportCase[];
  people: ReportPerson[];
  unnamed: number;
  items: DayItem[];
  nameById: Record<number, string>;
}

/** ช่องทางติดต่อของคนหนึ่ง รวมจากทุกรายชื่อที่ชื่อเหมือนกัน (ไม่ซ้ำ) */
function contactText(cs: Contact[]): string {
  const out: string[] = [];
  const add = (s: string | null | undefined, prefix = '') => {
    if (s && s.trim() && !out.includes(prefix + s.trim())) out.push(prefix + s.trim());
  };
  for (const c of cs) {
    add(c.phone, 'โทร ');
    add(c.line, 'LINE ');
    add(c.email);
    if (c.zoom) add('Zoom');
    if (c.googlemeet) add('Google Meet');
  }
  return out.join(' · ');
}

/**
 * สร้างรายงานของช่วง [from, to] — pure ทั้งหมด (ไม่แตะ store/DB)
 * anchors = เดือนที่ผู้ใช้เลือกส่งออก · 1 เดือน → แนวโน้มรายสัปดาห์, หลายเดือน → รายเดือน
 */
export function buildReport(
  acts: Activity[],
  occ: OccMap,
  contacts: Contact[],
  anchors: string[],
  today: string,
  now: number,
): ReportData {
  const first = fromISO(anchors[0]);
  const lastA = fromISO(anchors[anchors.length - 1]);
  const from = toISO(new Date(first.getFullYear(), first.getMonth(), 1));
  const to = toISO(new Date(lastA.getFullYear(), lastA.getMonth() + 1, 0));
  const label =
    anchors.length === 1
      ? `${MONTH_TH[first.getMonth()]} ${beYear(first.getFullYear())}`
      : `${MONTH_TH[first.getMonth()]} ${beYear(first.getFullYear())} – ${MONTH_TH[lastA.getMonth()]} ${beYear(lastA.getFullYear())}`;

  const stats = rangeStats(acts, occ, from, to, now);

  // แนวโน้มรายช่วงย่อย — เดือนเดียวแบ่งเป็นสัปดาห์ที่ 1..5, หลายเดือนแบ่งรายเดือน
  const bucketTitle = anchors.length === 1 ? 'รายสัปดาห์' : 'รายเดือน';
  const ranges: { label: string; from: string; to: string }[] = [];
  if (anchors.length === 1) {
    let start = from;
    let n = 1;
    while (start <= to) {
      const end = addDays(start, 6);
      ranges.push({ label: `สัปดาห์ ${n}`, from: start, to: end < to ? end : to });
      start = addDays(end, 1);
      n++;
    }
  } else {
    for (const a of anchors) {
      const d = fromISO(a);
      ranges.push({
        label: `${MONTH_TH[d.getMonth()]} ${beYear(d.getFullYear())}`,
        from: toISO(new Date(d.getFullYear(), d.getMonth(), 1)),
        to: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      });
    }
  }
  const buckets: ReportBucket[] = ranges.map((r) => {
    const s = rangeStats(acts, occ, r.from, r.to, now);
    return { label: r.label, done: s.done, scheduled: s.scheduled, rate: s.rate, hours: s.doneHours };
  });

  const cats = CATS.filter((c) => stats.hoursByCat[c.id]).map((c) => ({
    name: c.short,
    color: c.color,
    hours: stats.hoursByCat[c.id],
    pct: stats.doneHours ? stats.hoursByCat[c.id] / stats.doneHours : 0,
  }));

  const pris = PRI.filter((p) => stats.caseByPriority[p.id]).map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
    count: stats.caseByPriority[p.id],
  }));

  const nameById = Object.fromEntries(contacts.map((c) => [c.id, c.name])) as Record<number, string>;

  // ---------- รายชื่อคน (เหมือนแท็บ "รายชื่อ" ในหน้าสถิติ) ----------
  interface P {
    name: string;
    pri: PriorityId;
    cs: Contact[];
    items: DayItem[];
    done: number;
    hours: number;
  }
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const pmap = new Map<string, P>();
  let unnamed = 0;
  for (const it of stats.caseItems) {
    const found = it.contactIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c && !!c.name.trim());
    if (!found.length) {
      unnamed++;
      continue;
    }
    const counted = new Set<string>(); // นัดเดียวไม่นับซ้ำให้คนเดียวกัน
    for (const c of found) {
      const key = nameKey(c.name);
      const p = pmap.get(key) ?? { name: c.name.trim(), pri: c.priority, cs: [], items: [], done: 0, hours: 0 };
      if (!p.cs.some((x) => x.id === c.id)) p.cs.push(c);
      if (PRI_RANK[c.priority] < PRI_RANK[p.pri]) p.pri = c.priority;
      if (!counted.has(key)) {
        counted.add(key);
        p.items.push(it);
        if (it.ostatus === 'done') {
          p.done++;
          p.hours += (it.endMin - it.startMin) / 60;
        }
      }
      pmap.set(key, p);
    }
  }
  const people: ReportPerson[] = [...pmap.values()]
    .sort((a, b) => b.items.length - a.items.length || PRI_RANK[a.pri] - PRI_RANK[b.pri] || a.name.localeCompare(b.name, 'th'))
    .map((p) => {
      const items = [...p.items].sort((a, b) => a.date.localeCompare(b.date));
      return {
        name: p.name,
        pri: p.pri,
        total: items.length,
        done: p.done,
        hours: p.hours,
        last: items.length ? items[items.length - 1].date : null,
        merged: p.cs.length,
        contactText: contactText(p.cs),
        note: p.cs.map((c) => c.note?.trim()).filter(Boolean).join(' · '),
      };
    });

  // ---------- สรุปตามเคส (รวมนัดที่ชื่อเคสเหมือนกัน) ----------
  const cmap = new Map<string, ReportCase & { ids: number[] }>();
  for (const it of stats.caseItems) {
    const key = nameKey(it.title);
    const g =
      cmap.get(key) ??
      { title: it.title.trim(), pri: null as PriorityId | null, total: 0, done: 0, hours: 0, online: 0, inperson: 0, names: '', first: it.date, last: it.date, ids: [] as number[] };
    if (priRank(it.priority) < priRank(g.pri)) g.pri = it.priority;
    g.total++;
    if (it.ostatus === 'done') {
      g.done++;
      g.hours += (it.endMin - it.startMin) / 60;
    }
    if (it.channel === 'online') g.online++;
    else if (it.channel === 'inperson') g.inperson++;
    if (it.date < g.first) g.first = it.date;
    if (it.date > g.last) g.last = it.date;
    for (const id of it.contactIds) if (!g.ids.includes(id)) g.ids.push(id);
    cmap.set(key, g);
  }
  const cases: ReportCase[] = [...cmap.values()]
    .sort((a, b) => b.total - a.total || priRank(a.pri) - priRank(b.pri) || a.title.localeCompare(b.title, 'th'))
    .map(({ ids, ...g }) => ({ ...g, names: ids.map((id) => nameById[id]).filter(Boolean).join(', ') }));

  return {
    label,
    from,
    to,
    madeOn: to < today ? to : today,
    stats,
    bucketTitle,
    buckets,
    cats,
    pris,
    cases,
    people,
    unnamed,
    items: stats.caseItems,
    nameById,
  };
}

// ---------- ตัวช่วยจัดรูปแบบร่วม ----------

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** อัตราสำเร็จของช่วงที่ยังไม่มีรายการถึงกำหนด — แสดงขีดแทน 0% ที่ชวนเข้าใจผิด */
const ratePct = (done: number, scheduled: number) => (scheduled ? pct(done / scheduled) : '–');
const h1 = (v: number) => `${v.toFixed(1)} ชม.`;
const dayLabel = (iso: string) => `${fromISO(iso).getDate()} ${MONTH_TH[fromISO(iso).getMonth()]}`;

/** แถวสรุปภาพรวม (ใช้ร่วมทุกฟอร์แมต) — [หัวข้อ, ค่า, คำอธิบาย] */
function overviewRows(d: ReportData): [string, string, string][] {
  const s = d.stats;
  const avgDone = s.countedDays ? s.done / s.countedDays : 0;
  return [
    ['อัตราความสำเร็จ', ratePct(s.done, s.scheduled), `จากรายการที่ถึงกำหนดแล้ว ${s.scheduled} รายการ`],
    ['เสร็จแล้ว', `${s.done} / ${s.scheduled}`, `เฉลี่ย ${avgDone.toFixed(1)} รายการ/วัน`],
    ['วันที่นำมาคิด', `${s.countedDays} วัน`, `${d.from} ถึง ${d.madeOn} (ไม่รวมอนาคต)`],
    ['ชั่วโมงลงมือรวม', hoursText(s.doneHours * 60), 'นับเฉพาะรายการที่ทำเสร็จ'],
    ['เวลาว่างรวม', hoursText(s.freeTotalMin), `เฉลี่ย ${hoursText(s.freeAvgMin)}/วัน · หน้าต่าง 06:00–24:00`],
    ['เลื่อนนัด', `${s.rescheduled} ครั้ง`, 'จำนวนครั้งที่เลื่อนในช่วงนี้'],
    ['นัดเคสทั้งหมด', `${s.caseItems.length} นัด`, `${d.cases.length} เคส · ${d.people.length} คน`],
  ];
}

const CASE_HEAD = ['เคส', 'ระดับ', 'นัด', 'เสร็จ', 'อัตราสำเร็จ', 'ชั่วโมง', 'ออนไลน์', 'พบตัว', 'ช่วงวัน', 'ผู้ติดต่อ'];
const caseRow = (c: ReportCase): (string | number)[] => [
  c.title,
  c.pri ?? '–',
  c.total,
  c.done,
  ratePct(c.done, c.total),
  h1(c.hours),
  c.online,
  c.inperson,
  c.first === c.last ? dayLabel(c.first) : `${dayLabel(c.first)} – ${dayLabel(c.last)}`,
  c.names,
];

const PEOPLE_HEAD = ['ชื่อ', 'ระดับ', 'นัด', 'เสร็จ', 'อัตราสำเร็จ', 'ชั่วโมง', 'นัดล่าสุด', 'ช่องทางติดต่อ', 'หมายเหตุ'];
const personRow = (p: ReportPerson): (string | number)[] => [
  p.merged > 1 ? `${p.name} (รวม ${p.merged} รายชื่อ)` : p.name,
  p.pri,
  p.total,
  p.done,
  ratePct(p.done, p.total),
  h1(p.hours),
  p.last ? dayLabel(p.last) : '',
  p.contactText,
  p.note,
];

const ITEM_HEAD = ['วันที่', 'วัน', 'เวลา', 'เคส', 'ระดับ', 'ช่องทาง', 'ผู้ติดต่อ', 'สถานะ'];
const itemRow = (it: DayItem, nameById: Record<number, string>): (string | number)[] => [
  it.date,
  WD_TH_FULL[wdMon(it.date)],
  fmtRange(it.startMin, it.endMin),
  it.title,
  it.priority ?? '–',
  it.channel === 'online' ? 'ออนไลน์' : it.channel === 'inperson' ? 'พบตัว' : '',
  it.contactIds.map((id) => nameById[id]).filter(Boolean).join(', '),
  STATUS_TH[it.ostatus],
];

// ---------- .xlsx ----------

const S_TITLE: XStyle = { bold: true, size: 16, color: '#FFFFFF', fill: ACCENT, valign: 'center' };
const S_SUB: XStyle = { size: 10, color: '#6E6555', valign: 'center' };
const S_SECTION: XStyle = { bold: true, size: 12, color: '#FFFFFF', fill: '#6B6255', valign: 'center' };
const S_HEAD: XStyle = { bold: true, size: 10, color: '#FFFFFF', fill: '#8A8175', align: 'center', valign: 'center', border: true };
const S_KEY: XStyle = { size: 10, valign: 'center', border: true };
const S_VAL: XStyle = { bold: true, size: 11, align: 'right', valign: 'center', border: true };
const S_NOTE: XStyle = { size: 9, color: '#A79C88', valign: 'center', border: true };
const S_CELL: XStyle = { size: 10, valign: 'center', border: true, wrap: true };
const S_NUM: XStyle = { size: 10, align: 'center', valign: 'center', border: true };

const cell = (v: string | number, s: XStyle): XWriteCell => ({ v, s });

/** ป้ายระดับความสำคัญพื้นสีตามระดับ */
function priCell(id: PriorityId | null | string): XWriteCell {
  const p = typeof id === 'string' && id in PRI_BY_ID ? PRI_BY_ID[id as PriorityId] : null;
  return { v: p ? p.id : '–', s: { ...S_NUM, bold: !!p, color: p ? '#FFFFFF' : '#A79C88', fill: p?.color } };
}

/** เขียนตารางหนึ่งชุด: หัวข้อ + หัวคอลัมน์ + แถวข้อมูล — คืนเลขแถวถัดไป */
function table(
  rows: (XWriteCell | null)[][],
  merges: string[],
  at: number,
  width: number,
  title: string,
  head: string[],
  body: (XWriteCell | null)[][],
): number {
  let r = at;
  rows[r] = [cell(title, S_SECTION), ...Array<XWriteCell | null>(width - 1).fill({ s: S_SECTION })];
  merges.push(`A${r + 1}:${colLetter(width)}${r + 1}`);
  r++;
  rows[r++] = head.map((h) => cell(h, S_HEAD));
  for (const b of body) rows[r++] = b;
  rows[r++] = [];
  return r;
}

function colLetter(n: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + ((v - 1) % 26)) + s;
  return s;
}

/** ชีตรายงานสรุป (ภาพรวม + แนวโน้ม + ชั่วโมงตามหมวด + เคสตามระดับ) */
function summarySheet(d: ReportData): XWriteSheet {
  const rows: (XWriteCell | null)[][] = [];
  const merges: string[] = [];
  const W = 4;

  rows[0] = [cell('รายงานสรุปจากที่บันทึกไว้', S_TITLE), ...Array<XWriteCell | null>(W - 1).fill({ s: S_TITLE })];
  merges.push(`A1:${colLetter(W)}1`);
  rows[1] = [cell(`ช่วง ${d.label} · ${d.from} ถึง ${d.to}`, S_SUB)];
  rows[2] = [cell(`ออกรายงาน ${thaiDate(d.madeOn)} — นับเฉพาะรายการที่ถึงกำหนดแล้ว`, S_SUB)];
  rows[3] = [];
  let r = 4;

  r = table(rows, merges, r, W, 'ภาพรวม', ['ตัวชี้วัด', 'ค่า', 'คำอธิบาย', ''],
    overviewRows(d).map(([k, v, note]) => [cell(k, S_KEY), cell(v, S_VAL), cell(note, S_NOTE), { s: S_NOTE }]));

  r = table(rows, merges, r, W, `แนวโน้ม${d.bucketTitle}`, ['ช่วง', 'ทำเสร็จ', 'ถึงกำหนด', 'อัตราสำเร็จ'],
    d.buckets.map((b) => [
      cell(b.label, S_KEY),
      cell(b.done, S_NUM),
      cell(b.scheduled, S_NUM),
      { v: ratePct(b.done, b.scheduled), s: { ...S_NUM, bold: true, color: b.scheduled && b.rate >= 0.7 ? GREEN : undefined } },
    ]));

  r = table(rows, merges, r, W, 'ชั่วโมงตามหมวด', ['หมวด', 'ชั่วโมง', 'สัดส่วน', ''],
    d.cats.length
      ? d.cats.map((c) => [
          { v: c.name, s: { ...S_KEY, bold: true, fill: mix(c.color, 255, 0.78), color: mix(c.color, 0, 0.45) } },
          cell(h1(c.hours), S_VAL),
          cell(pct(c.pct), S_NUM),
          { s: S_NOTE },
        ])
      : [[cell('ยังไม่มีรายการที่ทำเสร็จในช่วงนี้', S_NOTE), { s: S_NOTE }, { s: S_NOTE }, { s: S_NOTE }]]);

  r = table(rows, merges, r, W, 'นัดเคสตามระดับความสำคัญ', ['ระดับ', 'ความหมาย', 'จำนวนนัด', 'สัดส่วน'],
    d.pris.length
      ? d.pris.map((p) => [
          priCell(p.id),
          cell(p.label, S_KEY),
          cell(p.count, S_NUM),
          cell(pct(d.items.length ? p.count / d.items.length : 0), S_NUM),
        ])
      : [[cell('–', S_NUM), cell('ไม่มีนัดเคสในช่วงนี้', S_KEY), { s: S_NOTE }, { s: S_NOTE }]]);

  if (d.unnamed) rows[r++] = [cell(`อีก ${d.unnamed} นัดในช่วงนี้ไม่ได้ระบุผู้ติดต่อ`, S_SUB)];

  return {
    name: 'รายงานสรุป',
    rows: normalize(rows, W),
    colWidths: [22, 16, 42, 12],
    merges,
    freeze: { cols: 0, rows: 3 },
  };
}

/** ชีตสรุปเคส + รายชื่อคน (สองตารางเรียงลงมา) */
function caseSheet(d: ReportData): XWriteSheet {
  const rows: (XWriteCell | null)[][] = [];
  const merges: string[] = [];
  const W = Math.max(CASE_HEAD.length, PEOPLE_HEAD.length);
  let r = 0;

  r = table(rows, merges, r, W, `สรุปตามเคส (${d.cases.length} เคส)`, pad(CASE_HEAD, W),
    d.cases.map((c) => rowCells(caseRow(c), 1)));

  table(rows, merges, r, W, `รายชื่อคน (${d.people.length} คน)`, pad(PEOPLE_HEAD, W),
    d.people.length ? d.people.map((p) => rowCells(personRow(p), 1)) : [[cell('ไม่มีนัดเคสที่ระบุผู้ติดต่อในช่วงนี้', S_NOTE)]]);

  return { name: 'สรุปเคส & รายชื่อ', rows: normalize(rows, W), colWidths: [30, 8, 7, 7, 11, 10, 10, 9, 20, 30], merges, freeze: { cols: 0, rows: 2 } };
}

/** ชีตรายการนัดเคสทุกครั้ง */
function itemSheet(d: ReportData): XWriteSheet {
  const rows: (XWriteCell | null)[][] = [];
  const merges: string[] = [];
  const W = ITEM_HEAD.length;
  table(rows, merges, 0, W, `รายการนัดเคส (${d.items.length} นัด)`, ITEM_HEAD,
    d.items.map((it) => {
      const cs = rowCells(itemRow(it, d.nameById), 4);
      const st = it.ostatus;
      cs[7] = { v: STATUS_TH[st], s: { ...S_NUM, bold: st === 'done' || st === 'skipped', color: st === 'done' ? GREEN : st === 'skipped' || st === 'cancelled' ? DANGER : undefined, strike: st === 'skipped' } };
      return cs;
    }));
  return { name: 'รายการนัดเคส', rows: normalize(rows, W), colWidths: [13, 12, 16, 34, 8, 11, 28, 12], merges, freeze: { cols: 0, rows: 2 } };
}

/** แปลงค่าดิบเป็นเซลล์ — คอลัมน์ priIdx ใช้ป้ายระดับสีพื้น, ตัวเลข/ข้อความสั้นจัดกลาง */
function rowCells(vals: (string | number)[], priIdx: number): (XWriteCell | null)[] {
  return vals.map((v, i) => {
    if (i === priIdx) return priCell(String(v));
    if (i === 0) return cell(v, { ...S_CELL, bold: true });
    return cell(v, typeof v === 'number' || String(v).length <= 12 ? S_NUM : S_CELL);
  });
}

function pad(head: string[], w: number): string[] {
  return head.length >= w ? head : [...head, ...Array<string>(w - head.length).fill('')];
}

/** เติมช่องว่างให้ทุกแถวยาวเท่ากันและไม่มีรู (sheet writer ต้องการ array หนาแน่น) */
function normalize(rows: (XWriteCell | null)[][], w: number): (XWriteCell | null)[][] {
  const n = rows.length;
  const out: (XWriteCell | null)[][] = [];
  for (let r = 0; r < n; r++) {
    const row = rows[r] ?? [];
    out.push(Array.from({ length: w }, (_, c) => row[c] ?? null));
  }
  return out;
}

/** ชีตรายงานทั้งชุดสำหรับไฟล์ .xlsx */
export function reportSheets(d: ReportData): XWriteSheet[] {
  const out = [summarySheet(d)];
  if (d.items.length) out.push(caseSheet(d), itemSheet(d));
  return out;
}

// ---------- CSV ----------

/** รายงานเป็นข้อความ CSV — บล็อกละหัวข้อ คั่นด้วยบรรทัดว่าง */
export function reportCsv(d: ReportData): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const line = (vals: (string | number)[]) => vals.map(esc).join(',');
  const out: string[] = [
    line(['รายงานสรุปจากที่บันทึกไว้']),
    line([`ช่วง ${d.label}`, d.from, d.to]),
    line([`ออกรายงาน ${thaiDate(d.madeOn)}`]),
    '',
    line(['ภาพรวม']),
    line(['ตัวชี้วัด', 'ค่า', 'คำอธิบาย']),
    ...overviewRows(d).map(line),
    '',
    line([`แนวโน้ม${d.bucketTitle}`]),
    line(['ช่วง', 'ทำเสร็จ', 'ถึงกำหนด', 'อัตราสำเร็จ', 'ชั่วโมง']),
    ...d.buckets.map((b) => line([b.label, b.done, b.scheduled, ratePct(b.done, b.scheduled), h1(b.hours)])),
    '',
    line(['ชั่วโมงตามหมวด']),
    line(['หมวด', 'ชั่วโมง', 'สัดส่วน']),
    ...d.cats.map((c) => line([c.name, h1(c.hours), pct(c.pct)])),
    '',
    line(['นัดเคสตามระดับความสำคัญ']),
    line(['ระดับ', 'ความหมาย', 'จำนวนนัด']),
    ...d.pris.map((p) => line([p.id, p.label, p.count])),
  ];
  if (d.items.length) {
    out.push(
      '',
      line([`สรุปตามเคส (${d.cases.length} เคส)`]),
      line(CASE_HEAD),
      ...d.cases.map((c) => line(caseRow(c))),
      '',
      line([`รายชื่อคน (${d.people.length} คน)`]),
      line(PEOPLE_HEAD),
      ...d.people.map((p) => line(personRow(p))),
      '',
      line([`รายการนัดเคส (${d.items.length} นัด)`]),
      line(ITEM_HEAD),
      ...d.items.map((it) => line(itemRow(it, d.nameById))),
    );
  }
  if (d.unnamed) out.push('', line([`อีก ${d.unnamed} นัดไม่ได้ระบุผู้ติดต่อ`]));
  return out.join('\n');
}

// ---------- .xls (HTML table) ----------

const TD = 'border:1px solid #E3DACB;padding:3px 6px;font-size:9pt;';

function htmlTable(title: string, head: string[], body: (string | number)[][], colorCol?: (v: string | number, i: number) => string): string {
  let s = `<table style="border-collapse:collapse;font-family:'Anuphan','Tahoma',sans-serif;margin-bottom:14px;">`;
  s += `<tr><td colspan="${head.length}" style="${TD}background:#6B6255;color:#FFFFFF;font-weight:bold;font-size:11pt;">${xmlEsc(title)}</td></tr><tr>`;
  s += head.map((h) => `<td style="${TD}background:#8A8175;color:#FFFFFF;font-weight:bold;text-align:center;">${xmlEsc(h)}</td>`).join('');
  s += '</tr>';
  for (const row of body) {
    s += '<tr>';
    s += row.map((v, i) => `<td style="${TD}${colorCol?.(v, i) ?? ''}">${xmlEsc(String(v))}</td>`).join('');
    s += '</tr>';
  }
  return s + '</table>';
}

/** รายงานเป็นตาราง HTML (สำหรับไฟล์ .xls) — ต่อท้ายตาราง Time Table */
export function reportHtml(d: ReportData): string {
  const priTint = (v: string | number, i: number, at: number) =>
    i === at && typeof v === 'string' && v in PRI_BY_ID
      ? `background:${PRI_BY_ID[v as PriorityId].color};color:#FFFFFF;font-weight:bold;text-align:center;`
      : '';

  let s = `<div style="font-family:'Anuphan','Tahoma',sans-serif;">`;
  s += `<div style="background:${ACCENT};color:#FFFFFF;font-weight:bold;font-size:14pt;padding:6px;">รายงานสรุปจากที่บันทึกไว้</div>`;
  s += `<div style="font-size:9pt;color:#6E6555;padding:4px 0 10px 0;">ช่วง ${xmlEsc(d.label)} · ${d.from} ถึง ${d.to} — ออกรายงาน ${xmlEsc(thaiDate(d.madeOn))}</div>`;
  s += htmlTable('ภาพรวม', ['ตัวชี้วัด', 'ค่า', 'คำอธิบาย'], overviewRows(d).map((r) => [...r]));
  s += htmlTable(`แนวโน้ม${d.bucketTitle}`, ['ช่วง', 'ทำเสร็จ', 'ถึงกำหนด', 'อัตราสำเร็จ', 'ชั่วโมง'],
    d.buckets.map((b) => [b.label, b.done, b.scheduled, ratePct(b.done, b.scheduled), h1(b.hours)]));
  s += htmlTable('ชั่วโมงตามหมวด', ['หมวด', 'ชั่วโมง', 'สัดส่วน'], d.cats.map((c) => [c.name, h1(c.hours), pct(c.pct)]),
    (v, i) => {
      if (i !== 0) return '';
      const c = CATS.find((x) => x.short === v);
      return c ? `background:${mix(c.color, 255, 0.78)};color:${mix(c.color, 0, 0.45)};font-weight:bold;` : '';
    });
  s += htmlTable('นัดเคสตามระดับความสำคัญ', ['ระดับ', 'ความหมาย', 'จำนวนนัด'], d.pris.map((p) => [p.id, p.label, p.count]),
    (v, i) => priTint(v, i, 0));
  if (d.items.length) {
    s += htmlTable(`สรุปตามเคส (${d.cases.length} เคส)`, CASE_HEAD, d.cases.map(caseRow), (v, i) => priTint(v, i, 1));
    s += htmlTable(`รายชื่อคน (${d.people.length} คน)`, PEOPLE_HEAD, d.people.map(personRow), (v, i) => priTint(v, i, 1));
    s += htmlTable(`รายการนัดเคส (${d.items.length} นัด)`, ITEM_HEAD, d.items.map((it) => itemRow(it, d.nameById)), (v, i) => priTint(v, i, 4));
  }
  return s + '</div>';
}
