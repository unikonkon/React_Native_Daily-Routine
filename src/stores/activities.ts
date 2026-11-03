// Store หลัก: ถือ series + occurrence map ทั้งหมดใน memory (โหลดครั้งเดียว — APP_STRUCTURE.md §0)
// mutation ทุกตัว: อัปเดต state ทันที (optimistic) → เขียน SQLite → ตั้งคิวแจ้งเตือนใหม่

import { useMemo } from 'react';
import { create } from 'zustand';

import { addDays } from '@/lib/dates';
import * as db from '@/lib/db';
import { dayItems, seriesDates } from '@/lib/engine';
import { requestResync } from '@/lib/notifications';
import type { Activity, DayItem, EditScope, NoteMap, OccMap, OccStatus } from '@/lib/types';
import { useSettings } from '@/stores/settings';
import { useUI } from '@/stores/ui';

interface RescTarget {
  date: string;
  start: number;
  end: number;
}

interface ActivitiesState {
  loaded: boolean;
  acts: Activity[];
  occ: OccMap;
  /** โน้ตรายครั้ง notes[date][id] */
  notes: NoteMap;
  rescCounts: Record<number, number>;
  /** เพิ่มทีละ 1 ทุก mutation — ตัวนับบอกว่าข้อมูลเปลี่ยน (การ subscribe ใน UI ให้ใช้ acts/occ ตรง ๆ) */
  version: number;
  boot: () => Promise<void>;
  add: (a: Omit<Activity, 'id'>) => Promise<Activity>;
  update: (a: Activity) => void;
  /**
   * บันทึกฟอร์มแก้ไข — prev = กิจกรรมเดิม, fields = ค่าใหม่จากฟอร์ม
   * ชุดทำซ้ำเลือกขอบเขตได้: 'one' แยกวัน date ออกเป็นครั้งเดียว · 'future' แบ่งชุดที่ date · 'all' แก้ทั้งชุด
   */
  editActivity: (prev: Activity, fields: Omit<Activity, 'id'>, scope: EditScope, date: string | null) => Promise<void>;
  /** status null = กลับเป็น planned */
  setStatus: (item: DayItem, status: OccStatus | null) => void;
  /** โน้ตของครั้งนี้ — '' / null = ลบ */
  setNote: (item: Pick<DayItem, 'id' | 'date'>, note: string | null) => void;
  deleteOne: (item: DayItem) => void;
  deleteSeries: (item: DayItem) => void;
  reschedule: (item: DayItem, to: RescTarget, reason: string) => void;
}

function resync(s: Pick<ActivitiesState, 'acts' | 'occ'>) {
  const { notifMaster, morning } = useSettings.getState();
  requestResync(s.acts, s.occ, notifMaster, morning);
}

/**
 * เขียนลง SQLite ไม่สำเร็จ — state ใน memory (optimistic) ไม่ตรงกับเครื่องแล้ว
 * บอกผู้ใช้ + โหลดจากฐานข้อมูลใหม่ให้หน้าจอกลับมาตรงกับที่บันทึกไว้จริง
 */
function onWriteError(e: unknown) {
  console.warn('[activities] write failed', e);
  useUI.getState().showToast('บันทึกลงเครื่องไม่สำเร็จ — โหลดข้อมูลล่าสุดใหม่แล้ว');
  useActivities.getState().boot().catch(() => {});
}

/** งานเขียนแบบ fire-and-forget (UI ไม่รอ) — พลาดเมื่อไรให้ onWriteError จัดการ ไม่ปล่อยเป็น unhandled rejection */
const persist = (p: Promise<unknown>) => {
  p.catch(onWriteError);
};

