// รายงานสรุปจากที่บันทึกไว้ — โมเดลกลาง + ตัวเรนเดอร์ 3 แบบ (.xlsx / CSV / .xls)
// เนื้อหาตรงกับหน้าสถิติ (app/settings/stats.tsx): ภาพรวม · แนวโน้ม · ชั่วโมงตามหมวด · นัดเคส (ระดับ/ตามเคส/รายชื่อคน) · รายการนัด
// ตัวเลขทุกตัวคำนวณจาก engine.rangeStats ตัวเดียวกับหน้าจอ — เลขในไฟล์กับในแอปจึงตรงกันเสมอ

import { CATS, CAT_OPTIONS, PRI, PRI_BY_ID, type CatId, type PriorityId } from '@/constants/theme';
import { MONTH_TH, WD_TH_FULL, addDays, beYear, fmtRange, fromISO, hoursText, thaiDate, toISO, wdMon } from '@/lib/dates';
import { rangeStats, type RangeStats } from '@/lib/engine';
import { EXPORT_PALETTES, type ExportPalette } from '@/lib/export-theme';
import type { Activity, Contact, DayItem, OccMap, OccStatus } from '@/lib/types';
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

/** ตัวเลือกย่อยหนึ่งค่าของหมวด (สถานที่/ประเภท/สื่อ) — configured = อยู่ในรายการที่ตั้งไว้, ไม่ใช่ค่าที่พิมพ์เอง */
export interface ReportCatOpt {
  name: string;
  count: number;
  configured: boolean;
}

/** กิจกรรมหนึ่งชื่อในหมวด — รวมทุกครั้งที่ชื่อเดียวกันในช่วงที่ส่งออก */
export interface ReportCatItem {
  name: string;
  count: number; // จำนวนครั้งที่ถึงกำหนด
  done: number;
  hours: number; // ชั่วโมงเฉพาะครั้งที่ทำเสร็จ
  first: string; // ISO วันแรกที่พบในช่วง
  last: string;
}

/** สรุปหมวดหนึ่ง — ชุดเดียวกับการ์ด "สรุปหมวดหมู่" หน้าสถิติ (มีครบทุกหมวด รวมหมวดที่ยังไม่ได้ใช้) */
export interface ReportCat {
  id: CatId;
  name: string; // ชื่อเต็ม
  short: string;
  color: string;
  count: number; // รายการที่ถึงกำหนดในช่วง
  done: number;
  hours: number; // ชั่วโมงเฉพาะที่ทำเสร็จ
  share: number; // สัดส่วนจำนวนรายการเทียบทั้งหมด
  /** สัดส่วนชั่วโมงเทียบชั่วโมงที่ทำเสร็จทั้งหมด (เกณฑ์ "ชั่วโมง" ของแถบเทียบในหน้าสถิติ) */
  hourShare: number;
  rate: number; // done / count
  /** กิจกรรมทุกชื่อในหมวดนี้ (ไม่ตัดทอน) เรียงจำนวนครั้งมากไปน้อย */
  items: ReportCatItem[];
  /** ชื่อชุดตัวเลือกย่อยของหมวด (null = หมวดนี้ไม่มีตัวเลือกย่อย) */
  optTitle: string | null;
  opts: ReportCatOpt[];
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
  /** สรุปหมวดหมู่ครบทุกหมวด — เรียงตามจำนวนรายการ หมวดที่ยังไม่ได้ใช้อยู่ท้ายสุด */
  catSummary: ReportCat[];
  /** หมวดที่ใช้มากสุด (จำนวนรายการ) — null เมื่อไม่มีรายการในช่วง */
  topCat: ReportCat | null;
  /** จำนวนหมวดที่มีรายการในช่วง */
  usedCats: number;
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
  /** ตัวเลือกย่อยต่อหมวดที่ผู้ใช้ตั้งไว้ (settings store) — ไม่ส่งมาก็ใช้ค่าเริ่มต้นของแอป */
  catOptions?: Partial<Record<CatId, string[]>>,
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

