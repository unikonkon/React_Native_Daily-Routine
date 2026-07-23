// Store หลัก: ถือ series + occurrence map ทั้งหมดใน memory (โหลดครั้งเดียว — APP_STRUCTURE.md §0)
// mutation ทุกตัว: อัปเดต state ทันที (optimistic) → เขียน SQLite → ตั้งคิวแจ้งเตือนใหม่

import { useMemo } from 'react';
import { create } from 'zustand';

import { addDays } from '@/lib/dates';
import * as db from '@/lib/db';
import { dayItems } from '@/lib/engine';
import { requestResync } from '@/lib/notifications';
import type { Activity, DayItem, OccMap, OccStatus } from '@/lib/types';
import { useSettings } from '@/stores/settings';

interface RescTarget {
  date: string;
  start: number;
  end: number;
}

interface ActivitiesState {
  loaded: boolean;
  acts: Activity[];
  occ: OccMap;
  rescCounts: Record<number, number>;
  /** เพิ่มทีละ 1 ทุก mutation — ตัวนับบอกว่าข้อมูลเปลี่ยน (การ subscribe ใน UI ให้ใช้ acts/occ ตรง ๆ) */
  version: number;
  boot: () => Promise<void>;
  add: (a: Omit<Activity, 'id'>) => Promise<Activity>;
  update: (a: Activity) => void;
  /** status null = กลับเป็น planned */
  setStatus: (item: DayItem, status: OccStatus | null) => void;
  deleteOne: (item: DayItem) => void;
  deleteSeries: (item: DayItem) => void;
  reschedule: (item: DayItem, to: RescTarget, reason: string) => void;
}

function resync(s: Pick<ActivitiesState, 'acts' | 'occ'>) {
  const { notifMaster, morning } = useSettings.getState();
  requestResync(s.acts, s.occ, notifMaster, morning);
}

export const useActivities = create<ActivitiesState>((set, get) => {
  const bump = (patch: Partial<ActivitiesState>) => {
    set((s) => ({ ...patch, version: s.version + 1 }));
    resync(get());
  };

  return {
    loaded: false,
    acts: [],
    occ: {},
    rescCounts: {},
    version: 0,

    boot: async () => {
      const [acts, occ, rescCounts] = await Promise.all([
        db.loadActivities(),
        db.loadOccurrences(),
        db.loadRescCounts(),
      ]);
      set((s) => ({ acts, occ, rescCounts, loaded: true, version: s.version + 1 }));
      resync(get());
    },

    add: async (a) => {
      const id = await db.insertActivity(a);
      const full: Activity = { ...a, id };
      bump({ acts: [...get().acts, full] });
      return full;
    },

    update: (a) => {
      bump({ acts: get().acts.map((x) => (x.id === a.id ? a : x)) });
      db.updateActivity(a);
    },

    setStatus: (item, status) => {
      const occ = { ...get().occ };
      const day = { ...(occ[item.date] ?? {}) };
      if (status === null || status === 'planned') delete day[item.id];
      else day[item.id] = status;
      occ[item.date] = day;
      bump({ occ });
      db.setOccurrence(item.id, item.date, status);
    },

    deleteOne: (item) => {
      if (item.repeat === 'none') {
        // ครั้งเดียว = ลบทั้งรายการ
        bump({ acts: get().acts.filter((a) => a.id !== item.id) });
        db.cancelActivity(item.id);
      } else {
        get().setStatus(item, 'cancelled');
      }
    },

    deleteSeries: (item) => {
      // เก็บประวัติ: ตัด end_date ถึงเมื่อวาน (อดีตยังแสดง/นับสถิติ) — ถ้าไม่เหลือช่วงเลยจึงยกเลิกทั้งรายการ
      const cut = addDays(item.date, -1);
      if (item.repeat === 'none' || cut < item.startDate) {
        bump({ acts: get().acts.filter((a) => a.id !== item.id) });
        db.cancelActivity(item.id);
      } else {
        bump({ acts: get().acts.map((a) => (a.id === item.id ? { ...a, endDate: cut } : a)) });
        db.setEndDate(item.id, cut);
      }
    },

    reschedule: async (item, to, reason) => {
      const fields: Omit<Activity, 'id'> = {
        title: item.title.endsWith(' (เลื่อนมา)') ? item.title : `${item.title} (เลื่อนมา)`,
        cat: item.cat,
        sub: item.sub,
        loc: item.loc,
        channel: item.channel,
        priority: item.priority,
        startMin: to.start,
        endMin: to.end,
        repeat: 'none',
        daysMask: 0,
        startDate: to.date,
        endDate: null,
        notify: item.notify,
        notifyBefore: item.notifyBefore,
        detachedFrom: item.id,
        status: 'active',
        contactIds: item.contactIds,
      };
      const newId = await db.insertActivity(fields);
      db.insertRescheduleLog(newId, item.date, item.startMin, to.date, to.start, reason || null);

      const occ = { ...get().occ, [item.date]: { ...(get().occ[item.date] ?? {}), [item.id]: 'rescheduled' as const } };
      const prev = get().rescCounts[item.id] ?? 0;
      bump({
        acts: [...get().acts, { ...fields, id: newId }],
        occ,
        rescCounts: { ...get().rescCounts, [newId]: prev + 1 },
      });
      db.setOccurrence(item.id, item.date, 'rescheduled');
    },
  };
});

// cache รายวันตัวกลางเดียว ใช้ร่วมกันทุกจุด (วัน/สัปดาห์/เดือน/ฟอร์ม/CSV/notifications)
// ล้างอัตโนมัติเมื่อ acts หรือ occ เปลี่ยน identity (ทุก mutation สร้าง object ใหม่เสมอ)
let cachedActs: Activity[] | null = null;
let cachedOcc: OccMap | null = null;
const dayCache = new Map<string, DayItem[]>();

function dayItemsCached(acts: Activity[], occ: OccMap, date: string): DayItem[] {
  if (acts !== cachedActs || occ !== cachedOcc) {
    dayCache.clear();
    cachedActs = acts;
    cachedOcc = occ;
  }
  let v = dayCache.get(date);
  if (!v) {
    if (dayCache.size > 500) dayCache.clear();
    v = dayItems(acts, occ, date);
    dayCache.set(date, v);
  }
  return v;
}

/**
 * กิจกรรมของวันหนึ่ง — สำหรับโค้ดนอก React เท่านั้น (export CSV, notifications) — ห้ามเรียกตอน render:
 * React Compiler จะ cache ผลไว้โดยไม่รู้ว่า store เปลี่ยน ทำให้ UI ค้างค่าเก่า ให้ใช้ useDay/useDayReader แทน
 */
export function getDay(date: string): DayItem[] {
  const { acts, occ } = useActivities.getState();
  return dayItemsCached(acts, occ, date);
}

/** hook แบบ reactive สำหรับ component — อ้าง acts/occ ตรง ๆ เพื่อให้ React Compiler เห็น dependency จริง */
export function useDay(date: string): DayItem[] {
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);
  return useMemo(() => dayItemsCached(acts, occ, date), [acts, occ, date]);
}

/** เหมือน useDay แต่คืนฟังก์ชันอ่านได้หลายวัน (week/month grid, พรีวิวฟอร์มเพิ่ม) — identity เปลี่ยนเมื่อข้อมูลเปลี่ยน */
export function useDayReader(): (date: string) => DayItem[] {
  const acts = useActivities((s) => s.acts);
  const occ = useActivities((s) => s.occ);
  return useMemo(() => (date: string) => dayItemsCached(acts, occ, date), [acts, occ]);
}