export const useActivities = create<ActivitiesState>((set, get) => {
  const bump = (patch: Partial<ActivitiesState>) => {
    set((s) => ({ ...patch, version: s.version + 1 }));
    resync(get());
  };

  return {
    loaded: false,
    acts: [],
    occ: {},
    notes: {},
    rescCounts: {},
    version: 0,

    boot: async () => {
      const [acts, occ, notes, rescCounts] = await Promise.all([
        db.loadActivities(),
        db.loadOccurrences(),
        db.loadNotes(),
        db.loadRescCounts(),
      ]);
      set((s) => ({ acts, occ, notes, rescCounts, loaded: true, version: s.version + 1 }));
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
      persist(db.updateActivity(a));
    },

    editActivity: async (prev, fields, scope, date) => {
      const whole = prev.repeat === 'none' || scope === 'all' || !date || (scope === 'future' && date <= prev.startDate);
      if (whole) {
        // ทั้งชุด (หรือกิจกรรมครั้งเดียว / แก้จากวันแรกของชุด) — แก้แถวเดิมตรง ๆ
        get().update({ ...fields, id: prev.id });
        return;
      }

      if (scope === 'one') {
        // เฉพาะวัน date: ยกเลิกวันนั้นในชุด + สร้างครั้งเดียวด้วยค่าใหม่ (ยกสถานะทำแล้ว/ข้ามเดิมตามไปด้วย)
        const one: Omit<Activity, 'id'> = {
          ...fields,
          repeat: 'none',
          daysMask: 0,
          dates: null,
          startDate: date,
          endDate: null,
          detachedFrom: prev.id,
        };
        const old = get().occ[date]?.[prev.id];
        const carry = old === 'done' || old === 'skipped' ? old : null;
        const newId = await db.detachOccurrence(prev.id, date, one, carry);
        const day: Record<number, OccStatus> = { ...(get().occ[date] ?? {}), [prev.id]: 'cancelled' };
        if (carry) day[newId] = carry;
        // โน้ตของวันนั้นย้ายตามไปกิจกรรมครั้งเดียว (ตรงกับ db.detachOccurrence)
        const notes = { ...get().notes };
        const note = notes[date]?.[prev.id];
        if (note !== undefined) {
          const nd = { ...notes[date], [newId]: note };
          delete nd[prev.id];
          notes[date] = nd;
        }
        bump({ acts: [...get().acts, { ...one, id: newId }], occ: { ...get().occ, [date]: day }, notes });
        return;
      }

      // ตั้งแต่ date เป็นต้นไป: ชุดเดิมจบเมื่อวานของ date (ประวัติก่อนหน้าไม่เปลี่ยน) · ชุดใหม่รับค่าจากฟอร์ม
      const cut = addDays(date, -1);
      const headDates = prev.repeat === 'custom' ? seriesDates(prev).filter((x) => x < date) : null;
      const head = { endDate: cut, dates: headDates };
      let tail: Omit<Activity, 'id'> | null = null;
      if (fields.repeat === 'custom' && fields.dates) {
        const rest = fields.dates.filter((x) => x >= date);
        if (rest.length) tail = { ...fields, dates: rest, startDate: rest[0], endDate: rest[rest.length - 1] };
      } else if (fields.repeat === 'none') {
        // เปลี่ยนชุดเป็น "ครั้งเดียว" — วันแรกของฟอร์มยังเป็นวันแรกของชุดเดิม (อดีต) จึงลงที่วัน date แทน
        tail = { ...fields, startDate: fields.startDate >= date ? fields.startDate : date };
      } else if (fields.endDate === null || fields.endDate >= date) {
        tail = { ...fields, startDate: fields.startDate > date ? fields.startDate : date };
      }

      const newId = await db.splitSeries(prev.id, date, head, tail);
      // ย้ายสถานะรายวันตั้งแต่ date ไปชุดใหม่ใน memory ให้ตรงกับฐานข้อมูล (ไม่มีชุดใหม่ = ทิ้ง)
      const occ: OccMap = { ...get().occ };
      for (const d of Object.keys(occ)) {
        if (d < date || occ[d][prev.id] === undefined) continue;
        const day = { ...occ[d] };
        if (newId !== null) day[newId] = day[prev.id];
        delete day[prev.id];
        occ[d] = day;
      }
      const notes: NoteMap = { ...get().notes };
      for (const d of Object.keys(notes)) {
        if (d < date || notes[d][prev.id] === undefined) continue;
        const day = { ...notes[d] };
        if (newId !== null) day[newId] = day[prev.id];
        delete day[prev.id];
        notes[d] = day;
      }
      const acts = get().acts.map((a) => (a.id === prev.id ? { ...a, ...head } : a));
      if (tail && newId !== null) acts.push({ ...tail, id: newId });
      bump({ acts, occ, notes });
    },

    setStatus: (item, status) => {
      const occ = { ...get().occ };
      const day = { ...(occ[item.date] ?? {}) };
      if (status === null || status === 'planned') delete day[item.id];
      else day[item.id] = status;
      occ[item.date] = day;
      bump({ occ });
      persist(db.setOccurrence(item.id, item.date, status));
    },

    setNote: (item, note) => {
      const text = note?.trim() ?? '';
      const notes = { ...get().notes };
      const day = { ...(notes[item.date] ?? {}) };
      if (text) day[item.id] = text;
      else delete day[item.id];
      notes[item.date] = day;
      set((s) => ({ notes, version: s.version + 1 })); // โน้ตไม่กระทบการแจ้งเตือน — ไม่ต้อง resync
      persist(db.setOccNote(item.id, item.date, text || null));
    },

    deleteOne: (item) => {
      if (item.repeat === 'none') {
        // ครั้งเดียว = ลบทั้งรายการ
        bump({ acts: get().acts.filter((a) => a.id !== item.id) });
        persist(db.cancelActivity(item.id));
      } else {
        get().setStatus(item, 'cancelled');
      }
    },

    deleteSeries: (item) => {
      // เก็บประวัติ: ตัด end_date ถึงเมื่อวาน (อดีตยังแสดง/นับสถิติ) — ถ้าไม่เหลือช่วงเลยจึงยกเลิกทั้งรายการ
      const cut = addDays(item.date, -1);
      if (item.repeat === 'none' || cut < item.startDate) {
        bump({ acts: get().acts.filter((a) => a.id !== item.id) });
        persist(db.cancelActivity(item.id));
      } else {
        bump({ acts: get().acts.map((a) => (a.id === item.id ? { ...a, endDate: cut } : a)) });
        persist(db.setEndDate(item.id, cut));
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
        dates: null,
        startDate: to.date,
        endDate: null,
        notify: item.notify,
        notifyBefore: item.notifyBefore,
        detachedFrom: item.id,
        status: 'active',
        contactIds: item.contactIds,
        color: item.color,
      };
      let newId: number;
      try {
        newId = await db.insertActivity(fields);
      } catch (e) {
        onWriteError(e);
        return;
      }
      persist(db.insertRescheduleLog(newId, item.date, item.startMin, to.date, to.start, reason || null));

      const occ = { ...get().occ, [item.date]: { ...(get().occ[item.date] ?? {}), [item.id]: 'rescheduled' as const } };
      const prev = get().rescCounts[item.id] ?? 0;
      bump({
        acts: [...get().acts, { ...fields, id: newId }],
        occ,
        rescCounts: { ...get().rescCounts, [newId]: prev + 1 },
      });
      persist(db.setOccurrence(item.id, item.date, 'rescheduled'));
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