  // ---------- สรุปหมวดหมู่ (ชุดเดียวกับการ์ด "สรุปหมวดหมู่" หน้าสถิติ) ----------
  const catSummary: ReportCat[] = CATS.map((c) => {
    const s = stats.byCat[c.id];
    const optSet = CAT_OPTIONS[c.id];
    const used = s?.opts ?? {};
    const listed = catOptions?.[c.id] ?? optSet?.defaults ?? [];
    // ค่าที่พิมพ์เองนอกรายการที่ตั้งไว้ต่อท้าย — จะได้ไม่หายไปจากรายงาน
    const names = optSet ? [...listed, ...Object.keys(used).filter((o) => !listed.includes(o))] : [];
    return {
      id: c.id,
      name: c.name,
      short: c.short,
      color: c.color,
      count: s?.count ?? 0,
      done: s?.done ?? 0,
      hours: s?.hours ?? 0,
      share: stats.scheduled ? (s?.count ?? 0) / stats.scheduled : 0,
      hourShare: stats.doneHours ? (s?.hours ?? 0) / stats.doneHours : 0,
      rate: s?.count ? s.done / s.count : 0,
      // กิจกรรมทุกชื่อในหมวด (ไม่ตัด 3 อันดับ) — เรียงครั้งมากไปน้อย แล้วชื่อไทย
      items: Object.entries(s?.titles ?? {})
        .map(([name, count]) => ({
          name,
          count,
          done: s?.titleDone[name] ?? 0,
          hours: s?.titleHours[name] ?? 0,
          first: s?.titleFirst[name] ?? '',
          last: s?.titleLast[name] ?? '',
        }))
        .sort((a, b) => b.count - a.count || b.hours - a.hours || a.name.localeCompare(b.name, 'th')),
      optTitle: optSet?.title ?? null,
      opts: names.map((n) => ({ name: n, count: used[n] ?? 0, configured: listed.includes(n) })),
    };
  }).sort((a, b) => {
    if (!a.count !== !b.count) return a.count ? -1 : 1; // หมวดที่ยังไม่ได้ใช้ไปท้ายสุด
    return b.count - a.count || b.hours - a.hours;
  });
  const usedCats = catSummary.filter((c) => c.count).length;
  const topCat = catSummary.find((c) => c.count) ?? null;

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
    catSummary,
    topCat,
    usedCats,
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
    [
      'หมวดที่ใช้งาน',
      `${d.usedCats} / ${CATS.length} หมวด`,
      d.catSummary.filter((c) => c.count).map((c) => c.short).join(' · ') || 'ยังไม่มีรายการในช่วงนี้',
    ],
    [
      'หมวดที่ไม่ใช้งาน',
      `${CATS.length - d.usedCats} / ${CATS.length} หมวด`,
      idleCatNames(d) || 'ใช้ครบทุกหมวดในช่วงนี้',
    ],
    [
      'หมวดที่ใช้มากสุด',
      d.topCat ? d.topCat.short : '–',
      d.topCat
        ? `${d.topCat.count} รายการ · ${pct(d.topCat.share)} ของทั้งหมด · เสร็จ ${d.topCat.done}`
        : 'ยังไม่มีรายการที่ถึงกำหนด',
    ],
  ];
}

/**
 * ตารางสรุปหมวดหมู่ — ชุดข้อมูลเดียวกับการ์ด "สรุปหมวดหมู่" หน้าสถิติ:
 * list ทุกหมวดที่มีในแอป · สถานะใช้งาน/ไม่ใช้งาน · เกณฑ์เทียบทั้งจำนวนและชั่วโมง (แถบสลับเกณฑ์ในหน้าจอ)
 * · กิจกรรมยอดฮิต 3 อันดับ · ตัวเลือกย่อยที่ตั้งไว้พร้อมตัวที่ยังไม่ถูกใช้
 */
const CAT_HEAD = ['หมวด', 'ชื่อเต็ม', 'สถานะ', 'รายการ', 'สัดส่วนรายการ', 'เสร็จ', 'อัตราสำเร็จ', 'ชั่วโมง', 'สัดส่วนชั่วโมง', 'กิจกรรมยอดฮิต (3 อันดับ)', 'ตัวเลือกย่อยที่ตั้งไว้'];
/** คอลัมน์ "สถานะ" ในตารางสรุปหมวดหมู่ (ไว้ย้อมสีให้ตรงกันทุกฟอร์แมต) */
const CAT_STATUS_COL = 2;
/** คอลัมน์แรกที่เป็นข้อความยาว (ต้อง wrap ในไฟล์ .xlsx) */
const CAT_TEXT_COL = 9;

/** แถบ "หมวดที่ใช้มากสุด" — ชุดเดียวกับแถบเด่นบนสุดของการ์ดในหน้าสถิติ */
const TOP_CAT_HEAD = ['หมวด', 'สัดส่วน', 'รายละเอียด'];

/** แถวของแถบเด่น — [ชื่อหมวด, ค่าเด่น, รายละเอียด] · แจ้งด้วยเมื่อมีหลายหมวดใช้เท่ากัน */
function topCatRows(d: ReportData): [string, string, string][] {
  const c = d.topCat;
  if (!c) return [['–', '–', 'ยังไม่มีรายการที่ถึงกำหนดในช่วงนี้']];
  const tied = d.catSummary.filter((x) => x.count === c.count);
  const rows: [string, string, string][] = [
    [
      c.name,
      pct(c.share),
      `${c.count} รายการจากทั้งหมด ${d.stats.scheduled} · ทำเสร็จ ${c.done} (${ratePct(c.done, c.count)})${c.hours ? ` · ลงมือไป ${h1(c.hours)}` : ''}`,
    ],
  ];
  if (tied.length > 1) {
    rows.push(['ใช้มากสุดเท่ากัน', `${tied.length} หมวด`, tied.map((x) => x.short).join(' · ')]);
  }
  return rows;
}

/** กิจกรรมยอดฮิตของหมวดเป็นข้อความบรรทัดเดียว — รายชื่อครบอยู่ในตาราง "รายการกิจกรรมทั้งหมดตามหมวด" */
function topTitlesText(c: ReportCat): string {
  if (!c.items.length) return 'ยังไม่ได้ใช้ในช่วงนี้';
  const head = c.items.slice(0, 3).map((it) => `${it.name} ${it.count} ครั้ง`).join(' · ');
  return c.items.length > 3 ? `${head} (ทั้งหมด ${c.items.length} ชื่อ — ดูตารางถัดไป)` : head;
}

/** ตาราง "รายการกิจกรรมทั้งหมดตามหมวด" — ทุกกิจกรรมในทั้ง 6 หมวด ไม่ตัดทอน */
const ACT_HEAD = ['หมวด', 'กิจกรรม', 'ครั้ง', 'เสร็จ', 'อัตราสำเร็จ', 'ชั่วโมง', 'สัดส่วนในหมวด', 'ครั้งแรก', 'ครั้งล่าสุด'];

