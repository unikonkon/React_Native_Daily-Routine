// Core engine — pure functions ทั้งหมด ไม่มี I/O (APP_STRUCTURE.md §0, §5.1, §3.4)
// ข้อมูลเข้า = activities + occurrence map จาก store ที่โหลดไว้แล้ว → ไม่ query ฐานข้อมูลซ้ำ

import { DAY_END, FREE_START, MIN_FREE_GAP, SNAP } from '@/constants/theme';
import { addDays, mondayOf, todayISO, wdMon } from '@/lib/dates';
import type { Activity, DayItem, FreeSlot, Horizon, OccMap, RepeatRule } from '@/lib/types';
import { HORIZON_DAYS } from '@/lib/types';

/** กิจกรรมนี้เกิดในวัน date หรือไม่ (ตามกฎ series) */
export function occursOn(a: Activity, date: string): boolean {
  if (a.status !== 'active') return false;
  if (date < a.startDate || (a.endDate != null && date > a.endDate)) return false;
  if (a.repeat === 'none') return a.startDate === date;
  return ((a.daysMask >> wdMon(date)) & 1) === 1;
}

/** กิจกรรมทั้งหมดของวันหนึ่ง + สถานะรายวัน (ตัด occurrence ที่ cancelled) เรียงตามเวลาเริ่ม */
export function dayItems(acts: Activity[], occ: OccMap, date: string): DayItem[] {
  const out: DayItem[] = [];
  const dayOcc = occ[date];
  for (const a of acts) {
    if (!occursOn(a, date)) continue;
    const ostatus = dayOcc?.[a.id] ?? 'planned';
    if (ostatus === 'cancelled') continue;
    out.push({ ...a, date, ostatus });
  }
  return out.sort((x, y) => x.startMin - y.startMin);
}

/** จัดเลนกิจกรรมเวลาทับกัน: คืน map id → { lane, n } (n = จำนวนเลนในกลุ่ม) */
export function assignLanes(items: DayItem[]): Record<number, { lane: number; n: number }> {
  const out: Record<number, { lane: number; n: number }> = {};
  let cluster: DayItem[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds: number[] = [];
    const ids: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((e) => e <= it.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.endMin);
      } else {
        laneEnds[lane] = it.endMin;
      }
      out[it.id] = { lane, n: 0 };
      ids.push(it.id);
    }
    for (const id of ids) out[id].n = laneEnds.length;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length) flush();
  return out;
}

/** ช่วงว่างของวัน: หน้าต่าง 06:00–30:00 (ครบ 24 ชม.), ช่องว่าง ≥ minDur (ค่าปกติ 45 นาที) */
export function freeSlots(items: DayItem[], minDur: number = MIN_FREE_GAP): FreeSlot[] {
  const busy = items
    .filter((i) => i.ostatus === 'planned' || i.ostatus === 'done')
    .sort((a, b) => a.startMin - b.startMin);
  const slots: FreeSlot[] = [];
  let cursor = FREE_START;
  for (const b of busy) {
    if (b.startMin - cursor >= minDur) slots.push({ start: cursor, end: b.startMin });
    cursor = Math.max(cursor, b.endMin);
  }
  if (DAY_END - cursor >= minDur) slots.push({ start: cursor, end: DAY_END });
  return slots;
}

/** ช่วงว่างเฉพาะกลางวัน — ตัดที่ 24:00 (ไม่นับ 00:00–06:00 = เวลานอน) สำหรับโหมด "วันที่ว่าง" */
const FREE_WINDOW_END = 1440; // 24:00 (นาทีในหน้าต่าง 06:00–30:00)
export function daytimeFreeSlots(items: DayItem[], minDur: number = MIN_FREE_GAP): FreeSlot[] {
  return freeSlots(items, minDur)
    .map((s) => ({ start: s.start, end: Math.min(s.end, FREE_WINDOW_END) }))
    .filter((s) => s.end - s.start >= minDur);
}


export const freeMinutes = (slots: FreeSlot[]) => slots.reduce((s, x) => s + (x.end - x.start), 0);

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

/** รายการเดิมที่ชนช่วงเวลา s–e ของวันนั้น */
export function conflictsOn(items: DayItem[], s: number, e: number): DayItem[] {
  return items.filter(
    (i) => (i.ostatus === 'planned' || i.ostatus === 'done') && overlaps(i.startMin, i.endMin, s, e),
  );
}

/** วันที่ทั้งหมดตามกฎทำซ้ำ+horizon เริ่มจาก anchor (ใช้ในฟอร์มเพิ่มกิจกรรม) */
export function computeDates(rule: RepeatRule, horizon: Horizon, anchor: string): string[] {
  // 'custom' ไม่มีสูตรคำนวณ — ผู้ใช้เลือกวันเองบนปฏิทิน คืน anchor ไว้กันลิสต์ว่าง
  if (rule === 'none' || rule === 'custom') return [anchor];
  const days = HORIZON_DAYS[horizon];
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(anchor, i);
    const wd = wdMon(d);
    if (rule === 'daily' || (rule === 'weekday' && wd < 5) || (rule === 'weekend' && wd >= 5)) out.push(d);
  }
  return out;
}

