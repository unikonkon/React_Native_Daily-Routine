// ฟอร์มเพิ่ม/แก้ไขกิจกรรม (วิซาร์ด 2 ขั้น — APP_STRUCTURE.md §4)
// ใช้เป็น draft ล้วน ๆ ไม่แตะ SQLite จนกดบันทึก (หน้า add.tsx เป็นคนเรียก activities.add/update)

import { create } from 'zustand';

import type { CatId, PriorityId } from '@/constants/theme';
import { todayISO } from '@/lib/dates';
import { computeDates } from '@/lib/engine';
import type { Activity, Channel, Horizon, RepeatRule } from '@/lib/types';

interface DraftState {
  editId: number | null; // โหมดแก้ไข
  cat: CatId | null;
  title: string;
  loc: string;
  sub: string;
  channel: Channel;
  priority: PriorityId;
  contactIds: number[];
  start: number;
  end: number;
  repeat: RepeatRule;
  horizon: Horizon;
  dates: string[];
  notify: boolean;
  before: number;

  set: (p: Partial<DraftState>) => void;
  setRepeat: (r: RepeatRule) => void;
  setHorizon: (h: Horizon) => void;
  toggleDate: (iso: string) => void;
  reset: () => void;
  loadActivity: (a: Activity) => void;
  loadSlot: (date: string, start: number, end: number) => void;
}

const initial = {
  editId: null,
  cat: null,
  title: '',
  loc: '',
  sub: '',
  channel: 'online' as Channel,
  priority: 'P1' as PriorityId,
  contactIds: [] as number[],
  start: 1110, // 18:30
  end: 1170, // 19:30
  repeat: 'none' as RepeatRule,
  horizon: '1m' as Horizon,
  notify: true,
  before: 30,
};

export const useDraft = create<DraftState>((set, get) => ({
  ...initial,
  dates: [todayISO()],

  set: (p) => set(p),

  setRepeat: (repeat) => {
    const anchor = get().dates[0] ?? todayISO();
    // 'custom' = ผู้ใช้เลือกวันเองบนปฏิทิน → คงวันที่เลือกไว้ ไม่คำนวณใหม่
    const dates = repeat === 'custom' ? get().dates : computeDates(repeat, get().horizon, anchor);
    set({ repeat, dates: dates.length ? dates : [anchor] });
  },

  setHorizon: (horizon) => {
    const anchor = get().dates[0] ?? todayISO();
    const dates = computeDates(get().repeat, horizon, anchor);
    set({ horizon, dates: dates.length ? dates : [anchor] });
  },

  toggleDate: (iso) => {
    const has = get().dates.includes(iso);
    const dates = has ? get().dates.filter((d) => d !== iso) : [...get().dates, iso].sort();
    // แตะแก้ปฏิทินเอง → กลายเป็น "เลือกเอง" (ตาม prototype)
    set({ dates: dates.length ? dates : [todayISO()], repeat: dates.length > 1 ? 'custom' : get().repeat === 'none' ? 'none' : 'custom' });
  },

  reset: () => set({ ...initial, dates: [todayISO()] }),

  loadActivity: (a) => {
    // โหมดแก้ไข: เริ่มจากวันแรกของ series — ถ้าผู้ใช้เปลี่ยน repeat/horizon จะคำนวณวันใหม่จากตรงนั้น
    set({
      ...initial,
      editId: a.id,
      cat: a.cat,
      title: a.title,
      loc: a.loc ?? '',
      sub: a.sub ?? '',
      channel: a.channel ?? 'online',
      priority: a.priority ?? 'P1',
      contactIds: a.contactIds,
      start: a.startMin,
      end: a.endMin,
      repeat: a.repeat,
      dates: a.repeat === 'none' || a.repeat === 'custom' ? [a.startDate] : computeDates(a.repeat, '1m', a.startDate),
      notify: a.notify,
      before: a.notifyBefore,
    });
  },

  loadSlot: (date, start, end) => {
    set({ ...initial, dates: [date], start, end });
  },
}));