/** ทุกกิจกรรมของทุกหมวด (หมวดที่ไม่มีรายการก็มีแถวบอกไว้) — คู่กับหมวดต้นทางไว้ย้อมสี */
function catItemRows(d: ReportData): { cat: ReportCat; vals: (string | number)[] }[] {
  const out: { cat: ReportCat; vals: (string | number)[] }[] = [];
  for (const c of d.catSummary) {
    if (!c.items.length) {
      out.push({ cat: c, vals: [c.short, 'ไม่มีรายการในช่วงนี้', 0, 0, '–', '–', '–', '–', '–'] });
      continue;
    }
    for (const it of c.items) {
      out.push({
        cat: c,
        vals: [
          c.short,
          it.name,
          it.count,
          it.done,
          ratePct(it.done, it.count),
          it.hours ? h1(it.hours) : '–',
          c.count ? pct(it.count / c.count) : '–',
          it.first ? dayLabel(it.first) : '–',
          it.last ? dayLabel(it.last) : '–',
        ],
      });
    }
  }
  return out;
}

/** หัวข้อตารางรายการกิจกรรม — บอกจำนวนชื่อทั้งหมดและจำนวนครั้งรวม */
const actTitle = (d: ReportData): string => {
  const names = d.catSummary.reduce((n, c) => n + c.items.length, 0);
  return `รายการกิจกรรมทั้งหมดตามหมวด — ${names} ชื่อ · ${d.stats.scheduled} ครั้ง (ครบทั้ง ${CATS.length} หมวด)`;
};

/** ตัวเลือกย่อยของหมวดเป็นข้อความบรรทัดเดียว — ตัวที่ตั้งไว้แต่ยังไม่ถูกใช้ก็แสดงไว้ด้วย */
function optsText(c: ReportCat): string {
  if (!c.optTitle) return '';
  if (!c.opts.length) return `${c.optTitle}: ยังไม่ได้ตั้งตัวเลือก`;
  return `${c.optTitle}: ${c.opts.map((o) => (o.count ? `${o.name} ${o.count}` : `${o.name} (ยังไม่ใช้)`)).join(' · ')}`;
}

const catRow = (c: ReportCat): (string | number)[] => [
  c.short,
  c.name,
  c.count ? 'ใช้งาน' : 'ไม่ใช้งาน',
  c.count,
  c.count ? pct(c.share) : '–',
  c.done,
  c.count ? ratePct(c.done, c.count) : '–',
  c.hours ? h1(c.hours) : '–',
  c.hours ? pct(c.hourShare) : '–',
  topTitlesText(c),
  optsText(c),
];

/** หัวข้อตารางสรุปหมวดหมู่ (ใช้ตรงกันทุกฟอร์แมต) */
const catTitle = (d: ReportData): string =>
  `สรุปหมวดหมู่ — หมวดทั้งหมด ${CATS.length} หมวด · ใช้งาน ${d.usedCats} · ไม่ใช้งาน ${CATS.length - d.usedCats}${d.topCat ? ` · ใช้มากสุด: ${d.topCat.short}` : ''}`;

/** ชื่อหมวดที่ไม่มีรายการเลยในช่วงนี้ (คั่นด้วย ·) */
const idleCatNames = (d: ReportData): string =>
  d.catSummary.filter((c) => !c.count).map((c) => c.short).join(' · ');

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

/** ชุดสไตล์ของชีตรายงานตามโทนที่เลือก */
interface Styles {
  title: XStyle;
  sub: XStyle;
  section: XStyle;
  head: XStyle;
  key: XStyle;
  val: XStyle;
  note: XStyle;
  cell: XStyle;
  num: XStyle;
}

function styles(pal: ExportPalette): Styles {
  const base = { valign: 'center' as const, border: true, fill: pal.cellBg ?? undefined };
  return {
    title: { bold: true, size: 16, color: pal.titleInk, fill: pal.title, valign: 'center' },
    sub: { size: 10, color: pal.sub, valign: 'center', fill: pal.cellBg ?? undefined },
    section: { bold: true, size: 12, color: pal.headInk, fill: pal.head, valign: 'center' },
    head: { bold: true, size: 10, color: pal.headInk, fill: pal.head2, align: 'center', valign: 'center', border: true },
    key: { ...base, size: 10, color: pal.ink },
    val: { ...base, bold: true, size: 11, color: pal.ink, align: 'right' },
    note: { ...base, size: 9, color: pal.faint },
    cell: { ...base, size: 10, color: pal.ink, wrap: true },
    num: { ...base, size: 10, color: pal.ink, align: 'center' },
  };
}

const cell = (v: string | number, s: XStyle): XWriteCell => ({ v, s });

/** ป้ายระดับความสำคัญพื้นสีตามระดับ (ปรับความสว่างตามโทน) */
function priCell(id: PriorityId | null | string, pal: ExportPalette, S: Styles): XWriteCell {
  const p = typeof id === 'string' && id in PRI_BY_ID ? PRI_BY_ID[id as PriorityId] : null;
  return { v: p ? p.id : '–', s: { ...S.num, bold: !!p, color: p ? pal.priInk : pal.faint, fill: p ? pal.priFill(p.color) : S.num.fill } };
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
  S: Styles,
): number {
  let r = at;
  rows[r] = [cell(title, S.section), ...Array<XWriteCell | null>(width - 1).fill({ s: S.section })];
  merges.push(`A${r + 1}:${colLetter(width)}${r + 1}`);
  r++;
  rows[r++] = head.map((h) => cell(h, S.head));
  for (const b of body) rows[r++] = b;
  rows[r++] = [];
  return r;
}