export const maskFromDates = (dates: string[]) => dates.reduce((m, d) => m | (1 << wdMon(d)), 0);

// ---------- Smart Reschedule (§3.4) ----------

export type RescRange = '3d' | 'w' | 'nw';

export interface RescCandidate extends FreeSlot {
  date: string;
  score: number;
}

/**
 * ช่วงว่างทั้งหมดสำหรับเลื่อนนัดระหว่าง from–to เรียงตามวัน+เวลา พร้อมคะแนน (ใช้หา "แนะนำ")
 *   +3 เวลาเริ่มห่างจากเวลานัดเดิม ≤ 60 นาที
 *   +max(0, 4 − จำนวนวันห่าง) — วันใกล้ได้ก่อน
 *   +2 เคส P1 และ slot เริ่มก่อน 10:00
 * ส่ง now (นาทีปัจจุบัน 0–1439) มาเพื่อตัดเวลาที่ผ่านแล้วของ "วันนี้" — เริ่มเสนอจากเวลาปัจจุบันปัดขึ้นทีละ 15 นาที
 */
export function rescheduleSlots(
  acts: Activity[],
  occ: OccMap,
  item: DayItem,
  from: string,
  to: string,
  now?: number,
): RescCandidate[] {
  const today = todayISO();
  const dur = item.endMin - item.startMin;
  const out: RescCandidate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const daysAway = Math.round((+new Date(d) - +new Date(today)) / 86400000);
    for (const s of freeSlots(dayItems(acts, occ, d), dur)) {
      let winStart = s.start;
      // วันนี้: ขยับจุดเริ่มให้พ้นเวลาปัจจุบัน (ก่อน 06:00 ไม่ต้องตัด — หน้าต่างวันยังไม่เริ่ม)
      if (now != null && d === today && now >= FREE_START && winStart < now) {
        winStart = Math.ceil(now / SNAP) * SNAP;
      }
      // ไล่สร้างช่วงย่อยความยาวเท่านัดต่อ ๆ กันจนเต็มหน้าต่างว่าง — แสดงเวลาว่างที่จองได้ทั้งหมด ไม่ใช่แค่ช่วงแรก
      for (let start = winStart; s.end - start >= dur; start += dur) {
        // ข้าม slot เดิมของนัดที่กำลังเลื่อน (วันเดิม เวลาเดิม)
        if (d === item.date && start === item.startMin) continue;
        let score = 0;
        if (Math.abs(start - item.startMin) <= 60) score += 3;
        score += Math.max(0, 4 - daysAway);
        if (item.priority === 'P1' && start < 600) score += 2;
        out.push({ date: d, start, end: start + dur, score });
      }
    }
  }
  return out; // เรียงตามวัน+เวลาอยู่แล้วจากลำดับการสแกน
}

/** ช่วงวันของ filter เลื่อนนัด (3 วัน / สัปดาห์นี้ / สัปดาห์หน้า) */
export function rescRangeDates(range: RescRange): { from: string; to: string } {
  const today = todayISO();
  if (range === '3d') return { from: today, to: addDays(today, 3) };
  if (range === 'w') return { from: today, to: addDays(mondayOf(today), 6) };
  const from = addDays(mondayOf(today), 7);
  return { from, to: addDays(from, 6) };
}

// ---------- สถิติ (§6.1) ----------

interface Stats {
  rate: number; // 0–1 done/scheduled
  doneWeek: number;
  streak: number;
  hoursByCat: Record<string, number>;
}

export function computeStats(acts: Activity[], occ: OccMap, now: number): Stats {
  const today = todayISO();
  const monday = mondayOf(today);

  // % สำเร็จ + เสร็จสัปดาห์นี้ (จันทร์–วันนี้ ตัดรายการที่ยังไม่ถึงเวลา)
  let scheduled = 0;
  let done = 0;
  const hoursByCat: Record<string, number> = {};
  for (let d = monday; d <= today; d = addDays(d, 1)) {
    for (const it of dayItems(acts, occ, d)) {
      if (it.ostatus === 'rescheduled') continue;
      if (d === today && it.startMin > now) continue;
      scheduled++;
      if (it.ostatus === 'done') {
        done++;
        hoursByCat[it.cat] = (hoursByCat[it.cat] ?? 0) + (it.endMin - it.startMin) / 60;
      }
    }
  }

  // streak: วันติดต่อกันย้อนหลังที่ทำครบทุกรายการที่ถึงกำหนด (วันไม่มีรายการ = ผ่านเฉย ๆ)
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDays(today, -i);
    const due = dayItems(acts, occ, d).filter(
      (it) => it.ostatus !== 'rescheduled' && !(d === today && it.startMin > now),
    );
    if (!due.length) {
      if (i > 30) break; // กันลูปยาวช่วงไม่มีข้อมูล
      continue;
    }
    if (due.every((it) => it.ostatus === 'done')) streak++;
    else break;
  }

  return { rate: scheduled ? done / scheduled : 0, doneWeek: done, streak, hoursByCat };
}
