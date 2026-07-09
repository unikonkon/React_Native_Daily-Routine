// Core engine — pure functions ทั้งหมด ไม่มี I/O (APP_STRUCTURE.md §0, §5.1, §3.4)
// ข้อมูลเข้า = activities + occurrence map จาก store ที่โหลดไว้แล้ว → ไม่ query ฐานข้อมูลซ้ำ

import { DAY_END, FREE_START, MIN_FREE_GAP } from '@/constants/theme';
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

/** ช่วงว่างของวัน: หน้าต่าง 06:00–26:00, ช่องว่าง ≥ minDur (ค่าปกติ 45 นาที) */
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

export const freeMinutes = (slots: FreeSlot[]) => slots.reduce((s, x) => s + (x.end - x.start), 0);

export const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

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
 * หา slot สำหรับเลื่อนนัด: สแกนช่วงวัน แล้วให้คะแนน
 *   +3 เวลาเริ่มห่างจากเวลานัดเดิม ≤ 60 นาที
 *   +max(0, 4 − จำนวนวันห่าง) — วันใกล้ได้ก่อน
 *   +2 เคส P1 และ slot เริ่มก่อน 10:00
 * คืน 6 อันดับแรก
 */
export function rescheduleCandidates(
  acts: Activity[],
  occ: OccMap,
  item: DayItem,
  range: RescRange,
): RescCandidate[] {
  const today = todayISO();
  let from = today;
  let to: string;
  if (range === '3d') to = addDays(today, 3);
  else if (range === 'w') to = addDays(mondayOf(today), 6);
  else {
    from = addDays(mondayOf(today), 7);
    to = addDays(from, 6);
  }

  const dur = item.endMin - item.startMin;
  const out: RescCandidate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const daysAway = Math.round((+new Date(d) - +new Date(today)) / 86400000);
    for (const s of freeSlots(dayItems(acts, occ, d), dur)) {
      // ข้าม slot เดิมของนัดที่กำลังเลื่อน (วันเดิม เวลาเดิม)
      if (d === item.date && s.start === item.startMin) continue;
      let score = 0;
      if (Math.abs(s.start - item.startMin) <= 60) score += 3;
      score += Math.max(0, 4 - daysAway);
      if (item.priority === 'P1' && s.start < 600) score += 2;
      out.push({ date: d, start: s.start, end: s.start + dur, score });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, 6);
}

// ---------- สถิติ (§6.1) ----------

export interface Stats {
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