function colLetter(n: number): string {
  let s = '';
  for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + ((v - 1) % 26)) + s;
  return s;
}

/**
 * ชีต "รายงานสรุป" — ภาพรวม + แนวโน้ม + ชั่วโมงตามหมวด + เคสตามระดับ + สรุปหมวดหมู่ (ตารางเรียงลงมาในชีตเดียว)
 * กว้าง 8 คอลัมน์เท่าตารางสรุปหมวดหมู่ — ตารางอื่นที่แคบกว่าถูกเติมช่องว่างให้เต็มความกว้าง
 */
function summarySheet(d: ReportData, pal: ExportPalette, S: Styles): XWriteSheet {
  const rows: (XWriteCell | null)[][] = [];
  const merges: string[] = [];
  const W = CAT_HEAD.length; // 8
  /** เติมเซลล์ว่าง (มีพื้น/เส้นตามโทน) ให้แถวยาวเท่าความกว้างชีต */
  const wide = (cs: (XWriteCell | null)[]): (XWriteCell | null)[] =>
    cs.length >= W ? cs : [...cs, ...Array.from({ length: W - cs.length }, () => ({ s: S.note }))];

  rows[0] = [cell('รายงานสรุปจากที่บันทึกไว้', S.title), ...Array<XWriteCell | null>(W - 1).fill({ s: S.title })];
  merges.push(`A1:${colLetter(W)}1`);
  rows[1] = [cell(`ช่วง ${d.label} · ${d.from} ถึง ${d.to}`, S.sub)];
  rows[2] = [cell(`ออกรายงาน ${thaiDate(d.madeOn)} — นับเฉพาะรายการที่ถึงกำหนดแล้ว`, S.sub)];
  rows[3] = [];
  let r = 4;

  r = table(rows, merges, r, W, 'ภาพรวม', pad(['ตัวชี้วัด', 'ค่า', 'คำอธิบาย'], W),
    overviewRows(d).map(([k, v, note]) => wide([cell(k, S.key), cell(v, S.val), cell(note, S.note)])), S);

  r = table(rows, merges, r, W, `แนวโน้ม${d.bucketTitle}`, pad(['ช่วง', 'ทำเสร็จ', 'ถึงกำหนด', 'อัตราสำเร็จ'], W),
    d.buckets.map((b) => wide([
      cell(b.label, S.key),
      cell(b.done, S.num),
      cell(b.scheduled, S.num),
      { v: ratePct(b.done, b.scheduled), s: { ...S.num, bold: true, color: b.scheduled && b.rate >= 0.7 ? pal.ok : S.num.color } },
    ])), S);

  r = table(rows, merges, r, W, 'ชั่วโมงตามหมวด', pad(['หมวด', 'ชั่วโมง', 'สัดส่วน'], W),
    d.cats.length
      ? d.cats.map((c) => wide([
          { v: c.name, s: { ...S.key, bold: true, fill: pal.catTint(c.color), color: pal.catInk(c.color) } },
          cell(h1(c.hours), S.val),
          cell(pct(c.pct), S.num),
        ]))
      : [wide([cell('ยังไม่มีรายการที่ทำเสร็จในช่วงนี้', S.note)])], S);

  r = table(rows, merges, r, W, 'นัดเคสตามระดับความสำคัญ', pad(['ระดับ', 'ความหมาย', 'จำนวนนัด', 'สัดส่วน'], W),
    d.pris.length
      ? d.pris.map((p) => wide([
          priCell(p.id, pal, S),
          cell(p.label, S.key),
          cell(p.count, S.num),
          cell(pct(d.items.length ? p.count / d.items.length : 0), S.num),
        ]))
      : [wide([cell('–', S.num), cell('ไม่มีนัดเคสในช่วงนี้', S.key)])], S);

  // สรุปหมวดหมู่ (ชุดเดียวกับการ์ดในหน้าสถิติ) — แถบเด่นหมวดที่ใช้มากสุด แล้วตามด้วยตารางทุกหมวด
  r = table(rows, merges, r, W, 'หมวดที่ใช้มากสุดในช่วงนี้', pad(TOP_CAT_HEAD, W),
    topCatRows(d).map(([k, v, note], i) => wide([
      {
        v: k,
        s: i === 0 && d.topCat
          ? { ...S.key, bold: true, fill: pal.catTint(d.topCat.color), color: pal.catInk(d.topCat.color) }
          : { ...S.key, bold: true },
      },
      cell(v, S.val),
      cell(note, S.note),
    ])), S);

  r = table(rows, merges, r, W, catTitle(d), CAT_HEAD, d.catSummary.map((c) => catCells(c, pal, S)), S);

  // รายการกิจกรรมทุกชื่อในทั้ง 6 หมวด (ไม่ตัดทอน) — ชุดเดียวกับที่กางดูได้ในการ์ดหน้าสถิติ
  r = table(rows, merges, r, W, actTitle(d), pad(ACT_HEAD, W),
    catItemRows(d).map(({ cat, vals }) => wide(vals.map((v, i) => {
      if (i === 0) return { v, s: { ...S.key, bold: true, fill: pal.catTint(cat.color), color: pal.catInk(cat.color) } };
      if (!cat.items.length) return cell(v, S.note); // หมวดที่ยังไม่ได้ใช้ — จางทั้งแถว
      return cell(v, i === 1 ? { ...S.cell, bold: true } : S.num);
    }))), S);

  if (d.unnamed) rows[r++] = [cell(`อีก ${d.unnamed} นัดในช่วงนี้ไม่ได้ระบุผู้ติดต่อ`, S.sub)];

  return {
    name: 'รายงานสรุป',
    rows: normalize(rows, W),
    colWidths: [22, 22, 42, 12, 12, 10, 11, 10, 12, 46, 46],
    merges,
    freeze: { cols: 0, rows: 3 },
  };
}

