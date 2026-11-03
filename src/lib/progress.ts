// สถานะบนราง B1 + ความคืบหน้ารายวัน — pure functions (ไม่มี I/O) ใช้ร่วม: มุมมองวัน/เดือน/ปี · แถบ 7 วัน · หน้าทบทวน
import { DAY_START } from '@/constants/theme';
import { addDays, nowMin, todayISO } from '@/lib/dates';
import type { DayItem } from '@/lib/types';

/**
 * สถานะที่วงกลมบนรางแสดง
 * overdue = ยังไม่บันทึก (planned) แต่เวลาจบผ่านไปแล้ว · current = "ตอนนี้" อยู่ในช่วงเวลาของรายการ (กำลังทำ)
 * next = รายการถัดไปของวันนี้ที่ยังไม่เริ่ม
 */
export type RailState = 'done' | 'skipped' | 'overdue' | 'current' | 'planned' | 'next' | 'rescheduled';

/** "ตอนนี้" ในระบบวัน 06:00–30:00 — 00:00–05:59 นับเป็นท้ายวันของเมื่อวาน (min + 1440) */
export interface NowRef {
  date: string;
  min: number;
}

export function nowRef(): NowRef {
  const m = nowMin();
  return m >= DAY_START ? { date: todayISO(), min: m } : { date: addDays(todayISO(), -1), min: m + 1440 };
}

/** occurrence นี้จบไปแล้วหรือยัง */
export function isPast(it: Pick<DayItem, 'date' | 'endMin'>, now: NowRef): boolean {
  return it.date < now.date || (it.date === now.date && it.endMin <= now.min);
}

/** "ตอนนี้" อยู่ระหว่างเวลาเริ่ม–จบของ occurrence นี้ */
export function isOngoing(it: Pick<DayItem, 'date' | 'startMin' | 'endMin'>, now: NowRef): boolean {
  return it.date === now.date && it.startMin <= now.min && now.min < it.endMin;
}

/** id ของรายการถัดไป (ยังไม่เริ่ม + ยังไม่บันทึก) ในวัน "ตอนนี้" — null ถ้าไม่ใช่วันนี้หรือหมดแล้ว */
export function nextItemId(items: DayItem[], now: NowRef): number | null {
  const hit = items.find((it) => it.date === now.date && it.ostatus === 'planned' && it.startMin > now.min);
  return hit ? hit.id : null;
}

export function railState(it: DayItem, now: NowRef, nextId: number | null): RailState {
  if (it.ostatus === 'done' || it.ostatus === 'skipped' || it.ostatus === 'rescheduled') return it.ostatus;
  if (isPast(it, now)) return 'overdue';
  if (isOngoing(it, now)) return 'current';
  return it.id === nextId ? 'next' : 'planned';
}

export interface DayProgress {
  /** รายการที่นับ (ไม่รวมที่เลื่อนไปแล้ว) */
  total: number;
  done: number;
  skipped: number;
  overdue: number;
  /** ยังไม่ถึงเวลา */
  waiting: number;
  /** 0–1 = done / total (ไม่มีรายการ = 0) */
  rate: number;
}

export function dayProgress(items: DayItem[], now: NowRef): DayProgress {
  let total = 0;
  let done = 0;
  let skipped = 0;
  let overdue = 0;
  for (const it of items) {
    if (it.ostatus === 'rescheduled') continue;
    total++;
    if (it.ostatus === 'done') done++;
    else if (it.ostatus === 'skipped') skipped++;
    else if (isPast(it, now)) overdue++;
  }
  return { total, done, skipped, overdue, waiting: total - done - skipped - overdue, rate: total ? done / total : 0 };
}

/** รายการค้างบันทึก (ผ่านเวลาแล้วแต่ยังเป็น planned) ในช่วง from–to เรียงใหม่ → เก่า (วันล่าสุดก่อน) */
export function overdueBetween(getDay: (date: string) => DayItem[], from: string, to: string, now: NowRef): DayItem[] {
  const out: DayItem[] = [];
  const last = to < now.date ? to : now.date; // อนาคตไม่มีทางค้าง
  for (let d = last; d >= from; d = addDays(d, -1)) {
    for (const it of getDay(d)) if (it.ostatus === 'planned' && isPast(it, now)) out.push(it);
  }
  return out;
}