/**
 * แถวหนึ่งของตารางสรุปหมวดหมู่ในไฟล์ .xlsx
 * คอลัมน์แรกพื้นสีตามหมวด · คอลัมน์สถานะเขียว = ใช้งาน / จาง = ไม่ใช้งาน · หมวดที่ไม่ใช้งานจางทั้งแถว
 */
function catCells(c: ReportCat, pal: ExportPalette, S: Styles): (XWriteCell | null)[] {
  return catRow(c).map((v, i) => {
    if (i === 0) return { v, s: { ...S.key, bold: true, fill: pal.catTint(c.color), color: pal.catInk(c.color) } };
    if (i === CAT_STATUS_COL) return { v, s: { ...S.num, bold: true, color: c.count ? pal.ok : pal.faint } };
    if (!c.count) return cell(v, S.note);
    return cell(v, i >= CAT_TEXT_COL ? S.cell : i === 1 ? S.key : S.num);
  });
}

/** ชีต "สรุปเคส & รายชื่อ" — สรุปตามเคส + รายชื่อคน + รายการนัดเคสทุกครั้ง (สามตารางเรียงลงมาในชีตเดียว) */
function caseSheet(d: ReportData, pal: ExportPalette, S: Styles): XWriteSheet {
  const rows: (XWriteCell | null)[][] = [];
  const merges: string[] = [];
  const W = Math.max(CASE_HEAD.length, PEOPLE_HEAD.length, ITEM_HEAD.length);
  let r = 0;

  r = table(rows, merges, r, W, `สรุปตามเคส (${d.cases.length} เคส)`, pad(CASE_HEAD, W),
    d.cases.map((c) => rowCells(caseRow(c), 1, pal, S)), S);

  r = table(rows, merges, r, W, `รายชื่อคน (${d.people.length} คน)`, pad(PEOPLE_HEAD, W),
    d.people.length ? d.people.map((p) => rowCells(personRow(p), 1, pal, S)) : [[cell('ไม่มีนัดเคสที่ระบุผู้ติดต่อในช่วงนี้', S.note)]], S);

  table(rows, merges, r, W, `รายการนัดเคส (${d.items.length} นัด)`, pad(ITEM_HEAD, W),
    d.items.map((it) => {
      const cs = rowCells(itemRow(it, d.nameById), 4, pal, S);
      const st = it.ostatus;
      cs[7] = { v: STATUS_TH[st], s: { ...S.num, bold: st === 'done' || st === 'skipped', color: st === 'done' ? pal.ok : st === 'skipped' || st === 'cancelled' ? pal.bad : S.num.color, strike: st === 'skipped' } };
      return cs;
    }), S);

  // ความกว้างคอลัมน์เอาค่ามากสุดของทั้งสามตาราง (คอลัมน์ D ต้องพอสำหรับชื่อเคสในตารางรายการนัด)
  return { name: 'สรุปเคส & รายชื่อ', rows: normalize(rows, W), colWidths: [30, 12, 16, 34, 11, 11, 28, 30, 20, 30], merges, freeze: { cols: 0, rows: 2 } };
}

/** แปลงค่าดิบเป็นเซลล์ — คอลัมน์ priIdx ใช้ป้ายระดับสีพื้น, ตัวเลข/ข้อความสั้นจัดกลาง */
function rowCells(vals: (string | number)[], priIdx: number, pal: ExportPalette, S: Styles): (XWriteCell | null)[] {
  return vals.map((v, i) => {
    if (i === priIdx) return priCell(String(v), pal, S);
    if (i === 0) return cell(v, { ...S.cell, bold: true });
    return cell(v, typeof v === 'number' || String(v).length <= 12 ? S.num : S.cell);
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

/** ชีตรายงานทั้งชุดสำหรับไฟล์ .xlsx — 2 ชีต: รายงานสรุป (รวมสรุปหมวดหมู่) · สรุปเคส & รายชื่อ (รวมรายการนัด) */
export function reportSheets(d: ReportData, pal: ExportPalette = EXPORT_PALETTES.current): XWriteSheet[] {
  const S = styles(pal);
  const out = [summarySheet(d, pal, S)];
  if (d.items.length) out.push(caseSheet(d, pal, S));
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
    '',
    line(['หมวดที่ใช้มากสุดในช่วงนี้']),
    line(TOP_CAT_HEAD),
    ...topCatRows(d).map(line),
    '',
    line([catTitle(d)]),
    line(CAT_HEAD),
    ...d.catSummary.map((c) => line(catRow(c))),
    '',
    line([actTitle(d)]),
    line(ACT_HEAD),
    ...catItemRows(d).map(({ vals }) => line(vals)),
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

function htmlTable(
  pal: ExportPalette,
  title: string,
  head: string[],
  body: (string | number)[][],
  colorCol?: (v: string | number, i: number) => string,
): string {
  const td = `border:1px solid ${pal.border};padding:3px 6px;font-size:9pt;color:${pal.ink};`;
  const bg = pal.cellBg ? `background:${pal.cellBg};` : '';
  let s = `<table style="border-collapse:collapse;font-family:'Anuphan','Tahoma',sans-serif;margin-bottom:14px;">`;
  s += `<tr><td colspan="${head.length}" style="${td}background:${pal.head};color:${pal.headInk};font-weight:bold;font-size:11pt;">${xmlEsc(title)}</td></tr><tr>`;
  s += head.map((h) => `<td style="${td}background:${pal.head2};color:${pal.headInk};font-weight:bold;text-align:center;">${xmlEsc(h)}</td>`).join('');
  s += '</tr>';
  for (const row of body) {
    s += '<tr>';
    s += row.map((v, i) => `<td style="${td}${bg}${colorCol?.(v, i) ?? ''}">${xmlEsc(String(v))}</td>`).join('');
    s += '</tr>';
  }
  return s + '</table>';
}

/** รายงานเป็นตาราง HTML (สำหรับไฟล์ .xls) — วางไว้หน้าตาราง Time Table */
export function reportHtml(d: ReportData, pal: ExportPalette = EXPORT_PALETTES.current): string {
  const priTint = (v: string | number, i: number, at: number) =>
    i === at && typeof v === 'string' && v in PRI_BY_ID
      ? `background:${pal.priFill(PRI_BY_ID[v as PriorityId].color)};color:${pal.priInk};font-weight:bold;text-align:center;`
      : '';
  const T = (title: string, head: string[], body: (string | number)[][], colorCol?: (v: string | number, i: number) => string) =>
    htmlTable(pal, title, head, body, colorCol);

  let s = `<div style="font-family:'Anuphan','Tahoma',sans-serif;">`;
  s += `<div style="background:${pal.title};color:${pal.titleInk};font-weight:bold;font-size:14pt;padding:6px;">รายงานสรุปจากที่บันทึกไว้</div>`;
  s += `<div style="font-size:9pt;color:${pal.sub};padding:4px 0 10px 0;">ช่วง ${xmlEsc(d.label)} · ${d.from} ถึง ${d.to} — ออกรายงาน ${xmlEsc(thaiDate(d.madeOn))}</div>`;
  s += T('ภาพรวม', ['ตัวชี้วัด', 'ค่า', 'คำอธิบาย'], overviewRows(d).map((r) => [...r]));
  s += T(`แนวโน้ม${d.bucketTitle}`, ['ช่วง', 'ทำเสร็จ', 'ถึงกำหนด', 'อัตราสำเร็จ', 'ชั่วโมง'],
    d.buckets.map((b) => [b.label, b.done, b.scheduled, ratePct(b.done, b.scheduled), h1(b.hours)]));
  s += T('ชั่วโมงตามหมวด', ['หมวด', 'ชั่วโมง', 'สัดส่วน'], d.cats.map((c) => [c.name, h1(c.hours), pct(c.pct)]),
    (v, i) => {
      if (i !== 0) return '';
      const c = CATS.find((x) => x.short === v);
      return c ? `background:${pal.catTint(c.color)};color:${pal.catInk(c.color)};font-weight:bold;` : '';
    });
  s += T('นัดเคสตามระดับความสำคัญ', ['ระดับ', 'ความหมาย', 'จำนวนนัด'], d.pris.map((p) => [p.id, p.label, p.count]),
    (v, i) => priTint(v, i, 0));
  s += T('หมวดที่ใช้มากสุดในช่วงนี้', TOP_CAT_HEAD, topCatRows(d).map((r) => [...r]), (v, i) => {
    if (i !== 0) return '';
    const c = CATS.find((x) => x.name === v);
    return c
      ? `background:${pal.catTint(c.color)};color:${pal.catInk(c.color)};font-weight:bold;white-space:nowrap;`
      : 'font-weight:bold;';
  });
  s += T(catTitle(d), CAT_HEAD, d.catSummary.map(catRow), (v, i) => {
    if (i === CAT_STATUS_COL) {
      return `color:${v === 'ใช้งาน' ? pal.ok : pal.faint};font-weight:bold;text-align:center;white-space:nowrap;`;
    }
    if (i !== 0) return '';
    const c = CATS.find((x) => x.short === v);
    return c ? `background:${pal.catTint(c.color)};color:${pal.catInk(c.color)};font-weight:bold;white-space:nowrap;` : '';
  });
  s += T(actTitle(d), ACT_HEAD, catItemRows(d).map(({ vals }) => vals), (v, i) => {
    if (i !== 0) return '';
    const c = CATS.find((x) => x.short === v);
    return c ? `background:${pal.catTint(c.color)};color:${pal.catInk(c.color)};font-weight:bold;white-space:nowrap;` : '';
  });
  if (d.items.length) {
    s += T(`สรุปตามเคส (${d.cases.length} เคส)`, CASE_HEAD, d.cases.map(caseRow), (v, i) => priTint(v, i, 1));
    s += T(`รายชื่อคน (${d.people.length} คน)`, PEOPLE_HEAD, d.people.map(personRow), (v, i) => priTint(v, i, 1));
    s += T(`รายการนัดเคส (${d.items.length} นัด)`, ITEM_HEAD, d.items.map((it) => itemRow(it, d.nameById)), (v, i) => priTint(v, i, 4));
  }
  return s + '</div>';
}

// ---------- Google Sheets (แถวข้อความ + สีส่งผ่าน Apps Script) ----------

/**
 * แท็บรายงานสำหรับส่งขึ้น Google Sheets — โครงตรงกับ SheetTab ใน lib/sheets
 * (ชีตรับได้แค่ค่า + สีพื้น/สีอักษร/ตัวหนา จึงไม่มี merge/ความกว้างคอลัมน์เหมือน .xlsx)
 */
export interface ReportTab {
  name: string;
  rows: string[][];
  bg: (string | null)[][];
  fg: (string | null)[][];
  bold: ('bold' | 'normal')[][];
}

/** เซลล์หนึ่งช่องระหว่างประกอบแท็บ (bg/fg = null → ปล่อยตามค่าเริ่มต้นของชีต) */
interface SCell {
  v: string | number;
  bg?: string | null;
  fg?: string | null;
  b?: boolean;
}

type Acc = { rows: string[][]; bg: (string | null)[][]; fg: (string | null)[][]; bold: ('bold' | 'normal')[][] };

const newAcc = (): Acc => ({ rows: [], bg: [], fg: [], bold: [] });

function pushRow(a: Acc, cells: SCell[]): void {
  a.rows.push(cells.map((c) => String(c.v)));
  a.bg.push(cells.map((c) => c.bg ?? null));
  a.fg.push(cells.map((c) => c.fg ?? null));
  a.bold.push(cells.map((c) => (c.b ? 'bold' : 'normal')));
}

/** ตารางหนึ่งชุดในแท็บ: แถบหัวข้อ (กว้างเต็มตาราง) + หัวคอลัมน์ + ข้อมูล + บรรทัดว่างคั่น */
function sheetBlock(a: Acc, pal: ExportPalette, title: string, head: string[], body: SCell[][]): void {
  pushRow(a, [
    { v: title, bg: pal.head, fg: pal.headInk, b: true },
    ...head.slice(1).map(() => ({ v: '', bg: pal.head })),
  ]);
  pushRow(a, head.map((h) => ({ v: h, bg: pal.head2, fg: pal.headInk, b: true })));
  for (const r of body) pushRow(a, r);
  pushRow(a, []);
}

/** แปลงค่าดิบเป็นเซลล์ — คอลัมน์ priIdx เป็นป้ายระดับพื้นสี, คอลัมน์แรกตัวหนา */
function sheetCells(vals: (string | number)[], priIdx: number, pal: ExportPalette): SCell[] {
  return vals.map((v, i) => {
    if (i === priIdx) return priSCell(String(v), pal);
    return { v, bg: pal.cellBg, fg: pal.ink, b: i === 0 };
  });
}

function priSCell(id: PriorityId | null | string, pal: ExportPalette): SCell {
  const p = typeof id === 'string' && id in PRI_BY_ID ? PRI_BY_ID[id as PriorityId] : null;
  return p
    ? { v: p.id, bg: pal.priFill(p.color), fg: pal.priInk, b: true }
    : { v: '–', bg: pal.cellBg, fg: pal.faint };
}

/**
 * ชีตรายงานทั้งชุดสำหรับส่งขึ้น Google Sheets — ชุดเนื้อหา/การแบ่งแท็บเดียวกับ reportSheets (.xlsx)
 * 2 แท็บ: "รายงานสรุป" (ภาพรวม · แนวโน้ม · ชั่วโมงตามหมวด · ระดับความสำคัญ · สรุปหมวดหมู่)
 *        "สรุปเคส & รายชื่อ" (สรุปตามเคส · รายชื่อคน · รายการนัดเคส)
 */
export function reportTabs(d: ReportData, pal: ExportPalette = EXPORT_PALETTES.current): ReportTab[] {
  const plain = (v: string | number): SCell => ({ v, bg: pal.cellBg, fg: pal.ink });

  // --- แท็บ 1: ภาพรวม / แนวโน้ม / ชั่วโมงตามหมวด / ระดับความสำคัญ / สรุปหมวดหมู่ ---
  const a = newAcc();
  pushRow(a, [
    { v: 'รายงานสรุปจากที่บันทึกไว้', bg: pal.title, fg: pal.titleInk, b: true },
    ...Array.from({ length: 3 }, () => ({ v: '', bg: pal.title })),
  ]);
  pushRow(a, [{ v: `ช่วง ${d.label} · ${d.from} ถึง ${d.to}`, fg: pal.sub }]);
  pushRow(a, [{ v: `ออกรายงาน ${thaiDate(d.madeOn)} — นับเฉพาะรายการที่ถึงกำหนดแล้ว`, fg: pal.sub }]);
  pushRow(a, []);

  sheetBlock(a, pal, 'ภาพรวม', ['ตัวชี้วัด', 'ค่า', 'คำอธิบาย'],
    overviewRows(d).map(([k, v, note]) => [
      { v: k, bg: pal.cellBg, fg: pal.ink },
      { v, bg: pal.cellBg, fg: pal.ink, b: true },
      { v: note, bg: pal.cellBg, fg: pal.faint },
    ]));

  sheetBlock(a, pal, `แนวโน้ม${d.bucketTitle}`, ['ช่วง', 'ทำเสร็จ', 'ถึงกำหนด', 'อัตราสำเร็จ', 'ชั่วโมง'],
    d.buckets.map((b) => [
      plain(b.label),
      plain(b.done),
      plain(b.scheduled),
      { v: ratePct(b.done, b.scheduled), bg: pal.cellBg, fg: b.scheduled && b.rate >= 0.7 ? pal.ok : pal.ink, b: true },
      plain(h1(b.hours)),
    ]));

  sheetBlock(a, pal, 'ชั่วโมงตามหมวด', ['หมวด', 'ชั่วโมง', 'สัดส่วน'],
    d.cats.length
      ? d.cats.map((c) => [
          { v: c.name, bg: pal.catTint(c.color), fg: pal.catInk(c.color), b: true },
          { v: h1(c.hours), bg: pal.cellBg, fg: pal.ink, b: true },
          plain(pct(c.pct)),
        ])
      : [[{ v: 'ยังไม่มีรายการที่ทำเสร็จในช่วงนี้', bg: pal.cellBg, fg: pal.faint }]]);

  sheetBlock(a, pal, 'นัดเคสตามระดับความสำคัญ', ['ระดับ', 'ความหมาย', 'จำนวนนัด', 'สัดส่วน'],
    d.pris.length
      ? d.pris.map((p) => [
          priSCell(p.id, pal),
          plain(p.label),
          plain(p.count),
          plain(pct(d.items.length ? p.count / d.items.length : 0)),
        ])
      : [[priSCell(null, pal), plain('ไม่มีนัดเคสในช่วงนี้')]]);

  // สรุปหมวดหมู่ — อยู่ในแท็บเดียวกับรายงานสรุป: แถบเด่นหมวดที่ใช้มากสุด แล้วตามด้วยตารางทุกหมวด
  sheetBlock(a, pal, 'หมวดที่ใช้มากสุดในช่วงนี้', TOP_CAT_HEAD,
    topCatRows(d).map(([k, v, note], i) => [
      i === 0 && d.topCat
        ? { v: k, bg: pal.catTint(d.topCat.color), fg: pal.catInk(d.topCat.color), b: true }
        : { v: k, bg: pal.cellBg, fg: pal.ink, b: true },
      { v, bg: pal.cellBg, fg: pal.ink, b: true },
      { v: note, bg: pal.cellBg, fg: pal.sub },
    ]));

  sheetBlock(a, pal, catTitle(d), CAT_HEAD,
    d.catSummary.map((c) =>
      catRow(c).map((v, i) => {
        if (i === 0) return { v, bg: pal.catTint(c.color), fg: pal.catInk(c.color), b: true };
        if (i === CAT_STATUS_COL) return { v, bg: pal.cellBg, fg: c.count ? pal.ok : pal.faint, b: true };
        return { v, bg: pal.cellBg, fg: c.count ? pal.ink : pal.faint };
      }),
    ));

  // รายการกิจกรรมทุกชื่อในทั้ง 6 หมวด (ไม่ตัดทอน)
  sheetBlock(a, pal, actTitle(d), ACT_HEAD,
    catItemRows(d).map(({ cat, vals }) =>
      vals.map((v, i) => {
        if (i === 0) return { v, bg: pal.catTint(cat.color), fg: pal.catInk(cat.color), b: true };
        return { v, bg: pal.cellBg, fg: cat.items.length ? pal.ink : pal.faint, b: i === 1 };
      }),
    ));

  if (d.unnamed) pushRow(a, [{ v: `อีก ${d.unnamed} นัดในช่วงนี้ไม่ได้ระบุผู้ติดต่อ`, fg: pal.sub }]);

  const out: ReportTab[] = [{ name: 'รายงานสรุป', ...a }];
  if (!d.items.length) return out;

  // --- แท็บ 2: สรุปตามเคส + รายชื่อคน + รายการนัดเคสทุกครั้ง (สถานะย้อมสีเหมือนไฟล์ .xlsx) ---
  const b = newAcc();
  sheetBlock(b, pal, `สรุปตามเคส (${d.cases.length} เคส)`, CASE_HEAD, d.cases.map((c) => sheetCells(caseRow(c), 1, pal)));
  sheetBlock(b, pal, `รายชื่อคน (${d.people.length} คน)`, PEOPLE_HEAD,
    d.people.length
      ? d.people.map((p) => sheetCells(personRow(p), 1, pal))
      : [[{ v: 'ไม่มีนัดเคสที่ระบุผู้ติดต่อในช่วงนี้', bg: pal.cellBg, fg: pal.faint }]]);
  sheetBlock(b, pal, `รายการนัดเคส (${d.items.length} นัด)`, ITEM_HEAD,
    d.items.map((it) => {
      const cells = sheetCells(itemRow(it, d.nameById), 4, pal);
      const st = it.ostatus;
      cells[7] = {
        v: STATUS_TH[st],
        bg: pal.cellBg,
        fg: st === 'done' ? pal.ok : st === 'skipped' || st === 'cancelled' ? pal.bad : pal.ink,
        b: st === 'done' || st === 'skipped',
      };
      return cells;
    }));
  out.push({ name: 'สรุปเคส & รายชื่อ', ...b });
  return out;
}
